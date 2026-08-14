import { AccessControlError, getAuthenticatedUserContext } from "@/lib/accessControl";
import { getProjectAccessRegistry } from "@/lib/core/auth";
import { isRetailProjectType, validateProjectSiteOwnership } from "@/lib/core/enterpriseHierarchy";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type { BuildSite, BuildSiteStatus, CreateBuildSiteInput, UpdateBuildSiteInput } from "@/lib/build/sites/types";

type BuildProjectRow = {
  id: string;
  client_id: string;
  project_name: string | null;
  project_code: string | null;
  project_type: string | null;
  archived_at: string | null;
};

type BuildSiteRow = BuildSite;

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function siteCodeToken(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function slugFromProject(project: BuildProjectRow) {
  const preferred = textValue(project.project_code) || textValue(project.project_name);
  const compact = preferred
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return compact.slice(0, 8) || "SITE";
}

function assertModulePermission(canWrite: boolean, permissions: string[]) {
  const needed = canWrite ? "projects:write" : "projects:read";
  if (!permissions.includes(needed)) {
    throw new AccessControlError("You do not have permission to access Build Sites.", 403);
  }
}

function normalizeSite(row: BuildSiteRow): BuildSite {
  return {
    ...row,
    site_code: textValue(row.site_code),
    name: textValue(row.name),
    description: row.description ?? null,
    site_type: row.site_type ?? null,
    address: row.address ?? null,
    state: row.state ?? null,
    lga: row.lga ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    status: (row.status || "planned") as BuildSiteStatus,
    planned_start_date: row.planned_start_date ?? null,
    planned_end_date: row.planned_end_date ?? null,
    actual_start_date: row.actual_start_date ?? null,
    actual_end_date: row.actual_end_date ?? null,
    created_by: row.created_by ?? null,
    archived_at: row.archived_at ?? null
  };
}

async function getBuildProject(projectId: string) {
  const supabase = createAdminSupabase();
  const { data: project, error } = await supabase
    .from("projects")
    .select("id, client_id, project_name:name, archived_at")
    .eq("id", projectId)
    .maybeSingle();

  if (error) throw new AccessControlError(`Could not resolve project: ${error.message}`, 500);
  if (!project) throw new AccessControlError("Project not found.", 404);

  return { ...(project as Record<string, unknown>), project_code: null, project_type: null } as BuildProjectRow;
}

async function getSiteByIdOrThrow(siteId: string) {
  const supabase = createAdminSupabase();
  const { data: site, error } = await supabase.from("build_sites").select("*").eq("id", siteId).maybeSingle();
  if (error) throw new AccessControlError(`Could not resolve site: ${error.message}`, 500);
  if (!site) throw new AccessControlError("Site not found.", 404);
  return site as BuildSiteRow;
}

async function generateSiteCode(project: BuildProjectRow) {
  const supabase = createAdminSupabase();
  const prefix = slugFromProject(project);

  const { data: existing, error } = await supabase
    .from("build_sites")
    .select("site_code")
    .eq("project_id", project.id);

  if (error) throw new AccessControlError(`Could not generate site code: ${error.message}`, 500);

  const existingCodes = new Set((existing ?? []).map((row) => textValue(row.site_code).toUpperCase()).filter(Boolean));
  let sequence = existingCodes.size + 1;
  let candidate = `${prefix}-SITE-${String(sequence).padStart(3, "0")}`;
  while (existingCodes.has(candidate)) {
    sequence += 1;
    candidate = `${prefix}-SITE-${String(sequence).padStart(3, "0")}`;
  }
  return candidate;
}

export async function assertBuildSiteAccess(params: {
  request?: Request;
  projectId: string;
  clientId?: string | null;
  siteId?: string | null;
  canWrite?: boolean;
}) {
  const projectId = textValue(params.projectId);
  if (!projectId) throw new AccessControlError("projectId is required.", 400);

  const authContext = await getAuthenticatedUserContext(params.request);
  const registry = await getProjectAccessRegistry(params.request);
  assertModulePermission(Boolean(params.canWrite), registry.permissions);

  const project = await getBuildProject(projectId);
  if (isRetailProjectType(project.project_type)) {
    throw new AccessControlError("Build Sites are not available for Retail projects.", 400);
  }

  if (params.clientId && textValue(params.clientId) !== project.client_id) {
    throw new AccessControlError("Project and client mismatch for site access.", 400);
  }

  if (!authContext.is_admin) {
    if (authContext.role === "client") {
      if (!authContext.client_id || authContext.client_id !== project.client_id) {
        throw new AccessControlError("You do not have access to this project client.", 403);
      }
      if (!authContext.allowed_project_ids.includes(project.id)) {
        throw new AccessControlError("You do not have access to this project.", 403);
      }
    } else {
      throw new AccessControlError("Only admin or client users can access Build Sites.", 403);
    }
  }

  let site: BuildSiteRow | null = null;
  const siteId = textValue(params.siteId);
  if (siteId) {
    await validateProjectSiteOwnership({
      projectId: project.id,
      siteId,
      clientId: project.client_id
    });
    site = await getSiteByIdOrThrow(siteId);
  }

  return {
    authContext,
    registry,
    project,
    site
  };
}

export async function getBuildSitesForProject(params: {
  request?: Request;
  projectId: string;
  includeArchived?: boolean;
}) {
  const includeArchived = Boolean(params.includeArchived);
  const access = await assertBuildSiteAccess({
    request: params.request,
    projectId: params.projectId,
    canWrite: false
  });

  if (includeArchived && !access.authContext.is_admin) {
    throw new AccessControlError("Only admins can include archived sites.", 403);
  }

  const supabase = createAdminSupabase();
  let query = supabase
    .from("build_sites")
    .select("*")
    .eq("project_id", access.project.id)
    .eq("client_id", access.project.client_id)
    .order("created_at", { ascending: true });

  if (!includeArchived) {
    query = query.is("archived_at", null);
  }

  const { data, error } = await query;
  if (error) throw new AccessControlError(`Could not load build sites: ${error.message}`, 500);
  return (data ?? []).map((row) => normalizeSite(row as BuildSiteRow));
}

export async function getBuildSiteById(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  includeArchived?: boolean;
}) {
  const includeArchived = Boolean(params.includeArchived);
  const access = await assertBuildSiteAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    canWrite: false
  });

  const site = access.site;
  if (!site) return null;
  if (!includeArchived && site.archived_at) return null;
  return normalizeSite(site);
}

export async function createBuildSite(params: {
  request?: Request;
  input: CreateBuildSiteInput;
}) {
  const input = params.input;
  const access = await assertBuildSiteAccess({
    request: params.request,
    projectId: input.projectId,
    clientId: input.clientId,
    canWrite: true
  });

  if (!access.authContext.is_admin) {
    throw new AccessControlError("Only admins can create Build Sites at this stage.", 403);
  }

  const name = textValue(input.name);
  if (!name) throw new AccessControlError("Site name is required.", 400);

  const requestedCode = siteCodeToken(textValue(input.siteCode || ""));
  const siteCode = requestedCode || (await generateSiteCode(access.project));
  const supabase = createAdminSupabase();

  const payload = {
    client_id: access.project.client_id,
    project_id: access.project.id,
    site_code: siteCode,
    name,
    description: textValue(input.description || "") || null,
    site_type: textValue(input.siteType || "") || null,
    address: textValue(input.address || "") || null,
    state: textValue(input.state || "") || null,
    lga: textValue(input.lga || "") || null,
    latitude: typeof input.latitude === "number" ? input.latitude : null,
    longitude: typeof input.longitude === "number" ? input.longitude : null,
    status: input.status || "planned",
    planned_start_date: textValue(input.plannedStartDate || "") || null,
    planned_end_date: textValue(input.plannedEndDate || "") || null,
    actual_start_date: textValue(input.actualStartDate || "") || null,
    actual_end_date: textValue(input.actualEndDate || "") || null,
    created_by: access.authContext.user_id
  };

  const { data, error } = await supabase.from("build_sites").insert(payload).select("*").single();
  if (error) {
    if (error.code === "23505") {
      throw new AccessControlError("Site code must be unique within this project.", 409);
    }
    throw new AccessControlError(`Could not create Build Site: ${error.message}`, 500);
  }

  return normalizeSite(data as BuildSiteRow);
}

export async function updateBuildSite(params: {
  request?: Request;
  input: UpdateBuildSiteInput;
}) {
  const input = params.input;
  const access = await assertBuildSiteAccess({
    request: params.request,
    projectId: input.projectId,
    clientId: input.clientId,
    siteId: input.id,
    canWrite: true
  });

  if (!access.authContext.is_admin) {
    throw new AccessControlError("Only admins can update Build Sites at this stage.", 403);
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };

  if (typeof input.name === "string") updates.name = textValue(input.name) || access.site?.name;
  if (typeof input.siteCode === "string") updates.site_code = siteCodeToken(input.siteCode) || access.site?.site_code;
  if ("description" in input) updates.description = textValue(input.description || "") || null;
  if ("siteType" in input) updates.site_type = textValue(input.siteType || "") || null;
  if ("address" in input) updates.address = textValue(input.address || "") || null;
  if ("state" in input) updates.state = textValue(input.state || "") || null;
  if ("lga" in input) updates.lga = textValue(input.lga || "") || null;
  if ("latitude" in input) updates.latitude = typeof input.latitude === "number" ? input.latitude : null;
  if ("longitude" in input) updates.longitude = typeof input.longitude === "number" ? input.longitude : null;
  if (input.status) updates.status = input.status;
  if ("plannedStartDate" in input) updates.planned_start_date = textValue(input.plannedStartDate || "") || null;
  if ("plannedEndDate" in input) updates.planned_end_date = textValue(input.plannedEndDate || "") || null;
  if ("actualStartDate" in input) updates.actual_start_date = textValue(input.actualStartDate || "") || null;
  if ("actualEndDate" in input) updates.actual_end_date = textValue(input.actualEndDate || "") || null;

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_sites")
    .update(updates)
    .eq("id", input.id)
    .eq("project_id", access.project.id)
    .eq("client_id", access.project.client_id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new AccessControlError("Site code must be unique within this project.", 409);
    }
    throw new AccessControlError(`Could not update Build Site: ${error.message}`, 500);
  }

  return normalizeSite(data as BuildSiteRow);
}

export async function archiveBuildSite(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  clientId?: string | null;
}) {
  const access = await assertBuildSiteAccess({
    request: params.request,
    projectId: params.projectId,
    clientId: params.clientId,
    siteId: params.siteId,
    canWrite: true
  });

  if (!access.authContext.is_admin) {
    throw new AccessControlError("Only admins can archive Build Sites at this stage.", 403);
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_sites")
    .update({ archived_at: new Date().toISOString(), status: "archived", updated_at: new Date().toISOString() })
    .eq("id", params.siteId)
    .eq("project_id", access.project.id)
    .eq("client_id", access.project.client_id)
    .select("*")
    .single();

  if (error) throw new AccessControlError(`Could not archive Build Site: ${error.message}`, 500);
  return normalizeSite(data as BuildSiteRow);
}

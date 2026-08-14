import { AccessControlError, getAuthenticatedUserContext } from "@/lib/accessControl";
import { getProjectAccessRegistry } from "@/lib/core/auth";
import { isRetailProjectType, validateProjectSiteOwnership, validateWorkPackageOwnership } from "@/lib/core/enterpriseHierarchy";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type {
  BuildWorkPackage,
  BuildWorkPackageStatus,
  CreateBuildWorkPackageInput,
  UpdateBuildWorkPackageInput
} from "@/lib/build/workPackages/types";

type BuildProjectRow = {
  id: string;
  client_id: string;
  project_name: string | null;
  project_code: string | null;
  project_type: string | null;
  archived_at: string | null;
};

type BuildWorkPackageRow = BuildWorkPackage;

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function codeToken(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

function slugFromSite(siteCode: string, projectCode: string | null, projectName: string | null) {
  const preferred = textValue(siteCode) || textValue(projectCode) || textValue(projectName);
  const compact = preferred
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return compact.slice(0, 10) || "WP";
}

function assertModulePermission(canWrite: boolean, permissions: string[]) {
  const needed = canWrite ? "projects:write" : "projects:read";
  if (!permissions.includes(needed)) {
    throw new AccessControlError("You do not have permission to access Work Packages.", 403);
  }
}

function normalizeWorkPackage(row: BuildWorkPackageRow): BuildWorkPackage {
  return {
    ...row,
    code: textValue(row.code),
    name: textValue(row.name),
    description: row.description ?? null,
    work_package_type: row.work_package_type ?? null,
    contractor: row.contractor ?? null,
    planned_start: row.planned_start ?? null,
    planned_finish: row.planned_finish ?? null,
    actual_start: row.actual_start ?? null,
    actual_finish: row.actual_finish ?? null,
    status: (row.status || "planned") as BuildWorkPackageStatus,
    template_id: (row as Record<string, unknown>).template_id ? textValue((row as Record<string, unknown>).template_id) : null,
    template_name: (row as Record<string, unknown>).template_name
      ? textValue((row as Record<string, unknown>).template_name)
      : null,
    created_by: row.created_by ?? null,
    archived_at: row.archived_at ?? null
  };
}

async function attachTemplateNames(rows: BuildWorkPackageRow[]) {
  const supabase = createAdminSupabase();
  const templateIds = Array.from(
    new Set(rows.map((row) => textValue((row as Record<string, unknown>).template_id)).filter(Boolean))
  );

  if (templateIds.length === 0) {
    return rows.map((row) => normalizeWorkPackage(row));
  }

  const { data, error } = await supabase
    .from("build_work_package_templates")
    .select("id, name")
    .in("id", templateIds);

  if (error) throw new AccessControlError(`Could not load assigned templates: ${error.message}`, 500);

  const templateNameById = new Map<string, string>();
  for (const item of data ?? []) {
    const id = textValue(item.id);
    if (!id) continue;
    templateNameById.set(id, textValue(item.name));
  }

  return rows.map((row) => {
    const normalized = normalizeWorkPackage(row);
    if (!normalized.template_id) return normalized;
    return {
      ...normalized,
      template_name: templateNameById.get(normalized.template_id) ?? null
    };
  });
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

async function getWorkPackageByIdOrThrow(workPackageId: string) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("build_work_packages").select("*").eq("id", workPackageId).maybeSingle();
  if (error) throw new AccessControlError(`Could not resolve Work Package: ${error.message}`, 500);
  if (!data) throw new AccessControlError("Work Package not found.", 404);
  return data as BuildWorkPackageRow;
}

async function generateWorkPackageCode(params: {
  project: BuildProjectRow;
  siteId: string;
}) {
  const supabase = createAdminSupabase();
  const { data: siteRow, error: siteError } = await supabase
    .from("build_sites")
    .select("site_code")
    .eq("id", params.siteId)
    .maybeSingle();
  if (siteError) throw new AccessControlError(`Could not resolve site code: ${siteError.message}`, 500);

  const siteCode = textValue((siteRow as { site_code?: string | null } | null)?.site_code ?? "");
  const prefix = slugFromSite(siteCode, params.project.project_code, params.project.project_name);

  const { data: existing, error } = await supabase
    .from("build_work_packages")
    .select("code")
    .eq("site_id", params.siteId);

  if (error) throw new AccessControlError(`Could not generate Work Package code: ${error.message}`, 500);

  const existingCodes = new Set((existing ?? []).map((row) => textValue(row.code).toUpperCase()).filter(Boolean));
  let sequence = existingCodes.size + 1;
  let candidate = `${prefix}-${String(sequence).padStart(3, "0")}`;
  while (existingCodes.has(candidate)) {
    sequence += 1;
    candidate = `${prefix}-${String(sequence).padStart(3, "0")}`;
  }
  return candidate;
}

export async function assertWorkPackageAccess(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  clientId?: string | null;
  workPackageId?: string | null;
  canWrite?: boolean;
}) {
  const projectId = textValue(params.projectId);
  const siteId = textValue(params.siteId);
  if (!projectId) throw new AccessControlError("projectId is required.", 400);
  if (!siteId) throw new AccessControlError("siteId is required.", 400);

  const authContext = await getAuthenticatedUserContext(params.request);
  const registry = await getProjectAccessRegistry(params.request);
  assertModulePermission(Boolean(params.canWrite), registry.permissions);

  const project = await getBuildProject(projectId);
  if (isRetailProjectType(project.project_type)) {
    throw new AccessControlError("Work Packages are not available for Retail projects.", 400);
  }

  const { site } = await validateProjectSiteOwnership({
    projectId: project.id,
    siteId,
    clientId: params.clientId ?? project.client_id
  });

  if (!authContext.is_admin) {
    if (authContext.role === "client") {
      if (!authContext.client_id || authContext.client_id !== project.client_id) {
        throw new AccessControlError("You do not have access to this project client.", 403);
      }
      if (!authContext.allowed_project_ids.includes(project.id)) {
        throw new AccessControlError("You do not have access to this project.", 403);
      }
      if (params.canWrite) {
        throw new AccessControlError("Only admins can modify Work Packages at this stage.", 403);
      }
    } else {
      throw new AccessControlError("Only admin or client users can access Work Packages.", 403);
    }
  }

  let workPackage: BuildWorkPackageRow | null = null;
  const workPackageId = textValue(params.workPackageId);
  if (workPackageId) {
    await validateWorkPackageOwnership({
      projectId: project.id,
      siteId: site.id,
      workPackageId,
      clientId: project.client_id
    });
    workPackage = await getWorkPackageByIdOrThrow(workPackageId);
  }

  return {
    authContext,
    registry,
    project,
    site,
    workPackage
  };
}

export async function getWorkPackages(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  includeArchived?: boolean;
}) {
  const includeArchived = Boolean(params.includeArchived);
  const access = await assertWorkPackageAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    canWrite: false
  });

  if (includeArchived && !access.authContext.is_admin) {
    throw new AccessControlError("Only admins can include archived Work Packages.", 403);
  }

  const supabase = createAdminSupabase();
  let query = supabase
    .from("build_work_packages")
    .select("*")
    .eq("client_id", access.project.client_id)
    .eq("project_id", access.project.id)
    .eq("site_id", access.site.id)
    .order("created_at", { ascending: true });

  if (!includeArchived) {
    query = query.is("archived_at", null);
  }

  const { data, error } = await query;
  if (error) throw new AccessControlError(`Could not load Work Packages: ${error.message}`, 500);
  return await attachTemplateNames((data ?? []) as BuildWorkPackageRow[]);
}

export async function getWorkPackage(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  includeArchived?: boolean;
}) {
  const includeArchived = Boolean(params.includeArchived);
  const access = await assertWorkPackageAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    canWrite: false
  });

  if (!access.workPackage) return null;
  if (!includeArchived && access.workPackage.archived_at) return null;
  const [enriched] = await attachTemplateNames([access.workPackage]);
  return enriched ?? normalizeWorkPackage(access.workPackage);
}

export async function createWorkPackage(params: {
  request?: Request;
  input: CreateBuildWorkPackageInput;
}) {
  const input = params.input;
  const access = await assertWorkPackageAccess({
    request: params.request,
    projectId: input.projectId,
    siteId: input.siteId,
    clientId: input.clientId,
    canWrite: true
  });

  const name = textValue(input.name);
  if (!name) throw new AccessControlError("Work Package name is required.", 400);

  const requestedCode = codeToken(textValue(input.code || ""));
  const code = requestedCode || (await generateWorkPackageCode({ project: access.project, siteId: access.site.id }));

  const supabase = createAdminSupabase();
  const payload = {
    client_id: access.project.client_id,
    project_id: access.project.id,
    site_id: access.site.id,
    code,
    name,
    description: textValue(input.description || "") || null,
    work_package_type: textValue(input.workPackageType || "") || null,
    contractor: textValue(input.contractor || "") || null,
    planned_start: textValue(input.plannedStart || "") || null,
    planned_finish: textValue(input.plannedFinish || "") || null,
    actual_start: textValue(input.actualStart || "") || null,
    actual_finish: textValue(input.actualFinish || "") || null,
    status: input.status || "planned",
    created_by: access.authContext.user_id
  };

  const { data, error } = await supabase.from("build_work_packages").insert(payload).select("*").single();
  if (error) {
    if (error.code === "23505") {
      throw new AccessControlError("Work Package code must be unique within this Site.", 409);
    }
    throw new AccessControlError(`Could not create Work Package: ${error.message}`, 500);
  }

  const [enriched] = await attachTemplateNames([data as BuildWorkPackageRow]);
  return enriched ?? normalizeWorkPackage(data as BuildWorkPackageRow);
}

export async function updateWorkPackage(params: {
  request?: Request;
  input: UpdateBuildWorkPackageInput;
}) {
  const input = params.input;
  const access = await assertWorkPackageAccess({
    request: params.request,
    projectId: input.projectId,
    siteId: input.siteId,
    clientId: input.clientId,
    workPackageId: input.id,
    canWrite: true
  });

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };

  if (typeof input.code === "string") updates.code = codeToken(input.code) || access.workPackage?.code;
  if (typeof input.name === "string") updates.name = textValue(input.name) || access.workPackage?.name;
  if ("description" in input) updates.description = textValue(input.description || "") || null;
  if ("workPackageType" in input) updates.work_package_type = textValue(input.workPackageType || "") || null;
  if ("contractor" in input) updates.contractor = textValue(input.contractor || "") || null;
  if ("plannedStart" in input) updates.planned_start = textValue(input.plannedStart || "") || null;
  if ("plannedFinish" in input) updates.planned_finish = textValue(input.plannedFinish || "") || null;
  if ("actualStart" in input) updates.actual_start = textValue(input.actualStart || "") || null;
  if ("actualFinish" in input) updates.actual_finish = textValue(input.actualFinish || "") || null;
  if ("templateId" in input) updates.template_id = textValue((input as Record<string, unknown>).templateId) || null;
  if (input.status) updates.status = input.status;

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_work_packages")
    .update(updates)
    .eq("id", input.id)
    .eq("client_id", access.project.client_id)
    .eq("project_id", access.project.id)
    .eq("site_id", access.site.id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new AccessControlError("Work Package code must be unique within this Site.", 409);
    }
    throw new AccessControlError(`Could not update Work Package: ${error.message}`, 500);
  }

  const [enriched] = await attachTemplateNames([data as BuildWorkPackageRow]);
  return enriched ?? normalizeWorkPackage(data as BuildWorkPackageRow);
}

export async function archiveWorkPackage(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  clientId?: string | null;
}) {
  const access = await assertWorkPackageAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    clientId: params.clientId,
    workPackageId: params.workPackageId,
    canWrite: true
  });

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_work_packages")
    .update({
      archived_at: new Date().toISOString(),
      status: "archived",
      updated_at: new Date().toISOString()
    })
    .eq("id", params.workPackageId)
    .eq("client_id", access.project.client_id)
    .eq("project_id", access.project.id)
    .eq("site_id", access.site.id)
    .select("*")
    .single();

  if (error) throw new AccessControlError(`Could not archive Work Package: ${error.message}`, 500);
  const [enriched] = await attachTemplateNames([data as BuildWorkPackageRow]);
  return enriched ?? normalizeWorkPackage(data as BuildWorkPackageRow);
}

import { AccessControlError } from "@/lib/accessControl";
import { assertWorkPackageAccess } from "@/lib/build/workPackages/service";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type {
  BuildResource,
  BuildResourceRequirement,
  BuildResourceRequirementType,
  BuildResourceStatus,
  BuildResourceType,
  CreateBuildResourceInput,
  CreateTemplateResourceRequirementInput,
  UpdateBuildResourceInput,
  UpdateTemplateResourceRequirementInput
} from "@/lib/build/resources/types";

type TemplateRow = {
  id: string;
  client_id: string | null;
  is_global: boolean;
  archived_at: string | null;
};

type CategoryRefRow = {
  id: string;
  template_id: string;
  status: string;
};

type ActivityTemplateRefRow = {
  id: string;
  template_id: string;
  activity_category_id: string | null;
};

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function codeValue(value: unknown) {
  return textValue(value)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function parseResourceType(value: unknown): BuildResourceType {
  const candidate = textValue(value).toLowerCase() as BuildResourceType;
  if (
    candidate === "labour" ||
    candidate === "material" ||
    candidate === "equipment" ||
    candidate === "vehicle" ||
    candidate === "contractor" ||
    candidate === "service"
  ) {
    return candidate;
  }
  throw new AccessControlError("Invalid resource type.", 400);
}

function parseResourceStatus(value: unknown): BuildResourceStatus {
  const candidate = textValue(value).toLowerCase() as BuildResourceStatus;
  if (candidate === "draft" || candidate === "active" || candidate === "inactive" || candidate === "archived") {
    return candidate;
  }
  return "active";
}

function parseRequirementType(value: unknown): BuildResourceRequirementType {
  const candidate = textValue(value).toLowerCase() as BuildResourceRequirementType;
  if (candidate === "estimated" || candidate === "mandatory" || candidate === "optional") {
    return candidate;
  }
  return "estimated";
}

function normalizeResource(row: Record<string, unknown>): BuildResource {
  return {
    id: textValue(row.id),
    client_id: textValue(row.client_id) || null,
    code: textValue(row.code),
    name: textValue(row.name),
    description: textValue(row.description) || null,
    resource_type: parseResourceType(row.resource_type),
    category: textValue(row.category) || null,
    unit_of_measure: textValue(row.unit_of_measure) || null,
    specification: textValue(row.specification) || null,
    default_rate: row.default_rate === null ? null : Number(row.default_rate || 0),
    currency: textValue(row.currency) || null,
    is_global: Boolean(row.is_global),
    status: parseResourceStatus(row.status),
    created_by: textValue(row.created_by) || null,
    created_at: textValue(row.created_at),
    updated_at: textValue(row.updated_at),
    archived_at: textValue(row.archived_at) || null
  };
}

function normalizeRequirement(row: Record<string, unknown>): BuildResourceRequirement {
  return {
    id: textValue(row.id),
    template_id: textValue(row.template_id),
    activity_category_id: textValue(row.activity_category_id) || null,
    activity_template_id: textValue(row.activity_template_id) || null,
    resource_id: textValue(row.resource_id),
    sequence: Number(row.sequence || 1),
    quantity: Number(row.quantity || 0),
    unit_of_measure: textValue(row.unit_of_measure),
    requirement_type: parseRequirementType(row.requirement_type),
    required_stage: textValue(row.required_stage) || null,
    mandatory: Boolean(row.mandatory),
    notes: textValue(row.notes) || null,
    created_at: textValue(row.created_at),
    updated_at: textValue(row.updated_at),
    archived_at: textValue(row.archived_at) || null,
    resource_type: row.resource_type ? parseResourceType(row.resource_type) : null,
    resource_code: textValue(row.resource_code) || null,
    resource_name: textValue(row.resource_name) || null,
    resource_category: textValue(row.resource_category) || null
  };
}

async function getVisibleTemplateOrThrow(params: {
  templateId: string;
  clientId: string;
  includeArchived?: boolean;
}) {
  const supabase = createAdminSupabase();
  let query = supabase
    .from("build_work_package_templates")
    .select("id, client_id, is_global, archived_at")
    .eq("id", params.templateId)
    .or(`client_id.eq.${params.clientId},is_global.eq.true`);

  if (!params.includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query.maybeSingle();
  if (error) throw new AccessControlError(`Could not resolve template: ${error.message}`, 500);
  if (!data) throw new AccessControlError("Template not found or not visible to this tenant.", 404);
  return data as TemplateRow;
}

async function getResourceOrThrow(resourceId: string) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("build_resources").select("*").eq("id", resourceId).maybeSingle();
  if (error) throw new AccessControlError(`Could not resolve resource: ${error.message}`, 500);
  if (!data) throw new AccessControlError("Resource not found.", 404);
  return normalizeResource(data as Record<string, unknown>);
}

async function getCategoryRef(categoryId: string) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_activity_categories")
    .select("id, template_id, status")
    .eq("id", categoryId)
    .maybeSingle();
  if (error) throw new AccessControlError(`Could not resolve activity category: ${error.message}`, 500);
  if (!data) throw new AccessControlError("Activity Category not found.", 404);
  return data as CategoryRefRow;
}

async function getActivityTemplateRef(activityTemplateId: string) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_activity_templates")
    .select("id, template_id, activity_category_id")
    .eq("id", activityTemplateId)
    .maybeSingle();
  if (error) throw new AccessControlError(`Could not resolve activity template: ${error.message}`, 500);
  if (!data) throw new AccessControlError("Activity Template not found.", 404);
  return data as ActivityTemplateRefRow;
}

function ensureResourceVisibleToTenant(resource: BuildResource, clientId: string) {
  if (resource.is_global && !resource.client_id) return;
  if (resource.client_id && resource.client_id === clientId) return;
  throw new AccessControlError("Resource does not belong to this tenant visibility scope.", 403);
}

function assertNoGlobalWriteIntent(isGlobal: boolean) {
  if (isGlobal) {
    throw new AccessControlError(
      "Global resource write operations are disabled until platform-admin and tenant-admin roles are separated.",
      403
    );
  }
}

export async function assertResourceAccess(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  resourceId?: string | null;
  canWrite?: boolean;
}) {
  const access = await assertWorkPackageAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    canWrite: params.canWrite
  });

  let resource: BuildResource | null = null;
  const resourceId = textValue(params.resourceId);
  if (resourceId) {
    resource = await getResourceOrThrow(resourceId);
    ensureResourceVisibleToTenant(resource, access.project.client_id);
  }

  return {
    authContext: access.authContext,
    project: access.project,
    site: access.site,
    workPackage: access.workPackage,
    resource
  };
}

export async function getResources(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  includeArchived?: boolean;
  includeGlobal?: boolean;
}) {
  const access = await assertResourceAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    canWrite: false
  });

  const includeArchived = Boolean(params.includeArchived);
  if (includeArchived && !access.authContext.is_admin) {
    throw new AccessControlError("Only admins can include archived resources.", 403);
  }

  const includeGlobal = params.includeGlobal !== false;

  const supabase = createAdminSupabase();
  let query = supabase.from("build_resources").select("*").order("name", { ascending: true });
  if (includeGlobal) {
    query = query.or(`client_id.eq.${access.project.client_id},is_global.eq.true`);
  } else {
    query = query.eq("client_id", access.project.client_id).eq("is_global", false);
  }

  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query;
  if (error) throw new AccessControlError(`Could not load resources: ${error.message}`, 500);
  return (data ?? []).map((row) => normalizeResource(row as Record<string, unknown>));
}

export async function getResourceById(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  resourceId: string;
  includeArchived?: boolean;
}) {
  const access = await assertResourceAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    resourceId: params.resourceId,
    canWrite: false
  });

  if (!access.resource) return null;
  if (!params.includeArchived && access.resource.archived_at) return null;
  return access.resource;
}

export async function createResource(params: {
  request?: Request;
  input: CreateBuildResourceInput;
}) {
  const input = params.input;
  const access = await assertResourceAccess({
    request: params.request,
    projectId: input.projectId,
    siteId: input.siteId,
    workPackageId: input.workPackageId,
    canWrite: true
  });

  const code = codeValue(input.code);
  const name = textValue(input.name);
  if (!code) throw new AccessControlError("Resource code is required.", 400);
  if (!name) throw new AccessControlError("Resource name is required.", 400);

  const isGlobal = Boolean(input.isGlobal);
  assertNoGlobalWriteIntent(isGlobal);

  const payload = {
    client_id: access.project.client_id,
    code,
    name,
    description: textValue(input.description) || null,
    resource_type: parseResourceType(input.resourceType),
    category: textValue(input.category) || null,
    unit_of_measure: textValue(input.unitOfMeasure) || null,
    specification: textValue(input.specification) || null,
    default_rate: typeof input.defaultRate === "number" ? input.defaultRate : null,
    currency: textValue(input.currency) || null,
    is_global: false,
    status: parseResourceStatus(input.status),
    created_by: access.authContext.user_id
  };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("build_resources").insert(payload).select("*").single();
  if (error) {
    if (error.code === "23505") {
      throw new AccessControlError("Resource code must be unique in tenant scope.", 409);
    }
    throw new AccessControlError(`Could not create resource: ${error.message}`, 500);
  }

  return normalizeResource(data as Record<string, unknown>);
}

export async function updateResource(params: {
  request?: Request;
  input: UpdateBuildResourceInput;
}) {
  const input = params.input;
  const access = await assertResourceAccess({
    request: params.request,
    projectId: input.projectId,
    siteId: input.siteId,
    workPackageId: input.workPackageId,
    resourceId: input.id,
    canWrite: true
  });

  const current = access.resource;
  if (!current) throw new AccessControlError("Resource not found.", 404);

  if (current.is_global) {
    throw new AccessControlError(
      "Global resource modifications are disabled until platform-admin and tenant-admin roles are separated.",
      403
    );
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };

  if (typeof input.code === "string") updates.code = codeValue(input.code) || current.code;
  if (typeof input.name === "string") updates.name = textValue(input.name) || current.name;
  if ("description" in input) updates.description = textValue(input.description) || null;
  if (input.resourceType) updates.resource_type = parseResourceType(input.resourceType);
  if ("category" in input) updates.category = textValue(input.category) || null;
  if ("unitOfMeasure" in input) updates.unit_of_measure = textValue(input.unitOfMeasure) || null;
  if ("specification" in input) updates.specification = textValue(input.specification) || null;
  if ("defaultRate" in input) {
    updates.default_rate = typeof input.defaultRate === "number" ? input.defaultRate : null;
  }
  if ("currency" in input) updates.currency = textValue(input.currency) || null;
  if (input.status) updates.status = parseResourceStatus(input.status);

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_resources")
    .update(updates)
    .eq("id", current.id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new AccessControlError("Resource code must be unique in tenant scope.", 409);
    }
    throw new AccessControlError(`Could not update resource: ${error.message}`, 500);
  }

  return normalizeResource(data as Record<string, unknown>);
}

export async function archiveResource(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  resourceId: string;
}) {
  const access = await assertResourceAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    resourceId: params.resourceId,
    canWrite: true
  });

  const current = access.resource;
  if (!current) throw new AccessControlError("Resource not found.", 404);

  if (current.is_global) {
    throw new AccessControlError(
      "Global resource modifications are disabled until platform-admin and tenant-admin roles are separated.",
      403
    );
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_resources")
    .update({
      status: "archived",
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", current.id)
    .select("*")
    .single();

  if (error) throw new AccessControlError(`Could not archive resource: ${error.message}`, 500);
  return normalizeResource(data as Record<string, unknown>);
}

export async function assertTemplateResourceRequirementAccess(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  requirementId?: string | null;
  canWrite?: boolean;
}) {
  const access = await assertWorkPackageAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    canWrite: params.canWrite
  });

  const template = await getVisibleTemplateOrThrow({
    templateId: textValue(params.templateId),
    clientId: access.project.client_id,
    includeArchived: true
  });

  let requirement: BuildResourceRequirement | null = null;
  const requirementId = textValue(params.requirementId);
  if (requirementId) {
    const supabase = createAdminSupabase();
    const { data, error } = await supabase
      .from("build_template_resource_requirements")
      .select("*")
      .eq("id", requirementId)
      .maybeSingle();
    if (error) throw new AccessControlError(`Could not resolve template resource requirement: ${error.message}`, 500);
    if (!data) throw new AccessControlError("Template resource requirement not found.", 404);

    const normalized = normalizeRequirement(data as Record<string, unknown>);
    if (normalized.template_id !== template.id) {
      throw new AccessControlError("Template resource requirement does not belong to the specified template.", 400);
    }
    requirement = normalized;
  }

  return {
    authContext: access.authContext,
    project: access.project,
    site: access.site,
    workPackage: access.workPackage,
    template,
    requirement
  };
}

async function resolveRequirementContext(params: {
  templateId: string;
  activityCategoryId?: string | null;
  activityTemplateId?: string | null;
}) {
  const resolvedCategoryId = textValue(params.activityCategoryId) || null;
  const resolvedActivityTemplateId = textValue(params.activityTemplateId) || null;

  let category: CategoryRefRow | null = null;
  if (resolvedCategoryId) {
    category = await getCategoryRef(resolvedCategoryId);
    if (category.template_id !== params.templateId) {
      throw new AccessControlError("activityCategoryId must belong to the same template.", 400);
    }
  }

  let activityTemplate: ActivityTemplateRefRow | null = null;
  if (resolvedActivityTemplateId) {
    activityTemplate = await getActivityTemplateRef(resolvedActivityTemplateId);
    if (activityTemplate.template_id !== params.templateId) {
      throw new AccessControlError("activityTemplateId must belong to the same template.", 400);
    }

    const activityCategoryId = textValue(activityTemplate.activity_category_id);
    if (!activityCategoryId) {
      throw new AccessControlError("Activity Template must have an activity category before assigning resources.", 400);
    }

    if (resolvedCategoryId && resolvedCategoryId !== activityCategoryId) {
      throw new AccessControlError(
        "activityTemplateId category must match the supplied activityCategoryId when both are provided.",
        400
      );
    }
  }

  return {
    activity_category_id: resolvedCategoryId || textValue(activityTemplate?.activity_category_id) || null,
    activity_template_id: resolvedActivityTemplateId
  };
}

async function enrichRequirementsWithResources(
  requirements: BuildResourceRequirement[],
  clientId: string
): Promise<BuildResourceRequirement[]> {
  const resourceIds = Array.from(new Set(requirements.map((item) => item.resource_id).filter(Boolean)));
  if (resourceIds.length === 0) return requirements;

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_resources")
    .select("id, client_id, code, name, resource_type, category, is_global")
    .in("id", resourceIds)
    .or(`client_id.eq.${clientId},is_global.eq.true`);

  if (error) throw new AccessControlError(`Could not load resource metadata: ${error.message}`, 500);

  const resourceMap = new Map<string, Record<string, unknown>>();
  for (const row of data ?? []) {
    const id = textValue(row.id);
    if (id) resourceMap.set(id, row as Record<string, unknown>);
  }

  return requirements.map((item) => {
    const resource = resourceMap.get(item.resource_id);
    if (!resource) return item;
    return {
      ...item,
      resource_type: parseResourceType(resource.resource_type),
      resource_code: textValue(resource.code) || null,
      resource_name: textValue(resource.name) || null,
      resource_category: textValue(resource.category) || null
    };
  });
}

export async function getTemplateResourceRequirements(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  includeArchived?: boolean;
}) {
  const access = await assertTemplateResourceRequirementAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    templateId: params.templateId,
    canWrite: false
  });

  const includeArchived = Boolean(params.includeArchived);
  if (includeArchived && !access.authContext.is_admin) {
    throw new AccessControlError("Only admins can include archived template resource requirements.", 403);
  }

  const supabase = createAdminSupabase();
  let query = supabase
    .from("build_template_resource_requirements")
    .select("*")
    .eq("template_id", access.template.id)
    .order("sequence", { ascending: true });

  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query;
  if (error) throw new AccessControlError(`Could not load template resource requirements: ${error.message}`, 500);

  const normalized = (data ?? []).map((row) => normalizeRequirement(row as Record<string, unknown>));
  return await enrichRequirementsWithResources(normalized, access.project.client_id);
}

export async function getTemplateResourceRequirementById(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  requirementId: string;
  includeArchived?: boolean;
}) {
  const access = await assertTemplateResourceRequirementAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    templateId: params.templateId,
    requirementId: params.requirementId,
    canWrite: false
  });

  if (!access.requirement) return null;
  if (!params.includeArchived && access.requirement.archived_at) return null;

  const [enriched] = await enrichRequirementsWithResources([access.requirement], access.project.client_id);
  return enriched ?? access.requirement;
}

export async function createTemplateResourceRequirement(params: {
  request?: Request;
  input: CreateTemplateResourceRequirementInput;
}) {
  const input = params.input;
  const access = await assertTemplateResourceRequirementAccess({
    request: params.request,
    projectId: input.projectId,
    siteId: input.siteId,
    workPackageId: input.workPackageId,
    templateId: input.templateId,
    canWrite: true
  });

  const resource = await getResourceOrThrow(textValue(input.resourceId));
  ensureResourceVisibleToTenant(resource, access.project.client_id);

  const resolved = await resolveRequirementContext({
    templateId: access.template.id,
    activityCategoryId: input.activityCategoryId,
    activityTemplateId: input.activityTemplateId
  });

  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new AccessControlError("quantity must be greater than zero.", 400);
  }

  const unitOfMeasure = textValue(input.unitOfMeasure) || textValue(resource.unit_of_measure);
  if (!unitOfMeasure) {
    throw new AccessControlError("unitOfMeasure is required or must be resolvable from the resource catalogue.", 400);
  }

  const requirementType = parseRequirementType(input.requirementType);
  const mandatory = typeof input.mandatory === "boolean" ? input.mandatory : requirementType === "mandatory";

  const payload = {
    template_id: access.template.id,
    activity_category_id: resolved.activity_category_id,
    activity_template_id: resolved.activity_template_id,
    resource_id: resource.id,
    sequence: typeof input.sequence === "number" && input.sequence > 0 ? input.sequence : 1,
    quantity,
    unit_of_measure: unitOfMeasure,
    requirement_type: requirementType,
    required_stage: textValue(input.requiredStage) || null,
    mandatory,
    notes: textValue(input.notes) || null
  };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_template_resource_requirements")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new AccessControlError("Requirement sequence must be unique within the selected ownership scope.", 409);
    }
    throw new AccessControlError(`Could not create template resource requirement: ${error.message}`, 500);
  }

  const normalized = normalizeRequirement(data as Record<string, unknown>);
  const [enriched] = await enrichRequirementsWithResources([normalized], access.project.client_id);
  return enriched ?? normalized;
}

export async function updateTemplateResourceRequirement(params: {
  request?: Request;
  input: UpdateTemplateResourceRequirementInput;
}) {
  const input = params.input;
  const access = await assertTemplateResourceRequirementAccess({
    request: params.request,
    projectId: input.projectId,
    siteId: input.siteId,
    workPackageId: input.workPackageId,
    templateId: input.templateId,
    requirementId: input.id,
    canWrite: true
  });

  const current = access.requirement;
  if (!current) throw new AccessControlError("Template resource requirement not found.", 404);

  const nextResource = input.resourceId ? await getResourceOrThrow(textValue(input.resourceId)) : null;
  if (nextResource) ensureResourceVisibleToTenant(nextResource, access.project.client_id);

  const resolved = await resolveRequirementContext({
    templateId: access.template.id,
    activityCategoryId: "activityCategoryId" in input ? input.activityCategoryId : current.activity_category_id,
    activityTemplateId: "activityTemplateId" in input ? input.activityTemplateId : current.activity_template_id
  });

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    activity_category_id: resolved.activity_category_id,
    activity_template_id: resolved.activity_template_id
  };

  if (nextResource) updates.resource_id = nextResource.id;
  if (typeof input.sequence === "number" && input.sequence > 0) updates.sequence = input.sequence;
  if (typeof input.quantity === "number") {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new AccessControlError("quantity must be greater than zero.", 400);
    }
    updates.quantity = input.quantity;
  }

  if ("unitOfMeasure" in input) {
    const candidate = textValue(input.unitOfMeasure) || textValue(nextResource?.unit_of_measure) || current.unit_of_measure;
    if (!candidate) {
      throw new AccessControlError("unitOfMeasure is required or must be resolvable from the resource catalogue.", 400);
    }
    updates.unit_of_measure = candidate;
  }

  if (input.requirementType) updates.requirement_type = parseRequirementType(input.requirementType);
  if ("requiredStage" in input) updates.required_stage = textValue(input.requiredStage) || null;
  if (typeof input.mandatory === "boolean") updates.mandatory = input.mandatory;
  if ("notes" in input) updates.notes = textValue(input.notes) || null;

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_template_resource_requirements")
    .update(updates)
    .eq("id", current.id)
    .eq("template_id", access.template.id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new AccessControlError("Requirement sequence must be unique within the selected ownership scope.", 409);
    }
    throw new AccessControlError(`Could not update template resource requirement: ${error.message}`, 500);
  }

  const normalized = normalizeRequirement(data as Record<string, unknown>);
  const [enriched] = await enrichRequirementsWithResources([normalized], access.project.client_id);
  return enriched ?? normalized;
}

export async function archiveTemplateResourceRequirement(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  requirementId: string;
}) {
  const access = await assertTemplateResourceRequirementAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    templateId: params.templateId,
    requirementId: params.requirementId,
    canWrite: true
  });

  const current = access.requirement;
  if (!current) throw new AccessControlError("Template resource requirement not found.", 404);

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_template_resource_requirements")
    .update({
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", current.id)
    .eq("template_id", access.template.id)
    .select("*")
    .single();

  if (error) throw new AccessControlError(`Could not archive template resource requirement: ${error.message}`, 500);

  const normalized = normalizeRequirement(data as Record<string, unknown>);
  const [enriched] = await enrichRequirementsWithResources([normalized], access.project.client_id);
  return enriched ?? normalized;
}

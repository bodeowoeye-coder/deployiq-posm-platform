import { AccessControlError } from "@/lib/accessControl";
import { getDependencies, validateDependencyGraph } from "@/lib/build/dependencies/service";
import { assertWorkPackageAccess } from "@/lib/build/workPackages/service";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type {
  BuildActivityDurationUnit,
  BuildActivityTemplate,
  BuildActivityTemplateAuthoringRecord,
  BuildActivityTemplateStatus,
  BuildChecklistTemplate,
  BuildTemplateAuthoringValidationSummary,
  CreateBuildActivityTemplateInput,
  ReorderBuildActivityTemplatesInput,
  UpdateBuildActivityTemplateInput
} from "@/lib/build/templates/types";

type TemplateRow = {
  id: string;
  client_id: string | null;
  is_global: boolean;
  status: string;
  archived_at: string | null;
};

type CategoryRow = {
  id: string;
  template_id: string;
  sequence: number;
  code: string;
  name: string;
  status: string;
};

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCode(value: unknown) {
  return textValue(value)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function parseDurationUnit(value: unknown): BuildActivityDurationUnit {
  const candidate = textValue(value).toLowerCase() as BuildActivityDurationUnit;
  if (candidate === "hours" || candidate === "days" || candidate === "weeks") return candidate;
  return "days";
}

function parseStatus(value: unknown): BuildActivityTemplateStatus {
  const candidate = textValue(value).toLowerCase() as BuildActivityTemplateStatus;
  if (candidate === "draft" || candidate === "active" || candidate === "inactive" || candidate === "archived") {
    return candidate;
  }
  throw new AccessControlError("Invalid activity template status.", 400);
}

function normalizeActivity(row: Record<string, unknown>): BuildActivityTemplate {
  return {
    id: textValue(row.id),
    template_id: textValue(row.template_id),
    activity_category_id: textValue(row.activity_category_id),
    sequence: Number(row.sequence || 1),
    code: textValue(row.code),
    name: textValue(row.name),
    description: textValue(row.description) || null,
    estimated_duration: row.estimated_duration === null ? null : Number(row.estimated_duration || 0),
    duration_unit: parseDurationUnit(row.duration_unit),
    mandatory: Boolean(row.mandatory),
    requires_photo: Boolean(row.requires_photo),
    requires_gps: Boolean(row.requires_gps),
    requires_approval: Boolean(row.requires_approval),
    status: parseStatus(row.status || "active"),
    notes: textValue(row.notes) || null,
    created_at: textValue(row.created_at),
    updated_at: textValue(row.updated_at),
    archived_at: textValue(row.archived_at) || null
  };
}

function normalizeChecklist(row: Record<string, unknown>): BuildChecklistTemplate {
  return {
    id: textValue(row.id),
    activity_template_id: textValue(row.activity_template_id),
    sequence: Number(row.sequence || 1),
    item: textValue(row.item),
    description: textValue(row.description) || null,
    mandatory: Boolean(row.mandatory),
    requires_photo: Boolean(row.requires_photo),
    requires_comment: Boolean(row.requires_comment),
    acceptance_type: textValue(row.acceptance_type) || null,
    created_at: textValue(row.created_at),
    updated_at: textValue(row.updated_at),
    archived_at: textValue(row.archived_at) || null
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
    .select("id, client_id, is_global, status, archived_at")
    .eq("id", params.templateId)
    .or(`client_id.eq.${params.clientId},is_global.eq.true`);

  if (!params.includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query.maybeSingle();
  if (error) throw new AccessControlError(`Could not resolve template: ${error.message}`, 500);
  if (!data) throw new AccessControlError("Template not found or not visible.", 404);
  return data as TemplateRow;
}

async function getCategoryOrThrow(categoryId: string) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_activity_categories")
    .select("id, template_id, sequence, code, name, status")
    .eq("id", categoryId)
    .maybeSingle();

  if (error) throw new AccessControlError(`Could not resolve activity category: ${error.message}`, 500);
  if (!data) throw new AccessControlError("Activity category not found.", 404);
  return data as CategoryRow;
}

async function getTemplateCategories(templateId: string) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_activity_categories")
    .select("id, template_id, sequence, code, name, status")
    .eq("template_id", templateId)
    .order("sequence", { ascending: true });

  if (error) throw new AccessControlError(`Could not load activity categories: ${error.message}`, 500);
  return (data ?? []) as CategoryRow[];
}

async function getTemplateActivities(templateId: string, includeArchived = false) {
  const supabase = createAdminSupabase();
  let query = supabase
    .from("build_activity_templates")
    .select("*")
    .eq("template_id", templateId)
    .order("sequence", { ascending: true });

  if (!includeArchived) {
    query = query.is("archived_at", null).neq("status", "archived");
  }

  const { data, error } = await query;
  if (error) throw new AccessControlError(`Could not load activity templates: ${error.message}`, 500);
  return (data ?? []).map((row) => normalizeActivity(row as Record<string, unknown>));
}

function assertTemplateWritable(template: TemplateRow) {
  if (template.is_global) {
    throw new AccessControlError(
      "Global template write operations are disabled until platform-admin and tenant-admin roles are separated.",
      403
    );
  }
  if (template.archived_at || textValue(template.status).toLowerCase() === "archived") {
    throw new AccessControlError("Archived templates cannot be modified.", 400);
  }
}

function assertCategoryWritable(category: CategoryRow) {
  if (textValue(category.status).toLowerCase() === "archived") {
    throw new AccessControlError("Archived activity categories cannot receive new activities.", 400);
  }
}

function assertNonNegativeDuration(value: number | null | undefined) {
  if (value === null || value === undefined) return;
  if (!Number.isFinite(value) || value < 0) {
    throw new AccessControlError("estimatedDuration must be zero or greater.", 400);
  }
}

async function getActivityByIdOrThrow(activityId: string) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("build_activity_templates").select("*").eq("id", activityId).maybeSingle();
  if (error) throw new AccessControlError(`Could not resolve activity template: ${error.message}`, 500);
  if (!data) throw new AccessControlError("Activity template not found.", 404);
  return normalizeActivity(data as Record<string, unknown>);
}

async function buildAuthoringRows(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  activities: BuildActivityTemplate[];
}) {
  const supabase = createAdminSupabase();

  const checklistsRes = await supabase
    .from("build_checklist_templates")
    .select("*")
    .in("activity_template_id", params.activities.map((activity) => activity.id))
    .is("archived_at", null)
    .order("sequence", { ascending: true });

  if (checklistsRes.error) {
    throw new AccessControlError(`Could not load checklist templates: ${checklistsRes.error.message}`, 500);
  }

  const checklists = (checklistsRes.data ?? []).map((row) => normalizeChecklist(row as Record<string, unknown>));
  const checklistCountByActivityId = new Map<string, number>();
  for (const checklist of checklists) {
    checklistCountByActivityId.set(
      checklist.activity_template_id,
      (checklistCountByActivityId.get(checklist.activity_template_id) ?? 0) + 1
    );
  }

  const { dependencies, graphValidation } = await getDependencies({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    templateId: params.templateId,
    includeArchived: false
  });

  const predecessorCountByActivityId = new Map<string, number>();
  const successorCountByActivityId = new Map<string, number>();
  for (const dependency of dependencies) {
    predecessorCountByActivityId.set(
      dependency.successor_activity_template_id,
      (predecessorCountByActivityId.get(dependency.successor_activity_template_id) ?? 0) + 1
    );
    successorCountByActivityId.set(
      dependency.predecessor_activity_template_id,
      (successorCountByActivityId.get(dependency.predecessor_activity_template_id) ?? 0) + 1
    );
  }

  const requirementsRes = await supabase
    .from("build_template_resource_requirements")
    .select("activity_template_id, quantity, unit_of_measure, resource_id")
    .eq("template_id", params.templateId)
    .is("archived_at", null);
  if (requirementsRes.error) {
    throw new AccessControlError(
      `Could not load template resource requirements: ${requirementsRes.error.message}`,
      500
    );
  }

  const requirementRows = (requirementsRes.data ?? []) as Array<Record<string, unknown>>;
  const resourceIds = Array.from(new Set(requirementRows.map((row) => textValue(row.resource_id)).filter(Boolean)));
  const resourceTypeById = new Map<string, string>();

  if (resourceIds.length > 0) {
    const resourcesRes = await supabase
      .from("build_resources")
      .select("id, resource_type")
      .in("id", resourceIds);

    if (resourcesRes.error) {
      throw new AccessControlError(`Could not load resource catalogue entries: ${resourcesRes.error.message}`, 500);
    }

    for (const resource of resourcesRes.data ?? []) {
      const resourceId = textValue(resource.id);
      if (!resourceId) continue;
      resourceTypeById.set(resourceId, textValue(resource.resource_type));
    }
  }

  const requirementsByActivityId = new Map<string, Array<Record<string, unknown>>>();
  for (const row of requirementRows) {
    const activityTemplateId = textValue(row.activity_template_id);
    if (!activityTemplateId) continue;
    const list = requirementsByActivityId.get(activityTemplateId) ?? [];
    list.push(row);
    requirementsByActivityId.set(activityTemplateId, list);
  }

  const records: BuildActivityTemplateAuthoringRecord[] = params.activities.map((activity) => {
    const requirementRowsForActivity = requirementsByActivityId.get(activity.id) ?? [];
    const types = Array.from(
      new Set(
        requirementRowsForActivity
          .map((row) => resourceTypeById.get(textValue(row.resource_id)) || "")
          .filter(Boolean)
      )
    );

    const quantitySummary = requirementRowsForActivity.map((row) => {
      const quantity = Number(row.quantity || 0);
      const unit = textValue(row.unit_of_measure) || "unit";
      return `${quantity} ${unit}`;
    });

    return {
      ...activity,
      checklist_count: checklistCountByActivityId.get(activity.id) ?? 0,
      dependency: {
        predecessor_count: predecessorCountByActivityId.get(activity.id) ?? 0,
        successor_count: successorCountByActivityId.get(activity.id) ?? 0,
        dependency_validation_status: graphValidation.isValid ? "valid" : "invalid"
      },
      resources: {
        requirement_count: requirementRowsForActivity.length,
        resource_types: types,
        quantity_unit_summary: quantitySummary
      }
    };
  });

  return {
    records,
    checklists,
    dependencies,
    graphValidation,
    requirementRows
  };
}

export function buildTemplateValidationSummary(params: {
  categories: CategoryRow[];
  activities: BuildActivityTemplate[];
  checklists: BuildChecklistTemplate[];
  dependencies: Array<{ predecessor_activity_template_id: string; successor_activity_template_id: string }>;
  requirementRows: Array<Record<string, unknown>>;
}): BuildTemplateAuthoringValidationSummary {
  const errors: string[] = [];
  const warnings: string[] = [];

  const categoryIdSet = new Set(params.categories.map((category) => category.id));
  const seenCodes = new Set<string>();
  const seenSequences = new Set<number>();

  for (const activity of params.activities) {
    if (!activity.activity_category_id || !categoryIdSet.has(activity.activity_category_id)) {
      errors.push(`Activity ${activity.code || activity.id} has a missing or invalid category.`);
    }

    const code = textValue(activity.code).toUpperCase();
    if (code) {
      if (seenCodes.has(code)) errors.push(`Duplicate activity code detected in template: ${code}.`);
      seenCodes.add(code);
    }

    if (seenSequences.has(activity.sequence)) {
      errors.push(`Duplicate activity sequence detected in template: ${activity.sequence}.`);
    }
    seenSequences.add(activity.sequence);
  }

  const dependencyValidation = validateDependencyGraph({
    activityIds: params.activities.map((activity) => activity.id),
    dependencies: params.dependencies.map((dependency) => ({
      predecessorActivityTemplateId: dependency.predecessor_activity_template_id,
      successorActivityTemplateId: dependency.successor_activity_template_id
    }))
  });

  if (!dependencyValidation.isValid) {
    errors.push("Dependency cycle or invalid dependency graph detected.");
  }

  const checklistCountByActivity = new Map<string, number>();
  for (const checklist of params.checklists) {
    checklistCountByActivity.set(
      checklist.activity_template_id,
      (checklistCountByActivity.get(checklist.activity_template_id) ?? 0) + 1
    );
  }

  for (const activity of params.activities) {
    if (activity.mandatory && activity.status === "active" && (checklistCountByActivity.get(activity.id) ?? 0) === 0) {
      warnings.push(`Active mandatory activity ${activity.code || activity.id} has no checklist items.`);
    }

    if (activity.archived_at || activity.status === "archived") {
      warnings.push(`Archived activity ${activity.code || activity.id} still appears in authoring scope.`);
    }
  }

  for (const requirement of params.requirementRows) {
    const quantity = Number(requirement.quantity || 0);
    const unit = textValue(requirement.unit_of_measure);
    if (!Number.isFinite(quantity) || quantity <= 0 || !unit) {
      warnings.push("Resource requirement inconsistency detected: quantity/unit is invalid.");
      break;
    }
  }

  const activeCategories = params.categories.filter((category) => textValue(category.status).toLowerCase() !== "archived");
  for (const category of activeCategories) {
    const hasActivities = params.activities.some(
      (activity) => activity.activity_category_id === category.id && !activity.archived_at && activity.status !== "archived"
    );
    if (!hasActivities) {
      warnings.push(`Active category ${category.code || category.id} has no active activities.`);
    }
  }

  return {
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings))
  };
}

export async function assertActivityTemplateAccess(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  activityTemplateId?: string;
  canWrite?: boolean;
}) {
  const access = await assertWorkPackageAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    canWrite: params.canWrite
  });

  const templateId = textValue(params.templateId);
  if (!templateId) throw new AccessControlError("templateId is required.", 400);

  const template = await getVisibleTemplateOrThrow({
    templateId,
    clientId: access.project.client_id,
    includeArchived: true
  });

  let activity: BuildActivityTemplate | null = null;
  const activityTemplateId = textValue(params.activityTemplateId);
  if (activityTemplateId) {
    activity = await getActivityByIdOrThrow(activityTemplateId);
    if (activity.template_id !== template.id) {
      throw new AccessControlError("Activity Template does not belong to the specified template.", 400);
    }
  }

  return {
    authContext: access.authContext,
    project: access.project,
    site: access.site,
    workPackage: access.workPackage,
    template,
    activity
  };
}

export async function getActivityTemplates(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  includeArchived?: boolean;
}) {
  const access = await assertActivityTemplateAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    templateId: params.templateId,
    canWrite: false
  });

  const includeArchived = Boolean(params.includeArchived);
  if (includeArchived && !access.authContext.is_admin) {
    throw new AccessControlError("Only admins can include archived activity templates.", 403);
  }

  const activities = await getTemplateActivities(access.template.id, includeArchived);
  const categories = await getTemplateCategories(access.template.id);
  const enriched = await buildAuthoringRows({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    templateId: access.template.id,
    activities
  });

  const validation = buildTemplateValidationSummary({
    categories,
    activities,
    checklists: enriched.checklists,
    dependencies: enriched.dependencies,
    requirementRows: enriched.requirementRows
  });

  return {
    activities: enriched.records,
    validation
  };
}

export async function getActivityTemplateById(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  activityTemplateId: string;
  includeArchived?: boolean;
}) {
  const result = await getActivityTemplates({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    templateId: params.templateId,
    includeArchived: params.includeArchived
  });

  return result.activities.find((item) => item.id === textValue(params.activityTemplateId)) ?? null;
}

export async function createActivityTemplate(params: {
  request?: Request;
  input: CreateBuildActivityTemplateInput;
}) {
  const input = params.input;
  const access = await assertActivityTemplateAccess({
    request: params.request,
    projectId: input.projectId,
    siteId: input.siteId,
    workPackageId: input.workPackageId,
    templateId: input.templateId,
    canWrite: true
  });

  assertTemplateWritable(access.template);

  const categoryId = textValue(input.activityCategoryId);
  if (!categoryId) throw new AccessControlError("activityCategoryId is required.", 400);

  const category = await getCategoryOrThrow(categoryId);
  if (category.template_id !== access.template.id) {
    throw new AccessControlError("Activity category must belong to the selected template.", 400);
  }
  assertCategoryWritable(category);

  const code = normalizeCode(input.code);
  const name = textValue(input.name);
  if (!code) throw new AccessControlError("Activity code is required.", 400);
  if (!name) throw new AccessControlError("Activity name is required.", 400);

  assertNonNegativeDuration(input.estimatedDuration);

  const payload = {
    template_id: access.template.id,
    activity_category_id: category.id,
    sequence: typeof input.sequence === "number" && input.sequence > 0 ? Math.round(input.sequence) : 1,
    code,
    name,
    description: textValue(input.description) || null,
    estimated_duration: typeof input.estimatedDuration === "number" ? input.estimatedDuration : null,
    duration_unit: parseDurationUnit(input.durationUnit),
    mandatory: typeof input.mandatory === "boolean" ? input.mandatory : true,
    requires_photo: typeof input.requiresPhoto === "boolean" ? input.requiresPhoto : false,
    requires_gps: typeof input.requiresGps === "boolean" ? input.requiresGps : false,
    requires_approval: typeof input.requiresApproval === "boolean" ? input.requiresApproval : false,
    status: input.status ? parseStatus(input.status) : "draft",
    notes: textValue(input.notes) || null
  };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("build_activity_templates").insert(payload).select("*").single();

  if (error) {
    if (error.code === "23505") {
      throw new AccessControlError("Activity code and sequence must be unique within template scope.", 409);
    }
    throw new AccessControlError(`Could not create activity template: ${error.message}`, 500);
  }

  return normalizeActivity(data as Record<string, unknown>);
}

export async function updateActivityTemplate(params: {
  request?: Request;
  input: UpdateBuildActivityTemplateInput;
}) {
  const input = params.input;
  const access = await assertActivityTemplateAccess({
    request: params.request,
    projectId: input.projectId,
    siteId: input.siteId,
    workPackageId: input.workPackageId,
    templateId: input.templateId,
    activityTemplateId: input.id,
    canWrite: true
  });

  assertTemplateWritable(access.template);
  const current = access.activity;
  if (!current) throw new AccessControlError("Activity template not found.", 404);

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };

  if (typeof input.activityCategoryId === "string") {
    const category = await getCategoryOrThrow(textValue(input.activityCategoryId));
    if (category.template_id !== access.template.id) {
      throw new AccessControlError("Activity category must belong to the selected template.", 400);
    }
    assertCategoryWritable(category);
    updates.activity_category_id = category.id;
  }

  if (typeof input.sequence === "number") {
    if (!Number.isInteger(input.sequence) || input.sequence <= 0) {
      throw new AccessControlError("sequence must be an integer greater than zero.", 400);
    }
    updates.sequence = input.sequence;
  }

  if (typeof input.code === "string") updates.code = normalizeCode(input.code) || current.code;
  if (typeof input.name === "string") updates.name = textValue(input.name) || current.name;
  if ("description" in input) updates.description = textValue(input.description) || null;

  if ("estimatedDuration" in input) {
    assertNonNegativeDuration(input.estimatedDuration);
    updates.estimated_duration = typeof input.estimatedDuration === "number" ? input.estimatedDuration : null;
  }

  if (input.durationUnit) updates.duration_unit = parseDurationUnit(input.durationUnit);
  if (typeof input.mandatory === "boolean") updates.mandatory = input.mandatory;
  if (typeof input.requiresPhoto === "boolean") updates.requires_photo = input.requiresPhoto;
  if (typeof input.requiresGps === "boolean") updates.requires_gps = input.requiresGps;
  if (typeof input.requiresApproval === "boolean") updates.requires_approval = input.requiresApproval;
  if (input.status) updates.status = parseStatus(input.status);
  if ("notes" in input) updates.notes = textValue(input.notes) || null;

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_activity_templates")
    .update(updates)
    .eq("id", current.id)
    .eq("template_id", access.template.id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new AccessControlError("Activity code and sequence must be unique within template scope.", 409);
    }
    throw new AccessControlError(`Could not update activity template: ${error.message}`, 500);
  }

  return normalizeActivity(data as Record<string, unknown>);
}

export async function archiveActivityTemplate(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  activityTemplateId: string;
}) {
  const access = await assertActivityTemplateAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    templateId: params.templateId,
    activityTemplateId: params.activityTemplateId,
    canWrite: true
  });

  assertTemplateWritable(access.template);
  const current = access.activity;
  if (!current) throw new AccessControlError("Activity template not found.", 404);

  const supabase = createAdminSupabase();
  const { count, error: dependencyCountError } = await supabase
    .from("build_activity_template_dependencies")
    .select("id", { count: "exact", head: true })
    .eq("template_id", access.template.id)
    .is("archived_at", null)
    .or(`predecessor_activity_template_id.eq.${current.id},successor_activity_template_id.eq.${current.id}`);

  if (dependencyCountError) {
    throw new AccessControlError(
      `Could not validate activity dependencies before archive: ${dependencyCountError.message}`,
      500
    );
  }

  if ((count ?? 0) > 0) {
    throw new AccessControlError(
      "Cannot archive activity template with active dependencies. Archive linked dependencies first.",
      409
    );
  }

  const { data, error } = await supabase
    .from("build_activity_templates")
    .update({
      status: "archived",
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", current.id)
    .eq("template_id", access.template.id)
    .select("*")
    .single();

  if (error) throw new AccessControlError(`Could not archive activity template: ${error.message}`, 500);
  return normalizeActivity(data as Record<string, unknown>);
}

export async function reorderActivityTemplates(params: {
  request?: Request;
  input: ReorderBuildActivityTemplatesInput;
}) {
  const input = params.input;
  const access = await assertActivityTemplateAccess({
    request: params.request,
    projectId: input.projectId,
    siteId: input.siteId,
    workPackageId: input.workPackageId,
    templateId: input.templateId,
    canWrite: true
  });

  assertTemplateWritable(access.template);

  const category = await getCategoryOrThrow(textValue(input.activityCategoryId));
  if (category.template_id !== access.template.id) {
    throw new AccessControlError("Activity category must belong to the selected template.", 400);
  }

  const allActivities = await getTemplateActivities(access.template.id, true);
  const scopedActivities = allActivities.filter(
    (activity) =>
      activity.activity_category_id === category.id &&
      !activity.archived_at &&
      activity.status !== "archived"
  );

  const orderedIds = input.orderedActivityTemplateIds.map((id) => textValue(id)).filter(Boolean);
  if (orderedIds.length === 0) {
    throw new AccessControlError("orderedActivityTemplateIds must include at least one activity id.", 400);
  }

  const expectedIds = new Set(scopedActivities.map((activity) => activity.id));
  if (expectedIds.size !== orderedIds.length || orderedIds.some((id) => !expectedIds.has(id))) {
    throw new AccessControlError(
      "orderedActivityTemplateIds must include each non-archived activity in the selected category exactly once.",
      400
    );
  }

  const orderedSet = new Set(orderedIds);
  const fullOrderedIds: string[] = [];
  let inserted = false;

  for (const activity of allActivities.sort((a, b) => a.sequence - b.sequence)) {
    const isTarget = activity.activity_category_id === category.id && !activity.archived_at && activity.status !== "archived";
    if (isTarget) {
      if (!inserted) {
        fullOrderedIds.push(...orderedIds);
        inserted = true;
      }
      continue;
    }
    if (!orderedSet.has(activity.id)) fullOrderedIds.push(activity.id);
  }

  const supabase = createAdminSupabase();
  for (let index = 0; index < fullOrderedIds.length; index += 1) {
    const id = fullOrderedIds[index];
    const tempSequence = 100000 + index + 1;
    const { error } = await supabase
      .from("build_activity_templates")
      .update({ sequence: tempSequence, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("template_id", access.template.id);
    if (error) throw new AccessControlError(`Could not reorder activity templates: ${error.message}`, 500);
  }

  for (let index = 0; index < fullOrderedIds.length; index += 1) {
    const id = fullOrderedIds[index];
    const finalSequence = index + 1;
    const { error } = await supabase
      .from("build_activity_templates")
      .update({ sequence: finalSequence, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("template_id", access.template.id);
    if (error) throw new AccessControlError(`Could not finalize activity template reorder: ${error.message}`, 500);
  }

  return await getActivityTemplates({
    request: params.request,
    projectId: input.projectId,
    siteId: input.siteId,
    workPackageId: input.workPackageId,
    templateId: input.templateId,
    includeArchived: false
  });
}

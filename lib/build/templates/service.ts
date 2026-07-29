import { AccessControlError } from "@/lib/accessControl";
import { buildTemplateValidationSummary } from "@/lib/build/activityTemplates/service";
import { getDependencies } from "@/lib/build/dependencies/service";
import { assertWorkPackageAccess, getWorkPackage } from "@/lib/build/workPackages/service";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type {
  BuildActivityDurationUnit,
  BuildActivityTemplate,
  BuildActivityTemplateStatus,
  BuildActivityCategory,
  BuildActivityCategoryStatus,
  BuildActivityCategoryType,
  BuildChecklistTemplate,
  BuildEquipmentTemplate,
  BuildInspectionTemplate,
  BuildSafetyTemplate,
  BuildSupplyTemplate,
  BuildWorkPackageTemplate,
  BuildWorkPackageTemplateBundle,
  BuildWorkPackageTemplateStatus,
  CreateBuildWorkPackageTemplateInput,
  UpdateBuildWorkPackageTemplateInput
} from "@/lib/build/templates/types";

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

function parseStatus(value: unknown): BuildWorkPackageTemplateStatus {
  const status = textValue(value).toLowerCase();
  if (status === "draft" || status === "active" || status === "archived") return status;
  return "active";
}

function normalizeTemplate(row: Record<string, unknown>): BuildWorkPackageTemplate {
  return {
    id: textValue(row.id),
    client_id: textValue(row.client_id) || null,
    code: textValue(row.code),
    name: textValue(row.name),
    description: textValue(row.description) || null,
    work_package_type: textValue(row.work_package_type) || null,
    category: textValue(row.category) || null,
    version: typeof row.version === "number" ? row.version : Number(row.version || 1),
    is_global: Boolean(row.is_global),
    status: parseStatus(row.status),
    created_by: textValue(row.created_by) || null,
    created_at: textValue(row.created_at),
    updated_at: textValue(row.updated_at),
    archived_at: textValue(row.archived_at) || null
  };
}

function normalizeActivity(row: Record<string, unknown>): BuildActivityTemplate {
  const activityStatus = textValue(row.status).toLowerCase() as BuildActivityTemplateStatus;
  const status: BuildActivityTemplateStatus =
    activityStatus === "draft" || activityStatus === "active" || activityStatus === "inactive" || activityStatus === "archived"
      ? activityStatus
      : "active";
  const durationUnitCandidate = textValue(row.duration_unit).toLowerCase() as BuildActivityDurationUnit;
  const durationUnit: BuildActivityDurationUnit =
    durationUnitCandidate === "hours" || durationUnitCandidate === "days" || durationUnitCandidate === "weeks"
      ? durationUnitCandidate
      : "days";

  return {
    id: textValue(row.id),
    template_id: textValue(row.template_id),
    activity_category_id: textValue(row.activity_category_id),
    sequence: Number(row.sequence || 0),
    code: textValue(row.code),
    name: textValue(row.name),
    description: textValue(row.description) || null,
    estimated_duration: row.estimated_duration === null ? null : Number(row.estimated_duration || 0),
    duration_unit: durationUnit,
    mandatory: Boolean(row.mandatory),
    requires_photo: Boolean(row.requires_photo),
    requires_gps: Boolean(row.requires_gps),
    requires_approval: Boolean(row.requires_approval),
    status,
    notes: textValue(row.notes) || null,
    created_at: textValue(row.created_at),
    updated_at: textValue(row.updated_at),
    archived_at: textValue(row.archived_at) || null
  };
}

function parseCategoryType(value: unknown): BuildActivityCategoryType {
  const candidate = textValue(value).toLowerCase().replace(/[\s-]+/g, "_") as BuildActivityCategoryType;
  if (
    candidate === "preparation" ||
    candidate === "execution" ||
    candidate === "inspection" ||
    candidate === "testing" ||
    candidate === "commissioning" ||
    candidate === "close_out" ||
    candidate === "general"
  ) {
    return candidate;
  }
  return "general";
}

function parseCategoryStatus(value: unknown): BuildActivityCategoryStatus {
  const candidate = textValue(value).toLowerCase() as BuildActivityCategoryStatus;
  if (candidate === "active" || candidate === "archived") return candidate;
  return "active";
}

function normalizeActivityCategory(row: Record<string, unknown>): BuildActivityCategory {
  return {
    id: textValue(row.id),
    template_id: textValue(row.template_id),
    sequence: Number(row.sequence || 1),
    code: textValue(row.code),
    name: textValue(row.name),
    description: textValue(row.description) || null,
    category_type: parseCategoryType(row.category_type),
    estimated_duration: row.estimated_duration === null ? null : Number(row.estimated_duration || 0),
    status: parseCategoryStatus(row.status),
    created_at: textValue(row.created_at),
    updated_at: textValue(row.updated_at)
  };
}

function validateActivityCategoryIntegrity(params: {
  templateId: string;
  categories: BuildActivityCategory[];
  activities: BuildActivityTemplate[];
}) {
  const categoryMap = new Map(params.categories.map((item) => [item.id, item]));

  for (const activity of params.activities) {
    if (!activity.activity_category_id) {
      throw new AccessControlError("Activity template validation failed: activity_category_id is required.", 400);
    }

    const category = categoryMap.get(activity.activity_category_id);
    if (!category) {
      throw new AccessControlError(
        "Activity template validation failed: activity category is missing or not visible.",
        400
      );
    }

    if (category.template_id !== params.templateId || activity.template_id !== params.templateId) {
      throw new AccessControlError(
        "Activity template validation failed: category and activity must belong to the same template.",
        400
      );
    }
  }
}

function normalizeChecklist(row: Record<string, unknown>): BuildChecklistTemplate {
  return {
    id: textValue(row.id),
    activity_template_id: textValue(row.activity_template_id),
    sequence: Number(row.sequence || 0),
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

function normalizeInspection(row: Record<string, unknown>): BuildInspectionTemplate {
  return {
    id: textValue(row.id),
    template_id: textValue(row.template_id),
    sequence: Number(row.sequence || 0),
    inspection_type: textValue(row.inspection_type),
    inspector_role: textValue(row.inspector_role) || null,
    frequency: textValue(row.frequency) || null,
    acceptance_criteria: textValue(row.acceptance_criteria) || null,
    created_at: textValue(row.created_at),
    updated_at: textValue(row.updated_at)
  };
}

function normalizeSafety(row: Record<string, unknown>): BuildSafetyTemplate {
  return {
    id: textValue(row.id),
    template_id: textValue(row.template_id),
    sequence: Number(row.sequence || 0),
    task_name: textValue(row.task_name),
    ppe_required: Boolean(row.ppe_required),
    permit_required: Boolean(row.permit_required),
    toolbox_talk_required: Boolean(row.toolbox_talk_required),
    hazard_assessment_required: Boolean(row.hazard_assessment_required),
    notes: textValue(row.notes) || null,
    created_at: textValue(row.created_at),
    updated_at: textValue(row.updated_at)
  };
}

function normalizeSupply(row: Record<string, unknown>): BuildSupplyTemplate {
  return {
    id: textValue(row.id),
    template_id: textValue(row.template_id),
    sequence: Number(row.sequence || 0),
    material: textValue(row.material),
    quantity: row.quantity === null ? null : Number(row.quantity || 0),
    unit: textValue(row.unit) || null,
    preferred_supplier: textValue(row.preferred_supplier) || null,
    delivery_stage: textValue(row.delivery_stage) || null,
    consumption_stage: textValue(row.consumption_stage) || null,
    created_at: textValue(row.created_at),
    updated_at: textValue(row.updated_at)
  };
}

function normalizeEquipment(row: Record<string, unknown>): BuildEquipmentTemplate {
  return {
    id: textValue(row.id),
    template_id: textValue(row.template_id),
    sequence: Number(row.sequence || 0),
    equipment_name: textValue(row.equipment_name),
    quantity: row.quantity === null ? null : Number(row.quantity || 0),
    unit: textValue(row.unit) || null,
    notes: textValue(row.notes) || null,
    created_at: textValue(row.created_at),
    updated_at: textValue(row.updated_at)
  };
}

function normalizeTemplateResourceRequirementPreview(
  row: Record<string, unknown>,
  resource: Record<string, unknown> | null
) {
  return {
    id: textValue(row.id),
    template_id: textValue(row.template_id),
    activity_category_id: textValue(row.activity_category_id) || null,
    activity_template_id: textValue(row.activity_template_id) || null,
    resource_id: textValue(row.resource_id),
    sequence: Number(row.sequence || 1),
    quantity: Number(row.quantity || 0),
    unit_of_measure: textValue(row.unit_of_measure),
    requirement_type: textValue(row.requirement_type),
    required_stage: textValue(row.required_stage) || null,
    mandatory: Boolean(row.mandatory),
    notes: textValue(row.notes) || null,
    resource_type: resource ? textValue(resource.resource_type) || null : null,
    resource_code: resource ? textValue(resource.code) || null : null,
    resource_name: resource ? textValue(resource.name) || null : null,
    resource_category: resource ? textValue(resource.category) || null : null
  };
}

function applyTemplateVisibility<T extends { eq: Function; or: Function }>(
  query: T,
  clientId: string,
  includeGlobal: boolean
) {
  if (includeGlobal) {
    return query.or(`client_id.eq.${clientId},is_global.eq.true`);
  }
  return query.eq("client_id", clientId).eq("is_global", false);
}

async function getVisibleTemplateOrThrow(params: {
  templateId: string;
  clientId: string;
  includeGlobal: boolean;
  includeArchived?: boolean;
}) {
  const supabase = createAdminSupabase();
  let query = supabase.from("build_work_package_templates").select("*").eq("id", params.templateId);
  query = applyTemplateVisibility(query, params.clientId, params.includeGlobal);
  if (!params.includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query.maybeSingle();
  if (error) throw new AccessControlError(`Could not load template: ${error.message}`, 500);
  if (!data) throw new AccessControlError("Template not found or not visible to this tenant.", 404);
  return normalizeTemplate(data as Record<string, unknown>);
}

export async function getTemplates(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  includeArchived?: boolean;
  includeGlobal?: boolean;
}) {
  const access = await assertWorkPackageAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    canWrite: false
  });

  const includeGlobal = params.includeGlobal !== false;
  const includeArchived = Boolean(params.includeArchived);
  if (includeArchived && !access.authContext.is_admin) {
    throw new AccessControlError("Only admins can include archived templates.", 403);
  }

  const supabase = createAdminSupabase();
  let query = supabase.from("build_work_package_templates").select("*").order("name", { ascending: true });
  query = applyTemplateVisibility(query, access.project.client_id, includeGlobal);
  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query;
  if (error) throw new AccessControlError(`Could not load templates: ${error.message}`, 500);
  return (data ?? []).map((row) => normalizeTemplate(row as Record<string, unknown>));
}

export async function getTemplate(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  includeArchived?: boolean;
  includeGlobal?: boolean;
}) {
  const access = await assertWorkPackageAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    canWrite: false
  });

  const template = await getVisibleTemplateOrThrow({
    templateId: textValue(params.templateId),
    clientId: access.project.client_id,
    includeGlobal: params.includeGlobal !== false,
    includeArchived: Boolean(params.includeArchived)
  });

  return template;
}

export async function createTemplate(params: {
  request?: Request;
  input: CreateBuildWorkPackageTemplateInput;
}) {
  const access = await assertWorkPackageAccess({
    request: params.request,
    projectId: params.input.projectId,
    siteId: params.input.siteId,
    workPackageId: params.input.workPackageId,
    canWrite: true
  });

  const code = normalizeCode(params.input.code);
  const name = textValue(params.input.name);
  if (!code) throw new AccessControlError("Template code is required.", 400);
  if (!name) throw new AccessControlError("Template name is required.", 400);

  const isGlobal = Boolean(params.input.isGlobal);
  const payload = {
    client_id: isGlobal ? null : access.project.client_id,
    code,
    name,
    description: textValue(params.input.description) || null,
    work_package_type: textValue(params.input.workPackageType) || null,
    category: textValue(params.input.category) || null,
    version: typeof params.input.version === "number" && params.input.version > 0 ? params.input.version : 1,
    is_global: isGlobal,
    status: parseStatus(params.input.status),
    created_by: access.authContext.user_id
  };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("build_work_package_templates").insert(payload).select("*").single();
  if (error) {
    if (error.code === "23505") throw new AccessControlError("Template code must be unique.", 409);
    throw new AccessControlError(`Could not create template: ${error.message}`, 500);
  }

  return normalizeTemplate(data as Record<string, unknown>);
}

export async function updateTemplate(params: {
  request?: Request;
  input: UpdateBuildWorkPackageTemplateInput;
}) {
  const access = await assertWorkPackageAccess({
    request: params.request,
    projectId: params.input.projectId,
    siteId: params.input.siteId,
    workPackageId: params.input.workPackageId,
    canWrite: true
  });

  const existing = await getVisibleTemplateOrThrow({
    templateId: textValue(params.input.id),
    clientId: access.project.client_id,
    includeGlobal: true,
    includeArchived: true
  });

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };

  if (typeof params.input.code === "string") updates.code = normalizeCode(params.input.code) || existing.code;
  if (typeof params.input.name === "string") updates.name = textValue(params.input.name) || existing.name;
  if ("description" in params.input) updates.description = textValue(params.input.description) || null;
  if ("workPackageType" in params.input) updates.work_package_type = textValue(params.input.workPackageType) || null;
  if ("category" in params.input) updates.category = textValue(params.input.category) || null;
  if (typeof params.input.version === "number" && params.input.version > 0) updates.version = params.input.version;
  if (params.input.status) updates.status = parseStatus(params.input.status);

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_work_package_templates")
    .update(updates)
    .eq("id", existing.id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") throw new AccessControlError("Template code must be unique.", 409);
    throw new AccessControlError(`Could not update template: ${error.message}`, 500);
  }

  return normalizeTemplate(data as Record<string, unknown>);
}

export async function archiveTemplate(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
}) {
  const access = await assertWorkPackageAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    canWrite: true
  });

  const existing = await getVisibleTemplateOrThrow({
    templateId: textValue(params.templateId),
    clientId: access.project.client_id,
    includeGlobal: true,
    includeArchived: true
  });

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_work_package_templates")
    .update({
      archived_at: new Date().toISOString(),
      status: "archived",
      updated_at: new Date().toISOString()
    })
    .eq("id", existing.id)
    .select("*")
    .single();

  if (error) throw new AccessControlError(`Could not archive template: ${error.message}`, 500);
  return normalizeTemplate(data as Record<string, unknown>);
}

export async function instantiateTemplate(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
}) {
  const access = await assertWorkPackageAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    canWrite: false
  });

  const template = await getVisibleTemplateOrThrow({
    templateId: textValue(params.templateId),
    clientId: access.project.client_id,
    includeGlobal: true,
    includeArchived: false
  });

  const supabase = createAdminSupabase();
  const [categoriesRes, activitiesRes, inspectionsRes, safetyRes, suppliesRes, equipmentRes, requirementsRes] = await Promise.all([
    supabase
      .from("build_activity_categories")
      .select("*")
      .eq("template_id", template.id)
      .neq("status", "archived")
      .order("sequence", { ascending: true }),
    supabase
      .from("build_activity_templates")
      .select("*")
      .eq("template_id", template.id)
      .order("sequence", { ascending: true }),
    supabase
      .from("build_inspection_templates")
      .select("*")
      .eq("template_id", template.id)
      .order("sequence", { ascending: true }),
    supabase
      .from("build_safety_templates")
      .select("*")
      .eq("template_id", template.id)
      .order("sequence", { ascending: true }),
    supabase
      .from("build_supply_templates")
      .select("*")
      .eq("template_id", template.id)
      .order("sequence", { ascending: true }),
    supabase
      .from("build_equipment_templates")
      .select("*")
      .eq("template_id", template.id)
      .order("sequence", { ascending: true }),
    supabase
      .from("build_template_resource_requirements")
      .select("*")
      .eq("template_id", template.id)
      .is("archived_at", null)
      .order("sequence", { ascending: true })
  ]);

  if (categoriesRes.error) throw new AccessControlError(`Could not load activity categories: ${categoriesRes.error.message}`, 500);
  if (activitiesRes.error) throw new AccessControlError(`Could not load activity templates: ${activitiesRes.error.message}`, 500);
  if (inspectionsRes.error) throw new AccessControlError(`Could not load inspection templates: ${inspectionsRes.error.message}`, 500);
  if (safetyRes.error) throw new AccessControlError(`Could not load safety templates: ${safetyRes.error.message}`, 500);
  if (suppliesRes.error) throw new AccessControlError(`Could not load supply templates: ${suppliesRes.error.message}`, 500);
  if (equipmentRes.error) throw new AccessControlError(`Could not load equipment templates: ${equipmentRes.error.message}`, 500);
  if (requirementsRes.error) {
    throw new AccessControlError(`Could not load template resource requirements: ${requirementsRes.error.message}`, 500);
  }

  const categories = (categoriesRes.data ?? []).map((row) => normalizeActivityCategory(row as Record<string, unknown>));
  const activities = (activitiesRes.data ?? []).map((row) => normalizeActivity(row as Record<string, unknown>));
  validateActivityCategoryIntegrity({
    templateId: template.id,
    categories,
    activities
  });

  const activityIds = activities.map((activity) => activity.id);
  const checklists = activityIds.length
    ? await (async () => {
        const { data, error } = await supabase
          .from("build_checklist_templates")
          .select("*")
          .in("activity_template_id", activityIds)
          .order("sequence", { ascending: true });
        if (error) throw new AccessControlError(`Could not load checklist templates: ${error.message}`, 500);
        return (data ?? []).map((row) => normalizeChecklist(row as Record<string, unknown>));
      })()
    : [];

  const requirementRows = (requirementsRes.data ?? []) as Array<Record<string, unknown>>;
  const resourceIds = Array.from(new Set(requirementRows.map((item) => textValue(item.resource_id)).filter(Boolean)));

  const resourceMap = new Map<string, Record<string, unknown>>();
  if (resourceIds.length > 0) {
    const { data: resourceRows, error: resourceError } = await supabase
      .from("build_resources")
      .select("id, code, name, resource_type, category")
      .in("id", resourceIds)
      .or(`client_id.eq.${access.project.client_id},is_global.eq.true`);

    if (resourceError) {
      throw new AccessControlError(`Could not load resource catalogue details: ${resourceError.message}`, 500);
    }

    for (const row of resourceRows ?? []) {
      const id = textValue(row.id);
      if (!id) continue;
      resourceMap.set(id, row as Record<string, unknown>);
    }
  }

  const resourceRequirements = requirementRows.map((row) => {
    const resourceId = textValue(row.resource_id);
    return normalizeTemplateResourceRequirementPreview(row, resourceMap.get(resourceId) ?? null);
  });

  const bundle: BuildWorkPackageTemplateBundle = {
    template,
    categories,
    activities,
    checklists,
    inspections: (inspectionsRes.data ?? []).map((row) => normalizeInspection(row as Record<string, unknown>)),
    safety: (safetyRes.data ?? []).map((row) => normalizeSafety(row as Record<string, unknown>)),
    supplies: (suppliesRes.data ?? []).map((row) => normalizeSupply(row as Record<string, unknown>)),
    equipment: (equipmentRes.data ?? []).map((row) => normalizeEquipment(row as Record<string, unknown>))
  };

  const dependencyResult = await getDependencies({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    templateId: template.id,
    includeArchived: false
  });

  const activityById = new Map(bundle.activities.map((activity) => [activity.id, activity]));
  const executionFlow = {
    orderedActivities: dependencyResult.graphValidation.topologicalOrder.map((activityId) => {
      const activity = activityById.get(activityId);
      return {
        activityTemplateId: activityId,
        code: activity?.code ?? null,
        name: activity?.name ?? null
      };
    }),
    edges: dependencyResult.dependencies.map((dependency) => ({
      predecessorActivityTemplateId: dependency.predecessor_activity_template_id,
      successorActivityTemplateId: dependency.successor_activity_template_id,
      dependencyType: dependency.dependency_type,
      lagValue: dependency.lag_value,
      lagUnit: dependency.lag_unit,
      mandatory: dependency.mandatory
    })),
    graphValidation: dependencyResult.graphValidation
  };

  const categoryMap = new Map(bundle.categories.map((category) => [category.id, category]));
  const checklistsByActivityId = new Map<string, BuildChecklistTemplate[]>();
  for (const checklist of bundle.checklists) {
    const list = checklistsByActivityId.get(checklist.activity_template_id) ?? [];
    list.push(checklist);
    checklistsByActivityId.set(checklist.activity_template_id, list);
  }

  const groupedHierarchy = bundle.categories.map((category) => {
    const activities = bundle.activities
      .filter((activity) => activity.activity_category_id === category.id)
      .sort((a, b) => a.sequence - b.sequence)
      .map((activity) => ({
        ...activity,
        checklistItems: (checklistsByActivityId.get(activity.id) ?? []).sort((a, b) => a.sequence - b.sequence)
      }));

    return {
      category,
      activities
    };
  });

  const templateValidation = buildTemplateValidationSummary({
    categories: bundle.categories.map((category) => ({
      id: category.id,
      template_id: category.template_id,
      sequence: category.sequence,
      code: category.code,
      name: category.name,
      status: category.status
    })),
    activities: bundle.activities,
    checklists: bundle.checklists,
    dependencies: dependencyResult.dependencies,
    requirementRows: resourceRequirements.map((item) => ({
      quantity: item.quantity,
      unit_of_measure: item.unit_of_measure,
      activity_template_id: item.activity_template_id
    }))
  });

  const dependencyByActivityId = new Map<string, { predecessor: number; successor: number }>();
  for (const activity of bundle.activities) {
    dependencyByActivityId.set(activity.id, { predecessor: 0, successor: 0 });
  }
  for (const dependency of dependencyResult.dependencies) {
    const predecessor = dependencyByActivityId.get(dependency.predecessor_activity_template_id);
    if (predecessor) predecessor.successor += 1;
    const successor = dependencyByActivityId.get(dependency.successor_activity_template_id);
    if (successor) successor.predecessor += 1;
  }

  const resourceByActivityId = new Map<string, number>();
  for (const requirement of resourceRequirements) {
    if (!requirement.activity_template_id) continue;
    resourceByActivityId.set(
      requirement.activity_template_id,
      (resourceByActivityId.get(requirement.activity_template_id) ?? 0) + 1
    );
  }

  const hierarchyCounts = {
    categories: bundle.categories.length,
    activities: bundle.activities.length,
    checklists: bundle.checklists.length,
    dependencies: dependencyResult.dependencies.length,
    resourceRequirements: resourceRequirements.length
  };

  return {
    context: {
      projectId: access.project.id,
      siteId: access.site.id,
      workPackageId: params.workPackageId
    },
    instantiatePreview: {
      categoriesCount: bundle.categories.length,
      activitiesCount: bundle.activities.length,
      checklistsCount: bundle.checklists.length,
      inspectionsCount: bundle.inspections.length,
      safetyCount: bundle.safety.length,
      suppliesCount: bundle.supplies.length,
      equipmentCount: bundle.equipment.length,
      resourceRequirementsCount: resourceRequirements.length,
      dependenciesCount: dependencyResult.dependencies.length,
      hierarchyCounts,
      warnings: templateValidation.warnings,
      errors: templateValidation.errors
    },
    bundle,
    hierarchy: groupedHierarchy.map((entry) => ({
      category: entry.category,
      activities: entry.activities.map((activity) => ({
        ...activity,
        dependencyCount: dependencyByActivityId.get(activity.id) ?? { predecessor: 0, successor: 0 },
        resourceRequirementCount: resourceByActivityId.get(activity.id) ?? 0
      }))
    })),
    resourceRequirements,
    dependencies: dependencyResult.dependencies,
    templateValidation,
    executionFlow
  };
}

export async function assignTemplateToWorkPackage(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string | null;
}) {
  const access = await assertWorkPackageAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    canWrite: true
  });

  const normalizedTemplateId = textValue(params.templateId);
  if (normalizedTemplateId) {
    const template = await getVisibleTemplateOrThrow({
      templateId: normalizedTemplateId,
      clientId: access.project.client_id,
      includeGlobal: true,
      includeArchived: false
    });

    if (template.status !== "active") {
      throw new AccessControlError("Only active templates can be assigned to a Work Package.", 400);
    }
  }

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("build_work_packages")
    .update({
      template_id: normalizedTemplateId || null,
      updated_at: new Date().toISOString()
    })
    .eq("id", params.workPackageId)
    .eq("client_id", access.project.client_id)
    .eq("project_id", access.project.id)
    .eq("site_id", access.site.id);

  if (error) throw new AccessControlError(`Could not assign template to Work Package: ${error.message}`, 500);

  const workPackage = await getWorkPackage({
    request: params.request,
    projectId: access.project.id,
    siteId: access.site.id,
    workPackageId: params.workPackageId,
    includeArchived: true
  });

  return workPackage;
}

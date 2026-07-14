import { AccessControlError } from "@/lib/accessControl";
import { assertWorkPackageAccess, getWorkPackage } from "@/lib/build/workPackages/service";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type {
  BuildActivityTemplate,
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
  return {
    id: textValue(row.id),
    template_id: textValue(row.template_id),
    sequence: Number(row.sequence || 0),
    code: textValue(row.code),
    name: textValue(row.name),
    description: textValue(row.description) || null,
    estimated_duration: row.estimated_duration === null ? null : Number(row.estimated_duration || 0),
    mandatory: Boolean(row.mandatory),
    requires_photo: Boolean(row.requires_photo),
    requires_gps: Boolean(row.requires_gps),
    requires_approval: Boolean(row.requires_approval),
    created_at: textValue(row.created_at),
    updated_at: textValue(row.updated_at)
  };
}

function normalizeChecklist(row: Record<string, unknown>): BuildChecklistTemplate {
  return {
    id: textValue(row.id),
    activity_template_id: textValue(row.activity_template_id),
    sequence: Number(row.sequence || 0),
    item: textValue(row.item),
    mandatory: Boolean(row.mandatory),
    created_at: textValue(row.created_at),
    updated_at: textValue(row.updated_at)
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
  const [activitiesRes, inspectionsRes, safetyRes, suppliesRes, equipmentRes] = await Promise.all([
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
      .order("sequence", { ascending: true })
  ]);

  if (activitiesRes.error) throw new AccessControlError(`Could not load activity templates: ${activitiesRes.error.message}`, 500);
  if (inspectionsRes.error) throw new AccessControlError(`Could not load inspection templates: ${inspectionsRes.error.message}`, 500);
  if (safetyRes.error) throw new AccessControlError(`Could not load safety templates: ${safetyRes.error.message}`, 500);
  if (suppliesRes.error) throw new AccessControlError(`Could not load supply templates: ${suppliesRes.error.message}`, 500);
  if (equipmentRes.error) throw new AccessControlError(`Could not load equipment templates: ${equipmentRes.error.message}`, 500);

  const activities = (activitiesRes.data ?? []).map((row) => normalizeActivity(row as Record<string, unknown>));

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

  const bundle: BuildWorkPackageTemplateBundle = {
    template,
    activities,
    checklists,
    inspections: (inspectionsRes.data ?? []).map((row) => normalizeInspection(row as Record<string, unknown>)),
    safety: (safetyRes.data ?? []).map((row) => normalizeSafety(row as Record<string, unknown>)),
    supplies: (suppliesRes.data ?? []).map((row) => normalizeSupply(row as Record<string, unknown>)),
    equipment: (equipmentRes.data ?? []).map((row) => normalizeEquipment(row as Record<string, unknown>))
  };

  return {
    context: {
      projectId: access.project.id,
      siteId: access.site.id,
      workPackageId: params.workPackageId
    },
    instantiatePreview: {
      activitiesCount: bundle.activities.length,
      checklistsCount: bundle.checklists.length,
      inspectionsCount: bundle.inspections.length,
      safetyCount: bundle.safety.length,
      suppliesCount: bundle.supplies.length,
      equipmentCount: bundle.equipment.length
    },
    bundle
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

import { AccessControlError } from "@/lib/accessControl";
import { assertActivityTemplateAccess } from "@/lib/build/activityTemplates/service";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type {
  BuildChecklistTemplate,
  CreateBuildChecklistTemplateInput,
  ReorderBuildChecklistTemplatesInput,
  UpdateBuildChecklistTemplateInput
} from "@/lib/build/templates/types";

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

async function getChecklistByIdOrThrow(id: string) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("build_checklist_templates").select("*").eq("id", id).maybeSingle();
  if (error) throw new AccessControlError(`Could not resolve checklist template: ${error.message}`, 500);
  if (!data) throw new AccessControlError("Checklist template not found.", 404);
  return normalizeChecklist(data as Record<string, unknown>);
}

export async function assertChecklistTemplateAccess(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  activityTemplateId?: string;
  checklistTemplateId?: string;
  canWrite?: boolean;
}) {
  const access = await assertActivityTemplateAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    templateId: params.templateId,
    activityTemplateId: params.activityTemplateId,
    canWrite: params.canWrite
  });

  let checklist: BuildChecklistTemplate | null = null;
  const checklistTemplateId = textValue(params.checklistTemplateId);
  if (checklistTemplateId) {
    checklist = await getChecklistByIdOrThrow(checklistTemplateId);
    if (access.activity && checklist.activity_template_id !== access.activity.id) {
      throw new AccessControlError("Checklist template does not belong to the selected activity template.", 400);
    }
    if (!access.activity) {
      const activity = await createAdminSupabase()
        .from("build_activity_templates")
        .select("id, template_id")
        .eq("id", checklist.activity_template_id)
        .maybeSingle();
      if (activity.error) throw new AccessControlError(`Could not resolve checklist activity scope: ${activity.error.message}`, 500);
      if (!activity.data || textValue(activity.data.template_id) !== access.template.id) {
        throw new AccessControlError("Checklist template is outside the selected template scope.", 403);
      }
    }
  }

  return {
    ...access,
    checklist
  };
}

export async function getChecklistTemplates(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  activityTemplateId: string;
  includeArchived?: boolean;
}) {
  const access = await assertChecklistTemplateAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    templateId: params.templateId,
    activityTemplateId: params.activityTemplateId,
    canWrite: false
  });

  if (!access.activity) throw new AccessControlError("Activity template not found.", 404);

  const includeArchived = Boolean(params.includeArchived);
  if (includeArchived && !access.authContext.is_admin) {
    throw new AccessControlError("Only admins can include archived checklist templates.", 403);
  }

  const supabase = createAdminSupabase();
  let query = supabase
    .from("build_checklist_templates")
    .select("*")
    .eq("activity_template_id", access.activity.id)
    .order("sequence", { ascending: true });

  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query;
  if (error) throw new AccessControlError(`Could not load checklist templates: ${error.message}`, 500);

  return (data ?? []).map((row) => normalizeChecklist(row as Record<string, unknown>));
}

export async function getChecklistTemplateById(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  activityTemplateId: string;
  checklistTemplateId: string;
  includeArchived?: boolean;
}) {
  const access = await assertChecklistTemplateAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    templateId: params.templateId,
    activityTemplateId: params.activityTemplateId,
    checklistTemplateId: params.checklistTemplateId,
    canWrite: false
  });

  if (!access.checklist) return null;
  if (!params.includeArchived && access.checklist.archived_at) return null;
  return access.checklist;
}

export async function createChecklistTemplate(params: {
  request?: Request;
  input: CreateBuildChecklistTemplateInput;
}) {
  const input = params.input;
  const access = await assertChecklistTemplateAccess({
    request: params.request,
    projectId: input.projectId,
    siteId: input.siteId,
    workPackageId: input.workPackageId,
    templateId: input.templateId,
    activityTemplateId: input.activityTemplateId,
    canWrite: true
  });

  if (access.template.is_global) {
    throw new AccessControlError(
      "Global template write operations are disabled until platform-admin and tenant-admin roles are separated.",
      403
    );
  }

  if (access.template.archived_at || textValue(access.template.status).toLowerCase() === "archived") {
    throw new AccessControlError("Archived templates cannot receive checklist items.", 400);
  }

  const activity = access.activity;
  if (!activity) throw new AccessControlError("Activity template not found.", 404);
  if (activity.archived_at || activity.status === "archived") {
    throw new AccessControlError("Archived activity templates cannot receive checklist items.", 400);
  }

  const item = textValue(input.item);
  if (!item) throw new AccessControlError("Checklist item is required.", 400);

  const payload = {
    activity_template_id: activity.id,
    sequence: typeof input.sequence === "number" && input.sequence > 0 ? Math.round(input.sequence) : 1,
    item,
    description: textValue(input.description) || null,
    mandatory: typeof input.mandatory === "boolean" ? input.mandatory : true,
    requires_photo: typeof input.requiresPhoto === "boolean" ? input.requiresPhoto : false,
    requires_comment: typeof input.requiresComment === "boolean" ? input.requiresComment : false,
    acceptance_type: textValue(input.acceptanceType) || null
  };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("build_checklist_templates").insert(payload).select("*").single();
  if (error) {
    if (error.code === "23505") {
      throw new AccessControlError("Checklist sequence must be unique within the activity template.", 409);
    }
    throw new AccessControlError(`Could not create checklist template: ${error.message}`, 500);
  }

  return normalizeChecklist(data as Record<string, unknown>);
}

export async function updateChecklistTemplate(params: {
  request?: Request;
  input: UpdateBuildChecklistTemplateInput;
}) {
  const input = params.input;

  const current = await getChecklistByIdOrThrow(textValue(input.id));
  const access = await assertChecklistTemplateAccess({
    request: params.request,
    projectId: input.projectId,
    siteId: input.siteId,
    workPackageId: input.workPackageId,
    templateId: input.templateId,
    activityTemplateId: current.activity_template_id,
    checklistTemplateId: input.id,
    canWrite: true
  });

  if (access.template.is_global) {
    throw new AccessControlError(
      "Global template write operations are disabled until platform-admin and tenant-admin roles are separated.",
      403
    );
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };

  if (typeof input.sequence === "number") {
    if (!Number.isInteger(input.sequence) || input.sequence <= 0) {
      throw new AccessControlError("sequence must be an integer greater than zero.", 400);
    }
    updates.sequence = input.sequence;
  }
  if (typeof input.item === "string") {
    const item = textValue(input.item);
    if (!item) throw new AccessControlError("Checklist item cannot be empty.", 400);
    updates.item = item;
  }
  if ("description" in input) updates.description = textValue(input.description) || null;
  if (typeof input.mandatory === "boolean") updates.mandatory = input.mandatory;
  if (typeof input.requiresPhoto === "boolean") updates.requires_photo = input.requiresPhoto;
  if (typeof input.requiresComment === "boolean") updates.requires_comment = input.requiresComment;
  if ("acceptanceType" in input) updates.acceptance_type = textValue(input.acceptanceType) || null;

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_checklist_templates")
    .update(updates)
    .eq("id", current.id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new AccessControlError("Checklist sequence must be unique within the activity template.", 409);
    }
    throw new AccessControlError(`Could not update checklist template: ${error.message}`, 500);
  }

  return normalizeChecklist(data as Record<string, unknown>);
}

export async function archiveChecklistTemplate(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  checklistTemplateId: string;
}) {
  const checklist = await getChecklistByIdOrThrow(textValue(params.checklistTemplateId));
  const access = await assertChecklistTemplateAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    templateId: params.templateId,
    activityTemplateId: checklist.activity_template_id,
    checklistTemplateId: checklist.id,
    canWrite: true
  });

  if (access.template.is_global) {
    throw new AccessControlError(
      "Global template write operations are disabled until platform-admin and tenant-admin roles are separated.",
      403
    );
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_checklist_templates")
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", checklist.id)
    .select("*")
    .single();

  if (error) throw new AccessControlError(`Could not archive checklist template: ${error.message}`, 500);
  return normalizeChecklist(data as Record<string, unknown>);
}

export async function reorderChecklistTemplates(params: {
  request?: Request;
  input: ReorderBuildChecklistTemplatesInput;
}) {
  const input = params.input;
  const access = await assertChecklistTemplateAccess({
    request: params.request,
    projectId: input.projectId,
    siteId: input.siteId,
    workPackageId: input.workPackageId,
    templateId: input.templateId,
    activityTemplateId: input.activityTemplateId,
    canWrite: true
  });

  if (access.template.is_global) {
    throw new AccessControlError(
      "Global template write operations are disabled until platform-admin and tenant-admin roles are separated.",
      403
    );
  }

  if (!access.activity) throw new AccessControlError("Activity template not found.", 404);

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_checklist_templates")
    .select("*")
    .eq("activity_template_id", access.activity.id)
    .is("archived_at", null)
    .order("sequence", { ascending: true });

  if (error) throw new AccessControlError(`Could not load checklist templates: ${error.message}`, 500);

  const items = (data ?? []).map((row) => normalizeChecklist(row as Record<string, unknown>));
  const orderedIds = input.orderedChecklistTemplateIds.map((id) => textValue(id)).filter(Boolean);
  const expectedIds = new Set(items.map((item) => item.id));

  if (expectedIds.size !== orderedIds.length || orderedIds.some((id) => !expectedIds.has(id))) {
    throw new AccessControlError(
      "orderedChecklistTemplateIds must include each non-archived checklist item exactly once.",
      400
    );
  }

  for (let index = 0; index < orderedIds.length; index += 1) {
    const id = orderedIds[index];
    const tempSequence = 100000 + index + 1;
    const tempRes = await supabase
      .from("build_checklist_templates")
      .update({ sequence: tempSequence, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("activity_template_id", access.activity.id);
    if (tempRes.error) throw new AccessControlError(`Could not reorder checklist templates: ${tempRes.error.message}`, 500);
  }

  for (let index = 0; index < orderedIds.length; index += 1) {
    const id = orderedIds[index];
    const finalSequence = index + 1;
    const finalRes = await supabase
      .from("build_checklist_templates")
      .update({ sequence: finalSequence, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("activity_template_id", access.activity.id);
    if (finalRes.error) {
      throw new AccessControlError(`Could not finalize checklist reorder: ${finalRes.error.message}`, 500);
    }
  }

  return await getChecklistTemplates({
    request: params.request,
    projectId: input.projectId,
    siteId: input.siteId,
    workPackageId: input.workPackageId,
    templateId: input.templateId,
    activityTemplateId: input.activityTemplateId,
    includeArchived: false
  });
}

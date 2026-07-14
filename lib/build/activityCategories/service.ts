import { AccessControlError } from "@/lib/accessControl";
import { assertWorkPackageAccess } from "@/lib/build/workPackages/service";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type {
  BuildActivityCategory,
  BuildActivityCategoryStatus,
  BuildActivityCategoryType,
  CreateBuildActivityCategoryInput,
  UpdateBuildActivityCategoryInput
} from "@/lib/build/templates/types";

type BuildTemplateRow = {
  id: string;
  client_id: string | null;
  is_global: boolean;
  archived_at: string | null;
};

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCode(value: unknown) {
  return textValue(value)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
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

function parseStatus(value: unknown): BuildActivityCategoryStatus {
  const candidate = textValue(value).toLowerCase() as BuildActivityCategoryStatus;
  if (candidate === "active" || candidate === "archived") return candidate;
  return "active";
}

function normalizeCategory(row: Record<string, unknown>): BuildActivityCategory {
  return {
    id: textValue(row.id),
    template_id: textValue(row.template_id),
    sequence: Number(row.sequence || 1),
    code: textValue(row.code),
    name: textValue(row.name),
    description: textValue(row.description) || null,
    category_type: parseCategoryType(row.category_type),
    estimated_duration: row.estimated_duration === null ? null : Number(row.estimated_duration || 0),
    status: parseStatus(row.status),
    created_at: textValue(row.created_at),
    updated_at: textValue(row.updated_at)
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
  if (!data) throw new AccessControlError("Template not found or not visible.", 404);
  return data as BuildTemplateRow;
}

export async function assertCategoryAccess(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  categoryId?: string;
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

  let category: BuildActivityCategory | null = null;
  const categoryId = textValue(params.categoryId);
  if (categoryId) {
    const supabase = createAdminSupabase();
    const { data, error } = await supabase
      .from("build_activity_categories")
      .select("*")
      .eq("id", categoryId)
      .maybeSingle();
    if (error) throw new AccessControlError(`Could not resolve category: ${error.message}`, 500);
    if (!data) throw new AccessControlError("Activity Category not found.", 404);

    const normalized = normalizeCategory(data as Record<string, unknown>);
    if (normalized.template_id !== template.id) {
      throw new AccessControlError("Activity Category does not belong to the specified template.", 400);
    }
    category = normalized;
  }

  return {
    authContext: access.authContext,
    project: access.project,
    site: access.site,
    workPackage: access.workPackage,
    template,
    category
  };
}

export async function getCategories(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  includeArchived?: boolean;
}) {
  const access = await assertCategoryAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    templateId: params.templateId,
    canWrite: false
  });

  const includeArchived = Boolean(params.includeArchived);
  if (includeArchived && !access.authContext.is_admin) {
    throw new AccessControlError("Only admins can include archived categories.", 403);
  }

  const supabase = createAdminSupabase();
  let query = supabase
    .from("build_activity_categories")
    .select("*")
    .eq("template_id", access.template.id)
    .order("sequence", { ascending: true });

  if (!includeArchived) {
    query = query.neq("status", "archived");
  }

  const { data, error } = await query;
  if (error) throw new AccessControlError(`Could not load categories: ${error.message}`, 500);
  return (data ?? []).map((row) => normalizeCategory(row as Record<string, unknown>));
}

export async function getCategory(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  categoryId: string;
  includeArchived?: boolean;
}) {
  const access = await assertCategoryAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    templateId: params.templateId,
    categoryId: params.categoryId,
    canWrite: false
  });

  const category = access.category;
  if (!category) return null;
  if (!params.includeArchived && category.status === "archived") return null;
  return category;
}

export async function createCategory(params: {
  request?: Request;
  input: CreateBuildActivityCategoryInput;
}) {
  const input = params.input;
  const access = await assertCategoryAccess({
    request: params.request,
    projectId: input.projectId,
    siteId: input.siteId,
    workPackageId: input.workPackageId,
    templateId: input.templateId,
    canWrite: true
  });

  const code = normalizeCode(input.code);
  const name = textValue(input.name);
  if (!code) throw new AccessControlError("Category code is required.", 400);
  if (!name) throw new AccessControlError("Category name is required.", 400);

  const supabase = createAdminSupabase();
  const payload = {
    template_id: access.template.id,
    sequence: typeof input.sequence === "number" && input.sequence > 0 ? input.sequence : 1,
    code,
    name,
    description: textValue(input.description) || null,
    category_type: parseCategoryType(input.categoryType),
    estimated_duration:
      typeof input.estimatedDuration === "number" && input.estimatedDuration >= 0
        ? input.estimatedDuration
        : null,
    status: parseStatus(input.status)
  };

  const { data, error } = await supabase.from("build_activity_categories").insert(payload).select("*").single();
  if (error) {
    if (error.code === "23505") {
      throw new AccessControlError("Category code and sequence must be unique within template.", 409);
    }
    throw new AccessControlError(`Could not create category: ${error.message}`, 500);
  }

  return normalizeCategory(data as Record<string, unknown>);
}

export async function updateCategory(params: {
  request?: Request;
  input: UpdateBuildActivityCategoryInput;
}) {
  const input = params.input;
  const access = await assertCategoryAccess({
    request: params.request,
    projectId: input.projectId,
    siteId: input.siteId,
    workPackageId: input.workPackageId,
    templateId: input.templateId,
    categoryId: input.id,
    canWrite: true
  });

  const current = access.category;
  if (!current) throw new AccessControlError("Activity Category not found.", 404);

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };

  if (typeof input.sequence === "number" && input.sequence > 0) updates.sequence = input.sequence;
  if (typeof input.code === "string") updates.code = normalizeCode(input.code) || current.code;
  if (typeof input.name === "string") updates.name = textValue(input.name) || current.name;
  if ("description" in input) updates.description = textValue(input.description) || null;
  if ("categoryType" in input) updates.category_type = parseCategoryType(input.categoryType);
  if ("estimatedDuration" in input) {
    updates.estimated_duration =
      typeof input.estimatedDuration === "number" && input.estimatedDuration >= 0 ? input.estimatedDuration : null;
  }
  if (input.status) updates.status = parseStatus(input.status);

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_activity_categories")
    .update(updates)
    .eq("id", current.id)
    .eq("template_id", access.template.id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new AccessControlError("Category code and sequence must be unique within template.", 409);
    }
    throw new AccessControlError(`Could not update category: ${error.message}`, 500);
  }

  return normalizeCategory(data as Record<string, unknown>);
}

export async function archiveCategory(params: {
  request?: Request;
  projectId: string;
  siteId: string;
  workPackageId: string;
  templateId: string;
  categoryId: string;
}) {
  const access = await assertCategoryAccess({
    request: params.request,
    projectId: params.projectId,
    siteId: params.siteId,
    workPackageId: params.workPackageId,
    templateId: params.templateId,
    categoryId: params.categoryId,
    canWrite: true
  });

  const current = access.category;
  if (!current) throw new AccessControlError("Activity Category not found.", 404);

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_activity_categories")
    .update({
      status: "archived",
      updated_at: new Date().toISOString()
    })
    .eq("id", current.id)
    .eq("template_id", access.template.id)
    .select("*")
    .single();

  if (error) throw new AccessControlError(`Could not archive category: ${error.message}`, 500);
  return normalizeCategory(data as Record<string, unknown>);
}

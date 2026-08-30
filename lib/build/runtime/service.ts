import { AccessControlError } from "@/lib/accessControl";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { assertWorkPackageAccess } from "@/lib/build/workPackages/service";
import { instantiateTemplate } from "@/lib/build/templates/service";
import type { BuildRuntimeActivity, BuildWorkPlan } from "@/lib/build/runtime/types";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function loadWorkPlanByScope(params: { clientId: string; projectId: string; siteId: string; workPackageId: string }) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_work_plans")
    .select("*")
    .eq("client_id", params.clientId)
    .eq("project_id", params.projectId)
    .eq("site_id", params.siteId)
    .eq("work_package_id", params.workPackageId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new AccessControlError(`Could not load Work Plan: ${error.message}`, 500);
  return data as Record<string, unknown> | null;
}

async function hydrateWorkPlan(row: Record<string, unknown>): Promise<BuildWorkPlan> {
  const planId = text(row.id);
  const supabase = createAdminSupabase();
  const [activitiesResult, checklistsResult, dependenciesResult, requirementsResult] = await Promise.all([
    supabase.from("build_runtime_activities").select("*").eq("work_plan_id", planId).is("archived_at", null).order("sequence"),
    supabase.from("build_runtime_checklist_items").select("id,runtime_activity_id").eq("work_plan_id", planId).is("archived_at", null),
    supabase.from("build_runtime_dependencies").select("id,successor_runtime_activity_id").eq("work_plan_id", planId),
    supabase.from("build_runtime_resource_requirements").select("id,runtime_activity_id").eq("work_plan_id", planId),
  ]);
  for (const result of [activitiesResult, checklistsResult, dependenciesResult, requirementsResult]) {
    if (result.error) throw new AccessControlError(`Could not load Work Plan details: ${result.error.message}`, 500);
  }

  const checklistCounts = new Map<string, number>();
  const predecessorCounts = new Map<string, number>();
  const resourceCounts = new Map<string, number>();
  for (const item of checklistsResult.data ?? []) checklistCounts.set(item.runtime_activity_id, (checklistCounts.get(item.runtime_activity_id) ?? 0) + 1);
  for (const item of dependenciesResult.data ?? []) predecessorCounts.set(item.successor_runtime_activity_id, (predecessorCounts.get(item.successor_runtime_activity_id) ?? 0) + 1);
  for (const item of requirementsResult.data ?? []) if (item.runtime_activity_id) resourceCounts.set(item.runtime_activity_id, (resourceCounts.get(item.runtime_activity_id) ?? 0) + 1);

  const activities = (activitiesResult.data ?? []).map((item) => ({
    ...item,
    checklist_count: checklistCounts.get(item.id) ?? 0,
    resource_requirement_count: resourceCounts.get(item.id) ?? 0,
    predecessor_count: predecessorCounts.get(item.id) ?? 0,
  })) as BuildRuntimeActivity[];

  return {
    ...(row as Omit<BuildWorkPlan, "counts" | "activities">),
    counts: {
      activities: activities.length,
      checklists: checklistsResult.data?.length ?? 0,
      dependencies: dependenciesResult.data?.length ?? 0,
      resourceRequirements: requirementsResult.data?.length ?? 0,
    },
    activities,
  };
}

export async function getWorkPlan(params: { request?: Request; projectId: string; siteId: string; workPackageId: string }) {
  const access = await assertWorkPackageAccess({ ...params, canWrite: false });
  if (!access.workPackage || access.workPackage.archived_at || access.workPackage.status === "archived") {
    throw new AccessControlError("Work Package is unavailable.", 404);
  }
  const row = await loadWorkPlanByScope({ clientId: access.project.client_id, projectId: access.project.id, siteId: access.site.id, workPackageId: access.workPackage.id });
  return row ? await hydrateWorkPlan(row) : null;
}

export async function createWorkPlan(params: { request?: Request; projectId: string; siteId: string; workPackageId: string }) {
  const access = await assertWorkPackageAccess({ ...params, canWrite: true, allowCustomerAdminWrite: true });
  if (!access.workPackage || access.workPackage.archived_at || access.workPackage.status === "archived") {
    throw new AccessControlError("Work Package is unavailable.", 400);
  }
  if (!access.workPackage.template_id) throw new AccessControlError("Assign an active Operational Template before generating a Work Plan.", 400);

  const preview = await instantiateTemplate({ ...params, request: params.request, templateId: access.workPackage.template_id });
  if (preview.templateValidation.errors.length > 0) {
    throw new AccessControlError("The Operational Template must pass configuration validation before a Work Plan can be generated.", 400);
  }

  const { data, error } = await createAdminSupabase().rpc("create_build_work_plan", {
    p_project_id: access.project.id,
    p_site_id: access.site.id,
    p_work_package_id: access.workPackage.id,
    p_instantiated_by: access.authContext.user_id,
  });
  if (error) throw new AccessControlError(`Could not generate Work Plan: ${error.message}`, 500);
  const row = await loadWorkPlanByScope({ clientId: access.project.client_id, projectId: access.project.id, siteId: access.site.id, workPackageId: access.workPackage.id });
  if (!row || text(row.id) !== text(data)) throw new AccessControlError("The generated Work Plan could not be resolved.", 500);
  return await hydrateWorkPlan(row);
}

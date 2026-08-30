import { AccessControlError } from "@/lib/accessControl";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { assertWorkPackageAccess } from "@/lib/build/workPackages/service";
import { instantiateTemplate } from "@/lib/build/templates/service";
import type { BuildRuntimeActivity, BuildRuntimeActivityExecution, BuildRuntimePerson, BuildWorkPlan } from "@/lib/build/runtime/types";

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
      notStarted: activities.filter((item) => item.status === "not_started").length,
      inProgress: activities.filter((item) => item.status === "in_progress").length,
      completed: activities.filter((item) => item.status === "completed").length,
      blocked: activities.filter((item) => item.status === "blocked").length,
    },
    activities,
  };
}

async function eligiblePeople(clientId: string) {
  const supabase = createAdminSupabase();
  const { data: memberships, error } = await supabase.from("workspace_memberships")
    .select("user_id,role_key,workspace_roles(label,status)").eq("client_id", clientId).eq("status", "active");
  if (error) throw new AccessControlError(`Could not load Activity responsibility options: ${error.message}`, 500);
  const active = (memberships ?? []).filter((row) => !row.workspace_roles || (row.workspace_roles as unknown as { status?: string }).status === "active");
  const userIds = active.map((row) => text(row.user_id)).filter(Boolean);
  const { data: profiles } = userIds.length ? await supabase.from("user_profiles").select("user_id,full_name,email,status").in("user_id", userIds) : { data: [] };
  const profilesById = new Map((profiles ?? []).map((row) => [text(row.user_id), row]));
  const people = active.map((row) => {
    const profile = profilesById.get(text(row.user_id));
    return { userId: text(row.user_id), name: text(profile?.full_name) || text(profile?.email) || "Workspace member", roleLabel: text((row.workspace_roles as unknown as { label?: string })?.label) || text(row.role_key), roleKey: text(row.role_key), profileStatus: text(profile?.status) };
  }).filter((person) => !person.profileStatus || person.profileStatus === "Active")
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    owners: people.filter((person) => new Set(["customer_admin", "workspace_manager", "project_manager", "supervisor", "agency_manager", "installer"]).has(person.roleKey)),
    supervisors: people.filter((person) => new Set(["customer_admin", "workspace_manager", "project_manager", "supervisor"]).has(person.roleKey)),
  };
}

export async function getRuntimeActivityExecution(params: { request?: Request; projectId: string; siteId: string; workPackageId: string; activityId: string }): Promise<BuildRuntimeActivityExecution> {
  const plan = await getWorkPlan(params);
  const activity = plan?.activities.find((item) => item.id === params.activityId);
  if (!plan || !activity) throw new AccessControlError("Activity is unavailable.", 404);
  const supabase = createAdminSupabase();
  const [{ data: events, error: eventError }, { data: dependencies, error: dependencyError }, { data: checklistItems, error: checklistError }, { data: resourceRequirements, error: resourceError }, people] = await Promise.all([
    supabase.from("build_runtime_activity_events").select("*").eq("runtime_activity_id", activity.id)
      .order("occurred_at").order("event_sequence", { nullsFirst: true }),
    supabase.from("build_runtime_dependencies").select("dependency_type,predecessor_runtime_activity_id").eq("successor_runtime_activity_id", activity.id),
    supabase.from("build_runtime_checklist_items").select("id,item,mandatory,status").eq("runtime_activity_id", activity.id).is("archived_at", null).order("sequence"),
    supabase.from("build_runtime_resource_requirements").select("id,resource_name,resource_type,quantity,unit_of_measure,mandatory").eq("runtime_activity_id", activity.id).order("sequence"),
    eligiblePeople(plan.client_id),
  ]);
  if (eventError || dependencyError || checklistError || resourceError) throw new AccessControlError("Activity execution details could not be loaded.", 500);
  const predecessorIds = (dependencies ?? []).map((item) => text(item.predecessor_runtime_activity_id)).filter(Boolean);
  const { data: predecessorRows, error: predecessorError } = predecessorIds.length
    ? await supabase.from("build_runtime_activities").select("id,name,status").eq("work_plan_id", plan.id).in("id", predecessorIds)
    : { data: [], error: null };
  if (predecessorError) throw new AccessControlError("Activity dependency details could not be loaded.", 500);
  const predecessorById = new Map((predecessorRows ?? []).map((item) => [text(item.id), item]));
  const allPeople = new Map([...people.owners, ...people.supervisors].map((person) => [person.userId, person]));
  const safe = (person: typeof people.owners[number]): BuildRuntimePerson => ({ userId: person.userId, name: person.name, roleLabel: person.roleLabel });
  const timeline = (events ?? []).map((event) => ({ ...event, actorName: allPeople.get(text(event.actor_user_id))?.name ?? "Workspace member" })) as BuildRuntimeActivityExecution["events"];
  const legacyTimestampCounts = new Map<string, number>();
  for (const event of timeline) if (event.event_sequence == null) legacyTimestampCounts.set(event.occurred_at, (legacyTimestampCounts.get(event.occurred_at) ?? 0) + 1);
  return {
    activity,
    owner: allPeople.get(activity.activity_owner_user_id ?? "") ? safe(allPeople.get(activity.activity_owner_user_id ?? "")!) : null,
    supervisor: allPeople.get(activity.supervisor_user_id ?? "") ? safe(allPeople.get(activity.supervisor_user_id ?? "")!) : null,
    eligibleOwners: people.owners.map(safe), eligibleSupervisors: people.supervisors.map(safe),
    events: timeline,
    dependencyTypes: (dependencies ?? []).map((item) => text(item.dependency_type)),
    predecessors: (dependencies ?? []).map((item) => {
      const predecessor = predecessorById.get(text(item.predecessor_runtime_activity_id));
      return { id: text(item.predecessor_runtime_activity_id), name: text(predecessor?.name) || "Predecessor Activity", status: (text(predecessor?.status) || "not_started") as BuildRuntimeActivity["status"], dependencyType: text(item.dependency_type) };
    }),
    checklistItems: (checklistItems ?? []).map((item) => ({ id: text(item.id), item: text(item.item), mandatory: Boolean(item.mandatory), status: text(item.status) })),
    resourceRequirements: (resourceRequirements ?? []).map((item) => ({ id: text(item.id), name: text(item.resource_name), type: text(item.resource_type), quantity: Number(item.quantity), unit: text(item.unit_of_measure) || null, mandatory: Boolean(item.mandatory) })),
    hasLegacyAmbiguousOrder: [...legacyTimestampCounts.values()].some((count) => count > 1),
  };
}

export async function getRuntimeActivityProjectScope(params: { clientId: string; projectId: string; activityId: string }) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("build_runtime_activities")
    .select("site_id,work_package_id")
    .eq("client_id", params.clientId)
    .eq("project_id", params.projectId)
    .eq("id", params.activityId)
    .is("archived_at", null)
    .maybeSingle();
  if (error || !data) throw new AccessControlError("Activity is unavailable.", 404);
  return { siteId: text(data.site_id), workPackageId: text(data.work_package_id) };
}

export async function applyRuntimeActivityAction(params: { request?: Request; projectId: string; siteId: string; workPackageId: string; activityId: string; action: string; ownerUserId?: string | null; supervisorUserId?: string | null; note?: string | null }) {
  // Resolve authenticated tenant and full Build ancestry first. The database action
  // then applies the narrower role/owner/supervisor rule for this specific transition.
  const access = await assertWorkPackageAccess({ ...params, canWrite: false });
  const plan = await loadWorkPlanByScope({ clientId: access.project.client_id, projectId: access.project.id, siteId: access.site.id, workPackageId: access.workPackage!.id });
  if (!plan || text(plan.id) === "") throw new AccessControlError("Work Plan is unavailable.", 404);
  if (params.action === "assign_responsibility") {
    const { data: activity, error: activityError } = await createAdminSupabase().from("build_runtime_activities")
      .select("status")
      .eq("id", params.activityId)
      .eq("work_plan_id", text(plan.id))
      .eq("client_id", access.project.client_id)
      .maybeSingle();
    if (activityError || !activity) throw new AccessControlError("Activity is unavailable.", 404);
    if (activity.status === "completed") throw new AccessControlError("Completed Activity responsibility is read-only.", 400);
  }
  const { data, error } = await createAdminSupabase().rpc("apply_build_runtime_activity_action", {
    p_runtime_activity_id: params.activityId, p_action: params.action, p_actor_user_id: access.authContext.user_id,
    p_activity_owner_user_id: params.ownerUserId || null, p_supervisor_user_id: params.supervisorUserId || null, p_note: params.note || null,
  });
  if (error) {
    const messages: Record<string, string> = {
      BUILD_ACTIVITY_FS_PREDECESSOR_INCOMPLETE: "Complete the required predecessor Activity before starting this Activity.",
      BUILD_ACTIVITY_CHECKLIST_INCOMPLETE: "Complete the required checklist before this Activity can be completed.",
      BUILD_ACTIVITY_BLOCKER_REASON_REQUIRED: "Add a blocker reason before reporting this Activity as blocked.",
      BUILD_ACTIVITY_INVALID_TRANSITION: "That Activity action is not valid for its current status.",
    };
    const key = Object.keys(messages).find((candidate) => error.message.includes(candidate));
    throw new AccessControlError(key ? messages[key] : "The Activity action could not be completed.", key ? 400 : 500);
  }
  if (text(data) !== params.activityId) throw new AccessControlError("The Activity update could not be verified.", 500);
  return getRuntimeActivityExecution(params);
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

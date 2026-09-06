import "server-only";

import { createAdminSupabase } from "../../supabaseAdmin.ts";
import { resolveCanonicalBuildProject } from "../projects/service.ts";
import { deriveDependencyIntelligence, type DependencyEdgeIntelligence } from "./dependencyIntelligence.ts";
import { deriveDependencyManagementRollup, type DependencyManagementCounts, type WorkPackageDependencyCounts } from "./dependencyRollup.ts";
import { deriveManagementAttention, type ManagementAttentionSummary } from "./managementAttention.ts";
import { orderManagementAttentionPreview, type BuildManagementAttentionPreview } from "./managementAttentionPreview.ts";
import { buildUtcHistoryBuckets, deriveProgressHistory, type ProgressHistoryResult } from "./progressHistory.ts";
import { deriveProjectProgressRollup, type ProjectProgressRollup } from "./progressRollup.ts";
import { deriveSchedulePerformance, isCurrentlyOverdue, type SchedulePerformance, type SchedulePerformanceState } from "./schedulePerformance.ts";

type Row = Record<string, unknown>;
export type ManagementActivityStatus = "not_started" | "in_progress" | "completed" | "blocked" | "submitted_for_review" | "changes_required" | "approved";
export type ManagementExceptionStatus = "open" | "in_remediation" | "resolved" | "verified";

export type BuildManagementException = {
  id: string; title: string; severity: "low" | "medium" | "high" | "critical"; status: ManagementExceptionStatus;
  ownerUserId: string; ownerName: string; dueAt: string | null; overdue: boolean;
  siteId: string; siteName: string; workPackageId: string; workPackageName: string;
  activityId: string; activityName: string; inspectionOutcome: "accepted" | "changes_required";
  inspectionReviewedAt: string; correctiveEvidenceCount: number;
};

export type BuildManagementSummary = {
  projectId: string;
  hasWorkPlans: boolean;
  activities: Record<ManagementActivityStatus | "total", number>;
  exceptions: Record<ManagementExceptionStatus | "total" | "active" | "overdue" | "critical" | "high", number>;
  schedule: { scheduled: number; currentlyOverdue: number; completedOnTime: number; completedLate: number; workPackagesOverdue: number; blockedOverdue: number; changesRequiredOverdue: number; dataIncomplete: number };
  workPackages: Array<{ id: string; name: string; siteId: string; siteName: string; activities: BuildManagementSummary["activities"]; activeExceptions: number; overdueExceptions: number; schedule: { scheduled: number; notYetDue: number; onSchedule: number; overdue: number; completedOnTime: number; completedLate: number }; dependencies: WorkPackageDependencyCounts }>;
  scheduleResponsibility: Array<{ ownerUserId: string; ownerName: string; assignedScheduled: number; overdueToStart: number; overdueToComplete: number; completedLate: number; blockedOverdue: number; awaitingReview: number }>;
  dependencyFacts: DependencyManagementCounts;
  exceptionsRegister: BuildManagementException[];
  managementAttention: ManagementAttentionSummary;
  managementAttentionPreview: BuildManagementAttentionPreview[];
  progressPerformance: Extract<ProjectProgressRollup, { ok: true }>;
  recentExecution: Extract<ProgressHistoryResult, { ok: true }>;
};

export type BuildExceptionFilters = { status?: string; severity?: string; owner?: string; due?: string; site?: string; workPackage?: string };

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const numeric = (value: unknown) => value === null || value === undefined ? null : typeof value === "number" ? value : Number(value);
const list = (data: Row[] | null) => data ?? [];
const byId = (rows: Row[]) => new Map(rows.map((row) => [text(row.id), row]));
function requireQuery(error: { message?: string } | null, label: string) {
  if (error) throw new Error(`Could not load Build management ${label}: ${error.message ?? "Unknown database error"}`);
}
export function isExceptionOverdue(dueAt: string | null, status: ManagementExceptionStatus, now: Date) {
  if (!dueAt || status === "verified") return false;
  const due = new Date(dueAt);
  return Number.isFinite(due.getTime()) && due.getTime() < now.getTime();
}

function activityCounts(rows: Row[]): BuildManagementSummary["activities"] {
  const count = (status: ManagementActivityStatus) => rows.filter((row) => text(row.status) === status).length;
  return { total: rows.length, not_started: count("not_started"), in_progress: count("in_progress"), completed: count("completed"), blocked: count("blocked"), submitted_for_review: count("submitted_for_review"), changes_required: count("changes_required"), approved: count("approved") };
}

function scheduleCounts(performance: SchedulePerformance[]) {
  const states = performance.map((item) => item.state);
  const count = (...values: SchedulePerformanceState[]) => states.filter((state) => values.includes(state)).length;
  return {
    scheduled: performance.length - count("not_scheduled", "schedule_data_incomplete"),
    notYetDue: count("not_yet_due"),
    onSchedule: count("on_schedule", "awaiting_review"),
    overdue: count("overdue_to_start", "overdue_to_complete"),
    completedOnTime: count("completed_early", "completed_on_time"),
    completedLate: count("completed_late"),
  };
}

export function filterBuildExceptions(rows: BuildManagementException[], filters: BuildExceptionFilters) {
  return rows.filter((row) => {
    if (filters.status && row.status !== filters.status) return false;
    if (filters.severity && row.severity !== filters.severity) return false;
    if (filters.owner && row.ownerUserId !== filters.owner) return false;
    if (filters.site && row.siteId !== filters.site) return false;
    if (filters.workPackage && row.workPackageId !== filters.workPackage) return false;
    if (filters.due === "overdue" && !row.overdue) return false;
    if (filters.due === "due" && (!row.dueAt || row.overdue || row.status === "verified")) return false;
    return true;
  });
}

export async function getBuildManagementSummary(projectId: string, now = new Date()): Promise<BuildManagementSummary> {
  const { project } = await resolveCanonicalBuildProject({ projectId, requiredPermission: "projects:read" });
  const supabase = createAdminSupabase();
  const { data: siteData, error: siteError } = await supabase.from("build_sites").select("id,name")
    .eq("client_id", project.client_id).eq("project_id", project.id).is("archived_at", null);
  requireQuery(siteError, "sites");
  const sites = list(siteData as Row[] | null), siteIds = sites.map((row) => text(row.id)).filter(Boolean);
  const workPackageResult = siteIds.length ? await supabase.from("build_work_packages").select("id,site_id,name")
    .eq("client_id", project.client_id).eq("project_id", project.id).in("site_id", siteIds).is("archived_at", null) : { data: [], error: null };
  requireQuery(workPackageResult.error, "work packages");
  const workPackages = list(workPackageResult.data as Row[] | null), workPackageIds = workPackages.map((row) => text(row.id)).filter(Boolean);
  const planResult = workPackageIds.length ? await supabase.from("build_work_plans").select("id,client_id,project_id,site_id,work_package_id,schedule_baselined_at")
    .eq("client_id", project.client_id).eq("project_id", project.id).in("work_package_id", workPackageIds).is("archived_at", null) : { data: [], error: null };
  requireQuery(planResult.error, "work plans");
  const plans = list(planResult.data as Row[] | null), planIds = plans.map((row) => text(row.id)).filter(Boolean);
  const activityResult = planIds.length ? await supabase.from("build_runtime_activities").select("id,client_id,project_id,site_id,work_plan_id,work_package_id,name,status,mandatory,requires_approval,planned_duration,duration_unit,activity_owner_user_id,supervisor_user_id,planned_start_at,planned_finish_at,started_at,completed_at,blocked_at,blocker_reason")
    .eq("client_id", project.client_id).eq("project_id", project.id).in("work_plan_id", planIds).is("archived_at", null) : { data: [], error: null };
  requireQuery(activityResult.error, "activities");
  const activities = list(activityResult.data as Row[] | null), activityIds = activities.map((row) => text(row.id)).filter(Boolean);
  const [eventResult, inspectionResult] = await Promise.all([
    supabase.from("build_runtime_activity_events").select("id,client_id,project_id,site_id,work_package_id,work_plan_id,runtime_activity_id,event_type,occurred_at,event_sequence").eq("client_id", project.client_id).eq("project_id", project.id),
    supabase.from("build_runtime_inspections").select("id,client_id,project_id,site_id,work_package_id,work_plan_id,runtime_activity_id,outcome,reviewed_at").eq("client_id", project.client_id).eq("project_id", project.id),
  ]);
  const [exceptionResult, evidenceResult, dependencyResult] = activityIds.length ? await Promise.all([
    supabase.from("build_runtime_exceptions").select("id,runtime_activity_id,runtime_inspection_id,title,severity,status,exception_owner_user_id,due_at,raised_at").eq("client_id", project.client_id).eq("project_id", project.id).in("runtime_activity_id", activityIds),
    supabase.from("build_runtime_evidence").select("id,runtime_activity_id,runtime_exception_id").eq("client_id", project.client_id).eq("project_id", project.id).in("runtime_activity_id", activityIds).not("runtime_exception_id", "is", null).is("archived_at", null),
    supabase.from("build_runtime_dependencies").select("id,work_plan_id,predecessor_runtime_activity_id,successor_runtime_activity_id,dependency_type,lag_value,lag_unit,mandatory").in("work_plan_id", planIds),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  requireQuery(exceptionResult.error, "exceptions"); requireQuery(inspectionResult.error, "inspections"); requireQuery(evidenceResult.error, "corrective evidence"); requireQuery(eventResult.error, "activity history"); requireQuery(dependencyResult.error, "dependencies");
  const exceptionRows = list(exceptionResult.data as Row[] | null);
  const ownerIds = [...new Set([...exceptionRows.map((row) => text(row.exception_owner_user_id)), ...activities.flatMap((row) => [text(row.activity_owner_user_id), text(row.supervisor_user_id)])].filter(Boolean))];
  const profileResult = ownerIds.length ? await supabase.from("user_profiles").select("user_id,full_name,email,status").in("user_id", ownerIds) : { data: [], error: null };
  requireQuery(profileResult.error, "owners");
  const sitesById = byId(sites), workPackagesById = byId(workPackages), activitiesById = byId(activities), inspectionsById = byId(list(inspectionResult.data as Row[] | null));
  const profilesById = new Map(list(profileResult.data as Row[] | null).map((row) => [text(row.user_id), row]));
  const plansById = byId(plans);
  const eventsByActivity = new Map<string, Row[]>();
  for (const row of list(eventResult.data as Row[] | null)) { const id = text(row.runtime_activity_id); eventsByActivity.set(id, [...(eventsByActivity.get(id) ?? []), row]); }
  const performanceByActivity = new Map(activities.map((activity) => {
    const plan = plansById.get(text(activity.work_plan_id)) ?? {};
    const performance = deriveSchedulePerformance({
      scheduleConfirmedAt: text(plan.schedule_baselined_at) || null,
      plannedStartAt: text(activity.planned_start_at) || null,
      plannedFinishAt: text(activity.planned_finish_at) || null,
      status: text(activity.status) as Parameters<typeof deriveSchedulePerformance>[0]["status"],
      startedAt: text(activity.started_at) || null,
      completedAt: text(activity.completed_at) || null,
      events: (eventsByActivity.get(text(activity.id)) ?? []).map((event) => ({ event_type: text(event.event_type), occurred_at: text(event.occurred_at), event_sequence: typeof event.event_sequence === "number" ? event.event_sequence : null })),
    }, now);
    return [text(activity.id), performance] as const;
  }));
  const dependencyRows = list(dependencyResult.data as Row[] | null);
  const dependencyEdges: DependencyEdgeIntelligence[] = [];
  for (const plan of plans) {
    const planId = text(plan.id);
    const planActivities = activities.filter((activity) => text(activity.work_plan_id) === planId);
    const planActivityIds = new Set(planActivities.map((activity) => text(activity.id)));
    const result = deriveDependencyIntelligence({
      evaluatedAt: now,
      activities: planActivities.map((activity) => ({
        id: text(activity.id), workPlanId: planId, workPackageId: text(activity.work_package_id),
        status: text(activity.status) as Parameters<typeof deriveSchedulePerformance>[0]["status"],
        plannedStartAt: text(activity.planned_start_at) || null, plannedFinishAt: text(activity.planned_finish_at) || null,
        ownerUserId: text(activity.activity_owner_user_id) || null, supervisorUserId: text(activity.supervisor_user_id) || null,
        schedulePerformance: performanceByActivity.get(text(activity.id))!,
      })),
      dependencies: dependencyRows.filter((dependency) => text(dependency.work_plan_id) === planId
        && planActivityIds.has(text(dependency.predecessor_runtime_activity_id))
        && planActivityIds.has(text(dependency.successor_runtime_activity_id))).map((dependency) => ({
        id: text(dependency.id), workPlanId: planId,
        predecessorActivityId: text(dependency.predecessor_runtime_activity_id), successorActivityId: text(dependency.successor_runtime_activity_id),
        dependencyType: text(dependency.dependency_type) as "FS" | "SS" | "FF" | "SF",
        lagValue: Number(dependency.lag_value), lagUnit: text(dependency.lag_unit) as "hours" | "days" | "weeks",
        mandatory: dependency.mandatory === true,
      })),
    });
    if (!result.ok) throw new Error("Could not derive Build management dependency intelligence");
    dependencyEdges.push(...result.edges);
  }
  const dependencyRollup = deriveDependencyManagementRollup(dependencyEdges);
  const dependencyByWorkPackage = new Map(dependencyRollup.workPackages.map((item) => [item.workPackageId, item]));
  const evidenceCount = new Map<string, number>();
  for (const row of list(evidenceResult.data as Row[] | null)) { const id = text(row.runtime_exception_id); evidenceCount.set(id, (evidenceCount.get(id) ?? 0) + 1); }
  const register = exceptionRows.map((row): BuildManagementException => {
    const activity = activitiesById.get(text(row.runtime_activity_id)) ?? {}, wp = workPackagesById.get(text(activity.work_package_id)) ?? {};
    const site = sitesById.get(text(wp.site_id)) ?? {}, inspection = inspectionsById.get(text(row.runtime_inspection_id)) ?? {};
    const ownerId = text(row.exception_owner_user_id), profile = profilesById.get(ownerId), status = text(row.status) as ManagementExceptionStatus;
    return { id: text(row.id), title: text(row.title), severity: text(row.severity) as BuildManagementException["severity"], status,
      ownerUserId: ownerId, ownerName: text(profile?.full_name) || text(profile?.email) || "Workspace member", dueAt: text(row.due_at) || null,
      overdue: isExceptionOverdue(text(row.due_at) || null, status, now), siteId: text(site.id), siteName: text(site.name),
      workPackageId: text(wp.id), workPackageName: text(wp.name), activityId: text(activity.id), activityName: text(activity.name),
      inspectionOutcome: (text(inspection.outcome) || "changes_required") as BuildManagementException["inspectionOutcome"],
      inspectionReviewedAt: text(inspection.reviewed_at), correctiveEvidenceCount: evidenceCount.get(text(row.id)) ?? 0 };
  });
  const active = register.filter((row) => row.status === "open" || row.status === "in_remediation");
  const siteByIdMap = new Map(sites.map((row) => [text(row.id), text(row.name)]));
  const workPackageSummary = workPackages.map((wp) => {
    const wpActivities = activities.filter((row) => text(row.work_package_id) === text(wp.id));
    const ids = new Set(wpActivities.map((row) => text(row.id))), exceptions = register.filter((row) => ids.has(row.activityId));
    const wpPerformance = wpActivities.map((row) => performanceByActivity.get(text(row.id))).filter((item): item is SchedulePerformance => Boolean(item));
    const dependencies = dependencyByWorkPackage.get(text(wp.id)) ?? { workPackageId: text(wp.id), totalConstraints: 0, unreleasedConstraints: 0, downstreamActivitiesExposed: 0, overdueSuccessorsWithUnreleasedConstraints: 0, latePredecessorActivities: 0, dataIncompleteConstraints: 0, baselineControllingConstraints: 0, hasDependencyExceptions: false };
    return { id: text(wp.id), name: text(wp.name), siteId: text(wp.site_id), siteName: siteByIdMap.get(text(wp.site_id)) ?? "Site unavailable",
      activities: activityCounts(wpActivities), activeExceptions: exceptions.filter((row) => row.status === "open" || row.status === "in_remediation").length,
      overdueExceptions: exceptions.filter((row) => row.overdue).length, schedule: scheduleCounts(wpPerformance), dependencies };
  });
  const scheduleOwners = new Map<string, BuildManagementSummary["scheduleResponsibility"][number]>();
  for (const activity of activities) {
    const performance = performanceByActivity.get(text(activity.id));
    if (!performance || performance.state === "not_scheduled" || performance.state === "schedule_data_incomplete") continue;
    const ownerId = text(activity.activity_owner_user_id) || "unassigned", profile = profilesById.get(ownerId);
    const current = scheduleOwners.get(ownerId) ?? { ownerUserId: ownerId, ownerName: ownerId === "unassigned" ? "Unassigned" : text(profile?.full_name) || text(profile?.email) || "Workspace member", assignedScheduled: 0, overdueToStart: 0, overdueToComplete: 0, completedLate: 0, blockedOverdue: 0, awaitingReview: 0 };
    current.assignedScheduled += 1;
    if (performance.state === "overdue_to_start") current.overdueToStart += 1;
    if (performance.state === "overdue_to_complete") current.overdueToComplete += 1;
    if (performance.state === "completed_late") current.completedLate += 1;
    if (text(activity.status) === "blocked" && isCurrentlyOverdue(performance.state)) current.blockedOverdue += 1;
    if (performance.state === "awaiting_review") current.awaitingReview += 1;
    scheduleOwners.set(ownerId, current);
  }
  const allPerformance = [...performanceByActivity.values()], projectSchedule = scheduleCounts(allPerformance);
  const exceptionCount = (status: ManagementExceptionStatus) => register.filter((row) => row.status === status).length;
  const attention = deriveManagementAttention({
    evaluatedAt: now,
    activities: activities.map((activity) => {
      const wp = workPackagesById.get(text(activity.work_package_id)) ?? {};
      const ownerId = text(activity.activity_owner_user_id), ownerProfile = profilesById.get(ownerId);
      const supervisorId = text(activity.supervisor_user_id), supervisorProfile = profilesById.get(supervisorId);
      return { id: text(activity.id), projectId: project.id, siteId: text(wp.site_id), workPackageId: text(activity.work_package_id), workPlanId: text(activity.work_plan_id),
        status: text(activity.status) as Parameters<typeof deriveSchedulePerformance>[0]["status"], requiresApproval: activity.requires_approval === true,
        plannedStartAt: text(activity.planned_start_at) || null, plannedFinishAt: text(activity.planned_finish_at) || null,
        activityOwnerUserId: ownerId || null, activityOwnerDisplayName: ownerId ? text(ownerProfile?.full_name) || text(ownerProfile?.email) || "Workspace member" : null,
        supervisorUserId: supervisorId || null, supervisorDisplayName: supervisorId ? text(supervisorProfile?.full_name) || text(supervisorProfile?.email) || "Workspace member" : null,
        blockerReason: text(activity.blocker_reason) || null, blockedAt: text(activity.blocked_at) || null,
        schedulePerformance: performanceByActivity.get(text(activity.id))!,
        events: (eventsByActivity.get(text(activity.id)) ?? []).map((event) => ({ event_type: text(event.event_type), occurred_at: text(event.occurred_at), event_sequence: typeof event.event_sequence === "number" ? event.event_sequence : null })) };
    }),
    exceptions: exceptionRows.map((row) => {
      const activity = activitiesById.get(text(row.runtime_activity_id)) ?? {}, wp = workPackagesById.get(text(activity.work_package_id)) ?? {};
      const ownerId = text(row.exception_owner_user_id), profile = profilesById.get(ownerId);
      return { id: text(row.id), projectId: project.id, siteId: text(wp.site_id), workPackageId: text(activity.work_package_id), workPlanId: text(activity.work_plan_id), activityId: text(activity.id),
        status: text(row.status) as ManagementExceptionStatus, ownerUserId: ownerId, ownerDisplayName: text(profile?.full_name) || text(profile?.email) || "Workspace member",
        dueAt: text(row.due_at) || null, raisedAt: text(row.raised_at) };
    }),
    dependencyEdges,
  });
  const attentionPreview = orderManagementAttentionPreview(attention.items.map((item) => {
    const activity = item.activityId ? activitiesById.get(item.activityId) ?? {} : {};
    const wp = workPackagesById.get(item.workPackageId) ?? {}, site = sitesById.get(item.siteId) ?? {};
    const exception = item.sourceRecordType === "runtime_exception" ? exceptionRows.find((row) => text(row.id) === item.sourceRecordId) : undefined;
    return { ...item, activityName: text(activity.name) || "Activity unavailable", workPackageName: text(wp.name) || "Work Package unavailable", siteName: text(site.name) || "Site unavailable",
      exceptionTitle: exception ? text(exception.title) : null, exceptionSeverity: exception ? text(exception.severity) as BuildManagementException["severity"] : null };
  })).slice(0, 6);
  const progressPerformance = deriveProjectProgressRollup({
    projectId: project.id,
    clientId: project.client_id,
    asOf: now,
    sites: sites.map((site) => ({ id: text(site.id), clientId: project.client_id, projectId: project.id, name: text(site.name) })),
    workPackages: workPackages.map((wp) => ({ id: text(wp.id), clientId: project.client_id, projectId: project.id,
      siteId: text(wp.site_id), name: text(wp.name) })),
    workPlans: plans.map((plan) => ({ id: text(plan.id), clientId: text(plan.client_id), projectId: text(plan.project_id),
      siteId: text(plan.site_id), workPackageId: text(plan.work_package_id) })),
    activities: activities.map((activity) => ({
      id: text(activity.id), clientId: text(activity.client_id), projectId: text(activity.project_id), siteId: text(activity.site_id),
      workPackageId: text(activity.work_package_id), workPlanId: text(activity.work_plan_id),
      status: text(activity.status) as ManagementActivityStatus, mandatory: activity.mandatory !== false,
      requiresApproval: activity.requires_approval === true, plannedDuration: numeric(activity.planned_duration),
      durationUnit: text(activity.duration_unit) || null, plannedStartAt: text(activity.planned_start_at) || null,
      plannedFinishAt: text(activity.planned_finish_at) || null, schedulePerformance: performanceByActivity.get(text(activity.id))!,
      events: (eventsByActivity.get(text(activity.id)) ?? []).map((event) => ({ event_type: text(event.event_type),
        occurred_at: text(event.occurred_at), event_sequence: typeof event.event_sequence === "number" ? event.event_sequence : null })),
    })),
    context: workPackages.map((wp) => {
      const workPackageId = text(wp.id);
      const wpActivities = activities.filter((activity) => text(activity.work_package_id) === workPackageId);
      const activityIdSet = new Set(wpActivities.map((activity) => text(activity.id)));
      return { workPackageId,
        overdueActivities: wpActivities.filter((activity) => isCurrentlyOverdue(performanceByActivity.get(text(activity.id))?.state ?? "not_scheduled")).length,
        blockedActivities: wpActivities.filter((activity) => text(activity.status) === "blocked").length,
        reviewPendingActivities: wpActivities.filter((activity) => text(activity.status) === "submitted_for_review").length,
        changesRequiredActivities: wpActivities.filter((activity) => text(activity.status) === "changes_required").length,
        activeExceptions: register.filter((item) => activityIdSet.has(item.activityId) && (item.status === "open" || item.status === "in_remediation")).length,
        managementAttentionObligations: attention.items.filter((item) => item.workPackageId === workPackageId).length,
        unreleasedDependencyConstraints: dependencyByWorkPackage.get(workPackageId)?.unreleasedConstraints ?? 0 };
    }),
  });
  if (!progressPerformance.ok) throw new Error(`Could not derive Build progress and performance: ${progressPerformance.reason}`);
  const recentPeriodEnd = now;
  const recentPeriodStart = new Date(now.getTime() - 7 * 86_400_000);
  const recentExecution = deriveProgressHistory({ projectId: project.id, clientId: project.client_id,
    periodStart: recentPeriodStart.toISOString(), periodEnd: recentPeriodEnd.toISOString(), timezone: "UTC",
    buckets: buildUtcHistoryBuckets(recentPeriodStart, recentPeriodEnd, "daily"),
    workPackages: workPackages.map((wp, index) => ({ id: text(wp.id), name: text(wp.name), sequence: index })),
    events: list(eventResult.data as Row[] | null).map((event) => ({ id: text(event.id), clientId: text(event.client_id), projectId: text(event.project_id),
      siteId: text(event.site_id), workPackageId: text(event.work_package_id), workPlanId: text(event.work_plan_id), activityId: text(event.runtime_activity_id),
      event_type: text(event.event_type), occurred_at: text(event.occurred_at), event_sequence: event.event_sequence == null ? null : Number(event.event_sequence) })),
    inspections: list(inspectionResult.data as Row[] | null).map((inspection) => ({ id: text(inspection.id), clientId: text(inspection.client_id), projectId: text(inspection.project_id),
      siteId: text(inspection.site_id), workPackageId: text(inspection.work_package_id), workPlanId: text(inspection.work_plan_id), activityId: text(inspection.runtime_activity_id),
      outcome: text(inspection.outcome) as "accepted" | "changes_required", reviewedAt: text(inspection.reviewed_at) })),
  });
  if (!recentExecution.ok) throw new Error(`Could not derive Build execution history: ${recentExecution.reason}`);
  return { projectId: project.id, hasWorkPlans: plans.length > 0, activities: activityCounts(activities),
    schedule: { scheduled: projectSchedule.scheduled, currentlyOverdue: projectSchedule.overdue, completedOnTime: projectSchedule.completedOnTime, completedLate: projectSchedule.completedLate,
      workPackagesOverdue: workPackageSummary.filter((item) => item.schedule.overdue > 0).length,
      blockedOverdue: activities.filter((row) => text(row.status) === "blocked" && isCurrentlyOverdue(performanceByActivity.get(text(row.id))?.state ?? "not_scheduled")).length,
      changesRequiredOverdue: activities.filter((row) => text(row.status) === "changes_required" && isCurrentlyOverdue(performanceByActivity.get(text(row.id))?.state ?? "not_scheduled")).length,
      dataIncomplete: allPerformance.filter((item) => item.state === "schedule_data_incomplete" || item.dataQuality === "ambiguous_history" || item.dataQuality === "missing_history").length },
    exceptions: { total: register.length, open: exceptionCount("open"), in_remediation: exceptionCount("in_remediation"), resolved: exceptionCount("resolved"), verified: exceptionCount("verified"), active: active.length, overdue: register.filter((row) => row.overdue).length, critical: active.filter((row) => row.severity === "critical").length, high: active.filter((row) => row.severity === "high").length },
    workPackages: workPackageSummary, scheduleResponsibility: [...scheduleOwners.values()].sort((a,b) => a.ownerName.localeCompare(b.ownerName)),
    dependencyFacts: dependencyRollup.project, exceptionsRegister: register,
    managementAttention: attention.summary, managementAttentionPreview: attentionPreview, progressPerformance, recentExecution };
}

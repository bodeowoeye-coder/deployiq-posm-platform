import type { DependencyEdgeIntelligence } from "./dependencyIntelligence.ts";
import type { ScheduleExecutionStatus, ScheduleHistoryEvent, SchedulePerformance } from "./schedulePerformance.ts";

export type ManagementAttentionType =
  | "schedule_overdue"
  | "execution_block"
  | "changes_required"
  | "exception"
  | "review_pending"
  | "assignment_missing"
  | "dependency_attention"
  | "data_incomplete";

export type ManagementAttentionOwnerKind = "activity_owner" | "exception_owner" | "unassigned" | null;
export type ManagementAttentionExpectedActor =
  | "activity_owner"
  | "assigned_supervisor_or_management"
  | "exception_owner_or_management"
  | "independent_reviewer"
  | "project_management"
  | "system_time"
  | null;
export type ManagementAttentionDataQuality = "complete" | "incomplete" | "ambiguous_history";

export type ManagementAttentionItem = {
  key: string;
  type: ManagementAttentionType;
  projectId: string;
  siteId: string;
  workPackageId: string;
  workPlanId: string;
  activityId: string | null;
  ownerUserId: string | null;
  ownerDisplayName: string | null;
  ownerKind: ManagementAttentionOwnerKind;
  expectedActor: ManagementAttentionExpectedActor;
  expectedActorUserId: string | null;
  expectedActorDisplayName: string | null;
  condition: string;
  expectedNextAction: string | null;
  observedAt: string | null;
  dueAt: string | null;
  overdue: boolean | null;
  sourceRecordType: "runtime_activity" | "runtime_exception" | "runtime_dependency";
  sourceRecordId: string;
  route: string;
  dataQuality: ManagementAttentionDataQuality;
};

export type ManagementAttentionActivityFact = {
  id: string;
  projectId: string;
  siteId: string;
  workPackageId: string;
  workPlanId: string;
  status: ScheduleExecutionStatus;
  active?: boolean;
  ancestryActive?: boolean;
  requiresApproval: boolean;
  plannedStartAt?: string | null;
  plannedFinishAt?: string | null;
  activityOwnerUserId: string | null;
  activityOwnerDisplayName: string | null;
  supervisorUserId: string | null;
  supervisorDisplayName?: string | null;
  blockerReason?: string | null;
  blockedAt?: string | null;
  schedulePerformance: SchedulePerformance;
  events?: ReadonlyArray<ScheduleHistoryEvent>;
};

export type ManagementAttentionExceptionFact = {
  id: string;
  projectId: string;
  siteId: string;
  workPackageId: string;
  workPlanId: string;
  activityId: string;
  status: "open" | "in_remediation" | "resolved" | "verified";
  ownerUserId: string;
  ownerDisplayName: string;
  dueAt: string | null;
  raisedAt: string;
  active?: boolean;
  ancestryActive?: boolean;
};

export type ManagementAttentionSummary = {
  outstandingObligations: number;
  overdueObligations: number;
  activitiesAffected: number;
  workPackagesAffected: number;
  explicitOwnersAffected: number;
  unassignedObligations: number;
  categoryCounts: {
    scheduleOverdue: number;
    executionBlocks: number;
    correctiveActionsRequired: number;
    activeExceptions: number;
    overdueExceptions: number;
    reviewsPending: number;
    assignmentsMissing: number;
    dependencyAttention: number;
    dataIncomplete: number;
  };
  owners: Array<{ ownerUserId: string; ownerDisplayName: string; obligationCount: number; overdueObligationCount: number }>;
};

export type ManagementAttentionResult = { items: ManagementAttentionItem[]; summary: ManagementAttentionSummary };

const terminalActivityStates = new Set<ScheduleExecutionStatus>(["completed", "approved"]);
const assignmentRequiredStates = new Set<ScheduleExecutionStatus>(["not_started", "in_progress", "blocked", "changes_required"]);
const activityRoute = (projectId: string, activityId: string, view?: string) =>
  `/workspace/admin/projects/${encodeURIComponent(projectId)}/activities/${encodeURIComponent(activityId)}${view ? `?view=${view}` : ""}`;

function owner(activity: ManagementAttentionActivityFact) {
  return activity.activityOwnerUserId
    ? { ownerUserId: activity.activityOwnerUserId, ownerDisplayName: activity.activityOwnerDisplayName, ownerKind: "activity_owner" as const }
    : { ownerUserId: null, ownerDisplayName: null, ownerKind: "unassigned" as const };
}

function historyObservation(events: ReadonlyArray<ScheduleHistoryEvent>, eventType: string) {
  const matches = events.filter((event) => event.event_type === eventType);
  if (!matches.length) return { observedAt: null, dataQuality: "incomplete" as const };
  const valid = matches.filter((event) => Number.isFinite(new Date(event.occurred_at).getTime()));
  if (valid.length !== matches.length) return { observedAt: null, dataQuality: "ambiguous_history" as const };
  const ordered = [...valid].sort((left, right) => {
    const delta = new Date(left.occurred_at).getTime() - new Date(right.occurred_at).getTime();
    if (delta) return delta;
    if (left.event_sequence === null || right.event_sequence === null) return 0;
    return left.event_sequence - right.event_sequence;
  });
  const latestTime = ordered.at(-1)!.occurred_at;
  const tied = ordered.filter((event) => event.occurred_at === latestTime);
  if (tied.length > 1 && tied.some((event) => event.event_sequence === null)) {
    return { observedAt: null, dataQuality: "ambiguous_history" as const };
  }
  return { observedAt: ordered.at(-1)!.occurred_at, dataQuality: "complete" as const };
}

function activityBase(activity: ManagementAttentionActivityFact) {
  return {
    projectId: activity.projectId,
    siteId: activity.siteId,
    workPackageId: activity.workPackageId,
    workPlanId: activity.workPlanId,
    activityId: activity.id,
    ...owner(activity),
  };
}

function deriveActivityItems(activity: ManagementAttentionActivityFact): ManagementAttentionItem[] {
  if (activity.active === false || activity.ancestryActive === false || terminalActivityStates.has(activity.status)) return [];
  const base = activityBase(activity);
  const items: ManagementAttentionItem[] = [];
  const schedule = activity.schedulePerformance;

  if (schedule.state === "overdue_to_start" || schedule.state === "overdue_to_complete") {
    items.push({ ...base, key: `schedule:${activity.id}:${schedule.state}`, type: "schedule_overdue",
      expectedActor: base.ownerUserId ? "activity_owner" : "project_management",
      expectedActorUserId: base.ownerUserId, expectedActorDisplayName: base.ownerDisplayName,
      condition: schedule.state === "overdue_to_start" ? "Activity overdue to start" : "Activity overdue to complete",
      expectedNextAction: schedule.state === "overdue_to_start" ? "Start Activity" : "Complete work or submit for review as configured",
      observedAt: null, dueAt: schedule.state === "overdue_to_start" ? activity.plannedStartAt ?? null : activity.plannedFinishAt ?? null,
      overdue: true, sourceRecordType: "runtime_activity", sourceRecordId: activity.id,
      route: activityRoute(activity.projectId, activity.id, schedule.state === "overdue_to_start" ? "execution" : "overview"),
      dataQuality: schedule.dataQuality === "ambiguous_history" ? "ambiguous_history" : schedule.dataQuality === "complete" ? "complete" : "incomplete" });
  }
  if (schedule.state === "schedule_data_incomplete") {
    items.push({ ...base, ownerUserId: null, ownerDisplayName: null, ownerKind: null, key: `schedule-data:${activity.id}`, type: "data_incomplete",
      expectedActor: "project_management", condition: "Schedule data incomplete", expectedNextAction: "Review schedule/dependency data",
      expectedActorUserId: null, expectedActorDisplayName: null,
      observedAt: null, dueAt: null, overdue: null, sourceRecordType: "runtime_activity", sourceRecordId: activity.id,
      route: activityRoute(activity.projectId, activity.id, "overview"), dataQuality: schedule.dataQuality === "ambiguous_history" ? "ambiguous_history" : "incomplete" });
  }
  if (activity.status === "blocked") {
    items.push({ ...base, key: `block:${activity.id}`, type: "execution_block", expectedActor: base.ownerUserId ? "activity_owner" : "project_management",
      expectedActorUserId: base.ownerUserId, expectedActorDisplayName: base.ownerDisplayName,
      condition: activity.blockerReason ? `Activity blocked: ${activity.blockerReason}` : "Activity blocked",
      expectedNextAction: "Resolve block and resume Activity", observedAt: activity.blockedAt ?? null, dueAt: null, overdue: null,
      sourceRecordType: "runtime_activity", sourceRecordId: activity.id, route: activityRoute(activity.projectId, activity.id, "execution"), dataQuality: activity.blockedAt ? "complete" : "incomplete" });
  }
  if (activity.status === "changes_required") {
    const history = historyObservation(activity.events ?? [], "changes_required");
    items.push({ ...base, key: `changes:${activity.id}`, type: "changes_required", expectedActor: base.ownerUserId ? "activity_owner" : "project_management",
      expectedActorUserId: base.ownerUserId, expectedActorDisplayName: base.ownerDisplayName,
      condition: "Corrective Action Required", expectedNextAction: "Resume corrective work and resubmit", ...history, dueAt: null, overdue: null,
      sourceRecordType: "runtime_activity", sourceRecordId: activity.id, route: activityRoute(activity.projectId, activity.id, "inspection") });
  }
  if (activity.status === "submitted_for_review") {
    const history = historyObservation(activity.events ?? [], "submitted_for_review");
    items.push({ ...base, key: `review:${activity.id}`, type: "review_pending",
      expectedActor: activity.supervisorUserId ? "assigned_supervisor_or_management" : "project_management",
      expectedActorUserId: activity.supervisorUserId, expectedActorDisplayName: activity.supervisorDisplayName ?? null,
      condition: "Awaiting Review", expectedNextAction: "Review submission", ...history, dueAt: null, overdue: null,
      sourceRecordType: "runtime_activity", sourceRecordId: activity.id, route: activityRoute(activity.projectId, activity.id, "inspection") });
  }
  if (!activity.activityOwnerUserId && assignmentRequiredStates.has(activity.status)) {
    items.push({ ...base, key: `assignment:${activity.id}`, type: "assignment_missing", expectedActor: "project_management",
      expectedActorUserId: null, expectedActorDisplayName: null,
      condition: "Activity Owner unassigned", expectedNextAction: "Assign Activity Owner", observedAt: null, dueAt: null, overdue: null,
      sourceRecordType: "runtime_activity", sourceRecordId: activity.id, route: activityRoute(activity.projectId, activity.id, "responsibility"), dataQuality: "complete" });
  }
  return items;
}

function deriveExceptionItem(exception: ManagementAttentionExceptionFact, evaluatedAt: Date): ManagementAttentionItem | null {
  if (exception.active === false || exception.ancestryActive === false || exception.status === "verified") return null;
  const action = exception.status === "open" ? "Start remediation"
    : exception.status === "in_remediation" ? "Complete corrective action and resolve"
      : "Verify resolution";
  const expectedActor: ManagementAttentionExpectedActor = exception.status === "resolved" ? "independent_reviewer" : "exception_owner_or_management";
  const dueTime = exception.dueAt ? new Date(exception.dueAt).getTime() : null;
  const overdue = dueTime === null ? null : Number.isFinite(dueTime) ? dueTime < evaluatedAt.getTime() : null;
  return { key: `exception:${exception.id}`, type: "exception", projectId: exception.projectId, siteId: exception.siteId,
    workPackageId: exception.workPackageId, workPlanId: exception.workPlanId, activityId: exception.activityId,
    ownerUserId: exception.ownerUserId, ownerDisplayName: exception.ownerDisplayName, ownerKind: "exception_owner", expectedActor,
    expectedActorUserId: exception.status === "resolved" ? null : exception.ownerUserId,
    expectedActorDisplayName: exception.status === "resolved" ? null : exception.ownerDisplayName,
    condition: exception.status === "resolved" ? "Exception awaiting verification" : "Corrective Exception outstanding",
    expectedNextAction: action, observedAt: exception.raisedAt, dueAt: exception.dueAt, overdue,
    sourceRecordType: "runtime_exception", sourceRecordId: exception.id,
    route: activityRoute(exception.projectId, exception.activityId, "exceptions"), dataQuality: exception.dueAt && dueTime !== null && !Number.isFinite(dueTime) ? "incomplete" : "complete" };
}

function deriveDependencyItems(edge: DependencyEdgeIntelligence, activity: ManagementAttentionActivityFact | undefined): ManagementAttentionItem[] {
  if (!activity || activity.active === false || activity.ancestryActive === false || terminalActivityStates.has(activity.status)) return [];
  if (edge.condition === "constraint_released" || edge.condition === "waiting_for_lag") return [];
  const base = activityBase(activity);
  if (edge.condition === "data_incomplete") {
    return [{ ...base, ownerUserId: null, ownerDisplayName: null, ownerKind: null, key: `dependency-data:${edge.dependencyId}`, type: "data_incomplete",
      expectedActor: "project_management", condition: "Dependency data incomplete", expectedNextAction: "Review schedule/dependency data",
      expectedActorUserId: null, expectedActorDisplayName: null,
      observedAt: null, dueAt: null, overdue: null, sourceRecordType: "runtime_dependency", sourceRecordId: edge.dependencyId,
      route: activityRoute(activity.projectId, activity.id, "dependencies"), dataQuality: "incomplete" }];
  }
  return [{ ...base, key: `dependency:${edge.dependencyId}`, type: "dependency_attention",
    expectedActor: edge.predecessorOwnerUserId ? "activity_owner" : "project_management",
    expectedActorUserId: edge.predecessorOwnerUserId, expectedActorDisplayName: null,
    condition: `Required predecessor ${edge.requiredPredecessorMilestone} milestone is not recorded`,
    expectedNextAction: `Complete required predecessor ${edge.requiredPredecessorMilestone} milestone`, observedAt: null, dueAt: null, overdue: null,
    sourceRecordType: "runtime_dependency", sourceRecordId: edge.dependencyId,
    route: activityRoute(activity.projectId, activity.id, "dependencies"), dataQuality: "complete" }];
}

function summarize(items: ManagementAttentionItem[]): ManagementAttentionSummary {
  const count = (type: ManagementAttentionType) => items.filter((item) => item.type === type).length;
  const ownerMap = new Map<string, ManagementAttentionSummary["owners"][number]>();
  for (const item of items) if (item.ownerUserId && item.ownerDisplayName) {
    const current = ownerMap.get(item.ownerUserId) ?? { ownerUserId: item.ownerUserId, ownerDisplayName: item.ownerDisplayName, obligationCount: 0, overdueObligationCount: 0 };
    current.obligationCount += 1;
    if (item.overdue === true) current.overdueObligationCount += 1;
    ownerMap.set(item.ownerUserId, current);
  }
  const exceptions = items.filter((item) => item.type === "exception");
  return {
    outstandingObligations: items.length,
    overdueObligations: items.filter((item) => item.overdue === true).length,
    activitiesAffected: new Set(items.map((item) => item.activityId).filter(Boolean)).size,
    workPackagesAffected: new Set(items.map((item) => item.workPackageId)).size,
    explicitOwnersAffected: ownerMap.size,
    unassignedObligations: items.filter((item) => item.ownerKind === "unassigned").length,
    categoryCounts: {
      scheduleOverdue: count("schedule_overdue"), executionBlocks: count("execution_block"),
      correctiveActionsRequired: count("changes_required"), activeExceptions: exceptions.length,
      overdueExceptions: exceptions.filter((item) => item.overdue === true).length,
      reviewsPending: count("review_pending"), assignmentsMissing: count("assignment_missing"),
      dependencyAttention: count("dependency_attention"), dataIncomplete: count("data_incomplete"),
    },
    owners: [...ownerMap.values()].sort((left, right) => left.ownerDisplayName.localeCompare(right.ownerDisplayName) || left.ownerUserId.localeCompare(right.ownerUserId)),
  };
}

export function deriveManagementAttention(input: {
  activities: ReadonlyArray<ManagementAttentionActivityFact>;
  exceptions: ReadonlyArray<ManagementAttentionExceptionFact>;
  dependencyEdges: ReadonlyArray<DependencyEdgeIntelligence>;
  evaluatedAt: Date;
}): ManagementAttentionResult {
  if (!Number.isFinite(input.evaluatedAt.getTime())) return { items: [], summary: summarize([]) };
  const activities = input.activities.filter((activity) => activity.active !== false && activity.ancestryActive !== false);
  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  const items = [
    ...activities.flatMap(deriveActivityItems),
    ...input.exceptions.map((exception) => deriveExceptionItem(exception, input.evaluatedAt)).filter((item): item is ManagementAttentionItem => item !== null),
    ...input.dependencyEdges.flatMap((edge) => deriveDependencyItems(edge, byId.get(edge.successorActivityId))),
  ];
  items.sort((left, right) => left.key.localeCompare(right.key));
  return { items, summary: summarize(items) };
}

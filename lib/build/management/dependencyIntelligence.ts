import {
  isCurrentlyOverdue,
  type ScheduleExecutionStatus,
  type SchedulePerformance,
} from "./schedulePerformance.ts";

export type BuildDependencyType = "FS" | "SS" | "FF" | "SF";
export type BuildDependencyLagUnit = "hours" | "days" | "weeks";
export type DependencyCondition =
  | "milestone_missing"
  | "waiting_for_lag"
  | "constraint_released"
  | "data_incomplete";
export type ActualSequenceCompliance = "compliant" | "non_compliant" | "not_observable" | "data_incomplete";

export type DependencyActivityFact = {
  id: string;
  workPlanId: string;
  workPackageId: string;
  status: ScheduleExecutionStatus;
  plannedStartAt: string | null;
  plannedFinishAt: string | null;
  ownerUserId?: string | null;
  supervisorUserId?: string | null;
  active?: boolean;
  schedulePerformance: SchedulePerformance;
};

export type RuntimeDependencyFact = {
  id: string;
  workPlanId: string;
  predecessorActivityId: string;
  successorActivityId: string;
  dependencyType: BuildDependencyType;
  lagValue: number;
  lagUnit: BuildDependencyLagUnit;
  mandatory: boolean;
  active?: boolean;
};

export type DependencyEdgeIntelligence = {
  dependencyId: string;
  workPlanId: string;
  workPackageId: string;
  predecessorActivityId: string;
  successorActivityId: string;
  predecessorOwnerUserId: string | null;
  predecessorSupervisorUserId: string | null;
  successorOwnerUserId: string | null;
  successorSupervisorUserId: string | null;
  dependencyType: BuildDependencyType;
  lagValue: number;
  lagUnit: BuildDependencyLagUnit;
  lagMs: number;
  mandatory: boolean;
  requiredPredecessorMilestone: "start" | "finish";
  relevantSuccessorBoundary: "start" | "finish";
  predecessorMilestoneAt: string | null;
  releaseAt: string | null;
  successorActualBoundaryAt: string | null;
  condition: DependencyCondition;
  actualSequenceCompliance: ActualSequenceCompliance;
  baselineControlling: boolean | null;
  downstreamScheduleExposure: boolean;
  relevantPlannedBoundaryPassed: boolean | null;
  overdueSuccessorWithUnreleasedConstraint: boolean;
  predecessorSchedulePerformance: SchedulePerformance;
  successorSchedulePerformance: SchedulePerformance;
  predecessorScheduleState: SchedulePerformance["state"];
  successorScheduleState: SchedulePerformance["state"];
  predecessorStatus: ScheduleExecutionStatus;
  successorStatus: ScheduleExecutionStatus;
};

export type DependencyActivityIntelligence = {
  activityId: string;
  incomingDependencyCount: number;
  outgoingDependencyCount: number;
  upstreamReachableActivityCount: number;
  downstreamReachableActivityCount: number;
  currentUnreleasedIncomingConstraintCount: number;
  downstreamActivitiesExposedCount: number;
};

export type DependencyIntelligenceResult =
  | { ok: true; edges: DependencyEdgeIntelligence[]; activities: DependencyActivityIntelligence[] }
  | { ok: false; reason: "invalid_evaluation_time" | "malformed_graph" | "cycle_detected"; edges: []; activities: [] };

const lagUnitMs: Record<BuildDependencyLagUnit, number> = {
  hours: 60 * 60 * 1_000,
  days: 24 * 60 * 60 * 1_000,
  weeks: 7 * 24 * 60 * 60 * 1_000,
};

function instant(value: string | null | undefined) {
  if (!value) return null;
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

function requiredMilestone(type: BuildDependencyType) {
  return type === "FS" || type === "FF" ? "finish" as const : "start" as const;
}

function successorBoundary(type: BuildDependencyType) {
  return type === "FS" || type === "SS" ? "start" as const : "finish" as const;
}

function actualMilestone(activity: DependencyActivityFact, boundary: "start" | "finish") {
  return boundary === "start"
    ? activity.schedulePerformance.actualStartedAt
    : activity.schedulePerformance.actualWorkFinishedAt;
}

function plannedMilestone(activity: DependencyActivityFact, boundary: "start" | "finish") {
  return boundary === "start" ? activity.plannedStartAt : activity.plannedFinishAt;
}

function reachable(start: string, adjacency: ReadonlyMap<string, ReadonlySet<string>>) {
  const visited = new Set<string>();
  const pending = [...(adjacency.get(start) ?? [])];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(adjacency.get(current) ?? []));
  }
  return visited;
}

function hasCycle(activityIds: ReadonlySet<string>, outgoing: ReadonlyMap<string, ReadonlySet<string>>) {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of outgoing.get(id) ?? []) if (visit(next)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return [...activityIds].some(visit);
}

export function deriveDependencyIntelligence(input: {
  activities: ReadonlyArray<DependencyActivityFact>;
  dependencies: ReadonlyArray<RuntimeDependencyFact>;
  evaluatedAt: Date;
}): DependencyIntelligenceResult {
  const evaluatedAt = input.evaluatedAt.getTime();
  if (!Number.isFinite(evaluatedAt)) return { ok: false, reason: "invalid_evaluation_time", edges: [], activities: [] };

  const activities = input.activities.filter((activity) => activity.active !== false);
  const dependencies = input.dependencies.filter((dependency) => dependency.active !== false);
  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  if (byId.size !== activities.length) return { ok: false, reason: "malformed_graph", edges: [], activities: [] };
  const workPlanIds = new Set(activities.map((activity) => activity.workPlanId));
  const workPackageIds = new Set(activities.map((activity) => activity.workPackageId));
  if (workPlanIds.size > 1 || workPackageIds.size > 1) return { ok: false, reason: "malformed_graph", edges: [], activities: [] };

  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  const dependencyIds = new Set<string>();
  const dependencyPairs = new Set<string>();
  for (const dependency of dependencies) {
    const predecessor = byId.get(dependency.predecessorActivityId);
    const successor = byId.get(dependency.successorActivityId);
    if (
      !predecessor || !successor || predecessor.id === successor.id ||
      predecessor.workPlanId !== dependency.workPlanId || successor.workPlanId !== dependency.workPlanId ||
      predecessor.workPackageId !== successor.workPackageId ||
      !(["FS", "SS", "FF", "SF"] as const).includes(dependency.dependencyType) ||
      !(["hours", "days", "weeks"] as const).includes(dependency.lagUnit) ||
      !Number.isInteger(dependency.lagValue) || dependency.lagValue < 0 ||
      dependencyIds.has(dependency.id) ||
      dependencyPairs.has(`${dependency.predecessorActivityId}:${dependency.successorActivityId}`)
    ) return { ok: false, reason: "malformed_graph", edges: [], activities: [] };
    dependencyIds.add(dependency.id);
    dependencyPairs.add(`${dependency.predecessorActivityId}:${dependency.successorActivityId}`);
    outgoing.set(predecessor.id, new Set([...(outgoing.get(predecessor.id) ?? []), successor.id]));
    incoming.set(successor.id, new Set([...(incoming.get(successor.id) ?? []), predecessor.id]));
  }
  if (hasCycle(new Set(byId.keys()), outgoing)) return { ok: false, reason: "cycle_detected", edges: [], activities: [] };

  const edges: DependencyEdgeIntelligence[] = dependencies.map((dependency) => {
    const predecessor = byId.get(dependency.predecessorActivityId)!;
    const successor = byId.get(dependency.successorActivityId)!;
    const predecessorBoundary = requiredMilestone(dependency.dependencyType);
    const relevantSuccessorBoundary = successorBoundary(dependency.dependencyType);
    const lagMs = dependency.lagValue * lagUnitMs[dependency.lagUnit];
    const milestoneValue = actualMilestone(predecessor, predecessorBoundary);
    const milestoneAt = instant(milestoneValue);
    const predecessorDataIncomplete = (milestoneValue !== null && milestoneAt === null) ||
      (predecessorBoundary === "finish" && milestoneValue === null && predecessor.schedulePerformance.dataQuality !== "complete");
    const releaseAt = milestoneAt === null ? null : milestoneAt + lagMs;
    const condition: DependencyCondition = predecessorDataIncomplete
      ? "data_incomplete"
      : milestoneAt === null
        ? "milestone_missing"
        : releaseAt! > evaluatedAt
          ? "waiting_for_lag"
          : "constraint_released";

    const successorActualValue = actualMilestone(successor, relevantSuccessorBoundary);
    const successorActual = instant(successorActualValue);
    const successorDataIncomplete = (successorActualValue !== null && successorActual === null) ||
      (relevantSuccessorBoundary === "finish" && successorActualValue === null &&
        (successor.status === "completed" || successor.status === "approved") && successor.schedulePerformance.dataQuality !== "complete");
    const actualSequenceCompliance: ActualSequenceCompliance = predecessorDataIncomplete || successorDataIncomplete
      ? "data_incomplete"
      : milestoneAt === null || successorActual === null
        ? "not_observable"
        : successorActual >= releaseAt!
          ? "compliant"
          : "non_compliant";

    const predecessorPlanned = instant(plannedMilestone(predecessor, predecessorBoundary));
    const successorPlanned = instant(plannedMilestone(successor, relevantSuccessorBoundary));
    const baselineControlling = predecessorPlanned === null || successorPlanned === null
      ? null
      : predecessorPlanned + lagMs === successorPlanned;
    const relevantPlannedBoundaryPassed = successorPlanned === null ? null : evaluatedAt > successorPlanned;
    const downstreamScheduleExposure = condition !== "constraint_released";

    return {
      dependencyId: dependency.id,
      workPlanId: dependency.workPlanId,
      workPackageId: predecessor.workPackageId,
      predecessorActivityId: predecessor.id,
      successorActivityId: successor.id,
      predecessorOwnerUserId: predecessor.ownerUserId ?? null,
      predecessorSupervisorUserId: predecessor.supervisorUserId ?? null,
      successorOwnerUserId: successor.ownerUserId ?? null,
      successorSupervisorUserId: successor.supervisorUserId ?? null,
      dependencyType: dependency.dependencyType,
      lagValue: dependency.lagValue,
      lagUnit: dependency.lagUnit,
      lagMs,
      mandatory: dependency.mandatory,
      requiredPredecessorMilestone: predecessorBoundary,
      relevantSuccessorBoundary,
      predecessorMilestoneAt: milestoneValue,
      releaseAt: releaseAt === null ? null : new Date(releaseAt).toISOString(),
      successorActualBoundaryAt: successorActualValue,
      condition,
      actualSequenceCompliance,
      baselineControlling,
      downstreamScheduleExposure,
      relevantPlannedBoundaryPassed,
      overdueSuccessorWithUnreleasedConstraint: downstreamScheduleExposure && isCurrentlyOverdue(successor.schedulePerformance.state),
      predecessorSchedulePerformance: predecessor.schedulePerformance,
      successorSchedulePerformance: successor.schedulePerformance,
      predecessorScheduleState: predecessor.schedulePerformance.state,
      successorScheduleState: successor.schedulePerformance.state,
      predecessorStatus: predecessor.status,
      successorStatus: successor.status,
    };
  });

  const exposedIds = new Set(edges.filter((edge) => edge.downstreamScheduleExposure).map((edge) => edge.successorActivityId));
  const activityFacts = activities.map((activity) => ({
    activityId: activity.id,
    incomingDependencyCount: dependencies.filter((edge) => edge.successorActivityId === activity.id).length,
    outgoingDependencyCount: dependencies.filter((edge) => edge.predecessorActivityId === activity.id).length,
    upstreamReachableActivityCount: reachable(activity.id, incoming).size,
    downstreamReachableActivityCount: reachable(activity.id, outgoing).size,
    currentUnreleasedIncomingConstraintCount: edges.filter((edge) => edge.successorActivityId === activity.id && edge.condition !== "constraint_released").length,
    downstreamActivitiesExposedCount: [...reachable(activity.id, outgoing)].filter((id) => exposedIds.has(id)).length,
  }));

  return { ok: true, edges, activities: activityFacts };
}

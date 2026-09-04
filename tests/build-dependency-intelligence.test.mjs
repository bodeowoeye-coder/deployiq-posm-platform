import assert from "node:assert/strict";
import test from "node:test";
import { deriveDependencyIntelligence } from "../lib/build/management/dependencyIntelligence.ts";
import { deriveSchedulePerformance } from "../lib/build/management/schedulePerformance.ts";

const workPlanId = "work-plan-1";
const workPackageId = "work-package-1";
const evaluatedAt = new Date("2026-09-10T12:00:00.000Z");

function activity(id, overrides = {}) {
  const source = {
    scheduleConfirmedAt: "2026-09-01T10:00:00.000Z",
    plannedStartAt: "2026-09-08T09:00:00.000Z",
    plannedFinishAt: "2026-09-09T09:00:00.000Z",
    status: "not_started",
    startedAt: null,
    completedAt: null,
    events: [],
    ...overrides,
  };
  return {
    id,
    workPlanId,
    workPackageId,
    status: source.status,
    plannedStartAt: source.plannedStartAt,
    plannedFinishAt: source.plannedFinishAt,
    ownerUserId: `${id}-owner`,
    supervisorUserId: `${id}-supervisor`,
    schedulePerformance: deriveSchedulePerformance(source, evaluatedAt),
    active: overrides.active,
  };
}

function edge(id, predecessorActivityId, successorActivityId, overrides = {}) {
  return {
    id,
    workPlanId,
    predecessorActivityId,
    successorActivityId,
    dependencyType: "FS",
    lagValue: 0,
    lagUnit: "hours",
    mandatory: true,
    ...overrides,
  };
}

function derive(activities, dependencies, at = evaluatedAt) {
  const result = deriveDependencyIntelligence({ activities, dependencies, evaluatedAt: at });
  assert.equal(result.ok, true);
  return result;
}

test("FS distinguishes missing milestone, waiting lag, equality and elapsed release", () => {
  const successor = activity("successor", { plannedStartAt: "2026-09-10T14:00:00Z", plannedFinishAt: "2026-09-11T14:00:00Z" });
  const missing = derive([activity("missing"), successor], [edge("missing-edge", "missing", "successor")]).edges[0];
  assert.equal(missing.requiredPredecessorMilestone, "finish");
  assert.equal(missing.relevantSuccessorBoundary, "start");
  assert.equal(missing.condition, "milestone_missing");
  assert.equal(missing.downstreamScheduleExposure, true);

  const predecessor = activity("predecessor", { status: "completed", completedAt: "2026-09-10T10:00:00Z" });
  const dependency = edge("edge", "predecessor", "successor", { lagValue: 2 });
  assert.equal(derive([predecessor, successor], [dependency], new Date("2026-09-10T11:59:59.999Z")).edges[0].condition, "waiting_for_lag");
  assert.equal(derive([predecessor, successor], [dependency], new Date("2026-09-10T12:00:00.000Z")).edges[0].condition, "constraint_released");
  assert.equal(derive([predecessor, successor], [dependency], new Date("2026-09-10T13:00:00.000Z")).edges[0].condition, "constraint_released");
});

test("FS retains canonical predecessor and successor schedule-performance facts", () => {
  const predecessor = activity("predecessor", {
    plannedFinishAt: "2026-09-09T09:00:00Z", status: "completed", completedAt: "2026-09-09T10:00:00Z",
  });
  const successor = activity("successor");
  const result = derive([predecessor, successor], [edge("edge", "predecessor", "successor")]).edges[0];
  assert.equal(result.predecessorScheduleState, "completed_late");
  assert.equal(result.successorScheduleState, "overdue_to_start");
  assert.equal(result.overdueSuccessorWithUnreleasedConstraint, false);
  assert.equal(result.predecessorOwnerUserId, "predecessor-owner");
  assert.equal(result.successorSupervisorUserId, "successor-supervisor");

  const onTime = activity("on-time", {
    plannedFinishAt: "2026-09-09T09:00:00Z", status: "completed", completedAt: "2026-09-09T09:00:00Z",
  });
  assert.equal(derive([onTime, activity("other-successor")], [edge("on-time-edge", "on-time", "other-successor")]).edges[0].predecessorScheduleState, "completed_on_time");
});

test("SS, FF and SF use their canonical predecessor milestone and successor boundary", () => {
  const predecessor = activity("predecessor", {
    status: "completed", startedAt: "2026-09-10T08:00:00Z", completedAt: "2026-09-10T10:00:00Z",
  });
  const successor = activity("successor", {
    status: "completed", startedAt: "2026-09-10T09:00:00Z", completedAt: "2026-09-10T11:00:00Z",
  });
  for (const [type, milestone, boundary] of [["SS", "start", "start"], ["FF", "finish", "finish"], ["SF", "start", "finish"]]) {
    const result = derive([predecessor, successor], [edge(type, "predecessor", "successor", { dependencyType: type })]).edges[0];
    assert.equal(result.requiredPredecessorMilestone, milestone);
    assert.equal(result.relevantSuccessorBoundary, boundary);
    assert.equal(result.condition, "constraint_released");
    assert.equal(result.actualSequenceCompliance, "compliant");
  }
  const withoutStart = activity("without-start", { status: "not_started" });
  assert.equal(derive([withoutStart, successor], [edge("ss-missing", "without-start", "successor", { dependencyType: "SS" })]).edges[0].condition, "milestone_missing");
  assert.equal(derive([withoutStart, successor], [edge("sf-missing", "without-start", "successor", { dependencyType: "SF" })]).edges[0].condition, "milestone_missing");
  assert.equal(derive([withoutStart, successor], [edge("ff-missing", "without-start", "successor", { dependencyType: "FF" })]).edges[0].condition, "milestone_missing");
});

test("hours, days and weeks use continuous calendar duration", () => {
  const predecessor = activity("predecessor", { status: "completed", completedAt: "2026-09-01T12:00:00Z" });
  const successors = [activity("hours-successor"), activity("days-successor"), activity("weeks-successor")];
  const results = derive([predecessor, ...successors], [
    edge("hours", "predecessor", "hours-successor", { lagValue: 2, lagUnit: "hours" }),
    edge("days", "predecessor", "days-successor", { lagValue: 2, lagUnit: "days" }),
    edge("weeks", "predecessor", "weeks-successor", { lagValue: 2, lagUnit: "weeks" }),
  ]).edges;
  assert.deepEqual(results.map((item) => item.lagMs), [7_200_000, 172_800_000, 1_209_600_000]);
});

test("release and actual sequence compliance remain independent facts", () => {
  const predecessor = activity("predecessor", { status: "completed", completedAt: "2026-09-10T10:00:00Z" });
  const earlySuccessor = activity("successor", { status: "in_progress", startedAt: "2026-09-10T09:00:00Z" });
  const result = derive([predecessor, earlySuccessor], [edge("edge", "predecessor", "successor")]).edges[0];
  assert.equal(result.condition, "constraint_released");
  assert.equal(result.actualSequenceCompliance, "non_compliant");

  const futureRelease = derive([predecessor, activity("future")], [edge("future-edge", "predecessor", "future", { lagValue: 1, lagUnit: "days" })]).edges[0];
  assert.equal(futureRelease.condition, "waiting_for_lag");
  assert.equal(futureRelease.actualSequenceCompliance, "not_observable");
});

test("successor on-time and late starts preserve canonical A.3 variance", () => {
  const predecessor = activity("predecessor", { status: "completed", completedAt: "2026-09-07T09:00:00Z" });
  const onTime = activity("on-time", { status: "in_progress", startedAt: "2026-09-08T09:00:00Z" });
  const late = activity("late", { status: "in_progress", startedAt: "2026-09-08T11:00:00Z" });
  const results = derive([predecessor, onTime, late], [
    edge("on-time-edge", "predecessor", "on-time"),
    edge("late-edge", "predecessor", "late"),
  ]).edges;
  assert.equal(results[0].successorSchedulePerformance.startVarianceMs, 0);
  assert.equal(results[1].successorSchedulePerformance.startVarianceMs, 7_200_000);
  assert.equal(results[0].actualSequenceCompliance, "compliant");
  assert.equal(results[1].actualSequenceCompliance, "compliant");
});

test("successor late completion is canonical context rather than attributed delay", () => {
  const predecessor = activity("predecessor", { status: "completed", completedAt: "2026-09-08T08:00:00Z" });
  const successor = activity("successor", { status: "completed", startedAt: "2026-09-08T09:00:00Z", completedAt: "2026-09-09T11:00:00Z" });
  const result = derive([predecessor, successor], [edge("edge", "predecessor", "successor")]).edges[0];
  assert.equal(result.successorScheduleState, "completed_late");
  assert.equal(result.successorSchedulePerformance.finishVarianceMs, 7_200_000);
  assert.equal(result.actualSequenceCompliance, "compliant");
});

test("baseline-controlling comparisons allow ties and preserve multiple predecessors", () => {
  const first = activity("first", { plannedFinishAt: "2026-09-08T09:00:00Z", status: "completed", completedAt: "2026-09-08T09:00:00Z" });
  const second = activity("second", { plannedFinishAt: "2026-09-07T09:00:00Z", status: "completed", completedAt: "2026-09-07T09:00:00Z" });
  const successor = activity("successor", { plannedStartAt: "2026-09-09T09:00:00Z" });
  const results = derive([first, second, successor], [
    edge("first-edge", "first", "successor", { lagValue: 1, lagUnit: "days" }),
    edge("second-edge", "second", "successor", { lagValue: 2, lagUnit: "days", mandatory: false }),
  ]);
  assert.deepEqual(results.edges.map((item) => item.baselineControlling), [true, true]);
  assert.equal(results.edges[1].mandatory, false);
  assert.equal(results.activities.find((item) => item.activityId === "successor").incomingDependencyCount, 2);
});

test("one unreleased predecessor creates exposure independently of planned-boundary overdue state", () => {
  const released = activity("released", { status: "completed", completedAt: "2026-09-09T08:00:00Z" });
  const missing = activity("missing");
  const future = activity("future", { plannedStartAt: "2026-09-11T09:00:00Z", plannedFinishAt: "2026-09-12T09:00:00Z" });
  const before = derive([released, missing, future], [edge("a", "released", "future"), edge("b", "missing", "future")]).edges;
  assert.equal(before.filter((item) => item.downstreamScheduleExposure).length, 1);
  assert.equal(before[1].relevantPlannedBoundaryPassed, false);
  assert.equal(before[1].overdueSuccessorWithUnreleasedConstraint, false);

  const overdue = activity("overdue");
  const after = derive([missing, overdue], [edge("c", "missing", "overdue")]).edges[0];
  assert.equal(after.relevantPlannedBoundaryPassed, true);
  assert.equal(after.overdueSuccessorWithUnreleasedConstraint, true);
});

test("blocked execution states remain factual context without attribution", () => {
  const blockedPredecessor = activity("predecessor", { status: "blocked", startedAt: "2026-09-08T09:00:00Z" });
  const blockedSuccessor = activity("successor", { status: "blocked", startedAt: "2026-09-08T09:00:00Z" });
  const result = derive([blockedPredecessor, blockedSuccessor], [edge("edge", "predecessor", "successor")]).edges[0];
  assert.equal(result.predecessorStatus, "blocked");
  assert.equal(result.successorStatus, "blocked");
  assert.equal(result.condition, "milestone_missing");
  assert.equal(result.successorScheduleState, "overdue_to_complete");
});

test("graph intelligence counts incoming, outgoing and reachable activities in chains", () => {
  const activities = [activity("a"), activity("b"), activity("c"), activity("d")];
  const result = derive(activities, [edge("ab", "a", "b"), edge("bc", "b", "c"), edge("bd", "b", "d")]);
  const a = result.activities.find((item) => item.activityId === "a");
  const b = result.activities.find((item) => item.activityId === "b");
  assert.deepEqual(a, {
    activityId: "a", incomingDependencyCount: 0, outgoingDependencyCount: 1,
    upstreamReachableActivityCount: 0, downstreamReachableActivityCount: 3,
    currentUnreleasedIncomingConstraintCount: 0, downstreamActivitiesExposedCount: 3,
  });
  assert.equal(b.upstreamReachableActivityCount, 1);
  assert.equal(b.downstreamReachableActivityCount, 2);
});

test("malformed, cross-work-plan and cyclic graphs fail closed", () => {
  const a = activity("a"), b = activity("b");
  assert.deepEqual(deriveDependencyIntelligence({ activities: [a, b], dependencies: [edge("ab", "a", "b"), edge("ba", "b", "a")], evaluatedAt }), { ok: false, reason: "cycle_detected", edges: [], activities: [] });
  assert.equal(deriveDependencyIntelligence({ activities: [a], dependencies: [edge("missing", "a", "unknown")], evaluatedAt }).reason, "malformed_graph");
  assert.equal(deriveDependencyIntelligence({ activities: [a, { ...b, workPlanId: "other" }], dependencies: [edge("cross", "a", "b")], evaluatedAt }).reason, "malformed_graph");
  assert.equal(deriveDependencyIntelligence({ activities: [a, b], dependencies: [edge("negative", "a", "b", { lagValue: -1 })], evaluatedAt }).reason, "malformed_graph");
  assert.equal(deriveDependencyIntelligence({ activities: [a, b], dependencies: [edge("same", "a", "b"), edge("same", "a", "b")], evaluatedAt }).reason, "malformed_graph");
  assert.equal(deriveDependencyIntelligence({ activities: [a, b], dependencies: [], evaluatedAt: new Date("invalid") }).reason, "invalid_evaluation_time");
});

test("inactive edges and activities are omitted without changing active results", () => {
  const activeA = activity("a"), activeB = activity("b");
  const archivedA = activity("archived-a", { active: false });
  const archivedB = activity("archived-b", { active: false });
  const result = derive([activeA, activeB, archivedA, archivedB], [
    edge("active", "a", "b"),
    edge("archived", "archived-a", "archived-b", { active: false }),
  ]);
  assert.equal(result.edges.length, 1);
  assert.deepEqual(result.activities.map((item) => item.activityId), ["a", "b"]);
});

test("incomplete approved history and unscheduled facts remain explicit", () => {
  const predecessor = activity("predecessor", { status: "approved", completedAt: "2026-09-09T09:00:00Z", events: [] });
  const unscheduled = activity("successor", { scheduleConfirmedAt: null, plannedStartAt: null, plannedFinishAt: null });
  const result = derive([predecessor, unscheduled], [edge("edge", "predecessor", "successor")]).edges[0];
  assert.equal(result.condition, "data_incomplete");
  assert.equal(result.actualSequenceCompliance, "data_incomplete");
  assert.equal(result.baselineControlling, null);
  assert.equal(result.relevantPlannedBoundaryPassed, null);
  assert.equal(result.successorScheduleState, "not_scheduled");
});

test("domain output contains no causal, risk or critical-path attribution", () => {
  const result = derive([activity("a"), activity("b")], [edge("edge", "a", "b")]);
  const serialized = JSON.stringify(result);
  for (const forbidden of ["causedDelay", "delayCause", "propagatedDelay", "attributableDelay", "criticalPath", "riskScore", "float", "slack"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.equal(result.edges[0].successorScheduleState, result.edges[0].successorScheduleState);
});

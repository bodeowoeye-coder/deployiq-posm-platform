import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ACTUAL_SEQUENCE_LABELS,
  buildDependencyDrilldown,
  DEPENDENCY_CONDITION_LABELS,
  DEPENDENCY_TYPE_LABELS,
  formatDependencyLag,
} from "../lib/build/management/dependencyDrilldown.ts";
import { deriveDependencyIntelligence } from "../lib/build/management/dependencyIntelligence.ts";
import { deriveSchedulePerformance } from "../lib/build/management/schedulePerformance.ts";

const evaluatedAt = new Date("2026-09-10T12:00:00Z");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function activity(id, name, overrides = {}) {
  const value = {
    id, name, workPlanId: "plan", workPackageId: "package", status: "not_started",
    plannedStartAt: "2026-09-10T09:00:00Z", plannedFinishAt: "2026-09-11T09:00:00Z",
    startedAt: null, completedAt: null, events: [], ...overrides,
  };
  const schedulePerformance = deriveSchedulePerformance({
    scheduleConfirmedAt: "2026-09-01T09:00:00Z", plannedStartAt: value.plannedStartAt,
    plannedFinishAt: value.plannedFinishAt, status: value.status, startedAt: value.startedAt,
    completedAt: value.completedAt, events: value.events,
  }, evaluatedAt);
  return { ...value, schedulePerformance };
}

function runtime(activity) {
  return {
    id: activity.id, name: activity.name, planned_start_at: activity.plannedStartAt,
    planned_finish_at: activity.plannedFinishAt, schedule_performance: activity.schedulePerformance,
  };
}

function derive(activities, dependencies) {
  const result = deriveDependencyIntelligence({ activities, dependencies, evaluatedAt });
  assert.equal(result.ok, true);
  return buildDependencyDrilldown({ edges: result.edges, activityFacts: result.activities, activities: activities.map(runtime) });
}

test("drill-down decorates authoritative A.4.1 facts without recalculating them", () => {
  const predecessor = activity("a", "Ground preparation", { status: "completed", completedAt: "2026-09-09T09:00:00Z" });
  const successor = activity("b", "Electrical first fix");
  const input = { id: "edge", workPlanId: "plan", predecessorActivityId: "a", successorActivityId: "b", dependencyType: "FS", lagValue: 1, lagUnit: "days", mandatory: true };
  const intelligence = deriveDependencyIntelligence({ activities: [predecessor, successor], dependencies: [input], evaluatedAt });
  assert.equal(intelligence.ok, true);
  const result = buildDependencyDrilldown({ edges: intelligence.edges, activityFacts: intelligence.activities, activities: [runtime(predecessor), runtime(successor)] });
  assert.equal(result.dependencies[0].condition, intelligence.edges[0].condition);
  assert.equal(result.dependencies[0].actualSequenceCompliance, intelligence.edges[0].actualSequenceCompliance);
  assert.equal(result.dependencies[0].baselineControlling, intelligence.edges[0].baselineControlling);
  assert.equal(result.dependencies[0].predecessorName, "Ground preparation");
  assert.equal(result.dependencies[0].successorName, "Electrical first fix");
  assert.equal(result.dependencies[0].predecessorPlannedMilestoneAt, predecessor.plannedFinishAt);
  assert.equal(result.dependencies[0].successorPlannedBoundaryAt, successor.plannedStartAt);
});

test("FS, SS, FF and SF expose their correct planned milestones", () => {
  for (const [type, predecessorField, successorField] of [
    ["FS", "plannedFinishAt", "plannedStartAt"], ["SS", "plannedStartAt", "plannedStartAt"],
    ["FF", "plannedFinishAt", "plannedFinishAt"], ["SF", "plannedStartAt", "plannedFinishAt"],
  ]) {
    const a = activity(`a-${type}`, "Predecessor", { status: "completed", startedAt: "2026-09-08T09:00:00Z", completedAt: "2026-09-09T09:00:00Z" });
    const b = activity(`b-${type}`, "Successor");
    const detail = derive([a, b], [{ id: type, workPlanId: "plan", predecessorActivityId: a.id, successorActivityId: b.id, dependencyType: type, lagValue: 0, lagUnit: "days", mandatory: true }]).dependencies[0];
    assert.equal(detail.predecessorPlannedMilestoneAt, a[predecessorField]);
    assert.equal(detail.successorPlannedBoundaryAt, b[successorField]);
  }
});

test("customer labels cover every dependency type, condition and compliance state", () => {
  assert.deepEqual(Object.values(DEPENDENCY_TYPE_LABELS), ["FS · Finish-to-Start", "SS · Start-to-Start", "FF · Finish-to-Finish", "SF · Start-to-Finish"]);
  assert.deepEqual(Object.values(DEPENDENCY_CONDITION_LABELS), ["Waiting for Predecessor", "Waiting for Dependency Lag", "Constraint Released", "Dependency Data Incomplete"]);
  assert.deepEqual(Object.values(ACTUAL_SEQUENCE_LABELS), ["Compliant", "Non-compliant", "Not yet observable", "Data incomplete"]);
});

test("lag formatting preserves stored continuous-calendar units and count grammar", () => {
  assert.deepEqual([
    formatDependencyLag(0, "days"), formatDependencyLag(1, "hours"), formatDependencyLag(20, "days"), formatDependencyLag(2, "weeks"),
  ], ["0 days", "1 hour", "20 days", "2 weeks"]);
});

test("multiple and tied predecessors remain independent drill-down records", () => {
  const a = activity("a", "First", { plannedFinishAt: "2026-09-08T09:00:00Z" });
  const b = activity("b", "Second", { plannedFinishAt: "2026-09-07T09:00:00Z" });
  const c = activity("c", "Successor", { plannedStartAt: "2026-09-09T09:00:00Z" });
  const result = derive([a, b, c], [
    { id: "one", workPlanId: "plan", predecessorActivityId: "a", successorActivityId: "c", dependencyType: "FS", lagValue: 1, lagUnit: "days", mandatory: true },
    { id: "two", workPlanId: "plan", predecessorActivityId: "b", successorActivityId: "c", dependencyType: "FS", lagValue: 2, lagUnit: "days", mandatory: false },
  ]);
  assert.equal(result.dependencies.length, 2);
  assert.deepEqual(result.dependencies.map((item) => item.baselineControlling), [true, true]);
  assert.equal(result.activityFacts.find((item) => item.activityId === "c").incomingDependencyCount, 2);
});

test("work-plan and Activity UX provide responsive factual drill-down and empty states", () => {
  const workPlan = read("components/workspace/BuildRuntimeWorkPlan.tsx");
  const activity = read("components/workspace/BuildRuntimeActivityExecution.tsx");
  for (const copy of ["Schedule Dependencies", "Predecessor Activity", "Successor Activity", "Actual Sequence Compliance", "Baseline-controlling constraint", "No schedule dependencies are recorded for this Work Plan."]) assert.match(workPlan, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(workPlan, /sm:grid-cols-2 lg:grid-cols-3/);
  assert.doesNotMatch(workPlan, /overflow-x-hidden/);
  for (const copy of ["Incoming Dependencies", "Outgoing Dependencies", "Unreleased Incoming", "Upstream Activities", "downstream Activities are exposed to unreleased constraints"]) assert.match(activity, new RegExp(copy));
  assert.match(activity, /encodeURIComponent\(activityId\)/);
});

test("drill-down service preserves authoritative active ancestry and no causal, predictive or critical-path claims", () => {
  const service = read("lib/build/runtime/service.ts");
  const ui = `${read("components/workspace/BuildRuntimeWorkPlan.tsx")}\n${read("components/workspace/BuildRuntimeActivityExecution.tsx")}`;
  assert.match(service, /assertWorkPackageAccess/);
  assert.match(service, /\.eq\("work_plan_id", planId\)/);
  assert.match(service, /\.is\("archived_at", null\)/);
  assert.doesNotMatch(service, /build_runtime_dependencies[^\n]*(?:client_id|project_id)/);
  assert.doesNotMatch(ui, /root cause|delay driver|critical path|will be delayed/i);
});

test("A.4.2 and A.3 remain consumed rather than reimplemented by drill-down", () => {
  const drilldown = read("lib/build/management/dependencyDrilldown.ts");
  assert.doesNotMatch(drilldown, /Date\(|lagUnitMs|isCurrentlyOverdue|deriveSchedulePerformance/);
  assert.match(drilldown, /DependencyEdgeIntelligence/);
  assert.match(read("components/workspace/BuildRuntimeWorkPlan.tsx"), /SCHEDULE_STATE_LABELS/);
});

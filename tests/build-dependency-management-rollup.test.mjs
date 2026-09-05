import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { deriveDependencyManagementRollup } from "../lib/build/management/dependencyRollup.ts";

const service = fs.readFileSync("lib/build/management/service.ts", "utf8");
const overview = fs.readFileSync("app/workspace/admin/projects/[id]/page.tsx", "utf8");

function edge(id, overrides = {}) {
  return {
    dependencyId: id,
    workPackageId: "wp-1",
    predecessorActivityId: `pred-${id}`,
    successorActivityId: `successor-${id}`,
    condition: "constraint_released",
    predecessorScheduleState: "on_schedule",
    overdueSuccessorWithUnreleasedConstraint: false,
    baselineControlling: false,
    mandatory: true,
    dependencyType: "FS",
    ...overrides,
  };
}

test("zero dependencies produce explicit zero Project rollups", () => {
  assert.deepEqual(deriveDependencyManagementRollup([]), {
    project: {
      totalConstraints: 0, unreleasedConstraints: 0, downstreamActivitiesExposed: 0,
      overdueSuccessorsWithUnreleasedConstraints: 0, latePredecessorActivities: 0,
      workPackagesWithDependencyExceptions: 0, dataIncompleteConstraints: 0,
      baselineControllingConstraints: 0,
    },
    workPackages: [],
  });
});

test("released and unreleased edge counts remain distinct", () => {
  const result = deriveDependencyManagementRollup([
    edge("released"),
    edge("missing", { condition: "milestone_missing" }),
    edge("lag", { condition: "waiting_for_lag" }),
    edge("incomplete", { condition: "data_incomplete" }),
  ]).project;
  assert.equal(result.totalConstraints, 4);
  assert.equal(result.unreleasedConstraints, 3);
  assert.equal(result.downstreamActivitiesExposed, 3);
  assert.equal(result.dataIncompleteConstraints, 1);
});

test("multiple unreleased edges deduplicate one exposed and overdue successor", () => {
  const result = deriveDependencyManagementRollup([
    edge("first", { successorActivityId: "shared", condition: "milestone_missing", overdueSuccessorWithUnreleasedConstraint: true }),
    edge("second", { successorActivityId: "shared", condition: "waiting_for_lag", overdueSuccessorWithUnreleasedConstraint: true }),
  ]).project;
  assert.equal(result.unreleasedConstraints, 2);
  assert.equal(result.downstreamActivitiesExposed, 1);
  assert.equal(result.overdueSuccessorsWithUnreleasedConstraints, 1);
});

test("one late predecessor connected to multiple successors is counted once", () => {
  const result = deriveDependencyManagementRollup([
    edge("first", { predecessorActivityId: "shared-predecessor", predecessorScheduleState: "completed_late" }),
    edge("second", { predecessorActivityId: "shared-predecessor", predecessorScheduleState: "completed_late" }),
  ]).project;
  assert.equal(result.latePredecessorActivities, 1);
  assert.equal(result.downstreamActivitiesExposed, 0);
  assert.equal(result.workPackagesWithDependencyExceptions, 1);
});

test("canonical current-overdue predecessor states qualify but blocked alone does not", () => {
  const result = deriveDependencyManagementRollup([
    edge("late-start", { predecessorScheduleState: "overdue_to_start" }),
    edge("late-finish", { predecessorScheduleState: "overdue_to_complete" }),
    edge("blocked-only", { predecessorScheduleState: "on_schedule" }),
  ]).project;
  assert.equal(result.latePredecessorActivities, 2);
});

test("non-mandatory and mixed canonical dependency types remain visible", () => {
  const result = deriveDependencyManagementRollup([
    edge("fs", { dependencyType: "FS" }),
    edge("ss", { dependencyType: "SS", mandatory: false }),
    edge("ff", { dependencyType: "FF" }),
    edge("sf", { dependencyType: "SF" }),
  ]).project;
  assert.equal(result.totalConstraints, 4);
});

test("Work Package rollups stay independent and identify dependency exceptions", () => {
  const result = deriveDependencyManagementRollup([
    edge("wp1-released"),
    edge("wp2-unreleased", { workPackageId: "wp-2", condition: "milestone_missing" }),
    edge("wp3-late", { workPackageId: "wp-3", predecessorScheduleState: "completed_late" }),
  ]);
  assert.equal(result.workPackages.length, 3);
  assert.equal(result.project.workPackagesWithDependencyExceptions, 2);
  assert.equal(result.workPackages.find((item) => item.workPackageId === "wp-1").hasDependencyExceptions, false);
  assert.equal(result.workPackages.find((item) => item.workPackageId === "wp-2").unreleasedConstraints, 1);
});

test("defensive duplicate dependency rows cannot inflate Project or Activity counts", () => {
  const duplicate = edge("same", { condition: "milestone_missing", successorActivityId: "successor" });
  const result = deriveDependencyManagementRollup([duplicate, { ...duplicate }]).project;
  assert.equal(result.totalConstraints, 1);
  assert.equal(result.unreleasedConstraints, 1);
  assert.equal(result.downstreamActivitiesExposed, 1);
});

test("baseline-controlling constraints remain secondary factual data", () => {
  const result = deriveDependencyManagementRollup([
    edge("first", { baselineControlling: true }),
    edge("second", { baselineControlling: true }),
  ]).project;
  assert.equal(result.baselineControllingConstraints, 2);
  assert.doesNotMatch(overview, /Critical Path|Delay Driver/);
});

test("management service uses the dependency engine once per active Work Plan and authoritative scoping", () => {
  assert.match(service, /deriveDependencyIntelligence/);
  assert.match(service, /deriveDependencyManagementRollup/);
  assert.match(service, /for \(const plan of plans\)/);
  assert.match(service, /planActivityIds\.has\(text\(dependency\.predecessor_runtime_activity_id\)\)/);
  assert.match(service, /planActivityIds\.has\(text\(dependency\.successor_runtime_activity_id\)\)/);
  assert.match(service, /\.in\("work_plan_id", planIds\)/);
  assert.doesNotMatch(service, /from\("build_runtime_dependencies"\)[\s\S]{0,250}\.eq\("client_id"/);
  assert.doesNotMatch(service, /from\("build_runtime_dependencies"\)[\s\S]{0,250}\.eq\("project_id"/);
  assert.match(service, /\.is\("archived_at", null\)/);
});

test("Project Overview exposes compact factual dependency metrics after Schedule Attention", () => {
  for (const label of ["Delay &amp; Dependencies", "Unreleased Constraint", "Activity Exposed", "Overdue Activity with Unreleased Dependency", "Work Package with Dependency Exceptions", "Late Predecessor"]) {
    assert.match(overview, new RegExp(label));
  }
  assert.ok(overview.indexOf("Schedule Attention") < overview.indexOf("delay-dependencies-heading"));
  assert.ok(overview.indexOf("delay-dependencies-heading") < overview.indexOf("Exception Health"));
  assert.match(overview, /sm:grid-cols-2 xl:grid-cols-4/);
});

test("count-aware labels and concise Work Package indicator preserve responsive hierarchy", () => {
  assert.match(overview, /countLabel\(management\.dependencyFacts\.unreleasedConstraints/);
  assert.match(overview, /"Activity Exposed", "Activities Exposed"/);
  assert.match(overview, /"Work Package with Dependency Exceptions", "Work Packages with Dependency Exceptions"/);
  assert.match(overview, /"Dependency Exceptions"/);
  assert.match(overview, /overflow-x-auto overscroll-x-contain/);
});

test("customer presentation contains no prohibited causal predictive or scoring language", () => {
  for (const phrase of ["Delay Cause", "Caused By", "Root Cause", "Propagated Delay", "Critical Path", "Risk Score", "Attributable Delay", "Will Be Delayed", "Likely Delay", "Responsible For Delay"]) {
    assert.doesNotMatch(overview, new RegExp(phrase, "i"));
  }
});

test("accepted A.3 schedule metrics and calculations remain in place", () => {
  for (const label of ["Scheduled Activities", "Currently Overdue", "Completed On Time", "Completed Late", "Work Packages with overdue work", "Blocked and overdue", "Changes Required and overdue"]) {
    assert.match(overview, new RegExp(label));
  }
  assert.match(service, /deriveSchedulePerformance/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deriveManagementAttention } from "../lib/build/management/managementAttention.ts";
import { deriveDependencyIntelligence } from "../lib/build/management/dependencyIntelligence.ts";
import { deriveSchedulePerformance } from "../lib/build/management/schedulePerformance.ts";

const evaluatedAt = new Date("2026-09-10T12:00:00Z");
const completeSchedule = (state, quality = "complete") => ({ state, actualStartedAt: null, actualWorkFinishedAt: null, submittedForReviewAt: null, inspectionAcceptedAt: null, startVarianceMs: null, finishVarianceMs: null, submissionVarianceMs: null, currentStartDelayMs: null, currentCompletionDelayMs: null, dataQuality: quality });
const activity = (id, overrides = {}) => ({ id, projectId: "project", siteId: "site", workPackageId: "package", workPlanId: "plan", status: "in_progress", active: true, ancestryActive: true, requiresApproval: false, plannedStartAt: "2026-09-09T09:00:00Z", plannedFinishAt: "2026-09-09T17:00:00Z", activityOwnerUserId: "owner", activityOwnerDisplayName: "Ada Owner", supervisorUserId: null, schedulePerformance: completeSchedule("on_schedule"), events: [], ...overrides });
const exception = (id, overrides = {}) => ({ id, projectId: "project", siteId: "site", workPackageId: "package", workPlanId: "plan", activityId: "activity", status: "open", ownerUserId: "exception-owner", ownerDisplayName: "Emeka Owner", dueAt: null, raisedAt: "2026-09-08T10:00:00Z", active: true, ancestryActive: true, ...overrides });
const derive = ({ activities = [], exceptions = [], dependencyEdges = [], at = evaluatedAt } = {}) => deriveManagementAttention({ activities, exceptions, dependencyEdges, evaluatedAt: at });

test("assigned and unassigned schedule overdue facts consume A.3 state unchanged", () => {
  for (const [state, action] of [["overdue_to_start", "Start Activity"], ["overdue_to_complete", "Complete work or submit for review as configured"]]) {
    const assigned = derive({ activities: [activity(state, { schedulePerformance: completeSchedule(state) })] }).items[0];
    assert.equal(assigned.type, "schedule_overdue"); assert.equal(assigned.ownerKind, "activity_owner"); assert.equal(assigned.expectedNextAction, action);
    assert.equal(assigned.dueAt, state === "overdue_to_start" ? "2026-09-09T09:00:00Z" : "2026-09-09T17:00:00Z");
    const unassigned = derive({ activities: [activity(`u-${state}`, { activityOwnerUserId: null, activityOwnerDisplayName: null, schedulePerformance: completeSchedule(state) })] });
    assert.equal(unassigned.items.find((item) => item.type === "schedule_overdue").ownerKind, "unassigned");
    assert.equal(unassigned.items.find((item) => item.type === "schedule_overdue").expectedActor, "project_management");
  }
});

test("blocked assigned and unassigned Activities are factual and independent from schedule", () => {
  const blocked = derive({ activities: [activity("blocked", { status: "blocked", blockerReason: "Access unavailable", blockedAt: "2026-09-10T10:00:00Z", schedulePerformance: completeSchedule("overdue_to_complete") })] });
  assert.equal(blocked.summary.outstandingObligations, 2); assert.equal(blocked.summary.activitiesAffected, 1);
  assert.deepEqual(new Set(blocked.items.map((item) => item.type)), new Set(["schedule_overdue", "execution_block"]));
  const item = derive({ activities: [activity("unassigned-block", { status: "blocked", activityOwnerUserId: null, activityOwnerDisplayName: null })] }).items;
  assert.equal(item.filter((row) => row.type === "execution_block")[0].ownerKind, "unassigned");
  assert.equal(item.filter((row) => row.type === "execution_block")[0].overdue, null);
});

test("changes-required uses the latest unambiguous correction cycle and never invents a deadline", () => {
  const events = [{ event_type: "changes_required", occurred_at: "2026-09-08T10:00:00Z", event_sequence: 3 }, { event_type: "changes_required", occurred_at: "2026-09-10T10:00:00Z", event_sequence: 9 }];
  const item = derive({ activities: [activity("changes", { status: "changes_required", events })] }).items.find((row) => row.type === "changes_required");
  assert.equal(item.observedAt, events[1].occurred_at); assert.equal(item.expectedNextAction, "Resume corrective work and resubmit"); assert.equal(item.dueAt, null);
  const unassigned = derive({ activities: [activity("changes-u", { status: "changes_required", activityOwnerUserId: null, activityOwnerDisplayName: null })] }).items;
  assert.equal(unassigned.find((row) => row.type === "changes_required").ownerKind, "unassigned");
});

test("missing and ambiguous histories never manufacture observed timestamps", () => {
  const missing = derive({ activities: [activity("missing", { status: "submitted_for_review" })] }).items[0];
  assert.equal(missing.observedAt, null); assert.equal(missing.dataQuality, "incomplete");
  const tied = [{ event_type: "submitted_for_review", occurred_at: "2026-09-10T10:00:00Z", event_sequence: null }, { event_type: "submitted_for_review", occurred_at: "2026-09-10T10:00:00Z", event_sequence: null }];
  const ambiguous = derive({ activities: [activity("ambiguous", { status: "submitted_for_review", events: tied })] }).items[0];
  assert.equal(ambiguous.observedAt, null); assert.equal(ambiguous.dataQuality, "ambiguous_history");
});

test("review pending retains work ownership and never promotes Supervisor to owner", () => {
  const event = { event_type: "submitted_for_review", occurred_at: "2026-09-10T09:00:00Z", event_sequence: 4 };
  const supervised = derive({ activities: [activity("review", { status: "submitted_for_review", supervisorUserId: "supervisor", events: [event] })] }).items[0];
  assert.equal(supervised.ownerUserId, "owner"); assert.equal(supervised.expectedActor, "assigned_supervisor_or_management"); assert.equal(supervised.observedAt, event.occurred_at);
  const unsupervised = derive({ activities: [activity("review-2", { status: "submitted_for_review" })] }).items[0];
  assert.equal(unsupervised.expectedActor, "project_management"); assert.notEqual(unsupervised.ownerUserId, "supervisor");
});

test("Exception states produce canonical actions, due semantics and verified exclusion", () => {
  const result = derive({ exceptions: [
    exception("open", { dueAt: "2026-09-11T12:00:00Z" }),
    exception("remediation", { status: "in_remediation", dueAt: "2026-09-09T12:00:00Z" }),
    exception("resolved", { status: "resolved" }), exception("verified", { status: "verified" }),
  ] });
  assert.equal(result.items.length, 3);
  assert.deepEqual(result.items.map((item) => item.expectedNextAction).sort(), ["Complete corrective action and resolve", "Start remediation", "Verify resolution"].sort());
  assert.equal(result.summary.categoryCounts.activeExceptions, 3); assert.equal(result.summary.categoryCounts.overdueExceptions, 1);
  assert.equal(result.items.find((item) => item.sourceRecordId === "open").overdue, false);
  assert.equal(result.items.find((item) => item.sourceRecordId === "resolved").overdue, null);
});

test("Exception time evaluation is caller supplied and invalid due data remains incomplete", () => {
  const before = derive({ exceptions: [exception("due", { dueAt: "2026-09-10T11:00:00Z" })], at: new Date("2026-09-10T10:00:00Z") });
  const after = derive({ exceptions: [exception("due", { dueAt: "2026-09-10T11:00:00Z" })], at: new Date("2026-09-10T12:00:00Z") });
  assert.equal(before.items[0].overdue, false); assert.equal(after.items[0].overdue, true);
  const invalid = derive({ exceptions: [exception("invalid", { dueAt: "invalid" })] }).items[0];
  assert.equal(invalid.overdue, null); assert.equal(invalid.dataQuality, "incomplete");
});

test("assignment missing is conservative and excludes terminal Activities", () => {
  for (const status of ["not_started", "in_progress", "blocked", "changes_required"]) {
    const result = derive({ activities: [activity(status, { status, activityOwnerUserId: null, activityOwnerDisplayName: null })] });
    assert.ok(result.items.some((item) => item.type === "assignment_missing"));
  }
  for (const status of ["completed", "approved", "submitted_for_review"]) {
    const result = derive({ activities: [activity(status, { status, activityOwnerUserId: null, activityOwnerDisplayName: null })] });
    assert.ok(!result.items.some((item) => item.type === "assignment_missing"));
  }
});

function dependencyFixtures(condition) {
  const schedule = completeSchedule("on_schedule");
  const predecessor = { id: "pre", workPlanId: "plan", workPackageId: "package", status: "not_started", plannedStartAt: "2026-09-09T09:00:00Z", plannedFinishAt: "2026-09-09T10:00:00Z", ownerUserId: "pre-owner", schedulePerformance: condition === "data_incomplete" ? { ...schedule, dataQuality: "missing_history" } : schedule };
  const successor = { id: "successor", workPlanId: "plan", workPackageId: "package", status: "not_started", plannedStartAt: "2026-09-11T09:00:00Z", plannedFinishAt: "2026-09-11T10:00:00Z", ownerUserId: "successor-owner", schedulePerformance: schedule };
  if (condition === "waiting_for_lag") predecessor.schedulePerformance = { ...schedule, actualWorkFinishedAt: "2026-09-10T11:00:00Z" };
  if (condition === "data_incomplete") predecessor.schedulePerformance = { ...predecessor.schedulePerformance, actualWorkFinishedAt: "bad" };
  const intelligence = deriveDependencyIntelligence({ activities: [predecessor, successor], dependencies: [{ id: `edge-${condition}`, workPlanId: "plan", predecessorActivityId: "pre", successorActivityId: "successor", dependencyType: "FS", lagValue: condition === "waiting_for_lag" ? 1 : 0, lagUnit: "days", mandatory: true }], evaluatedAt });
  assert.equal(intelligence.ok, true); assert.equal(intelligence.edges[0].condition, condition);
  return { edge: intelligence.edges[0], successor: activity("successor", { activityOwnerUserId: "successor-owner", activityOwnerDisplayName: "Successor Owner" }) };
}

test("milestone-missing dependency is factual, preserves successor ownership and makes no causal assignment", () => {
  const { edge, successor } = dependencyFixtures("milestone_missing");
  const item = derive({ activities: [successor], dependencyEdges: [edge] }).items[0];
  assert.equal(item.type, "dependency_attention"); assert.equal(item.ownerUserId, "successor-owner");
  assert.equal(item.expectedActorUserId, "pre-owner");
  assert.equal(item.sourceRecordId, edge.dependencyId); assert.doesNotMatch(item.condition, /cause|fault|responsible for delay/i);
});

test("waiting-for-lag remains context and is excluded from human obligations", () => {
  const { edge, successor } = dependencyFixtures("waiting_for_lag");
  const result = derive({ activities: [successor], dependencyEdges: [edge] });
  assert.equal(result.summary.outstandingObligations, 0); assert.equal(result.summary.categoryCounts.dependencyAttention, 0);
});

test("dependency data incomplete creates ownerless management attention", () => {
  const { edge, successor } = dependencyFixtures("data_incomplete");
  const item = derive({ activities: [successor], dependencyEdges: [edge] }).items[0];
  assert.equal(item.type, "data_incomplete"); assert.equal(item.ownerUserId, null); assert.equal(item.expectedActor, "project_management");
});

test("roll-ups distinguish obligations, Activities, Work Packages, owners and Unassigned", () => {
  const activities = [activity("one", { status: "blocked", blockerReason: "Hold", schedulePerformance: completeSchedule("overdue_to_complete") }), activity("two", { workPackageId: "package-2", schedulePerformance: completeSchedule("overdue_to_start") }), activity("three", { activityOwnerUserId: null, activityOwnerDisplayName: null, schedulePerformance: completeSchedule("overdue_to_start") })];
  const result = derive({ activities });
  assert.equal(result.summary.outstandingObligations, 5); assert.equal(result.summary.activitiesAffected, 3); assert.equal(result.summary.workPackagesAffected, 2);
  assert.equal(result.summary.explicitOwnersAffected, 1); assert.equal(result.summary.owners[0].obligationCount, 3); assert.equal(result.summary.unassignedObligations, 2);
});

test("multiple explicit owners remain distinct and roles never substitute for ownership", () => {
  const result = derive({ activities: [activity("a", { activityOwnerUserId: "a", activityOwnerDisplayName: "A", supervisorUserId: "manager", schedulePerformance: completeSchedule("overdue_to_start") }), activity("b", { activityOwnerUserId: "b", activityOwnerDisplayName: "B", schedulePerformance: completeSchedule("overdue_to_start") })] });
  assert.equal(result.summary.explicitOwnersAffected, 2); assert.deepEqual(result.summary.owners.map((item) => item.ownerUserId), ["a", "b"]);
  assert.ok(!result.summary.owners.some((item) => item.ownerUserId === "manager"));
});

test("archived Activity or ancestry contributes no attention and zero state is calm", () => {
  assert.deepEqual(derive(), { items: [], summary: { outstandingObligations: 0, overdueObligations: 0, activitiesAffected: 0, workPackagesAffected: 0, explicitOwnersAffected: 0, unassignedObligations: 0, categoryCounts: { scheduleOverdue: 0, executionBlocks: 0, correctiveActionsRequired: 0, activeExceptions: 0, overdueExceptions: 0, reviewsPending: 0, assignmentsMissing: 0, dependencyAttention: 0, dataIncomplete: 0 }, owners: [] } });
  assert.equal(derive({ activities: [activity("archived", { active: false, schedulePerformance: completeSchedule("overdue_to_start") }), activity("ancestor", { ancestryActive: false, schedulePerformance: completeSchedule("overdue_to_start") })] }).items.length, 0);
  assert.equal(derive({ exceptions: [exception("archived", { ancestryActive: false })] }).items.length, 0);
});

test("contract is pure, consumes A.3/A.4 types and contains no blame, scores, IO, UI or mutation", () => {
  const source = readFileSync(new URL("../lib/build/management/managementAttention.ts", import.meta.url), "utf8");
  assert.match(source, /SchedulePerformance/); assert.match(source, /DependencyEdgeIntelligence/);
  assert.doesNotMatch(source, /deriveSchedulePerformance|deriveDependencyIntelligence|Date\.now|createAdminSupabase|\.from\(|fetch\(|React|useState|risk score|accountability score|performance score|priority rank/i);
  assert.doesNotMatch(source, /caused delay|responsible for delay|\bfault\b|poor performance|high-risk employee|delay attributable to|negligent|worst performer/i);
});

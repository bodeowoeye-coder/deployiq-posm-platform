import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deriveProjectProgressRollup } from "../lib/build/management/progressRollup.ts";

const asOf = new Date("2026-09-06T12:00:00.000Z");
const clientId = "client-1", projectId = "project-1";
const site = (id = "site-1", extra = {}) => ({ id, clientId, projectId, name: id, ...extra });
const wp = (id = "wp-1", siteId = "site-1", extra = {}) => ({ id, clientId, projectId, siteId, name: id, ...extra });
const plan = (id = "plan-1", workPackageId = "wp-1", siteId = "site-1", extra = {}) => ({ id, clientId, projectId, siteId, workPackageId, ...extra });
const performance = (state = "on_schedule", actualStartedAt = "2026-09-01T09:00:00.000Z") => ({ state, dataQuality: "complete", actualStartedAt });
const activity = (id, workPackageId = "wp-1", workPlanId = "plan-1", extra = {}) => ({
  id, clientId, projectId, siteId: "site-1", workPackageId, workPlanId, status: "in_progress", requiresApproval: false,
  plannedDuration: 1, durationUnit: "days", plannedStartAt: "2026-09-01T09:00:00.000Z",
  plannedFinishAt: "2026-09-05T17:00:00.000Z", schedulePerformance: performance(), events: [], ...extra,
});
const input = (extra = {}) => ({ projectId, clientId, asOf, sites: [site()], workPackages: [wp()], workPlans: [plan()],
  activities: [activity("activity-1")], context: [], ...extra });

test("B.3 aggregates direct Activity counts and duration totals instead of averaging Work Package ratios", () => {
  const activities = [activity("a-1", "wp-1", "plan-1", { status: "completed", plannedDuration: 10 })];
  for (let index = 0; index < 20; index += 1) activities.push(activity(`b-${index}`, "wp-2", "plan-2", {
    status: index < 10 ? "completed" : "in_progress", plannedDuration: 1,
  }));
  const result = deriveProjectProgressRollup(input({ workPackages: [wp("wp-1"), wp("wp-2")],
    workPlans: [plan("plan-1", "wp-1"), plan("plan-2", "wp-2")], activities }));
  assert.equal(result.ok, true);
  assert.equal(result.measurement.counts.totalActivities, 21);
  assert.equal(result.measurement.counts.operationallyCompletedActivities, 11);
  assert.equal(result.measurement.progressMeasurement.activityCounts.operationalCompletionRatio, 11 / 21);
  assert.equal(result.measurement.durationPosition.totalValidPlannedDurationHours, 30 * 24);
  assert.equal(result.measurement.durationPosition.operationalDurationCompletedHours, 20 * 24);
  assert.equal(result.measurement.durationPosition.operationalDurationCompletionRatio, 2 / 3);
});

test("B.3 keeps operational completion distinct from acceptance", () => {
  const result = deriveProjectProgressRollup(input({ activities: [activity("review", "wp-1", "plan-1", {
    status: "submitted_for_review", requiresApproval: true,
    events: [{ event_type: "submitted_for_review", occurred_at: "2026-09-05T17:00:00.000Z", event_sequence: 1 }],
  })] }));
  assert.equal(result.ok, true);
  assert.equal(result.measurement.counts.operationallyCompletedActivities, 1);
  assert.equal(result.measurement.counts.acceptedActivities, 0);
  assert.equal(result.measurement.finishPosition.operationalCompletionShortfallActivities, 0);
  assert.equal(result.measurement.finishPosition.acceptedCompletionShortfallActivities, 1);
});

test("B.3 exposes the complete Work Package and Project count, planned-position, duration and coverage contract", () => {
  const activities = [
    activity("direct", "wp-1", "plan-1", { status: "completed" }),
    activity("review", "wp-1", "plan-1", { status: "submitted_for_review", requiresApproval: true,
      events: [{ event_type: "submitted_for_review", occurred_at: "2026-09-05T17:00:00.000Z", event_sequence: 1 }] }),
    activity("approved", "wp-1", "plan-1", { status: "approved", requiresApproval: true,
      events: [{ event_type: "submitted_for_review", occurred_at: "2026-09-04T17:00:00.000Z", event_sequence: 1 },
        { event_type: "inspection_accepted", occurred_at: "2026-09-05T17:00:00.000Z", event_sequence: 2 }] }),
    activity("changes", "wp-1", "plan-1", { status: "changes_required", requiresApproval: true,
      events: [{ event_type: "submitted_for_review", occurred_at: "2026-09-04T17:00:00.000Z", event_sequence: 1 },
        { event_type: "changes_required", occurred_at: "2026-09-05T17:00:00.000Z", event_sequence: 2 }] }),
  ];
  const result = deriveProjectProgressRollup(input({ activities }));
  assert.equal(result.ok, true);
  for (const measured of [result.measurement, result.workPackages[0].measurement]) {
    assert.deepEqual(measured.counts, { totalActivities: 4, operationallyCompletedActivities: 3, acceptedActivities: 2 });
    assert.deepEqual(measured.progressMeasurement.activityCounts, { totalActivities: 4, operationallyCompletedActivities: 3,
      acceptedActivities: 2, remainingOperationalActivities: 1, remainingAcceptedActivities: 2,
      operationalCompletionRatio: 0.75, acceptedCompletionRatio: 0.5 });
    assert.deepEqual(measured.startPosition, { scheduledActivities: 4, activitiesExpectedStarted: 4,
      activitiesNotYetExpectedStarted: 0, activitiesActuallyStarted: 4, startShortfallActivities: 0, startAheadActivities: 0 });
    assert.deepEqual(measured.finishPosition, { activitiesExpectedFinished: 4, activitiesNotYetExpectedFinished: 0,
      operationalCompletionShortfallActivities: 1, operationalCompletionAheadActivities: 0,
      acceptedCompletionShortfallActivities: 2, acceptedCompletionAheadActivities: 0 });
    assert.equal(measured.durationPosition.totalValidPlannedDurationHours, 96);
    assert.equal(measured.durationPosition.plannedDurationExpectedCompleteHours, 96);
    assert.equal(measured.durationPosition.operationalDurationCompletedHours, 72);
    assert.equal(measured.durationPosition.acceptedDurationCompletedHours, 48);
    assert.equal(measured.durationPosition.operationalDurationDifferenceRatio, -0.25);
    assert.equal(measured.durationPosition.acceptedDurationDifferenceRatio, -0.5);
    assert.equal(measured.coverage.startPosition.status, "complete");
    assert.equal(measured.coverage.finishPosition.status, "complete");
    assert.equal(measured.coverage.duration.status, "complete");
  }
});

test("B.3 preserves multiple active Sites and their unequal Work Package scopes", () => {
  const result = deriveProjectProgressRollup(input({ sites: [site("site-1"), site("site-2")],
    workPackages: [wp("wp-1", "site-1"), wp("wp-2", "site-2")],
    workPlans: [plan("plan-1", "wp-1", "site-1"), plan("plan-2", "wp-2", "site-2")],
    activities: [activity("a", "wp-1", "plan-1"), activity("b", "wp-2", "plan-2", { siteId: "site-2" })] }));
  assert.equal(result.ok, true);
  assert.equal(result.scope.sitesTotal, 2);
  assert.equal(result.scope.workPackagesTotal, 2);
  assert.deepEqual(result.workPackages.map((item) => item.siteId), ["site-1", "site-2"]);
});

test("B.3 retains unscheduled and optional Activities in completion scope while exposing schedule coverage", () => {
  const result = deriveProjectProgressRollup(input({ activities: [activity("unscheduled", "wp-1", "plan-1", {
    mandatory: false, plannedStartAt: null, plannedFinishAt: null,
    schedulePerformance: performance("not_scheduled", null),
  })] }));
  assert.equal(result.ok, true);
  assert.equal(result.measurement.counts.totalActivities, 1);
  assert.equal(result.measurement.coverage.startPosition.status, "unavailable");
  assert.equal(result.measurement.coverage.finishPosition.status, "unavailable");
  assert.equal(result.dataQuality, "partial");
});

test("B.3 exposes missing, zero and invalid duration without inventing duration ratios", () => {
  for (const [plannedDuration, expectedIssue] of [[null, "missingDurationActivities"], [0, "zeroDurationActivities"]]) {
    const result = deriveProjectProgressRollup(input({ activities: [activity(`duration-${plannedDuration}`, "wp-1", "plan-1", { plannedDuration })] }));
    assert.equal(result.ok, true);
    assert.equal(result.workPackages[0].measurement.coverage.duration[expectedIssue], 1);
    assert.equal(result.workPackages[0].measurement.durationPosition.operationalDurationCompletionRatio, null);
    assert.notEqual(result.dataQuality, "complete");
  }
  const invalid = deriveProjectProgressRollup(input({ activities: [activity("duration-invalid", "wp-1", "plan-1", { plannedDuration: -1 })] }));
  assert.equal(invalid.ok, true);
  assert.equal(invalid.dataQuality, "invalid");
  assert.equal(invalid.measurement.counts.totalActivities, 1);
  assert.equal(invalid.measurement.coverage.duration.invalidDurationActivities, 1);
  assert.equal(invalid.workPackages[0].unavailableReason, "invalid_measurement");
  assert.equal(invalid.workPackages[0].measurement.dataQuality, "invalid");
  assert.equal(invalid.workPackages[0].measurement.coverage.duration.invalidDurationActivities, 1);
});

test("B.3 surfaces Work Packages without plans and empty plans as unavailable, never zero or 100 percent", () => {
  const result = deriveProjectProgressRollup(input({ workPackages: [wp("wp-1"), wp("wp-2")], workPlans: [plan()], activities: [] }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.scope, { sitesTotal: 1, workPackagesTotal: 2, workPackagesWithActiveWorkPlan: 1,
    workPackagesWithoutActiveWorkPlan: 1, workPackagesWithAmbiguousActivePlans: 0,
    workPackagesWithIncompleteMeasurement: 2, totalActivities: 0 });
  assert.equal(result.measurement, null);
  assert.equal(result.workPackages[0].unavailableReason, "empty_activity_scope");
  assert.equal(result.workPackages[0].measurement.progressMeasurement.activityCounts.operationalCompletionRatio, null);
  assert.equal(result.workPackages[1].unavailableReason, "work_plan_not_available");
  assert.equal(result.workPackages[1].measurement, null);
});

test("B.3 fails closed for ambiguous active Work Plans", () => {
  const result = deriveProjectProgressRollup(input({ workPlans: [plan("plan-1"), plan("plan-2")], activities: [] }));
  assert.equal(result.ok, true);
  assert.equal(result.dataQuality, "invalid");
  assert.equal(result.scope.workPackagesWithAmbiguousActivePlans, 1);
  assert.equal(result.workPackages[0].unavailableReason, "multiple_active_work_plans");
});

test("B.3 excludes archived ancestry and archived Activities from active metrics", () => {
  const result = deriveProjectProgressRollup(input({ sites: [site(), site("site-2", { archivedAt: asOf.toISOString() })],
    workPackages: [wp(), wp("wp-2", "site-2")], workPlans: [plan(), plan("plan-2", "wp-2", "site-2")],
    activities: [activity("active"), activity("archived", "wp-1", "plan-1", { archivedAt: asOf.toISOString() }),
      activity("archived-parent", "wp-2", "plan-2", { siteId: "site-2" })] }));
  assert.equal(result.ok, true);
  assert.equal(result.scope.sitesTotal, 1);
  assert.equal(result.scope.workPackagesTotal, 1);
  assert.equal(result.scope.totalActivities, 1);
});

test("B.3 makes an invalid schedule visible and excludes it from expected-position claims", () => {
  const result = deriveProjectProgressRollup(input({ activities: [activity("bad-schedule", "wp-1", "plan-1", {
    plannedStartAt: "not-a-date", schedulePerformance: performance("schedule_data_incomplete"),
  })] }));
  assert.equal(result.ok, true);
  assert.equal(result.dataQuality, "invalid");
  assert.equal(result.measurement.counts.totalActivities, 1);
  assert.equal(result.measurement.coverage.invalidScheduleActivities, 1);
  assert.equal(result.workPackages[0].measurement.coverage.invalidScheduleActivities, 1);
  assert.equal(result.workPackages[0].measurement.startPosition.activitiesExpectedStarted, null);
  assert.equal(result.workPackages[0].measurement.durationPosition.plannedDurationExpectedCompleteRatio, null);
});

test("B.3 rejects cross-tenant, cross-project, duplicate and invalid ancestry input", () => {
  assert.equal(deriveProjectProgressRollup(input({ activities: [activity("a", "wp-1", "plan-1", { clientId: "other" })] })).reason, "cross_tenant_scope");
  assert.equal(deriveProjectProgressRollup(input({ workPackages: [wp("wp-1", "site-1", { projectId: "other" })] })).reason, "cross_project_scope");
  assert.equal(deriveProjectProgressRollup(input({ sites: [site(), site()] })).reason, "duplicate_identifier");
  assert.equal(deriveProjectProgressRollup(input({ workPackages: [wp("wp-1", "missing")] })).reason, "invalid_ancestry");
  assert.equal(deriveProjectProgressRollup(input({ workPlans: [plan("plan-1", "missing")] })).reason, "invalid_ancestry");
  assert.equal(deriveProjectProgressRollup(input({ activities: [activity("a", "other", "plan-1")] })).reason, "invalid_ancestry");
});

test("B.3 validates and rolls up existing management context without recreating its rules", () => {
  const context = { workPackageId: "wp-1", overdueActivities: 2, blockedActivities: 1, reviewPendingActivities: 1,
    changesRequiredActivities: 0, activeExceptions: 3, managementAttentionObligations: 4, unreleasedDependencyConstraints: 2 };
  const result = deriveProjectProgressRollup(input({ context: [context] }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.workPackages[0].context, context);
  assert.deepEqual(result.managementContext, { workPackagesWithOverdueWork: 1, workPackagesWithBlockedWork: 1,
    workPackagesWithManagementAttention: 1, workPackagesWithDependencyExceptions: 1 });
  assert.equal(deriveProjectProgressRollup(input({ context: [{ ...context, overdueActivities: -1 }] })).reason, "invalid_context");
});

test("B.3 is deterministic at an explicit as-of time and does not mutate input", () => {
  const source = input();
  const before = structuredClone(source);
  const first = deriveProjectProgressRollup(source);
  const second = deriveProjectProgressRollup(source);
  assert.deepEqual(first, second);
  assert.deepEqual(source, before);
  assert.equal(first.asOf, asOf.toISOString());
});

test("management service composes B.1/B.2 roll-ups from tenant-scoped canonical rows", async () => {
  const source = await readFile(new URL("../lib/build/management/service.ts", import.meta.url), "utf8");
  assert.match(source, /deriveProjectProgressRollup/);
  assert.match(source, /\.eq\("client_id", project\.client_id\)/);
  assert.match(source, /planned_duration,duration_unit/);
  assert.match(source, /progressPerformance/);
  assert.doesNotMatch(source, /average\s*\(/i);
});

test("Project Overview presents coverage-aware operational, accepted and planned-position facts", async () => {
  const source = await readFile(new URL("../app/workspace/admin/projects/[id]/page.tsx", import.meta.url), "utf8");
  for (const copy of ["Progress &amp; Performance", "Activities Completed", "Activities Accepted", "Activities Expected Complete",
    "Operational Completion Shortfall", "Accepted Completion Shortfall", "Planned-Duration Share Expected Complete",
    "Planned-Duration Share Completed", "Planned-Duration Share Accepted", "Duration Coverage", "Work Package performance",
    "This is not a physical-progress claim."]) assert.match(source, new RegExp(copy.replace(/[&]/g, "&")));
  assert.match(source, /valid planned durations/);
  assert.match(source, /No active Work Plan is available; progress cannot be measured/);
  assert.doesNotMatch(source, />Good<|>Poor<|>At Risk<|>Critical<|>Healthy<|>Underperforming</);
});

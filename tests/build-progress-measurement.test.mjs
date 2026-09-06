import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deriveProgressMeasurement } from "../lib/build/management/progressMeasurement.ts";

const submitted = { event_type: "submitted_for_review", occurred_at: "2026-09-01T10:00:00Z", event_sequence: 1 };
const accepted = { event_type: "inspection_accepted", occurred_at: "2026-09-01T11:00:00Z", event_sequence: 2 };
const activity = (id, overrides = {}) => ({ id, status: "not_started", requiresApproval: false, plannedDuration: 1, durationUnit: "days", active: true, mandatory: true, events: [], ...overrides });
const measure = (...activities) => deriveProgressMeasurement(activities);

test("empty and not-started sets expose unavailable or zero count ratios without fabricating completion", () => {
  const empty = measure(); assert.equal(empty.ok, true); assert.equal(empty.activityCounts.totalActivities, 0);
  assert.equal(empty.activityCounts.operationalCompletionRatio, null); assert.equal(empty.activityCounts.acceptedCompletionRatio, null);
  assert.equal(empty.durationCoverage.status, "unavailable"); assert.equal(empty.durationCoverage.usableDurationCoverageRatio, null);
  const pending = measure(activity("pending")); assert.equal(pending.activityCounts.operationallyCompletedActivities, 0);
  assert.equal(pending.activityCounts.acceptedActivities, 0); assert.equal(pending.activityCounts.remainingOperationalActivities, 1);
  assert.equal(pending.activityCounts.remainingAcceptedActivities, 1);
});

test("direct completion is both operationally completed and accepted", () => {
  const result = measure(activity("direct", { status: "completed" })); assert.equal(result.ok, true);
  assert.equal(result.activityCounts.operationallyCompletedActivities, 1); assert.equal(result.activityCounts.acceptedActivities, 1);
  assert.equal(result.activityCounts.operationalCompletionRatio, 1); assert.equal(result.activityCounts.acceptedCompletionRatio, 1);
});

test("approval lifecycle preserves operational and accepted completion distinction", () => {
  for (const status of ["not_started", "in_progress"]) {
    const result = measure(activity(status, { status, requiresApproval: true }));
    assert.equal(result.activityCounts.operationallyCompletedActivities, 0); assert.equal(result.activityCounts.acceptedActivities, 0);
  }
  const awaiting = measure(activity("submitted", { status: "submitted_for_review", requiresApproval: true, events: [submitted] }));
  assert.equal(awaiting.activityCounts.operationallyCompletedActivities, 1); assert.equal(awaiting.activityCounts.acceptedActivities, 0);
  const approved = measure(activity("approved", { status: "approved", requiresApproval: true, events: [submitted, accepted] }));
  assert.equal(approved.activityCounts.operationallyCompletedActivities, 1); assert.equal(approved.activityCounts.acceptedActivities, 1);
  const corrections = measure(activity("changes", { status: "changes_required", requiresApproval: true, events: [submitted] }));
  assert.equal(corrections.activityCounts.operationallyCompletedActivities, 0); assert.equal(corrections.activityCounts.acceptedActivities, 0);
});

test("contradictory or incomplete authoritative lifecycle facts fail closed", () => {
  assert.deepEqual(measure(activity("bad-direct", { status: "approved" })), { ok: false, dataQuality: "invalid", reason: "completion_state_invalid", activityId: "bad-direct", contributions: [] });
  assert.equal(measure(activity("bad-approval", { status: "completed", requiresApproval: true })).ok, false);
  assert.equal(measure(activity("missing-submission", { status: "submitted_for_review", requiresApproval: true })).ok, false);
  assert.equal(measure(activity("missing-review", { status: "approved", requiresApproval: true, events: [accepted] })).ok, false);
});

test("mixed count measures remain explicitly Activity-count based", () => {
  const result = measure(activity("direct", { status: "completed" }), activity("awaiting", { status: "submitted_for_review", requiresApproval: true, events: [submitted] }), activity("pending"));
  assert.deepEqual(result.activityCounts, { totalActivities: 3, operationallyCompletedActivities: 2, acceptedActivities: 1,
    remainingOperationalActivities: 1, remainingAcceptedActivities: 2, operationalCompletionRatio: 2 / 3, acceptedCompletionRatio: 1 / 3 });
});

test("hours days and weeks share the canonical calendar-duration normalization", () => {
  const result = measure(activity("hours", { plannedDuration: 12, durationUnit: "hours", status: "completed" }), activity("days", { plannedDuration: 2, durationUnit: "days" }), activity("weeks", { plannedDuration: 1, durationUnit: "weeks", status: "completed" }));
  assert.equal(result.plannedDuration.totalValidPlannedDurationHours, 228);
  assert.equal(result.plannedDuration.operationallyCompletedPlannedDurationHours, 180);
  assert.equal(result.plannedDuration.acceptedPlannedDurationHours, 180);
  assert.equal(result.plannedDuration.operationalDurationCompletionRatio, 180 / 228);
  assert.equal(result.plannedDuration.acceptedDurationCompletionRatio, 180 / 228);
});

test("duration coverage exposes valid zero missing and invalid records", () => {
  const partial = measure(activity("valid"), activity("zero", { plannedDuration: 0 }), activity("missing", { plannedDuration: null }));
  assert.deepEqual(partial.durationCoverage, { status: "partial", totalActivities: 3, validDurationActivities: 1,
    zeroDurationActivities: 1, missingDurationActivities: 1, invalidDurationActivities: 0, usableDurationCoverageRatio: 1 / 3 });
  assert.equal(partial.dataQuality, "partial"); assert.equal(partial.plannedDuration.operationalDurationCompletionRatio, 0);
  const unavailable = measure(activity("zero", { plannedDuration: 0 }), activity("missing", { plannedDuration: undefined }));
  assert.equal(unavailable.durationCoverage.status, "unavailable"); assert.equal(unavailable.plannedDuration.operationalDurationCompletionRatio, null);
  const complete = measure(activity("one"), activity("two", { plannedDuration: 2 }));
  assert.equal(complete.durationCoverage.status, "complete"); assert.equal(complete.durationCoverage.usableDurationCoverageRatio, 1);
});

test("negative malformed and unsupported durations fail weighted ratios closed", () => {
  for (const invalidActivity of [
    activity("negative", { plannedDuration: -1 }), activity("malformed", { plannedDuration: "2" }),
    activity("nan", { plannedDuration: Number.NaN }), activity("unit", { durationUnit: "months" }),
  ]) {
    const result = measure(activity("valid", { status: "completed" }), invalidActivity);
    assert.equal(result.ok, true); assert.equal(result.dataQuality, "invalid");
    assert.equal(result.durationCoverage.invalidDurationActivities, 1);
    assert.equal(result.plannedDuration.operationalDurationCompletionRatio, null);
    assert.equal(result.plannedDuration.acceptedDurationCompletionRatio, null);
  }
});

test("zero duration stays in counts but never enters a duration numerator or denominator", () => {
  const result = measure(activity("zero", { plannedDuration: 0, status: "completed" }), activity("positive", { plannedDuration: 2 }));
  assert.equal(result.activityCounts.totalActivities, 2); assert.equal(result.activityCounts.operationallyCompletedActivities, 1);
  assert.equal(result.plannedDuration.totalValidPlannedDurationHours, 48); assert.equal(result.plannedDuration.operationallyCompletedPlannedDurationHours, 0);
  assert.equal(result.contributions[0].durationEligibility, "zero");
});

test("optional and parallel Activities retain independent count and duration contributions", () => {
  const result = measure(activity("optional", { mandatory: false, plannedDuration: 2, status: "completed" }), activity("parallel", { plannedDuration: 2, status: "completed" }));
  assert.equal(result.activityCounts.totalActivities, 2); assert.equal(result.durationCoverage.validDurationActivities, 2);
  assert.equal(result.plannedDuration.totalValidPlannedDurationHours, 96);
  assert.equal(result.plannedDuration.operationallyCompletedPlannedDurationHours, 96);
});

test("archived and inactive inputs cannot contribute", () => {
  const result = measure(activity("active", { status: "completed" }), activity("archived", { status: "completed", archivedAt: "2026-09-01T00:00:00Z" }), activity("inactive", { status: "completed", active: false }));
  assert.equal(result.activityCounts.totalActivities, 1); assert.equal(result.contributions.length, 3);
  assert.deepEqual(result.contributions.slice(1).map((item) => item.exclusionReason), ["archived_or_inactive", "archived_or_inactive"]);
});

test("contributions explain completion, acceptance, normalized duration and exclusion reason", () => {
  const result = measure(activity("awaiting", { status: "submitted_for_review", requiresApproval: true, plannedDuration: null, events: [submitted] }));
  assert.deepEqual(result.contributions[0], { activityId: "awaiting", included: true, exclusionReason: null,
    operationallyComplete: true, accepted: false, normalizedPlannedDurationHours: null,
    durationEligibility: "missing", durationIssue: "duration_missing" });
});

test("structurally invalid Activities fail closed", () => {
  assert.equal(deriveProgressMeasurement([{ ...activity(""), id: "" }]).ok, false);
  assert.equal(deriveProgressMeasurement([{ ...activity("status"), status: "half_done" }]).ok, false);
  assert.equal(deriveProgressMeasurement([{ ...activity("approval"), requiresApproval: "yes" }]).ok, false);
  assert.equal(deriveProgressMeasurement([activity("duplicate"), activity("duplicate")]).ok, false);
  assert.equal(deriveProgressMeasurement([{ ...activity("events"), events: "not-an-event-list" }]).ok, false);
  assert.equal(deriveProgressMeasurement([activity("event-time", { events: [{ ...submitted, occurred_at: "invalid" }] })]).ok, false);
  assert.equal(deriveProgressMeasurement([activity("event-order", { events: [{ ...submitted, event_sequence: -1 }] })]).ok, false);
});

test("output is deterministic and the contract has no clock IO Retail percent physical progress scoring or forecasting", () => {
  const input = [activity("one", { status: "completed" }), activity("two", { plannedDuration: null })];
  assert.deepEqual(deriveProgressMeasurement(input), deriveProgressMeasurement(input));
  const source = readFileSync(new URL("../lib/build/management/progressMeasurement.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /new Date\(|Date\.now|createAdminSupabase|\.from\(|fetch\(|projectProgress|progressPercent|target_quantity|physicalProgress|percent_complete|progress_percent|manual_progress|reported_progress|milestone weight|performance score|productivity|efficiency|forecast|earned value|\bSPI\b|\bCPI\b/i);
});

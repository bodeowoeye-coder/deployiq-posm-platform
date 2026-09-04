import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveSchedulePerformance,
  deriveSuccessfulReviewFinish,
  formatScheduleVariance,
  isCurrentlyOverdue,
} from "../lib/build/management/schedulePerformance.ts";

const confirmed = "2026-09-01T10:00:00.000Z";
const start = "2026-09-07T09:00:00.000Z";
const finish = "2026-09-09T09:00:00.000Z";
const at = (value) => new Date(value);
const input = (overrides = {}) => ({ scheduleConfirmedAt: confirmed, plannedStartAt: start, plannedFinishAt: finish, status: "not_started", startedAt: null, completedAt: null, events: [], ...overrides });

test("unconfirmed and incomplete schedules fail visibly without fabricated dates", () => {
  assert.equal(deriveSchedulePerformance(input({ scheduleConfirmedAt: null }), at(start)).state, "not_scheduled");
  const incomplete = deriveSchedulePerformance(input({ plannedFinishAt: null }), at(start));
  assert.equal(incomplete.state, "schedule_data_incomplete");
  assert.equal(incomplete.dataQuality, "incomplete_schedule");
});

test("not-started boundaries are strict including zero-duration milestones", () => {
  assert.equal(deriveSchedulePerformance(input(), at(start)).state, "not_yet_due");
  assert.equal(deriveSchedulePerformance(input(), at("2026-09-07T09:00:00.001Z")).state, "overdue_to_start");
  const milestone = input({ plannedFinishAt: start });
  assert.equal(deriveSchedulePerformance(milestone, at(start)).state, "not_yet_due");
  assert.equal(deriveSchedulePerformance(milestone, at("2026-09-07T09:00:00.001Z")).state, "overdue_to_start");
});

test("start variance preserves early exact and late instants", () => {
  assert.equal(deriveSchedulePerformance(input({ status: "in_progress", startedAt: "2026-09-07T08:00:00Z" }), at(start)).startVarianceMs, -3_600_000);
  assert.equal(deriveSchedulePerformance(input({ status: "in_progress", startedAt: start }), at(start)).startVarianceMs, 0);
  assert.equal(deriveSchedulePerformance(input({ status: "in_progress", startedAt: "2026-09-07T10:00:00Z" }), at(start)).startVarianceMs, 3_600_000);
});

test("in-progress and blocked Activities keep execution separate from schedule", () => {
  assert.equal(deriveSchedulePerformance(input({ status: "in_progress", startedAt: start }), at(finish)).state, "on_schedule");
  const blocked = deriveSchedulePerformance(input({ status: "blocked", startedAt: start }), at("2026-09-09T10:00:00Z"));
  assert.equal(blocked.state, "overdue_to_complete");
  assert.equal(blocked.currentCompletionDelayMs, 3_600_000);
  assert.ok(isCurrentlyOverdue(blocked.state));
});

test("direct completion classifies early exact and late", () => {
  assert.equal(deriveSchedulePerformance(input({ status: "completed", completedAt: "2026-09-09T08:00:00Z" }), at(finish)).state, "completed_early");
  assert.equal(deriveSchedulePerformance(input({ status: "completed", completedAt: finish }), at(finish)).state, "completed_on_time");
  assert.equal(deriveSchedulePerformance(input({ status: "completed", completedAt: "2026-09-09T10:00:00Z" }), at(finish)).state, "completed_late");
});

test("awaiting review reports submission variance without final completion", () => {
  const result = deriveSchedulePerformance(input({ status: "submitted_for_review", events: [{ event_type: "submitted_for_review", occurred_at: "2026-09-09T10:00:00Z", event_sequence: 4 }] }), at("2026-09-10T09:00:00Z"));
  assert.equal(result.state, "awaiting_review");
  assert.equal(result.submissionVarianceMs, 3_600_000);
  assert.equal(result.actualWorkFinishedAt, null);
  assert.equal(result.currentCompletionDelayMs, null);
});

test("changes required remains unfinished and can become overdue", () => {
  const result = deriveSchedulePerformance(input({ status: "changes_required", startedAt: start, events: [{ event_type: "submitted_for_review", occurred_at: finish, event_sequence: 2 }] }), at("2026-09-10T09:00:00Z"));
  assert.equal(result.state, "overdue_to_complete");
  assert.equal(result.submittedForReviewAt, finish);
  assert.equal(result.actualWorkFinishedAt, null);
});

test("approved work uses final successful submission before acceptance", () => {
  const events = [
    { event_type: "submitted_for_review", occurred_at: "2026-09-08T09:00:00Z", event_sequence: 2 },
    { event_type: "changes_required", occurred_at: "2026-09-08T10:00:00Z", event_sequence: 3 },
    { event_type: "submitted_for_review", occurred_at: "2026-09-09T10:00:00Z", event_sequence: 5 },
    { event_type: "inspection_accepted", occurred_at: "2026-09-10T12:00:00Z", event_sequence: 6 },
  ];
  const result = deriveSchedulePerformance(input({ status: "approved", completedAt: "2026-09-10T12:00:00Z", events }), at("2026-09-10T12:00:00Z"));
  assert.equal(result.actualWorkFinishedAt, "2026-09-09T10:00:00Z");
  assert.equal(result.inspectionAcceptedAt, "2026-09-10T12:00:00Z");
  assert.equal(result.state, "completed_late");
});

test("missing or ambiguous review history never fabricates finish", () => {
  assert.equal(deriveSuccessfulReviewFinish([]).quality, "missing_history");
  const ambiguous = deriveSuccessfulReviewFinish([
    { event_type: "submitted_for_review", occurred_at: finish, event_sequence: null },
    { event_type: "inspection_accepted", occurred_at: finish, event_sequence: null },
  ]);
  assert.equal(ambiguous.quality, "ambiguous_history");
  assert.equal(ambiguous.submittedAt, null);
  assert.equal(deriveSchedulePerformance(input({ status: "approved", completedAt: "2026-09-10T12:00:00Z" }), at("2026-09-11T12:00:00Z")).state, "schedule_data_incomplete");
  assert.equal(deriveSchedulePerformance(input({ status: "completed", completedAt: null }), at("2026-09-11T12:00:00Z")).state, "schedule_data_incomplete");
});

test("human-readable variance is deterministic and non-lossy", () => {
  assert.equal(formatScheduleVariance(0), "On time");
  assert.equal(formatScheduleVariance(18 * 60_000), "18 minutes late");
  assert.equal(formatScheduleVariance(-2 * 3_600_000), "2 hours early");
  assert.equal(formatScheduleVariance(49 * 3_600_000), "2 days 1 hour late");
});

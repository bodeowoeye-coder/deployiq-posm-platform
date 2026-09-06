import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { derivePlannedPosition } from "../lib/build/management/plannedPosition.ts";
import { deriveSchedulePerformance } from "../lib/build/management/schedulePerformance.ts";

const start = "2026-09-07T09:00:00Z";
const finish = "2026-09-09T09:00:00Z";
const before = new Date("2026-09-06T09:00:00Z");
const during = new Date("2026-09-08T09:00:00Z");
const after = new Date("2026-09-10T09:00:00Z");
const submitted = { event_type: "submitted_for_review", occurred_at: "2026-09-09T08:00:00Z", event_sequence: 2 };
const accepted = { event_type: "inspection_accepted", occurred_at: "2026-09-09T10:00:00Z", event_sequence: 3 };
const schedule = (overrides = {}) => deriveSchedulePerformance({ scheduleConfirmedAt: "2026-09-01T09:00:00Z", plannedStartAt: start,
  plannedFinishAt: finish, status: "not_started", startedAt: null, completedAt: null, events: [], ...overrides }, after);
const activity = (id, overrides = {}) => ({ id, status: "not_started", requiresApproval: false, plannedDuration: 1,
  durationUnit: "days", plannedStartAt: start, plannedFinishAt: finish, mandatory: true, active: true, events: [],
  schedulePerformance: schedule(), ...overrides });
const derive = (activities, asOf = after) => derivePlannedPosition(activities, asOf);

test("empty scope exposes zero facts and unavailable ratios", () => {
  const result = derive([]); assert.equal(result.ok, true); assert.equal(result.counts.totalActivities, 0);
  assert.equal(result.startPosition.activitiesExpectedStarted, 0); assert.equal(result.finishPosition.activitiesExpectedFinished, 0);
  assert.equal(result.durationPosition.plannedDurationExpectedCompleteRatio, null);
  assert.equal(result.coverage.startPosition.status, "unavailable"); assert.equal(result.coverage.finishPosition.status, "unavailable");
});

test("caller-supplied asOf deterministically changes binary start and finish position", () => {
  const input = [activity("one")];
  const early = derive(input, before), middle = derive(input, during), late = derive(input, after);
  assert.equal(early.startPosition.activitiesExpectedStarted, 0); assert.equal(early.finishPosition.activitiesExpectedFinished, 0);
  assert.equal(middle.startPosition.activitiesExpectedStarted, 1); assert.equal(middle.finishPosition.activitiesExpectedFinished, 0);
  assert.equal(late.startPosition.activitiesExpectedStarted, 1); assert.equal(late.finishPosition.activitiesExpectedFinished, 1);
  assert.deepEqual(derive(input, after), derive(input, after));
});

test("actual start uses canonical A.3 actualStartedAt and respects asOf", () => {
  const early = activity("early", { schedulePerformance: schedule({ status: "in_progress", startedAt: "2026-09-06T09:00:00Z" }) });
  const late = activity("late", { schedulePerformance: schedule({ status: "in_progress", startedAt: "2026-09-08T09:00:00Z" }) });
  assert.equal(derive([early], before).startPosition.activitiesActuallyStarted, 1);
  assert.equal(derive([late], during).startPosition.activitiesActuallyStarted, 1);
  assert.equal(derive([late], before).startPosition.activitiesActuallyStarted, 0);
});

test("start shortfall and ahead remain separate non-negative counts", () => {
  const noStart = activity("not-started");
  const startedEarly = activity("started", { plannedStartAt: "2026-09-12T09:00:00Z", plannedFinishAt: "2026-09-13T09:00:00Z",
    schedulePerformance: schedule({ status: "in_progress", startedAt: "2026-09-06T09:00:00Z" }) });
  const shortfall = derive([noStart], after); assert.equal(shortfall.startPosition.startShortfallActivities, 1); assert.equal(shortfall.startPosition.startAheadActivities, 0);
  const ahead = derive([startedEarly], after); assert.equal(ahead.startPosition.startShortfallActivities, 0); assert.equal(ahead.startPosition.startAheadActivities, 1);
});

test("finish comparison consumes B.1 direct-completion authority", () => {
  const pending = derive([activity("pending")]);
  assert.equal(pending.finishPosition.activitiesExpectedFinished, 1);
  assert.equal(pending.finishPosition.operationalCompletionShortfallActivities, 1);
  assert.equal(pending.finishPosition.acceptedCompletionShortfallActivities, 1);
  const complete = derive([activity("complete", { status: "completed" })]);
  assert.equal(complete.counts.operationallyCompletedActivities, 1); assert.equal(complete.counts.acceptedActivities, 1);
  assert.equal(complete.finishPosition.operationalCompletionShortfallActivities, 0);
  assert.equal(complete.finishPosition.acceptedCompletionShortfallActivities, 0);
});

test("approval submission can eliminate operational shortfall while accepted shortfall remains", () => {
  const awaiting = derive([activity("awaiting", { status: "submitted_for_review", requiresApproval: true, events: [submitted] })]);
  assert.equal(awaiting.counts.operationallyCompletedActivities, 1); assert.equal(awaiting.counts.acceptedActivities, 0);
  assert.equal(awaiting.finishPosition.operationalCompletionShortfallActivities, 0);
  assert.equal(awaiting.finishPosition.acceptedCompletionShortfallActivities, 1);
  const approved = derive([activity("approved", { status: "approved", requiresApproval: true, events: [submitted, accepted] })]);
  assert.equal(approved.counts.acceptedActivities, 1); assert.equal(approved.finishPosition.acceptedCompletionShortfallActivities, 0);
  const corrections = derive([activity("changes", { status: "changes_required", requiresApproval: true, events: [submitted] })]);
  assert.equal(corrections.counts.operationallyCompletedActivities, 0); assert.equal(corrections.counts.acceptedActivities, 0);
});

test("actual completion ahead of baseline is separate and never a negative shortfall", () => {
  const future = activity("future", { status: "completed", plannedStartAt: "2026-09-11T09:00:00Z", plannedFinishAt: "2026-09-12T09:00:00Z" });
  const result = derive([future], after);
  assert.equal(result.finishPosition.activitiesExpectedFinished, 0);
  assert.equal(result.finishPosition.operationalCompletionShortfallActivities, 0); assert.equal(result.finishPosition.operationalCompletionAheadActivities, 1);
  assert.equal(result.finishPosition.acceptedCompletionShortfallActivities, 0); assert.equal(result.finishPosition.acceptedCompletionAheadActivities, 1);
});

test("planned duration position is binary at finish with no interpolation", () => {
  const input = [activity("one", { plannedDuration: 2 })];
  assert.equal(derive(input, during).durationPosition.plannedDurationExpectedCompleteHours, 0);
  assert.equal(derive(input, during).durationPosition.plannedDurationExpectedCompleteRatio, 0);
  assert.equal(derive(input, after).durationPosition.plannedDurationExpectedCompleteHours, 48);
  assert.equal(derive(input, after).durationPosition.plannedDurationExpectedCompleteRatio, 1);
});

test("mixed duration units and parallel Activities each contribute independently", () => {
  const result = derive([activity("hours", { plannedDuration: 12, durationUnit: "hours", status: "completed" }),
    activity("days", { plannedDuration: 2, durationUnit: "days" }), activity("weeks", { plannedDuration: 1, durationUnit: "weeks", status: "completed", mandatory: false })]);
  assert.equal(result.durationPosition.totalValidPlannedDurationHours, 228);
  assert.equal(result.durationPosition.plannedDurationExpectedCompleteHours, 228);
  assert.equal(result.durationPosition.operationalDurationCompletedHours, 180);
  assert.equal(result.durationPosition.acceptedDurationCompletedHours, 180);
  assert.equal(result.durationPosition.plannedDurationExpectedCompleteRatio, 1);
  assert.equal(result.durationPosition.operationalDurationCompletionRatio, 180 / 228);
});

test("signed ratio difference and explicit duration shortfall/ahead have factual semantics", () => {
  const behind = derive([activity("done", { status: "completed" }), activity("pending")]);
  assert.equal(behind.durationPosition.operationalDurationDifferenceRatio, -0.5);
  assert.equal(behind.durationPosition.operationalDurationShortfallRatio, 0.5); assert.equal(behind.durationPosition.operationalDurationAheadRatio, 0);
  const ahead = derive([activity("future", { status: "completed", plannedStartAt: "2026-09-11T09:00:00Z", plannedFinishAt: "2026-09-12T09:00:00Z" })]);
  assert.equal(ahead.durationPosition.operationalDurationDifferenceRatio, 1);
  assert.equal(ahead.durationPosition.operationalDurationShortfallRatio, 0); assert.equal(ahead.durationPosition.operationalDurationAheadRatio, 1);
});

test("missing dates are coverage gaps rather than future schedule facts", () => {
  const result = derive([activity("valid"), activity("no-start", { plannedStartAt: null }), activity("no-finish", { plannedFinishAt: null })]);
  assert.equal(result.ok, true); assert.equal(result.dataQuality, "partial");
  assert.equal(result.coverage.validScheduledActivities, 1); assert.equal(result.coverage.missingPlannedStartActivities, 1);
  assert.equal(result.coverage.missingPlannedFinishActivities, 1); assert.equal(result.coverage.startPosition.status, "partial");
  assert.equal(result.coverage.finishPosition.status, "partial");
  assert.equal(result.activityContributions[1].expectedToHaveStarted, null);
  assert.equal(result.durationPosition.plannedDurationExpectedCompleteRatio, null);
});

test("malformed timestamps reversed schedules and malformed actual starts fail planned comparisons closed", () => {
  for (const item of [activity("start", { plannedStartAt: "bad" }), activity("finish", { plannedFinishAt: "bad" }),
    activity("order", { plannedStartAt: finish, plannedFinishAt: start }),
    activity("actual", { schedulePerformance: { ...schedule(), actualStartedAt: "bad" } })]) {
    const result = derive([item]); assert.equal(result.ok, true); assert.equal(result.dataQuality, "invalid");
    assert.equal(result.coverage.invalidScheduleActivities, 1); assert.equal(result.startPosition.activitiesExpectedStarted, null);
    assert.equal(result.finishPosition.activitiesExpectedFinished, null); assert.equal(result.durationPosition.plannedDurationExpectedCompleteRatio, null);
  }
});

test("unscheduled Activity stays in actual counts and is explicit outside planned scope", () => {
  const result = derive([activity("unscheduled", { status: "completed", plannedStartAt: null, plannedFinishAt: null })]);
  assert.equal(result.counts.totalActivities, 1); assert.equal(result.counts.operationallyCompletedActivities, 1);
  assert.equal(result.coverage.validScheduledActivities, 0); assert.equal(result.coverage.startPosition.status, "unavailable");
  assert.equal(result.coverage.finishPosition.status, "unavailable");
});

test("zero missing and invalid duration preserve B.1 coverage and weighted fail-closed rules", () => {
  const partial = derive([activity("valid"), activity("zero", { plannedDuration: 0 }), activity("missing", { plannedDuration: null })]);
  assert.equal(partial.coverage.duration.validDurationActivities, 1); assert.equal(partial.coverage.duration.zeroDurationActivities, 1);
  assert.equal(partial.coverage.duration.missingDurationActivities, 1); assert.equal(partial.coverage.duration.status, "partial");
  const invalid = derive([activity("valid"), activity("invalid", { plannedDuration: -1 })]);
  assert.equal(invalid.dataQuality, "invalid"); assert.equal(invalid.coverage.duration.invalidDurationActivities, 1);
  assert.equal(invalid.durationPosition.plannedDurationExpectedCompleteRatio, null);
  assert.equal(invalid.durationPosition.operationalDurationDifferenceRatio, null);
});

test("audit contributions align schedule expectations actual completion and duration explanations", () => {
  const result = derive([activity("audit", { status: "submitted_for_review", requiresApproval: true, events: [submitted] })]);
  assert.deepEqual(result.activityContributions[0], { activityId: "audit", included: true, expectedToHaveStarted: true,
    expectedToHaveFinished: true, actuallyStarted: false, operationallyComplete: true, accepted: false,
    plannedStartAt: start, plannedFinishAt: finish, normalizedPlannedDurationHours: 24,
    durationEligibility: "valid_positive", startScheduleEligibility: "valid", finishScheduleEligibility: "valid",
    schedulePerformanceState: "overdue_to_start", schedulePerformanceDataQuality: "complete",
    scheduleIssue: null, plannedDurationExpectedContributionHours: 24, operationalDurationContributionHours: 24,
    acceptedDurationContributionHours: 0 });
});

test("invalid asOf duplicate IDs malformed completion and archived scope fail closed or exclude safely", () => {
  assert.equal(derive([activity("one")], new Date("bad")).ok, false);
  assert.equal(derive([activity("duplicate"), activity("duplicate")]).ok, false);
  assert.equal(derive([activity("bad", { status: "approved", requiresApproval: false })]).ok, false);
  assert.equal(derive([{ ...activity("schedule"), schedulePerformance: null }]).ok, false);
  assert.equal(derive([{ ...activity("state"), schedulePerformance: { ...schedule(), state: "invented" } }]).ok, false);
  const archived = derive([activity("active"), activity("archived", { status: "completed", archivedAt: "2026-09-01T00:00:00Z" })]);
  assert.equal(archived.counts.totalActivities, 1); assert.equal(archived.activityContributions[1].included, false);
});

test("contract reuses B.1 and A.3 types without Retail physical progress scoring forecasting or earned value", () => {
  const source = readFileSync(new URL("../lib/build/management/plannedPosition.ts", import.meta.url), "utf8");
  assert.match(source, /deriveProgressMeasurement/); assert.match(source, /SchedulePerformance/);
  assert.doesNotMatch(source, /deriveSchedulePerformance\(|new Date\(|Date\.now|projectProgress|progressPercent|target_quantity|physicalProgress|installedProgress|quantityProgress|performance score|project score|owner score|risk score|forecast|predicted finish|earned value|\bPV\b|\bEV\b|\bAC\b|\bSPI\b|\bCPI\b/i);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deriveQualityAdherence } from "../lib/build/management/qualityAdherence.ts";

const projectId = "project-1", clientId = "client-1";
const performance = (state, extra = {}) => ({ state, actualStartedAt: null, actualWorkFinishedAt: null,
  submittedForReviewAt: null, inspectionAcceptedAt: null, startVarianceMs: null, finishVarianceMs: null,
  submissionVarianceMs: null, currentStartDelayMs: null, currentCompletionDelayMs: null, dataQuality: "complete", ...extra });
const activity = (id, workPackageId, status, state, extra = {}) => ({ id, clientId, projectId, workPackageId,
  requiresApproval: status === "approved" || status === "changes_required", status, schedulePerformance: performance(state), ...extra });
const review = (activityId, workPackageId, firstOutcome = "accepted", extra = {}) => { const reviewCycles = extra.reviewCycles ?? 1;
  return { activityId, workPackageId, reviewCycles, firstOutcome, accepted: firstOutcome === "accepted",
    changesRequiredOutcomes: firstOutcome === "changes_required" ? 1 : 0, correctiveCycles: 0,
    measuredReviewCycles: extra.unmeasurableReviewCycles ? reviewCycles - extra.unmeasurableReviewCycles : reviewCycles,
    unmeasurableReviewCycles: 0, medianReviewTurnaroundHours: 2, ...extra }; };
const history = (activityReviews = [], extra = {}) => ({ ok: true, dataQuality: "complete", projectId, clientId,
  periodStart: "2026-01-01T00:00:00Z", periodEnd: "2027-01-01T00:00:00Z", timezone: "UTC", counts: {},
  reviewTurnaround: { reviewCyclesTotal: activityReviews.reduce((sum, item) => sum + item.reviewCycles, 0),
    reviewCyclesMeasured: activityReviews.reduce((sum, item) => sum + item.measuredReviewCycles, 0), reviewCyclesUnmeasurable: 0,
    totalHours: 2, averageHours: 2, medianHours: 2, minHours: 2, maxHours: 2 }, buckets: [], workPackages: [], activityReviews, ...extra });
const packages = [{ id: "wp-1", clientId, projectId, name: "One", sequence: 1 }, { id: "wp-2", clientId, projectId, name: "Two", sequence: 2 }];
const run = (activities = [], reviews = [], extra = {}) => deriveQualityAdherence({ projectId, clientId, activities,
  workPackages: packages, history: history(reviews), context: [], ...extra });

test("B.5 empty scope exposes unavailable ratios rather than fabricated zero or 100%", () => {
  const result = run(); assert.equal(result.ok, true);
  assert.deepEqual(result.schedule.finishAdherence, { numerator: 0, denominator: 0, ratio: null });
  assert.deepEqual(result.quality.firstPassAcceptance, { numerator: 0, denominator: 0, ratio: null });
  assert.equal(result.schedule.scheduleCoverageState, "unavailable"); assert.equal(result.quality.reviewCoverageState, "unavailable");
});

test("B.5 reuses A.3 finish classification including the exact boundary", () => {
  const result = run([activity("early", "wp-1", "completed", "completed_early"),
    activity("exact", "wp-1", "completed", "completed_on_time"), activity("late", "wp-1", "completed", "completed_late")]);
  assert.equal(result.ok, true); assert.deepEqual(result.schedule.finishAdherence, { numerator: 2, denominator: 3, ratio: 2 / 3 });
  assert.equal(result.schedule.completedLate, 1);
});

test("B.5 schedule denominator excludes missing, invalid, unscheduled and unfinished records with coverage", () => {
  const result = run([activity("ok", "wp-1", "completed", "completed_on_time"),
    activity("unscheduled", "wp-1", "completed", "not_scheduled"),
    activity("invalid", "wp-1", "completed", "schedule_data_incomplete", { schedulePerformance: performance("schedule_data_incomplete", { dataQuality: "incomplete_schedule" }) }),
    activity("missing-finish", "wp-1", "completed", "schedule_data_incomplete", { schedulePerformance: performance("schedule_data_incomplete", { dataQuality: "missing_history" }) }),
    activity("unfinished", "wp-1", "in_progress", "overdue_to_complete")]);
  assert.equal(result.ok, true); assert.equal(result.schedule.eligibleCompletedActivities, 1);
  assert.equal(result.schedule.completedActivitiesExcludedFromAdherence, 3); assert.equal(result.schedule.missingScheduleActivities, 1);
  assert.equal(result.schedule.invalidScheduleActivities, 1); assert.equal(result.schedule.missingActualCompletionActivities, 1);
  assert.deepEqual(result.schedule.scheduleCoverage, { numerator: 1, denominator: 4, ratio: 0.25 });
  assert.equal(result.schedule.scheduleCoverageState, "partial");
});

test("B.5 start adherence uses canonical actual/planned variance without inventing an SLA", () => {
  const activities = [activity("early", "wp-1", "in_progress", "on_schedule", { schedulePerformance: performance("on_schedule", { actualStartedAt: "2026-01-01", startVarianceMs: -1 }) }),
    activity("exact", "wp-1", "in_progress", "on_schedule", { schedulePerformance: performance("on_schedule", { actualStartedAt: "2026-01-01", startVarianceMs: 0 }) }),
    activity("late", "wp-1", "in_progress", "on_schedule", { schedulePerformance: performance("on_schedule", { actualStartedAt: "2026-01-01", startVarianceMs: 1 }) })];
  const result = run(activities); assert.equal(result.ok, true);
  assert.deepEqual(result.schedule.startAdherence, { numerator: 2, denominator: 3, ratio: 2 / 3 });
});

test("B.5 first-pass review facts exclude direct and never-reviewed Activities", () => {
  const activities = [activity("direct", "wp-1", "completed", "completed_on_time", { requiresApproval: false }),
    activity("accepted", "wp-1", "approved", "completed_on_time"), activity("pending", "wp-1", "submitted_for_review", "awaiting_review", { requiresApproval: true })];
  const result = run(activities, [review("accepted", "wp-1")]); assert.equal(result.ok, true);
  assert.equal(result.quality.approvalActivitiesTotal, 2); assert.equal(result.quality.reviewEligibleActivities, 1);
  assert.equal(result.quality.firstPassAcceptedActivities, 1); assert.equal(result.quality.reviewHistoryIncompleteActivities, 1);
  assert.equal(result.quality.reviewCoverageState, "partial");
  assert.deepEqual(result.quality.firstPassAcceptance, { numerator: 1, denominator: 1, ratio: 1 });
});

test("B.5 separates repeated correction outcomes, Activities, cycles and current state", () => {
  const reviews = [review("corrected", "wp-1", "changes_required", { reviewCycles: 3, accepted: true,
    changesRequiredOutcomes: 2, correctiveCycles: 2, measuredReviewCycles: 3 })];
  const result = run([activity("corrected", "wp-1", "approved", "completed_late"),
    activity("current", "wp-1", "changes_required", "overdue_to_complete", { requiresApproval: true })], reviews);
  assert.equal(result.ok, true); assert.equal(result.quality.changesRequiredOutcomes, 2);
  assert.equal(result.quality.activitiesRequiringCorrection, 1); assert.equal(result.quality.correctiveCycles, 2);
  assert.equal(result.quality.currentlyChangesRequiredActivities, 1); assert.equal(result.quality.multipleReviewActivities, 1);
  assert.equal(result.quality.averageReviewCyclesPerReviewedActivity, 3);
});

test("B.5 reuses B.4 review-turnaround aggregates and exposes coverage", () => {
  const reviews = [review("one", "wp-1"), review("two", "wp-1", "changes_required", { measuredReviewCycles: 0, unmeasurableReviewCycles: 1 })];
  const h = history(reviews, { reviewTurnaround: { reviewCyclesTotal: 2, reviewCyclesMeasured: 1, reviewCyclesUnmeasurable: 1,
    totalHours: 7, averageHours: 7, medianHours: 7, minHours: 7, maxHours: 7 } });
  const result = deriveQualityAdherence({ projectId, clientId, activities: [], workPackages: packages, history: h });
  assert.equal(result.ok, true); assert.equal(result.quality.medianReviewTurnaroundHours, 7);
  assert.equal(result.quality.measuredReviewCycles, 1); assert.equal(result.quality.unmeasurableReviewCycles, 1);
});

test("B.5 current overdue context remains separate from completed adherence", () => {
  const result = run([activity("done", "wp-1", "completed", "completed_on_time")], [], { context: [
    { workPackageId: "wp-1", currentOverdueActivities: 5, activeExceptions: 2, managementAttentionObligations: 4 }] });
  assert.equal(result.ok, true); assert.equal(result.schedule.finishAdherence.ratio, 1);
  assert.equal(result.workPackages[0].context.currentOverdueActivities, 5);
});

test("B.5 Project ratios aggregate raw facts rather than averaging mixed-size Work Package ratios", () => {
  const activities = [activity("a1", "wp-1", "approved", "completed_on_time"),
    ...[1,2,3].map((n) => activity(`b${n}`, "wp-2", "approved", n === 1 ? "completed_on_time" : "completed_late"))];
  const reviews = [review("a1", "wp-1"), review("b1", "wp-2"),
    review("b2", "wp-2", "changes_required", { accepted: true, reviewCycles: 2 }),
    review("b3", "wp-2", "changes_required", { accepted: true, reviewCycles: 2 })];
  const result = run(activities, reviews); assert.equal(result.ok, true);
  assert.equal(result.schedule.finishAdherence.ratio, 0.5); assert.equal(result.quality.firstPassAcceptance.ratio, 0.5);
  assert.notEqual(result.schedule.finishAdherence.ratio, (1 + 1 / 3) / 2);
  assert.notEqual(result.quality.firstPassAcceptance.ratio, (1 + 1 / 3) / 2);
});

test("B.5 preserves historical archived review facts while excluding archived current state", () => {
  const result = run([activity("archived", "wp-1", "changes_required", "overdue_to_complete", { archivedAt: "2026-02-01", requiresApproval: true })],
    [review("archived", "archived-wp", "changes_required")]);
  assert.equal(result.ok, true); assert.equal(result.quality.activitiesRequiringCorrection, 1);
  assert.equal(result.quality.currentlyChangesRequiredActivities, 0);
  assert.equal(result.workPackages.find((item) => item.id === "archived-wp").historicalOnly, true);
});

test("B.5 fails closed on duplicate, ancestry, tenant, project, history and context defects", () => {
  const base = activity("a", "wp-1", "completed", "completed_on_time");
  assert.equal(run([base, base]).reason, "duplicate_identifier");
  assert.equal(run([], [], { workPackages: [packages[0], packages[0]] }).reason, "duplicate_identifier");
  assert.equal(run([{ ...base, clientId: "other" }]).reason, "cross_tenant_scope");
  assert.equal(run([{ ...base, projectId: "other" }]).reason, "cross_project_scope");
  assert.equal(run([{ ...base, workPackageId: "missing" }]).reason, "invalid_ancestry");
  assert.equal(run([{ ...base, schedulePerformance: performance("invented") }]).reason, "invalid_schedule_facts");
  assert.equal(run([], [review("a", "wp-1"), review("a", "wp-1")]).reason, "invalid_review_history");
  assert.equal(run([], [review("bad", "wp-1", "accepted", { reviewCycles: 0 })]).reason, "invalid_review_history");
  assert.equal(run([], [], { context: [{ workPackageId: "wp-1", currentOverdueActivities: -1, activeExceptions: 0, managementAttentionObligations: 0 }] }).reason, "invalid_context");
});

test("B.5 is deterministic, pure and composed from accepted engines with safe UI language", async () => {
  const source = [activity("a", "wp-1", "completed", "completed_on_time")]; const before = structuredClone(source);
  assert.deepEqual(run(source), run(source)); assert.deepEqual(source, before);
  const domain = await readFile(new URL("../lib/build/management/qualityAdherence.ts", import.meta.url), "utf8");
  const service = await readFile(new URL("../lib/build/management/service.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/workspace/admin/projects/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(domain, /SchedulePerformance/); assert.match(domain, /ProgressHistoryResult/);
  assert.match(service, /deriveQualityAdherence/); assert.match(page, /Quality &amp; Schedule Adherence/);
  assert.doesNotMatch(`${domain}\n${page}`, /Quality Score|Performance Score|traffic.light|ranking|forecast|Physical Progress|Earned Value|Review SLA|late acceptance|employee performance|improving|declining/i);
});

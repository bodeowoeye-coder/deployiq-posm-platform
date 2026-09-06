import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildUtcHistoryBuckets, deriveProgressHistory } from "../lib/build/management/progressHistory.ts";

const projectId = "project-1", clientId = "client-1";
const start = "2026-09-01T00:00:00.000Z", end = "2026-09-08T00:00:00.000Z";
let sequence = 0;
const event = (id, type, at, activityId = "activity-1", workPackageId = "wp-1", extra = {}) => ({ id, clientId, projectId,
  siteId: "site-1", workPackageId, workPlanId: `plan-${workPackageId}`, activityId, event_type: type, occurred_at: at,
  event_sequence: ++sequence, ...extra });
const inspection = (id, outcome, at, activityId = "activity-1", workPackageId = "wp-1", extra = {}) => ({ id, clientId,
  projectId, siteId: "site-1", workPackageId, workPlanId: `plan-${workPackageId}`, activityId, outcome, reviewedAt: at, ...extra });
const run = (events = [], inspections = [], extra = {}) => deriveProgressHistory({ projectId, clientId, periodStart: start, periodEnd: end,
  timezone: "UTC", buckets: buildUtcHistoryBuckets(new Date(start), new Date(end), "daily"), events, inspections,
  workPackages: [{ id: "wp-1", name: "First", sequence: 1 }, { id: "wp-2", name: "Second", sequence: 2 }], ...extra });

test.beforeEach(() => { sequence = 0; });

test("B.4 empty history retains continuous zero buckets and unavailable turnaround", () => {
  const result = run();
  assert.equal(result.ok, true); assert.equal(result.buckets.length, 7);
  assert.deepEqual(result.counts, { activitiesStarted: 0, operationalCompletions: 0, acceptedActivities: 0, submissions: 0,
    initialSubmissions: 0, resubmissions: 0, changesRequiredOutcomes: 0, activitiesRequiringChanges: 0,
    correctiveWorkResumptions: 0, correctiveCycles: 0, activitiesWithCorrectiveCycles: 0, blockedEvents: 0,
    activitiesBlocked: 0, resumedEvents: 0 });
  assert.deepEqual(result.reviewTurnaround, { reviewCyclesTotal: 0, reviewCyclesMeasured: 0, reviewCyclesUnmeasurable: 0,
    totalHours: null, averageHours: null, medianHours: null, minHours: null, maxHours: null });
});

test("B.4 enforces valid half-open periods and explicit contiguous UTC bucket boundaries", () => {
  assert.equal(run([], [], { periodEnd: start }).reason, "invalid_period");
  assert.equal(run([], [], { periodStart: "bad" }).reason, "invalid_period");
  assert.equal(run([], [], { timezone: "" }).reason, "invalid_period");
  assert.equal(run([], [], { buckets: [{ bucketStart: start, bucketEnd: "2026-09-02T00:00:00.000Z", label: "one" }] }).reason, "invalid_buckets");
  assert.equal(buildUtcHistoryBuckets(new Date(start), new Date(end), "weekly").length, 1);
});

test("B.4 includes period start and excludes period end, before-period and future events", () => {
  const result = run([event("before", "started", "2026-08-31T23:59:59.999Z", "a"), event("start", "started", start, "b"),
    event("inside", "blocked", "2026-09-07T23:59:59.999Z", "b"), event("end", "resumed", end, "b"),
    event("future", "started", "2026-09-09T00:00:00.000Z", "c")]);
  assert.equal(result.ok, true); assert.equal(result.counts.activitiesStarted, 1); assert.equal(result.counts.blockedEvents, 1);
  assert.equal(result.counts.resumedEvents, 0); assert.equal(result.buckets.reduce((sum, bucket) => sum + bucket.activitiesStarted, 0), 1);
});

test("B.4 counts direct completion once and keeps started blocked resumed facts distinct", () => {
  const result = run([event("start", "started", "2026-09-01T01:00:00Z"), event("block-1", "blocked", "2026-09-01T02:00:00Z"),
    event("resume", "resumed", "2026-09-01T03:00:00Z"), event("block-2", "blocked", "2026-09-01T04:00:00Z"),
    event("complete", "completed", "2026-09-01T05:00:00Z")]);
  assert.equal(result.ok, true); assert.equal(result.counts.operationalCompletions, 1); assert.equal(result.counts.acceptedActivities, 0);
  assert.equal(result.counts.blockedEvents, 2); assert.equal(result.counts.activitiesBlocked, 1); assert.equal(result.counts.resumedEvents, 1);
});

test("B.4 approval history counts attempts but only the accepted resubmission as operational completion", () => {
  const events = [event("submit-1", "submitted_for_review", "2026-09-02T08:00:00Z"),
    event("changes", "changes_required", "2026-09-02T10:00:00Z"),
    event("correct", "corrective_work_resumed", "2026-09-02T11:00:00Z"),
    event("submit-2", "submitted_for_review", "2026-09-03T08:00:00Z"),
    event("accept", "inspection_accepted", "2026-09-03T12:00:00Z")];
  const inspections = [inspection("inspect-1", "changes_required", "2026-09-02T10:00:00Z"), inspection("inspect-2", "accepted", "2026-09-03T12:00:00Z")];
  const result = run(events, inspections);
  assert.equal(result.ok, true); assert.equal(result.counts.submissions, 2); assert.equal(result.counts.initialSubmissions, 1);
  assert.equal(result.counts.resubmissions, 1); assert.equal(result.counts.operationalCompletions, 1); assert.equal(result.counts.acceptedActivities, 1);
  assert.equal(result.counts.changesRequiredOutcomes, 1); assert.equal(result.counts.activitiesRequiringChanges, 1);
  assert.equal(result.counts.correctiveWorkResumptions, 1); assert.equal(result.counts.correctiveCycles, 1);
});

test("B.4 preserves repeated outcomes as events and distinct affected Activity counts", () => {
  const events = [event("s1", "submitted_for_review", "2026-09-02T08:00:00Z", "a"), event("c1", "changes_required", "2026-09-02T09:00:00Z", "a"),
    event("r1", "corrective_work_resumed", "2026-09-02T10:00:00Z", "a"), event("s2", "submitted_for_review", "2026-09-02T11:00:00Z", "a"),
    event("c2", "changes_required", "2026-09-02T12:00:00Z", "a")];
  const inspections = [inspection("i1", "changes_required", "2026-09-02T09:00:00Z", "a"), inspection("i2", "changes_required", "2026-09-02T12:00:00Z", "a")];
  const result = run(events, inspections); assert.equal(result.ok, true);
  assert.equal(result.counts.changesRequiredOutcomes, 2); assert.equal(result.counts.activitiesRequiringChanges, 1);
  assert.equal(result.counts.correctiveCycles, 1);
});

test("B.4 derives precise review turnaround statistics and coverage", () => {
  const events = [], inspections = [];
  for (const [index, hours] of [1, 3, 5, 9].entries()) {
    const activityId = `a-${index}`, submitted = `2026-09-0${index + 2}T08:00:00Z`, accepted = new Date(Date.parse(submitted) + hours * 3_600_000).toISOString();
    events.push(event(`s-${index}`, "submitted_for_review", submitted, activityId), event(`a-${index}`, "inspection_accepted", accepted, activityId));
    inspections.push(inspection(`i-${index}`, "accepted", accepted, activityId));
  }
  const result = run(events, inspections); assert.equal(result.ok, true);
  assert.deepEqual(result.reviewTurnaround, { reviewCyclesTotal: 4, reviewCyclesMeasured: 4, reviewCyclesUnmeasurable: 0,
    totalHours: 18, averageHours: 4.5, medianHours: 4, minHours: 1, maxHours: 9 });
});

test("B.4 surfaces an unmeasurable rejected review as partial without fabricating zero turnaround", () => {
  const result = run([event("change", "changes_required", "2026-09-02T10:00:00Z")],
    [inspection("inspect", "changes_required", "2026-09-02T10:00:00Z")]);
  assert.equal(result.ok, true); assert.equal(result.dataQuality, "partial"); assert.equal(result.reviewTurnaround.reviewCyclesUnmeasurable, 1);
  assert.equal(result.reviewTurnaround.averageHours, null);
});

test("B.4 rolls raw facts into stable Work Packages without ranking or averaging", () => {
  const result = run([event("complete-2", "completed", "2026-09-02T10:00:00Z", "a2", "wp-2"),
    event("complete-1", "completed", "2026-09-02T11:00:00Z", "a1", "wp-1")]);
  assert.equal(result.ok, true); assert.deepEqual(result.workPackages.map((item) => item.name), ["First", "Second"]);
  assert.equal(result.workPackages.reduce((sum, item) => sum + item.operationalCompletions, 0), result.counts.operationalCompletions);
});

test("B.4 retains authoritative archived-history ancestry and labels unavailable definitions safely", () => {
  const result = run([event("historic", "completed", "2026-09-02T10:00:00Z", "archived-activity", "archived-wp")]);
  assert.equal(result.ok, true); assert.equal(result.counts.operationalCompletions, 1);
  assert.equal(result.workPackages[0].name, "Archived Work Package");
});

test("B.4 fails closed for malformed, duplicate, cross-scope and ambiguous history", () => {
  assert.equal(run([event("bad", "started", "bad")]).reason, "invalid_event");
  assert.equal(run([event("one", "started", start, "activity-1", "wp-1", { event_sequence: 7 }), event("two", "blocked", start, "activity-2", "wp-1", { event_sequence: 7 })]).reason, "invalid_event_sequence");
  assert.equal(run([event("first", "started", "2026-09-03T00:00:00Z", "activity-1", "wp-1", { event_sequence: 1 }),
    event("second", "blocked", "2026-09-02T00:00:00Z", "activity-1", "wp-1", { event_sequence: 2 })]).reason, "impossible_event_order");
  assert.equal(run([event("tenant", "started", start, "a", "wp-1", { clientId: "other" })]).reason, "cross_tenant_history");
  assert.equal(run([event("project", "started", start, "a", "wp-1", { projectId: "other" })]).reason, "cross_project_history");
  assert.equal(run([event("one", "started", start), event("two", "blocked", "2026-09-02T00:00:00Z", "activity-1", "wp-2")]).reason, "invalid_historical_ancestry");
  assert.equal(run([event("complete-1", "completed", "2026-09-02T01:00:00Z"), event("complete-2", "completed", "2026-09-02T02:00:00Z")]).reason, "ambiguous_operational_completion");
  assert.equal(run([event("accept", "inspection_accepted", "2026-09-02T02:00:00Z")], [inspection("i", "accepted", "2026-09-02T02:00:00Z")]).reason, "acceptance_without_valid_submission");
  assert.equal(run([event("orphan-resume", "corrective_work_resumed", "2026-09-02T02:00:00Z")]).reason, "ambiguous_corrective_cycle");
});

test("B.4 is deterministic, pure, helper-based, snapshot-free and safely presented", async () => {
  const source = { events: [event("done", "completed", "2026-09-02T02:00:00Z")], inspections: [] };
  const before = structuredClone(source); assert.deepEqual(run(source.events, source.inspections), run(source.events, source.inspections)); assert.deepEqual(source, before);
  const domain = await readFile(new URL("../lib/build/management/progressHistory.ts", import.meta.url), "utf8");
  const service = await readFile(new URL("../lib/build/management/service.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/workspace/admin/projects/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(domain, /deriveSuccessfulReviewFinish/); assert.doesNotMatch(domain, /new Date\(\)|snapshot|forecast|velocity score|earned value|employee/i);
  assert.match(service, /buildUtcHistoryBuckets/); assert.match(page, /Recent Execution/); assert.match(page, /Last 7 Days · UTC/);
  assert.doesNotMatch(page, /improving|declining|Performance Trend|Physical Progress|Forecast Completion|SPI|CPI|Earned Value/);
});

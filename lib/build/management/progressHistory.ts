import { deriveSuccessfulReviewFinish, type ScheduleHistoryEvent } from "./schedulePerformance.ts";

export type HistoricalEvent = ScheduleHistoryEvent & {
  id: string; clientId: string; projectId: string; siteId: string; workPackageId: string; workPlanId: string; activityId: string;
};
export type HistoricalInspection = {
  id: string; clientId: string; projectId: string; siteId: string; workPackageId: string; workPlanId: string; activityId: string;
  outcome: "accepted" | "changes_required"; reviewedAt: string;
};
export type HistoryBucketBoundary = { bucketStart: string; bucketEnd: string; label: string };
export type HistoricalWorkPackage = { id: string; name: string; sequence?: number | null };

type HistoryCounts = {
  activitiesStarted: number; operationalCompletions: number; acceptedActivities: number;
  submissions: number; initialSubmissions: number; resubmissions: number;
  changesRequiredOutcomes: number; activitiesRequiringChanges: number; correctiveWorkResumptions: number;
  correctiveCycles: number; activitiesWithCorrectiveCycles: number; blockedEvents: number; activitiesBlocked: number; resumedEvents: number;
};
export type ProgressHistoryResult = { ok: false; dataQuality: "invalid"; reason: string; recordId: string | null } | {
  ok: true; dataQuality: "complete" | "partial"; projectId: string; clientId: string; periodStart: string; periodEnd: string;
  timezone: string; counts: HistoryCounts;
  reviewTurnaround: { reviewCyclesTotal: number; reviewCyclesMeasured: number; reviewCyclesUnmeasurable: number;
    totalHours: number | null; averageHours: number | null; medianHours: number | null; minHours: number | null; maxHours: number | null };
  activityReviews: Array<{ activityId: string; workPackageId: string; reviewCycles: number; firstOutcome: "accepted" | "changes_required";
    accepted: boolean; changesRequiredOutcomes: number; correctiveCycles: number; measuredReviewCycles: number;
    unmeasurableReviewCycles: number; medianReviewTurnaroundHours: number | null }>;
  buckets: Array<HistoryBucketBoundary & HistoryCounts>;
  workPackages: Array<{ id: string; name: string; operationalCompletions: number; acceptedActivities: number;
    submissions: number; changesRequiredOutcomes: number; reviewCyclesMeasured: number; medianReviewTurnaroundHours: number | null }>;
};

const supported = new Set(["responsibility_assigned", "started", "completed", "blocked", "resumed", "checklist_passed",
  "checklist_failed", "checklist_not_applicable", "evidence_added", "submitted_for_review", "inspection_accepted",
  "changes_required", "corrective_work_resumed", "exception_created", "exception_remediation_started", "exception_resolved", "exception_verified"]);
const instant = (value: string) => { const result = Date.parse(value); return Number.isFinite(result) ? result : null; };
const inPeriod = (value: number, start: number, end: number) => value >= start && value < end;
const emptyCounts = (): HistoryCounts => ({ activitiesStarted: 0, operationalCompletions: 0, acceptedActivities: 0,
  submissions: 0, initialSubmissions: 0, resubmissions: 0, changesRequiredOutcomes: 0, activitiesRequiringChanges: 0,
  correctiveWorkResumptions: 0, correctiveCycles: 0, activitiesWithCorrectiveCycles: 0, blockedEvents: 0, activitiesBlocked: 0, resumedEvents: 0 });
const median = (values: number[]) => values.length === 0 ? null : values.length % 2 ? values[(values.length - 1) / 2]
  : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
const roundHours = (milliseconds: number) => Math.round(milliseconds / 36) / 100_000;

function ordered(events: HistoricalEvent[]) {
  return [...events].sort((left, right) => instant(left.occurred_at)! - instant(right.occurred_at)!
    || (left.event_sequence ?? Number.MAX_SAFE_INTEGER) - (right.event_sequence ?? Number.MAX_SAFE_INTEGER)
    || left.id.localeCompare(right.id));
}

export function buildUtcHistoryBuckets(periodStart: Date, periodEnd: Date, cadence: "daily" | "weekly"): HistoryBucketBoundary[] {
  if (!(periodStart instanceof Date) || !(periodEnd instanceof Date) || !Number.isFinite(periodStart.getTime()) ||
    !Number.isFinite(periodEnd.getTime()) || periodEnd <= periodStart) return [];
  const step = cadence === "daily" ? 86_400_000 : 7 * 86_400_000;
  const result: HistoryBucketBoundary[] = [];
  for (let start = periodStart.getTime(); start < periodEnd.getTime(); start += step) {
    const end = Math.min(start + step, periodEnd.getTime());
    result.push({ bucketStart: new Date(start).toISOString(), bucketEnd: new Date(end).toISOString(),
      label: new Date(start).toISOString().slice(0, 10) });
  }
  return result;
}

export function deriveProgressHistory(input: { projectId: string; clientId: string; periodStart: string; periodEnd: string;
  timezone: string; buckets: ReadonlyArray<HistoryBucketBoundary>; events: ReadonlyArray<HistoricalEvent>;
  inspections: ReadonlyArray<HistoricalInspection>; workPackages?: ReadonlyArray<HistoricalWorkPackage> }): ProgressHistoryResult {
  const invalid = (reason: string, recordId: string | null = null): ProgressHistoryResult => ({ ok: false, dataQuality: "invalid", reason, recordId });
  const start = instant(input.periodStart), end = instant(input.periodEnd);
  if (!input.projectId || !input.clientId || !input.timezone || start === null || end === null || end <= start) return invalid("invalid_period");
  let cursor = start;
  for (const bucket of input.buckets) {
    const bucketStart = instant(bucket.bucketStart), bucketEnd = instant(bucket.bucketEnd);
    if (!bucket.label || bucketStart === null || bucketEnd === null || bucketStart !== cursor || bucketEnd <= bucketStart || bucketEnd > end) return invalid("invalid_buckets");
    cursor = bucketEnd;
  }
  if (input.buckets.length && cursor !== end) return invalid("invalid_buckets");
  const ids = new Set<string>(), sequences = new Set<number>();
  const ancestryByActivity = new Map<string, string>();
  for (const row of [...input.events, ...input.inspections]) {
    if (!row.id || ids.has(row.id)) return invalid("duplicate_identifier", row.id || null); ids.add(row.id);
    if (row.clientId !== input.clientId) return invalid("cross_tenant_history", row.id);
    if (row.projectId !== input.projectId) return invalid("cross_project_history", row.id);
    const ancestry = `${row.siteId}:${row.workPackageId}:${row.workPlanId}`;
    if (!row.siteId || !row.workPackageId || !row.workPlanId || !row.activityId || (ancestryByActivity.has(row.activityId) && ancestryByActivity.get(row.activityId) !== ancestry)) return invalid("invalid_historical_ancestry", row.id);
    ancestryByActivity.set(row.activityId, ancestry);
  }
  for (const event of input.events) {
    if (!supported.has(event.event_type) || instant(event.occurred_at) === null) return invalid("invalid_event", event.id);
    if (event.event_sequence !== null && (!Number.isInteger(event.event_sequence) || event.event_sequence < 1 || sequences.has(event.event_sequence))) return invalid("invalid_event_sequence", event.id);
    if (event.event_sequence !== null) sequences.add(event.event_sequence);
  }
  for (const activityId of new Set(input.events.map((event) => event.activityId))) {
    const sequenced = input.events.filter((event) => event.activityId === activityId && event.event_sequence !== null)
      .sort((left, right) => left.event_sequence! - right.event_sequence!);
    for (let index = 1; index < sequenced.length; index += 1) {
      if (instant(sequenced[index].occurred_at)! < instant(sequenced[index - 1].occurred_at)!) {
        return invalid("impossible_event_order", sequenced[index].id);
      }
    }
  }
  for (const inspection of input.inspections) if (!new Set(["accepted", "changes_required"]).has(inspection.outcome) || instant(inspection.reviewedAt) === null) return invalid("invalid_inspection", inspection.id);
  for (const event of input.events.filter((item) => item.event_type === "inspection_accepted" || item.event_type === "changes_required")) {
    const outcome = event.event_type === "inspection_accepted" ? "accepted" : "changes_required";
    if (!input.inspections.some((inspection) => inspection.activityId === event.activityId && inspection.outcome === outcome && instant(inspection.reviewedAt) === instant(event.occurred_at))) return invalid("inspection_event_mismatch", event.id);
  }
  for (const inspection of input.inspections) {
    const eventType = inspection.outcome === "accepted" ? "inspection_accepted" : "changes_required";
    const matches = input.events.filter((event) => event.activityId === inspection.activityId && event.event_type === eventType &&
      instant(event.occurred_at) === instant(inspection.reviewedAt));
    if (matches.length !== 1) return invalid("inspection_event_mismatch", inspection.id);
  }

  const boundaryEvents = input.events.filter((event) => instant(event.occurred_at)! < end);
  const boundaryInspections = input.inspections.filter((inspection) => instant(inspection.reviewedAt)! < end);
  const activityIds = [...new Set([...boundaryEvents.map((event) => event.activityId), ...boundaryInspections.map((inspection) => inspection.activityId)])];
  const operationalMilestones: Array<{ activityId: string; workPackageId: string; at: number }> = [];
  const reviewDurations: Array<{ activityId: string; workPackageId: string; inspectionId: string; hours: number | null; at: number }> = [];
  const correctiveCycles: Array<{ activityId: string; workPackageId: string; at: number }> = [];
  let partial = false;

  for (const activityId of activityIds) {
    const events = ordered(boundaryEvents.filter((event) => event.activityId === activityId));
    const inspections = [...boundaryInspections.filter((inspection) => inspection.activityId === activityId)]
      .sort((left, right) => instant(left.reviewedAt)! - instant(right.reviewedAt)! || left.id.localeCompare(right.id));
    const completed = events.filter((event) => event.event_type === "completed");
    if (completed.length > 1 || (completed.length && inspections.length)) return invalid("ambiguous_operational_completion", activityId);
    if (completed.length) operationalMilestones.push({ activityId, workPackageId: completed[0].workPackageId, at: instant(completed[0].occurred_at)! });

    const historyForHelper = events.map((event) => ({ event_type: event.event_type, occurred_at: event.occurred_at, event_sequence: event.event_sequence }));
    const successful = deriveSuccessfulReviewFinish(historyForHelper);
    if (inspections.some((inspection) => inspection.outcome === "accepted")) {
      if (successful.quality !== "complete" || successful.submittedAt === null) return invalid("acceptance_without_valid_submission", activityId);
      const acceptedInspections = inspections.filter((inspection) => inspection.outcome === "accepted");
      if (acceptedInspections.length !== 1) return invalid("duplicate_acceptance", activityId);
      operationalMilestones.push({ activityId, workPackageId: acceptedInspections[0].workPackageId, at: instant(successful.submittedAt)! });
    }

    let previousReviewAt = Number.NEGATIVE_INFINITY;
    for (const inspection of inspections) {
      const reviewedAt = instant(inspection.reviewedAt)!;
      const expectedType = inspection.outcome === "accepted" ? "inspection_accepted" : "changes_required";
      if (!events.some((event) => event.event_type === expectedType && instant(event.occurred_at) === reviewedAt)) return invalid("inspection_event_mismatch", inspection.id);
      const submissions = events.filter((event) => event.event_type === "submitted_for_review" && instant(event.occurred_at)! >= previousReviewAt && instant(event.occurred_at)! <= reviewedAt);
      const submission = submissions.at(-1);
      if (!submission) {
        if (inspection.outcome === "accepted") return invalid("acceptance_without_valid_submission", inspection.id);
        partial = true; reviewDurations.push({ activityId, workPackageId: inspection.workPackageId, inspectionId: inspection.id, hours: null, at: reviewedAt });
      } else reviewDurations.push({ activityId, workPackageId: inspection.workPackageId, inspectionId: inspection.id,
        hours: roundHours(reviewedAt - instant(submission.occurred_at)!), at: reviewedAt });
      previousReviewAt = reviewedAt;
    }

    let correctionPending = false, correctionResumed = false;
    for (const event of events) {
      if (event.event_type === "changes_required") { correctionPending = true; correctionResumed = false; }
      else if (event.event_type === "corrective_work_resumed") {
        if (!correctionPending || correctionResumed) return invalid("ambiguous_corrective_cycle", event.id);
        correctionResumed = true;
      } else if (event.event_type === "submitted_for_review" && correctionPending) {
        if (!correctionResumed) return invalid("ambiguous_corrective_cycle", event.id);
        correctiveCycles.push({ activityId, workPackageId: event.workPackageId, at: instant(event.occurred_at)! });
        correctionPending = false; correctionResumed = false;
      }
    }
  }

  const periodEvents = boundaryEvents.filter((event) => inPeriod(instant(event.occurred_at)!, start, end));
  const periodInspections = boundaryInspections.filter((inspection) => inPeriod(instant(inspection.reviewedAt)!, start, end));
  const submissionOrdinal = new Map<string, number>();
  for (const activityId of activityIds) ordered(boundaryEvents.filter((event) => event.activityId === activityId && event.event_type === "submitted_for_review"))
    .forEach((event, index) => submissionOrdinal.set(event.id, index));
  const countFor = (periodStart: number, periodEnd: number): HistoryCounts => {
    const events = periodEvents.filter((event) => inPeriod(instant(event.occurred_at)!, periodStart, periodEnd));
    const inspections = periodInspections.filter((inspection) => inPeriod(instant(inspection.reviewedAt)!, periodStart, periodEnd));
    const submissions = events.filter((event) => event.event_type === "submitted_for_review");
    const initial = submissions.filter((event) => submissionOrdinal.get(event.id) === 0);
    const changes = inspections.filter((inspection) => inspection.outcome === "changes_required");
    const blocks = events.filter((event) => event.event_type === "blocked");
    const cycles = correctiveCycles.filter((cycle) => inPeriod(cycle.at, periodStart, periodEnd));
    return { activitiesStarted: new Set(events.filter((event) => event.event_type === "started").map((event) => event.activityId)).size,
      operationalCompletions: operationalMilestones.filter((event) => inPeriod(event.at, periodStart, periodEnd)).length,
      acceptedActivities: new Set(inspections.filter((inspection) => inspection.outcome === "accepted").map((inspection) => inspection.activityId)).size,
      submissions: submissions.length, initialSubmissions: initial.length, resubmissions: submissions.length - initial.length,
      changesRequiredOutcomes: changes.length, activitiesRequiringChanges: new Set(changes.map((inspection) => inspection.activityId)).size,
      correctiveWorkResumptions: events.filter((event) => event.event_type === "corrective_work_resumed").length,
      correctiveCycles: cycles.length, activitiesWithCorrectiveCycles: new Set(cycles.map((cycle) => cycle.activityId)).size,
      blockedEvents: blocks.length, activitiesBlocked: new Set(blocks.map((event) => event.activityId)).size,
      resumedEvents: events.filter((event) => event.event_type === "resumed").length };
  };
  const measuredReviews = reviewDurations.filter((review) => review.hours !== null && inPeriod(review.at, start, end));
  const periodReviews = reviewDurations.filter((review) => inPeriod(review.at, start, end));
  const hours = measuredReviews.map((review) => review.hours!).sort((a, b) => a - b);
  const workPackageNames = new Map((input.workPackages ?? []).map((item) => [item.id, item]));
  const periodWorkPackageIds = [...new Set([...periodEvents.map((event) => event.workPackageId), ...periodInspections.map((inspection) => inspection.workPackageId)])];
  const workPackages = periodWorkPackageIds.map((id) => {
    const definition = workPackageNames.get(id), milestones = operationalMilestones.filter((item) => item.workPackageId === id && inPeriod(item.at, start, end));
    const reviews = measuredReviews.filter((item) => item.workPackageId === id).map((item) => item.hours!).sort((a, b) => a - b);
    return { id, name: definition?.name ?? "Archived Work Package", sequence: definition?.sequence ?? null,
      operationalCompletions: milestones.length, acceptedActivities: new Set(periodInspections.filter((item) => item.workPackageId === id && item.outcome === "accepted").map((item) => item.activityId)).size,
      submissions: periodEvents.filter((item) => item.workPackageId === id && item.event_type === "submitted_for_review").length,
      changesRequiredOutcomes: periodInspections.filter((item) => item.workPackageId === id && item.outcome === "changes_required").length,
      reviewCyclesMeasured: reviews.length, medianReviewTurnaroundHours: median(reviews) };
  }).sort((left, right) => (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  const activityReviews = activityIds.flatMap((activityId) => {
    const inspections = [...boundaryInspections.filter((item) => item.activityId === activityId)]
      .sort((left, right) => instant(left.reviewedAt)! - instant(right.reviewedAt)! || left.id.localeCompare(right.id));
    if (inspections.length === 0) return [];
    const orderedReviewEvents = ordered(boundaryEvents.filter((item) => item.activityId === activityId &&
      (item.event_type === "inspection_accepted" || item.event_type === "changes_required")));
    const reviews = reviewDurations.filter((item) => item.activityId === activityId);
    const measured = reviews.flatMap((item) => item.hours === null ? [] : [item.hours]).sort((a, b) => a - b);
    return [{ activityId, workPackageId: inspections[0].workPackageId, reviewCycles: inspections.length,
      firstOutcome: orderedReviewEvents[0].event_type === "inspection_accepted" ? "accepted" as const : "changes_required" as const,
      accepted: inspections.some((item) => item.outcome === "accepted"),
      changesRequiredOutcomes: inspections.filter((item) => item.outcome === "changes_required").length,
      correctiveCycles: correctiveCycles.filter((item) => item.activityId === activityId).length,
      measuredReviewCycles: measured.length, unmeasurableReviewCycles: reviews.length - measured.length,
      medianReviewTurnaroundHours: median(measured) }];
  }).sort((left, right) => left.workPackageId.localeCompare(right.workPackageId) || left.activityId.localeCompare(right.activityId));
  return { ok: true, dataQuality: partial ? "partial" : "complete", projectId: input.projectId, clientId: input.clientId,
    periodStart: input.periodStart, periodEnd: input.periodEnd, timezone: input.timezone, counts: countFor(start, end),
    reviewTurnaround: { reviewCyclesTotal: periodReviews.length, reviewCyclesMeasured: measuredReviews.length,
      reviewCyclesUnmeasurable: periodReviews.length - measuredReviews.length, totalHours: hours.length ? hours.reduce((sum, value) => sum + value, 0) : null,
      averageHours: hours.length ? hours.reduce((sum, value) => sum + value, 0) / hours.length : null, medianHours: median(hours),
      minHours: hours.at(0) ?? null, maxHours: hours.at(-1) ?? null },
    buckets: input.buckets.map((bucket) => ({ ...bucket, ...countFor(instant(bucket.bucketStart)!, instant(bucket.bucketEnd)!) })),
    workPackages, activityReviews };
}

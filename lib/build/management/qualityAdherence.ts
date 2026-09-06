import type { ProgressHistoryResult } from "./progressHistory.ts";
import type { SchedulePerformance } from "./schedulePerformance.ts";

export type QualityAdherenceActivity = {
  id: string; clientId: string; projectId: string; workPackageId: string;
  requiresApproval: boolean; status: string; active?: boolean; archivedAt?: string | null;
  schedulePerformance: SchedulePerformance;
};
export type QualityAdherenceWorkPackage = { id: string; clientId: string; projectId: string; name: string; sequence?: number | null };
export type QualityAdherenceContext = { workPackageId: string; currentOverdueActivities: number; activeExceptions: number; managementAttentionObligations: number };

type Ratio = { numerator: number; denominator: number; ratio: number | null };
type ScheduleFacts = {
  completedActivities: number; eligibleCompletedActivities: number; completedOnOrBeforePlan: number; completedLate: number;
  completedActivitiesExcludedFromAdherence: number; missingScheduleActivities: number; invalidScheduleActivities: number;
  missingActualCompletionActivities: number; finishAdherence: Ratio; eligibleStartedActivities: number;
  startedOnOrBeforePlan: number; startedLate: number; startAdherence: Ratio; scheduleCoverage: Ratio;
  scheduleCoverageState: "complete" | "partial" | "unavailable";
};
type QualityFacts = {
  approvalActivitiesTotal: number; approvalActivitiesReviewed: number; reviewEligibleActivities: number;
  reviewHistoryIncompleteActivities: number; reviewCoverage: Ratio; firstPassAcceptedActivities: number;
  activitiesRequiringCorrection: number; currentlyChangesRequiredActivities: number; changesRequiredOutcomes: number;
  correctiveCycles: number; activitiesWithCorrectiveCycles: number; firstPassAcceptance: Ratio;
  totalCompletedReviewCycles: number; singleReviewAcceptedActivities: number; multipleReviewActivities: number;
  averageReviewCyclesPerReviewedActivity: number | null; measuredReviewCycles: number; unmeasurableReviewCycles: number;
  averageReviewTurnaroundHours: number | null; medianReviewTurnaroundHours: number | null;
  reviewCoverageState: "complete" | "partial" | "unavailable";
};
export type QualityAdherenceResult = { ok: false; reason: string; recordId: string | null } | {
  ok: true; projectId: string; clientId: string; schedule: ScheduleFacts; quality: QualityFacts;
  workPackages: Array<{ id: string; name: string; schedule: ScheduleFacts; quality: QualityFacts;
    context: QualityAdherenceContext; historicalOnly: boolean }>;
};

const ratio = (numerator: number, denominator: number): Ratio => ({ numerator, denominator, ratio: denominator === 0 ? null : numerator / denominator });
const isActive = (row: QualityAdherenceActivity) => row.active !== false && !row.archivedAt;
const emptyContext = (workPackageId: string): QualityAdherenceContext => ({ workPackageId, currentOverdueActivities: 0,
  activeExceptions: 0, managementAttentionObligations: 0 });
const scheduleStates = new Set(["not_scheduled", "schedule_data_incomplete", "not_yet_due", "on_schedule", "overdue_to_start",
  "overdue_to_complete", "completed_early", "completed_on_time", "completed_late", "awaiting_review"]);
const executionStates = new Set(["not_started", "in_progress", "completed", "blocked", "submitted_for_review", "changes_required", "approved"]);

function scheduleFacts(activities: ReadonlyArray<QualityAdherenceActivity>): ScheduleFacts {
  const completed = activities.filter((item) => item.status === "completed" || item.status === "approved");
  const eligible = completed.filter((item) => ["completed_early", "completed_on_time", "completed_late"].includes(item.schedulePerformance.state));
  const onOrBefore = eligible.filter((item) => item.schedulePerformance.state === "completed_early" || item.schedulePerformance.state === "completed_on_time").length;
  const late = eligible.filter((item) => item.schedulePerformance.state === "completed_late").length;
  const missingSchedule = completed.filter((item) => item.schedulePerformance.state === "not_scheduled").length;
  const invalidSchedule = completed.filter((item) => item.schedulePerformance.state === "schedule_data_incomplete" &&
    item.schedulePerformance.dataQuality !== "missing_history").length;
  const missingActual = completed.filter((item) => item.schedulePerformance.state === "schedule_data_incomplete" &&
    item.schedulePerformance.dataQuality === "missing_history").length;
  const started = activities.filter((item) => item.schedulePerformance.actualStartedAt !== null &&
    item.schedulePerformance.startVarianceMs !== null && item.schedulePerformance.dataQuality !== "incomplete_schedule");
  const startedOnTime = started.filter((item) => item.schedulePerformance.startVarianceMs! <= 0).length;
  return { completedActivities: completed.length, eligibleCompletedActivities: eligible.length, completedOnOrBeforePlan: onOrBefore,
    completedLate: late, completedActivitiesExcludedFromAdherence: completed.length - eligible.length,
    missingScheduleActivities: missingSchedule, invalidScheduleActivities: invalidSchedule,
    missingActualCompletionActivities: missingActual, finishAdherence: ratio(onOrBefore, eligible.length),
    eligibleStartedActivities: started.length, startedOnOrBeforePlan: startedOnTime, startedLate: started.length - startedOnTime,
    startAdherence: ratio(startedOnTime, started.length), scheduleCoverage: ratio(eligible.length, completed.length),
    scheduleCoverageState: completed.length === 0 ? "unavailable" : eligible.length === completed.length ? "complete" : "partial" };
}

function qualityFacts(activities: ReadonlyArray<QualityAdherenceActivity>, reviews: Extract<ProgressHistoryResult, { ok: true }>["activityReviews"],
  turnaround?: Extract<ProgressHistoryResult, { ok: true }>["reviewTurnaround"]): QualityFacts {
  const activeApproval = activities.filter((item) => item.requiresApproval);
  const activeApprovalIds = new Set(activeApproval.map((item) => item.id));
  const reviewedIds = new Set(reviews.map((item) => item.activityId));
  const approvalTotal = new Set([...activeApprovalIds, ...reviewedIds]).size;
  const firstPass = reviews.filter((item) => item.firstOutcome === "accepted").length;
  const correction = reviews.filter((item) => item.changesRequiredOutcomes > 0).length;
  const cycles = reviews.reduce((sum, item) => sum + item.reviewCycles, 0);
  const measured = reviews.reduce((sum, item) => sum + item.measuredReviewCycles, 0);
  const unmeasured = reviews.reduce((sum, item) => sum + item.unmeasurableReviewCycles, 0);
  return { approvalActivitiesTotal: approvalTotal, approvalActivitiesReviewed: reviews.length, reviewEligibleActivities: reviews.length,
    reviewHistoryIncompleteActivities: activeApproval.filter((item) => !reviewedIds.has(item.id)).length,
    reviewCoverage: ratio(reviews.length, approvalTotal), firstPassAcceptedActivities: firstPass,
    activitiesRequiringCorrection: correction, currentlyChangesRequiredActivities: activities.filter((item) => item.status === "changes_required").length,
    changesRequiredOutcomes: reviews.reduce((sum, item) => sum + item.changesRequiredOutcomes, 0),
    correctiveCycles: reviews.reduce((sum, item) => sum + item.correctiveCycles, 0),
    activitiesWithCorrectiveCycles: reviews.filter((item) => item.correctiveCycles > 0).length,
    firstPassAcceptance: ratio(firstPass, reviews.length), totalCompletedReviewCycles: cycles,
    singleReviewAcceptedActivities: reviews.filter((item) => item.reviewCycles === 1 && item.accepted).length,
    multipleReviewActivities: reviews.filter((item) => item.reviewCycles > 1).length,
    averageReviewCyclesPerReviewedActivity: reviews.length ? cycles / reviews.length : null,
    measuredReviewCycles: measured, unmeasurableReviewCycles: unmeasured,
    averageReviewTurnaroundHours: turnaround?.averageHours ?? null,
    medianReviewTurnaroundHours: turnaround?.medianHours ?? null,
    reviewCoverageState: approvalTotal === 0 ? "unavailable" : reviews.length === approvalTotal ? "complete" : "partial" };
}

export function deriveQualityAdherence(input: { projectId: string; clientId: string;
  activities: ReadonlyArray<QualityAdherenceActivity>; workPackages: ReadonlyArray<QualityAdherenceWorkPackage>;
  history: Extract<ProgressHistoryResult, { ok: true }>; context?: ReadonlyArray<QualityAdherenceContext> }): QualityAdherenceResult {
  const invalid = (reason: string, recordId: string | null = null): QualityAdherenceResult => ({ ok: false, reason, recordId });
  if (!input.projectId || !input.clientId || input.history.projectId !== input.projectId || input.history.clientId !== input.clientId) return invalid("invalid_scope");
  for (const rows of [input.activities, input.workPackages]) {
    const seen = new Set<string>();
    for (const row of rows) {
      if (!row.id || seen.has(row.id)) return invalid("duplicate_identifier", row.id || null); seen.add(row.id);
      if (row.clientId !== input.clientId) return invalid("cross_tenant_scope", row.id);
      if (row.projectId !== input.projectId) return invalid("cross_project_scope", row.id);
    }
  }
  const packageById = new Map(input.workPackages.map((item) => [item.id, item]));
  const activeActivities = input.activities.filter(isActive);
  const invalidActivity = activeActivities.find((item) => !packageById.has(item.workPackageId));
  if (invalidActivity) return invalid("invalid_ancestry", invalidActivity.id);
  const malformedActivity = activeActivities.find((item) => !executionStates.has(item.status) ||
    !scheduleStates.has(item.schedulePerformance.state));
  if (malformedActivity) return invalid("invalid_schedule_facts", malformedActivity.id);
  const contexts = new Map<string, QualityAdherenceContext>();
  for (const item of input.context ?? []) {
    if (contexts.has(item.workPackageId) || !packageById.has(item.workPackageId) ||
      ![item.currentOverdueActivities, item.activeExceptions, item.managementAttentionObligations].every((value) => Number.isInteger(value) && value >= 0)) return invalid("invalid_context", item.workPackageId);
    contexts.set(item.workPackageId, item);
  }
  const reviewIds = new Set<string>();
  for (const item of input.history.activityReviews) {
    if (!item.activityId || reviewIds.has(item.activityId)) return invalid("invalid_review_history", item.activityId || null);
    if (!item.workPackageId || !["accepted", "changes_required"].includes(item.firstOutcome) || typeof item.accepted !== "boolean" ||
      ![item.reviewCycles, item.changesRequiredOutcomes, item.correctiveCycles, item.measuredReviewCycles,
        item.unmeasurableReviewCycles].every((value) => Number.isInteger(value) && value >= 0) || item.reviewCycles < 1 ||
      item.measuredReviewCycles + item.unmeasurableReviewCycles !== item.reviewCycles || item.changesRequiredOutcomes > item.reviewCycles ||
      item.correctiveCycles > item.changesRequiredOutcomes) return invalid("invalid_review_history", item.activityId);
    const current = activeActivities.find((activity) => activity.id === item.activityId);
    if (current && current.workPackageId !== item.workPackageId) return invalid("invalid_ancestry", item.activityId);
    reviewIds.add(item.activityId);
  }
  const projectReviews = input.history.activityReviews;
  const historicalPackageIds = projectReviews.map((item) => item.workPackageId).filter((id) => !packageById.has(id));
  const packageDefinitions = [...input.workPackages, ...new Set(historicalPackageIds)].map((item) => typeof item === "string"
    ? { id: item, clientId: input.clientId, projectId: input.projectId, name: "Archived Work Package", sequence: null } : item);
  const workPackages = packageDefinitions.map((wp) => {
    const activities = activeActivities.filter((item) => item.workPackageId === wp.id);
    const reviews = projectReviews.filter((item) => item.workPackageId === wp.id);
    return { id: wp.id, name: wp.name, sequence: wp.sequence ?? null, schedule: scheduleFacts(activities), quality: qualityFacts(activities, reviews),
      context: contexts.get(wp.id) ?? emptyContext(wp.id), historicalOnly: !packageById.has(wp.id) };
  }).sort((left, right) => (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  return { ok: true, projectId: input.projectId, clientId: input.clientId, schedule: scheduleFacts(activeActivities),
    quality: qualityFacts(activeActivities, projectReviews, input.history.reviewTurnaround), workPackages };
}

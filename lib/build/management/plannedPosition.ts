import {
  deriveProgressMeasurement,
  type ProgressMeasurementActivity,
  type ProgressMeasurementContribution,
  type ProgressMeasurementResult,
} from "./progressMeasurement.ts";
import type { SchedulePerformance } from "./schedulePerformance.ts";

export type PlannedPositionActivity = ProgressMeasurementActivity & {
  plannedStartAt: string | null | undefined;
  plannedFinishAt: string | null | undefined;
  schedulePerformance: Pick<SchedulePerformance, "actualStartedAt" | "state" | "dataQuality">;
};

export type ScheduleEligibility = "valid" | "missing" | "invalid" | "excluded";
export type PositionCoverageStatus = "complete" | "partial" | "unavailable";

export type PlannedPositionContribution = {
  activityId: string;
  included: boolean;
  expectedToHaveStarted: boolean | null;
  expectedToHaveFinished: boolean | null;
  actuallyStarted: boolean | null;
  operationallyComplete: boolean | null;
  accepted: boolean | null;
  plannedStartAt: string | null;
  plannedFinishAt: string | null;
  normalizedPlannedDurationHours: number | null;
  durationEligibility: ProgressMeasurementContribution["durationEligibility"];
  startScheduleEligibility: ScheduleEligibility;
  finishScheduleEligibility: ScheduleEligibility;
  schedulePerformanceState: SchedulePerformance["state"] | null;
  schedulePerformanceDataQuality: SchedulePerformance["dataQuality"] | null;
  scheduleIssue: "planned_start_missing" | "planned_finish_missing" | "planned_timestamp_invalid" | "planned_finish_before_start" | "actual_start_invalid" | null;
  plannedDurationExpectedContributionHours: number | null;
  operationalDurationContributionHours: number | null;
  acceptedDurationContributionHours: number | null;
};

export type PlannedPositionResult =
  | {
      ok: false;
      dataQuality: "invalid";
      reason: "as_of_invalid" | "schedule_input_invalid" | "progress_measurement_invalid";
      activityId: string | null;
      progressMeasurement: ProgressMeasurementResult | null;
      activityContributions: PlannedPositionContribution[];
    }
  | {
      ok: true;
      dataQuality: "complete" | "partial" | "invalid";
      asOf: string;
      counts: {
        totalActivities: number;
        operationallyCompletedActivities: number;
        acceptedActivities: number;
      };
      startPosition: {
        scheduledActivities: number;
        activitiesExpectedStarted: number | null;
        activitiesNotYetExpectedStarted: number | null;
        activitiesActuallyStarted: number;
        startShortfallActivities: number | null;
        startAheadActivities: number | null;
      };
      finishPosition: {
        activitiesExpectedFinished: number | null;
        activitiesNotYetExpectedFinished: number | null;
        operationalCompletionShortfallActivities: number | null;
        operationalCompletionAheadActivities: number | null;
        acceptedCompletionShortfallActivities: number | null;
        acceptedCompletionAheadActivities: number | null;
      };
      durationPosition: {
        totalValidPlannedDurationHours: number;
        plannedDurationExpectedCompleteHours: number | null;
        plannedDurationExpectedCompleteRatio: number | null;
        operationalDurationCompletedHours: number;
        operationalDurationCompletionRatio: number | null;
        acceptedDurationCompletedHours: number;
        acceptedDurationCompletionRatio: number | null;
        operationalDurationDifferenceRatio: number | null;
        acceptedDurationDifferenceRatio: number | null;
        operationalDurationShortfallRatio: number | null;
        operationalDurationAheadRatio: number | null;
        acceptedDurationShortfallRatio: number | null;
        acceptedDurationAheadRatio: number | null;
      };
      coverage: {
        totalActivities: number;
        validScheduledActivities: number;
        validStartActivities: number;
        validFinishActivities: number;
        missingPlannedStartActivities: number;
        missingPlannedFinishActivities: number;
        invalidScheduleActivities: number;
        startPosition: { status: PositionCoverageStatus; ratio: number | null };
        finishPosition: { status: PositionCoverageStatus; ratio: number | null };
        durationPosition: { status: PositionCoverageStatus; eligibleActivities: number; ratio: number | null };
        duration: Extract<ProgressMeasurementResult, { ok: true }>["durationCoverage"];
      };
      progressMeasurement: Extract<ProgressMeasurementResult, { ok: true }>;
      activityContributions: PlannedPositionContribution[];
    };

function timestamp(value: string | null | undefined) {
  if (value === null || value === undefined || value === "") return { kind: "missing" as const, value: null };
  if (typeof value !== "string") return { kind: "invalid" as const, value: null };
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? { kind: "valid" as const, value: parsed } : { kind: "invalid" as const, value: null };
}

function coverageStatus(valid: number, total: number): PositionCoverageStatus {
  if (total === 0 || valid === 0) return "unavailable";
  return valid === total ? "complete" : "partial";
}

const delta = (actual: number, expected: number) => ({
  shortfall: Math.max(expected - actual, 0),
  ahead: Math.max(actual - expected, 0),
});

const scheduleStates = new Set<SchedulePerformance["state"]>([
  "not_scheduled", "schedule_data_incomplete", "not_yet_due", "on_schedule", "overdue_to_start",
  "overdue_to_complete", "completed_early", "completed_on_time", "completed_late", "awaiting_review",
]);
const scheduleQualities = new Set<SchedulePerformance["dataQuality"]>([
  "complete", "incomplete_schedule", "ambiguous_history", "missing_history",
]);

/**
 * Compares accepted baseline schedule position with B.1 completion facts.
 * The supplied Activity states/events must already represent authoritative
 * facts at `asOf`; this function never reads the wall clock or reconstructs
 * tenant ancestry. Schedule classification remains owned by A.3.
 */
export function derivePlannedPosition(
  activities: ReadonlyArray<PlannedPositionActivity>,
  asOf: Date,
): PlannedPositionResult {
  const asOfMs = asOf instanceof Date ? asOf.getTime() : Number.NaN;
  if (!Number.isFinite(asOfMs)) {
    return { ok: false, dataQuality: "invalid", reason: "as_of_invalid", activityId: null,
      progressMeasurement: null, activityContributions: [] };
  }
  const malformedSchedule = activities.find((activity) => !activity || typeof activity !== "object" ||
    !activity.schedulePerformance || typeof activity.schedulePerformance !== "object" ||
    !scheduleStates.has(activity.schedulePerformance.state) ||
    !scheduleQualities.has(activity.schedulePerformance.dataQuality) ||
    !(activity.schedulePerformance.actualStartedAt === null || typeof activity.schedulePerformance.actualStartedAt === "string"));
  if (malformedSchedule) {
    return { ok: false, dataQuality: "invalid", reason: "schedule_input_invalid",
      activityId: typeof malformedSchedule.id === "string" ? malformedSchedule.id : null,
      progressMeasurement: null, activityContributions: [] };
  }

  const progress = deriveProgressMeasurement(activities);
  if (!progress.ok) {
    return { ok: false, dataQuality: "invalid", reason: "progress_measurement_invalid",
      activityId: progress.activityId, progressMeasurement: progress, activityContributions: [] };
  }

  const progressById = new Map(progress.contributions.map((item) => [item.activityId, item]));
  const contributions: PlannedPositionContribution[] = [];
  for (const activity of activities) {
    const measured = progressById.get(activity.id)!;
    if (!measured.included) {
      contributions.push({ activityId: activity.id, included: false, expectedToHaveStarted: null, expectedToHaveFinished: null,
        actuallyStarted: null, operationallyComplete: null, accepted: null, plannedStartAt: null, plannedFinishAt: null,
        normalizedPlannedDurationHours: null, durationEligibility: null, startScheduleEligibility: "excluded",
        finishScheduleEligibility: "excluded", schedulePerformanceState: null, schedulePerformanceDataQuality: null,
        scheduleIssue: null, plannedDurationExpectedContributionHours: null,
        operationalDurationContributionHours: null, acceptedDurationContributionHours: null });
      continue;
    }

    const start = timestamp(activity.plannedStartAt);
    const finish = timestamp(activity.plannedFinishAt);
    const actualStart = timestamp(activity.schedulePerformance.actualStartedAt);
    let scheduleIssue: PlannedPositionContribution["scheduleIssue"] = null;
    if (start.kind === "invalid" || finish.kind === "invalid") scheduleIssue = "planned_timestamp_invalid";
    else if (start.kind === "valid" && finish.kind === "valid" && finish.value < start.value) scheduleIssue = "planned_finish_before_start";
    else if (actualStart.kind === "invalid") scheduleIssue = "actual_start_invalid";
    else if (start.kind === "missing") scheduleIssue = "planned_start_missing";
    else if (finish.kind === "missing") scheduleIssue = "planned_finish_missing";

    const orderInvalid = start.kind === "valid" && finish.kind === "valid" && finish.value < start.value;
    const startEligibility: ScheduleEligibility = start.kind === "missing" ? "missing" : start.kind === "invalid" || orderInvalid ? "invalid" : "valid";
    const finishEligibility: ScheduleEligibility = finish.kind === "missing" ? "missing" : finish.kind === "invalid" || orderInvalid ? "invalid" : "valid";
    const expectedStarted = startEligibility === "valid" ? start.value! <= asOfMs : null;
    const expectedFinished = finishEligibility === "valid" ? finish.value! <= asOfMs : null;
    const actuallyStarted = actualStart.kind === "valid" ? actualStart.value! <= asOfMs : actualStart.kind === "missing" ? false : null;
    const durationHours = measured.normalizedPlannedDurationHours;

    contributions.push({ activityId: activity.id, included: true, expectedToHaveStarted: expectedStarted,
      expectedToHaveFinished: expectedFinished, actuallyStarted, operationallyComplete: measured.operationallyComplete,
      accepted: measured.accepted, plannedStartAt: start.kind === "valid" ? activity.plannedStartAt! : null,
      plannedFinishAt: finish.kind === "valid" ? activity.plannedFinishAt! : null,
      normalizedPlannedDurationHours: durationHours, durationEligibility: measured.durationEligibility,
      startScheduleEligibility: startEligibility, finishScheduleEligibility: finishEligibility,
      schedulePerformanceState: activity.schedulePerformance.state,
      schedulePerformanceDataQuality: activity.schedulePerformance.dataQuality, scheduleIssue,
      plannedDurationExpectedContributionHours: durationHours === null || expectedFinished === null ? null : expectedFinished ? durationHours : 0,
      operationalDurationContributionHours: durationHours === null ? null : measured.operationallyComplete ? durationHours : 0,
      acceptedDurationContributionHours: durationHours === null ? null : measured.accepted ? durationHours : 0 });
  }

  const included = contributions.filter((item) => item.included);
  const validScheduled = included.filter((item) => item.startScheduleEligibility === "valid" && item.finishScheduleEligibility === "valid");
  const invalidSchedule = included.filter((item) => item.startScheduleEligibility === "invalid" || item.finishScheduleEligibility === "invalid" || item.actuallyStarted === null).length;
  const validStarts = included.filter((item) => item.startScheduleEligibility === "valid");
  const validFinishes = included.filter((item) => item.finishScheduleEligibility === "valid");
  const expectedStarts = validStarts.filter((item) => item.expectedToHaveStarted).length;
  const expectedFinishes = validFinishes.filter((item) => item.expectedToHaveFinished).length;
  const actualStarts = included.filter((item) => item.actuallyStarted).length;
  const startDifference = delta(actualStarts, expectedStarts);
  const operationalDifference = delta(progress.activityCounts.operationallyCompletedActivities, expectedFinishes);
  const acceptedDifference = delta(progress.activityCounts.acceptedActivities, expectedFinishes);
  const validDuration = included.filter((item) => item.durationEligibility === "valid_positive");
  const durationPositionEligible = validDuration.filter((item) => item.finishScheduleEligibility === "valid");
  const durationScheduleIncomplete = durationPositionEligible.length !== validDuration.length;
  const expectedDuration = durationPositionEligible.reduce((sum, item) => sum + (item.plannedDurationExpectedContributionHours ?? 0), 0);
  const totalDuration = progress.plannedDuration.totalValidPlannedDurationHours;
  const durationComparisonValid = progress.dataQuality !== "invalid" && invalidSchedule === 0 && !durationScheduleIncomplete && totalDuration > 0;
  const expectedDurationRatio = durationComparisonValid ? expectedDuration / totalDuration : null;
  const operationalRatio = progress.plannedDuration.operationalDurationCompletionRatio;
  const acceptedRatio = progress.plannedDuration.acceptedDurationCompletionRatio;
  const operationalRatioDelta = expectedDurationRatio === null || operationalRatio === null ? null : operationalRatio - expectedDurationRatio;
  const acceptedRatioDelta = expectedDurationRatio === null || acceptedRatio === null ? null : acceptedRatio - expectedDurationRatio;
  const total = included.length;
  const plannedCountsValid = invalidSchedule === 0;
  const startCoverage = coverageStatus(validStarts.length, total);
  const finishCoverage = coverageStatus(validFinishes.length, total);
  const durationCoverage = coverageStatus(durationPositionEligible.length, total);
  const partial = startCoverage !== "complete" || finishCoverage !== "complete" || durationCoverage !== "complete" || progress.dataQuality === "partial";

  return {
    ok: true,
    dataQuality: invalidSchedule > 0 || progress.dataQuality === "invalid" ? "invalid" : partial ? "partial" : "complete",
    asOf: asOf.toISOString(),
    counts: { totalActivities: total, operationallyCompletedActivities: progress.activityCounts.operationallyCompletedActivities,
      acceptedActivities: progress.activityCounts.acceptedActivities },
    startPosition: { scheduledActivities: validScheduled.length, activitiesExpectedStarted: plannedCountsValid ? expectedStarts : null,
      activitiesNotYetExpectedStarted: plannedCountsValid ? validStarts.length - expectedStarts : null,
      activitiesActuallyStarted: actualStarts, startShortfallActivities: plannedCountsValid ? startDifference.shortfall : null,
      startAheadActivities: plannedCountsValid ? startDifference.ahead : null },
    finishPosition: { activitiesExpectedFinished: plannedCountsValid ? expectedFinishes : null,
      activitiesNotYetExpectedFinished: plannedCountsValid ? validFinishes.length - expectedFinishes : null,
      operationalCompletionShortfallActivities: plannedCountsValid ? operationalDifference.shortfall : null,
      operationalCompletionAheadActivities: plannedCountsValid ? operationalDifference.ahead : null,
      acceptedCompletionShortfallActivities: plannedCountsValid ? acceptedDifference.shortfall : null,
      acceptedCompletionAheadActivities: plannedCountsValid ? acceptedDifference.ahead : null },
    durationPosition: { totalValidPlannedDurationHours: totalDuration,
      plannedDurationExpectedCompleteHours: durationComparisonValid ? expectedDuration : null,
      plannedDurationExpectedCompleteRatio: expectedDurationRatio,
      operationalDurationCompletedHours: progress.plannedDuration.operationallyCompletedPlannedDurationHours,
      operationalDurationCompletionRatio: operationalRatio,
      acceptedDurationCompletedHours: progress.plannedDuration.acceptedPlannedDurationHours,
      acceptedDurationCompletionRatio: acceptedRatio,
      operationalDurationDifferenceRatio: operationalRatioDelta,
      acceptedDurationDifferenceRatio: acceptedRatioDelta,
      operationalDurationShortfallRatio: operationalRatioDelta === null ? null : Math.max(-operationalRatioDelta, 0),
      operationalDurationAheadRatio: operationalRatioDelta === null ? null : Math.max(operationalRatioDelta, 0),
      acceptedDurationShortfallRatio: acceptedRatioDelta === null ? null : Math.max(-acceptedRatioDelta, 0),
      acceptedDurationAheadRatio: acceptedRatioDelta === null ? null : Math.max(acceptedRatioDelta, 0) },
    coverage: { totalActivities: total,
      validScheduledActivities: validScheduled.length,
      validStartActivities: validStarts.length, validFinishActivities: validFinishes.length,
      missingPlannedStartActivities: included.filter((item) => item.startScheduleEligibility === "missing").length,
      missingPlannedFinishActivities: included.filter((item) => item.finishScheduleEligibility === "missing").length,
      invalidScheduleActivities: invalidSchedule,
      startPosition: { status: startCoverage, ratio: total ? validStarts.length / total : null },
      finishPosition: { status: finishCoverage, ratio: total ? validFinishes.length / total : null },
      durationPosition: { status: durationCoverage, eligibleActivities: durationPositionEligible.length,
        ratio: total ? durationPositionEligible.length / total : null },
      duration: progress.durationCoverage },
    progressMeasurement: progress,
    activityContributions: contributions,
  };
}

import { deriveSuccessfulReviewFinish, type ScheduleHistoryEvent } from "./schedulePerformance.ts";

export type ProgressActivityStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "blocked"
  | "submitted_for_review"
  | "changes_required"
  | "approved";

export type ProgressDurationUnit = "hours" | "days" | "weeks";
export type ProgressDurationEligibility = "valid_positive" | "zero" | "missing" | "invalid";
export type ProgressDurationCoverageStatus = "complete" | "partial" | "unavailable";

export type ProgressMeasurementActivity = {
  id: string;
  status: ProgressActivityStatus;
  requiresApproval: boolean;
  plannedDuration: number | null | undefined;
  durationUnit: ProgressDurationUnit | string | null | undefined;
  events?: ReadonlyArray<ScheduleHistoryEvent>;
  active?: boolean;
  archivedAt?: string | null;
  mandatory?: boolean;
};

export type ProgressMeasurementContribution = {
  activityId: string;
  included: boolean;
  exclusionReason: "archived_or_inactive" | null;
  operationallyComplete: boolean | null;
  accepted: boolean | null;
  normalizedPlannedDurationHours: number | null;
  durationEligibility: ProgressDurationEligibility | null;
  durationIssue: "duration_missing" | "duration_invalid" | "duration_unit_unsupported" | null;
};

export type ProgressMeasurementResult =
  | {
      ok: false;
      dataQuality: "invalid";
      reason: "activity_input_invalid" | "completion_state_invalid";
      activityId: string | null;
      contributions: ProgressMeasurementContribution[];
    }
  | {
      ok: true;
      dataQuality: "complete" | "partial" | "invalid";
      activityCounts: {
        totalActivities: number;
        operationallyCompletedActivities: number;
        acceptedActivities: number;
        remainingOperationalActivities: number;
        remainingAcceptedActivities: number;
        operationalCompletionRatio: number | null;
        acceptedCompletionRatio: number | null;
      };
      plannedDuration: {
        totalValidPlannedDurationHours: number;
        operationallyCompletedPlannedDurationHours: number;
        acceptedPlannedDurationHours: number;
        operationalDurationCompletionRatio: number | null;
        acceptedDurationCompletionRatio: number | null;
      };
      durationCoverage: {
        status: ProgressDurationCoverageStatus;
        totalActivities: number;
        validDurationActivities: number;
        zeroDurationActivities: number;
        missingDurationActivities: number;
        invalidDurationActivities: number;
        usableDurationCoverageRatio: number | null;
      };
      contributions: ProgressMeasurementContribution[];
    };

const statuses = new Set<ProgressActivityStatus>([
  "not_started", "in_progress", "completed", "blocked", "submitted_for_review", "changes_required", "approved",
]);

const durationHours: Record<ProgressDurationUnit, number> = {
  hours: 1,
  days: 24,
  weeks: 24 * 7,
};

function completion(activity: ProgressMeasurementActivity) {
  if (activity.requiresApproval) {
    if (activity.status === "completed") return null;
    if (activity.status === "approved") {
      const review = deriveSuccessfulReviewFinish(activity.events ?? []);
      if (review.quality !== "complete") return null;
      return { operationallyComplete: true, accepted: true };
    }
    if (activity.status === "submitted_for_review") {
      const hasSubmission = (activity.events ?? []).some((event) => event.event_type === "submitted_for_review");
      if (!hasSubmission) return null;
      return { operationallyComplete: true, accepted: false };
    }
    // A rejected submission is no longer a successful work result. It must be
    // corrected and submitted again before it contributes to either measure.
    return { operationallyComplete: false, accepted: false };
  }

  if (activity.status === "submitted_for_review" || activity.status === "changes_required" || activity.status === "approved") return null;
  const complete = activity.status === "completed";
  return { operationallyComplete: complete, accepted: complete };
}

function duration(activity: ProgressMeasurementActivity) {
  if (activity.plannedDuration === null || activity.plannedDuration === undefined) {
    return { eligibility: "missing" as const, hours: null, issue: "duration_missing" as const };
  }
  if (typeof activity.plannedDuration !== "number" || !Number.isFinite(activity.plannedDuration) || activity.plannedDuration < 0) {
    return { eligibility: "invalid" as const, hours: null, issue: "duration_invalid" as const };
  }
  if (!(typeof activity.durationUnit === "string" && activity.durationUnit in durationHours)) {
    return { eligibility: "invalid" as const, hours: null, issue: "duration_unit_unsupported" as const };
  }
  if (activity.plannedDuration === 0) return { eligibility: "zero" as const, hours: null, issue: null };
  return {
    eligibility: "valid_positive" as const,
    hours: activity.plannedDuration * durationHours[activity.durationUnit as ProgressDurationUnit],
    issue: null,
  };
}

/**
 * Measures current completion facts for an already-authorized Activity set.
 * Historical/as-of normalization belongs upstream: callers must first rebuild
 * each Activity's authoritative state and event history at their supplied asOf.
 * This pure aggregate has no wall-clock dependency.
 */
export function deriveProgressMeasurement(
  activities: ReadonlyArray<ProgressMeasurementActivity>,
): ProgressMeasurementResult {
  const contributions: ProgressMeasurementContribution[] = [];
  const included: Array<ProgressMeasurementContribution & { operationallyComplete: boolean; accepted: boolean }> = [];
  const activityIds = new Set<string>();

  for (const activity of activities) {
    if (!activity || typeof activity !== "object" || typeof activity.id !== "string" || !activity.id.trim() ||
      activityIds.has(activity.id) || typeof activity.requiresApproval !== "boolean" || !statuses.has(activity.status) ||
      (activity.events !== undefined && (!Array.isArray(activity.events) || activity.events.some((event) =>
        !event || typeof event.event_type !== "string" || !Number.isFinite(Date.parse(event.occurred_at)) ||
        (event.event_sequence !== null && (!Number.isInteger(event.event_sequence) || event.event_sequence < 1))
      )))) {
      return { ok: false, dataQuality: "invalid", reason: "activity_input_invalid", activityId: activity?.id ?? null, contributions };
    }
    activityIds.add(activity.id);
    if (activity.active === false || Boolean(activity.archivedAt)) {
      contributions.push({ activityId: activity.id, included: false, exclusionReason: "archived_or_inactive", operationallyComplete: null,
        accepted: null, normalizedPlannedDurationHours: null, durationEligibility: null, durationIssue: null });
      continue;
    }
    const completionState = completion(activity);
    if (!completionState) {
      return { ok: false, dataQuality: "invalid", reason: "completion_state_invalid", activityId: activity.id, contributions };
    }
    const normalized = duration(activity);
    const contribution = { activityId: activity.id, included: true, exclusionReason: null,
      ...completionState, normalizedPlannedDurationHours: normalized.hours,
      durationEligibility: normalized.eligibility, durationIssue: normalized.issue } satisfies ProgressMeasurementContribution;
    contributions.push(contribution);
    included.push(contribution);
  }

  const total = included.length;
  const operational = included.filter((item) => item.operationallyComplete).length;
  const accepted = included.filter((item) => item.accepted).length;
  const valid = included.filter((item) => item.durationEligibility === "valid_positive");
  const zero = included.filter((item) => item.durationEligibility === "zero").length;
  const missing = included.filter((item) => item.durationEligibility === "missing").length;
  const invalid = included.filter((item) => item.durationEligibility === "invalid").length;
  const totalDuration = valid.reduce((sum, item) => sum + item.normalizedPlannedDurationHours!, 0);
  const operationalDuration = valid.filter((item) => item.operationallyComplete).reduce((sum, item) => sum + item.normalizedPlannedDurationHours!, 0);
  const acceptedDuration = valid.filter((item) => item.accepted).reduce((sum, item) => sum + item.normalizedPlannedDurationHours!, 0);
  const coverageStatus: ProgressDurationCoverageStatus = valid.length === 0 ? "unavailable"
    : valid.length === total ? "complete" : "partial";
  const durationRatiosAvailable = totalDuration > 0 && invalid === 0;

  return {
    ok: true,
    dataQuality: invalid > 0 ? "invalid" : missing > 0 || zero > 0 ? "partial" : "complete",
    activityCounts: {
      totalActivities: total,
      operationallyCompletedActivities: operational,
      acceptedActivities: accepted,
      remainingOperationalActivities: total - operational,
      remainingAcceptedActivities: total - accepted,
      operationalCompletionRatio: total ? operational / total : null,
      acceptedCompletionRatio: total ? accepted / total : null,
    },
    plannedDuration: {
      totalValidPlannedDurationHours: totalDuration,
      operationallyCompletedPlannedDurationHours: operationalDuration,
      acceptedPlannedDurationHours: acceptedDuration,
      operationalDurationCompletionRatio: durationRatiosAvailable ? operationalDuration / totalDuration : null,
      acceptedDurationCompletionRatio: durationRatiosAvailable ? acceptedDuration / totalDuration : null,
    },
    durationCoverage: {
      status: coverageStatus,
      totalActivities: total,
      validDurationActivities: valid.length,
      zeroDurationActivities: zero,
      missingDurationActivities: missing,
      invalidDurationActivities: invalid,
      usableDurationCoverageRatio: total ? valid.length / total : null,
    },
    contributions,
  };
}

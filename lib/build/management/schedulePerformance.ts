export type SchedulePerformanceState =
  | "not_scheduled"
  | "schedule_data_incomplete"
  | "not_yet_due"
  | "on_schedule"
  | "overdue_to_start"
  | "overdue_to_complete"
  | "completed_early"
  | "completed_on_time"
  | "completed_late"
  | "awaiting_review";

export type ScheduleExecutionStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "blocked"
  | "submitted_for_review"
  | "changes_required"
  | "approved";

export type ScheduleHistoryEvent = {
  event_type: string;
  occurred_at: string;
  event_sequence: number | null;
};

export type SchedulePerformanceInput = {
  scheduleConfirmedAt: string | null;
  plannedStartAt: string | null;
  plannedFinishAt: string | null;
  status: ScheduleExecutionStatus;
  startedAt: string | null;
  completedAt: string | null;
  events?: ReadonlyArray<ScheduleHistoryEvent>;
};

export type SchedulePerformance = {
  state: SchedulePerformanceState;
  actualStartedAt: string | null;
  actualWorkFinishedAt: string | null;
  submittedForReviewAt: string | null;
  inspectionAcceptedAt: string | null;
  startVarianceMs: number | null;
  finishVarianceMs: number | null;
  submissionVarianceMs: number | null;
  currentStartDelayMs: number | null;
  currentCompletionDelayMs: number | null;
  dataQuality: "complete" | "incomplete_schedule" | "ambiguous_history" | "missing_history";
};

const instant = (value: string | null | undefined) => {
  if (!value) return null;
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
};

function orderedEvents(events: ReadonlyArray<ScheduleHistoryEvent>) {
  return [...events].sort((left, right) => {
    const time = (instant(left.occurred_at) ?? 0) - (instant(right.occurred_at) ?? 0);
    if (time !== 0) return time;
    if (left.event_sequence === null || right.event_sequence === null) return 0;
    return left.event_sequence - right.event_sequence;
  });
}

function hasAmbiguousRelevantOrder(events: ReadonlyArray<ScheduleHistoryEvent>) {
  const relevant = events.filter((event) => event.event_type === "submitted_for_review" || event.event_type === "inspection_accepted");
  const byTime = new Map<string, ScheduleHistoryEvent[]>();
  for (const event of relevant) byTime.set(event.occurred_at, [...(byTime.get(event.occurred_at) ?? []), event]);
  return [...byTime.values()].some((group) => group.length > 1 && group.some((event) => event.event_sequence === null));
}

export function deriveSuccessfulReviewFinish(events: ReadonlyArray<ScheduleHistoryEvent>) {
  if (hasAmbiguousRelevantOrder(events)) return { submittedAt: null, acceptedAt: null, quality: "ambiguous_history" as const };
  const ordered = orderedEvents(events);
  const acceptedIndex = ordered.findLastIndex((event) => event.event_type === "inspection_accepted");
  if (acceptedIndex < 0) return { submittedAt: null, acceptedAt: null, quality: "missing_history" as const };
  const submitted = ordered.slice(0, acceptedIndex).findLast((event) => event.event_type === "submitted_for_review");
  if (!submitted) return { submittedAt: null, acceptedAt: ordered[acceptedIndex].occurred_at, quality: "missing_history" as const };
  return { submittedAt: submitted.occurred_at, acceptedAt: ordered[acceptedIndex].occurred_at, quality: "complete" as const };
}

export function deriveLatestSubmission(events: ReadonlyArray<ScheduleHistoryEvent>) {
  if (hasAmbiguousRelevantOrder(events)) return null;
  return orderedEvents(events).findLast((event) => event.event_type === "submitted_for_review")?.occurred_at ?? null;
}

export function deriveSchedulePerformance(input: SchedulePerformanceInput, now: Date): SchedulePerformance {
  const base = {
    actualStartedAt: input.startedAt,
    actualWorkFinishedAt: null,
    submittedForReviewAt: null,
    inspectionAcceptedAt: null,
    startVarianceMs: null,
    finishVarianceMs: null,
    submissionVarianceMs: null,
    currentStartDelayMs: null,
    currentCompletionDelayMs: null,
  } satisfies Omit<SchedulePerformance, "state" | "dataQuality">;

  if (!input.scheduleConfirmedAt) return { ...base, state: "not_scheduled", dataQuality: "complete" };
  const plannedStart = instant(input.plannedStartAt), plannedFinish = instant(input.plannedFinishAt);
  if (plannedStart === null || plannedFinish === null) return { ...base, state: "schedule_data_incomplete", dataQuality: "incomplete_schedule" };

  const started = instant(input.startedAt);
  const startVarianceMs = started === null ? null : started - plannedStart;
  let actualWorkFinishedAt: string | null = null;
  let submittedForReviewAt: string | null = null;
  let inspectionAcceptedAt: string | null = null;
  let dataQuality: SchedulePerformance["dataQuality"] = "complete";

  if (input.status === "completed") actualWorkFinishedAt = input.completedAt;
  if (input.status === "approved") {
    const reviewed = deriveSuccessfulReviewFinish(input.events ?? []);
    actualWorkFinishedAt = reviewed.submittedAt;
    submittedForReviewAt = reviewed.submittedAt;
    inspectionAcceptedAt = reviewed.acceptedAt;
    dataQuality = reviewed.quality;
  } else if (input.status === "submitted_for_review" || input.status === "changes_required") {
    submittedForReviewAt = deriveLatestSubmission(input.events ?? []);
    if (!submittedForReviewAt && (input.events?.length ?? 0) > 0 && hasAmbiguousRelevantOrder(input.events ?? [])) dataQuality = "ambiguous_history";
    else if (!submittedForReviewAt) dataQuality = "missing_history";
  }

  const finished = instant(actualWorkFinishedAt);
  const finishVarianceMs = finished === null ? null : finished - plannedFinish;
  const submitted = instant(submittedForReviewAt);
  const submissionVarianceMs = submitted === null ? null : submitted - plannedFinish;
  if (finished !== null) {
    const state = finishVarianceMs! < 0 ? "completed_early" : finishVarianceMs === 0 ? "completed_on_time" : "completed_late";
    return { ...base, state, actualStartedAt: input.startedAt, actualWorkFinishedAt, submittedForReviewAt, inspectionAcceptedAt, startVarianceMs, finishVarianceMs, submissionVarianceMs, dataQuality };
  }
  if (input.status === "completed" || input.status === "approved") {
    return { ...base, state: "schedule_data_incomplete", actualStartedAt: input.startedAt, submittedForReviewAt, inspectionAcceptedAt, startVarianceMs, submissionVarianceMs, dataQuality: "missing_history" };
  }
  if (input.status === "submitted_for_review") {
    return { ...base, state: "awaiting_review", actualStartedAt: input.startedAt, submittedForReviewAt, startVarianceMs, submissionVarianceMs, dataQuality };
  }

  const current = now.getTime();
  const hasStarted = started !== null || input.status !== "not_started";
  if (!hasStarted && current > plannedStart) return { ...base, state: "overdue_to_start", actualStartedAt: input.startedAt, startVarianceMs, currentStartDelayMs: current - plannedStart, dataQuality };
  if (hasStarted && current > plannedFinish) return { ...base, state: "overdue_to_complete", actualStartedAt: input.startedAt, submittedForReviewAt, startVarianceMs, submissionVarianceMs, currentCompletionDelayMs: current - plannedFinish, dataQuality };
  return { ...base, state: hasStarted ? "on_schedule" : "not_yet_due", actualStartedAt: input.startedAt, submittedForReviewAt, startVarianceMs, submissionVarianceMs, dataQuality };
}

export const SCHEDULE_STATE_LABELS: Record<SchedulePerformanceState, string> = {
  not_scheduled: "Not Scheduled",
  schedule_data_incomplete: "Schedule Data Incomplete",
  not_yet_due: "Not Yet Due",
  on_schedule: "On Schedule",
  overdue_to_start: "Overdue to Start",
  overdue_to_complete: "Overdue to Complete",
  completed_early: "Completed Early",
  completed_on_time: "Completed On Time",
  completed_late: "Completed Late",
  awaiting_review: "Awaiting Review",
};

export function formatScheduleVariance(value: number | null) {
  if (value === null) return "Unavailable";
  if (value === 0) return "On time";
  const totalMinutes = Math.floor(Math.abs(value) / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [days ? `${days} ${days === 1 ? "day" : "days"}` : "", hours ? `${hours} ${hours === 1 ? "hour" : "hours"}` : "", minutes || (!days && !hours) ? `${minutes} ${minutes === 1 ? "minute" : "minutes"}` : ""].filter(Boolean);
  return `${parts.join(" ")} ${value < 0 ? "early" : "late"}`;
}

export function isCurrentlyOverdue(state: SchedulePerformanceState) {
  return state === "overdue_to_start" || state === "overdue_to_complete";
}

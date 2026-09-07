import type { BuildExecutionHistory } from "../management/service.ts";
import type { CanonicalBuildProject } from "../projects/types.ts";

export type ExecutionHistoryCadence = "daily" | "weekly";
export type ExecutionHistoryPeriod = { from: string; through: string; periodStart: string; periodEnd: string; timezone: "UTC"; cadence: ExecutionHistoryCadence };
export type ExecutionHistoryQueryResult = { state: "selection"; cadence: ExecutionHistoryCadence; timezone: "UTC" } | { state: "invalid" } | ({ state: "ready" } & ExecutionHistoryPeriod);

export type BuildExecutionHistoryReport = {
  report: { type: "build_execution_history_report"; title: "Execution History Report"; version: 1 };
  project: { id: string; clientId: string; name: string; code: string | null };
  scope: { kind: "project" | "work_package"; workPackageId: string | null; workPackageName: string | null; siteName: string | null };
  timing: { generatedAt: string; period: ExecutionHistoryPeriod };
  summary: { activitiesStarted: number | null; activitiesCompleted: number; activitiesAccepted: number; submissions: number; initialSubmissions: number | null; resubmissions: number | null; changesRequiredOutcomes: number; activitiesRequiringCorrection: number | null; correctiveCycles: number | null; blockedEvents: number | null; resumedEvents: number | null };
  review: { cyclesTotal: number | null; cyclesMeasured: number; cyclesUnmeasurable: number | null; averageHours: number | null; medianHours: number | null; minHours: number | null; maxHours: number | null };
  buckets: BuildExecutionHistory["buckets"];
  workPackages: BuildExecutionHistory["workPackages"];
  coverage: { dataQuality: BuildExecutionHistory["dataQuality"]; scopedBucketsAvailable: boolean; archivedWorkPackages: number; reviewCyclesMeasured: number; reviewCyclesTotal: number | null };
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function utcDate(value: string) {
  if (!DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}
export function parseExecutionHistoryQuery(query: { from?: string; through?: string; cadence?: string; timezone?: string }): ExecutionHistoryQueryResult {
  const cadence = query.cadence ?? "daily", timezone = query.timezone ?? "UTC";
  if ((cadence !== "daily" && cadence !== "weekly") || timezone !== "UTC") return { state: "invalid" };
  if (!query.from && !query.through) return { state: "selection", cadence, timezone };
  if (!query.from || !query.through) return { state: "invalid" };
  const start = utcDate(query.from), through = utcDate(query.through);
  if (!start || !through || start > through) return { state: "invalid" };
  const end = new Date(through.getTime() + 86_400_000);
  return { state: "ready", from: query.from, through: query.through, periodStart: start.toISOString(), periodEnd: end.toISOString(), timezone, cadence };
}

function instant(value: Date | string, label: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid Build execution-history report ${label}`);
  return date.toISOString();
}
const zeroPackage = { operationalCompletions: 0, acceptedActivities: 0, submissions: 0, changesRequiredOutcomes: 0, reviewCyclesMeasured: 0, medianReviewTurnaroundHours: null };

export function composeBuildExecutionHistoryReport(input: { project: CanonicalBuildProject; history: BuildExecutionHistory; period: ExecutionHistoryPeriod; generatedAt: Date; workPackage?: { id: string; clientId: string; projectId: string; siteName: string; name: string } }): BuildExecutionHistoryReport {
  const { project, history, period } = input;
  const generatedAt = instant(input.generatedAt, "generatedAt");
  if (!project.id || !project.client_id || history.projectId !== project.id || history.clientId !== project.client_id ||
      instant(history.periodStart, "periodStart") !== period.periodStart || instant(history.periodEnd, "periodEnd") !== period.periodEnd ||
      history.timezone !== "UTC" || period.timezone !== "UTC" || !["daily", "weekly"].includes(period.cadence)) throw new Error("Invalid Build execution-history report scope");
  if (input.workPackage && (input.workPackage.clientId !== project.client_id || input.workPackage.projectId !== project.id || !input.workPackage.id || !input.workPackage.name || !input.workPackage.siteName)) throw new Error("Invalid Build execution-history Work Package scope");
  const packageMatches = input.workPackage ? history.workPackages.filter((row) => row.id === input.workPackage!.id) : [];
  if (packageMatches.length > 1) throw new Error("Invalid Build execution-history Work Package history");
  const scoped = packageMatches[0] ?? zeroPackage;
  const isPackage = Boolean(input.workPackage);
  const counts = history.counts;
  const review = history.reviewTurnaround;
  return {
    report: { type: "build_execution_history_report", title: "Execution History Report", version: 1 },
    project: { id: project.id, clientId: project.client_id, name: project.project_name, code: project.project_code },
    scope: { kind: isPackage ? "work_package" : "project", workPackageId: input.workPackage?.id ?? null, workPackageName: input.workPackage?.name ?? null, siteName: input.workPackage?.siteName ?? null },
    timing: { generatedAt, period },
    summary: isPackage ? { activitiesStarted: null, activitiesCompleted: scoped.operationalCompletions, activitiesAccepted: scoped.acceptedActivities,
      submissions: scoped.submissions, initialSubmissions: null, resubmissions: null, changesRequiredOutcomes: scoped.changesRequiredOutcomes,
      activitiesRequiringCorrection: null, correctiveCycles: null, blockedEvents: null, resumedEvents: null }
      : { activitiesStarted: counts.activitiesStarted, activitiesCompleted: counts.operationalCompletions, activitiesAccepted: counts.acceptedActivities,
        submissions: counts.submissions, initialSubmissions: counts.initialSubmissions, resubmissions: counts.resubmissions,
        changesRequiredOutcomes: counts.changesRequiredOutcomes, activitiesRequiringCorrection: counts.activitiesRequiringChanges,
        correctiveCycles: counts.correctiveCycles, blockedEvents: counts.blockedEvents, resumedEvents: counts.resumedEvents },
    review: isPackage ? { cyclesTotal: null, cyclesMeasured: scoped.reviewCyclesMeasured, cyclesUnmeasurable: null, averageHours: null,
      medianHours: scoped.medianReviewTurnaroundHours, minHours: null, maxHours: null }
      : { cyclesTotal: review.reviewCyclesTotal, cyclesMeasured: review.reviewCyclesMeasured, cyclesUnmeasurable: review.reviewCyclesUnmeasurable,
        averageHours: review.averageHours, medianHours: review.medianHours, minHours: review.minHours, maxHours: review.maxHours },
    buckets: isPackage ? [] : history.buckets,
    workPackages: isPackage ? [] : history.workPackages,
    coverage: { dataQuality: history.dataQuality, scopedBucketsAvailable: !isPackage,
      archivedWorkPackages: history.workPackages.filter((row) => row.name === "Archived Work Package").length,
      reviewCyclesMeasured: isPackage ? scoped.reviewCyclesMeasured : review.reviewCyclesMeasured,
      reviewCyclesTotal: isPackage ? null : review.reviewCyclesTotal },
  };
}

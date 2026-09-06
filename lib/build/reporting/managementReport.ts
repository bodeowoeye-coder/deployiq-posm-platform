import type { BuildManagementSummary } from "../management/service.ts";
import type { CanonicalBuildProject } from "../projects/types.ts";

type Ratio = { numerator: number; denominator: number; ratio: number | null };
type ReportRatio = Ratio & { state: "available" | "unavailable" };

export type BuildManagementReport = {
  report: { type: "build_management_report"; title: "Build Management Report"; version: 1 };
  project: { id: string; clientId: string; name: string; code: string | null; clientReference: string | null; type: string; status: string };
  scope: { kind: "project"; projectId: string; clientId: string };
  timing: { generatedAt: string; asOf: string; currentStateNotice: string; recentExecution: { periodStart: string; periodEnd: string; timezone: string } };
  status: { activitiesCompleted: number; activitiesAccepted: number; activitiesExpectedComplete: number | null; currentOverdue: number; managementAttention: number; openExceptions: number };
  progress: { dataQuality: string; operationalShortfall: number | null; acceptedShortfall: number | null; durationExpected: ReportRatio; durationCompleted: ReportRatio; durationAccepted: ReportRatio; durationCoverage: { state: string; eligible: number; total: number } };
  schedule: BuildManagementSummary["schedule"];
  attention: { summary: BuildManagementSummary["managementAttention"]; preview: BuildManagementSummary["managementAttentionPreview"] };
  quality: { scheduleAdherence: ReportRatio; firstPassAcceptance: ReportRatio; activitiesRequiringCorrection: number; currentChangesRequired: number; reviewCoverage: ReportRatio; medianReviewTurnaroundHours: number | null; reviewCoverageState: string; scheduleCoverageState: string };
  recentExecution: BuildManagementSummary["recentExecution"];
  dependencies: BuildManagementSummary["dependencyFacts"];
  exceptions: { counts: BuildManagementSummary["exceptions"]; preview: BuildManagementSummary["exceptionsRegister"] };
  workPackages: Array<{ id: string; name: string; siteName: string; availability: string; completed: number | null; expectedComplete: number | null; currentOverdue: number; managementAttention: number; scheduleAdherence: ReportRatio; firstPassAcceptance: ReportRatio; dataQuality: string }>;
  coverage: { progress: string; schedule: ReportRatio; review: ReportRatio; dependencyDataIncomplete: number; workPackagesWithoutPlan: number; workPackagesWithMultiplePlans: number; workPackagesWithIncompleteMeasurement: number; assignmentsMissing: number };
};

export type BuildManagementReportInput = {
  project: CanonicalBuildProject;
  management: BuildManagementSummary;
  generatedAt: Date;
  asOf: Date;
};

function instant(value: Date | string, label: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid Build management report ${label}`);
  return date.toISOString();
}

function integer(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid Build management report ${label}`);
  return value;
}

function reportRatio(value: Ratio, label: string): ReportRatio {
  integer(value.numerator, `${label} numerator`);
  integer(value.denominator, `${label} denominator`);
  if (value.numerator > value.denominator) throw new Error(`Invalid Build management report ${label}`);
  if (value.denominator === 0) {
    if (value.ratio !== null) throw new Error(`Invalid Build management report ${label}`);
    return { ...value, state: "unavailable" };
  }
  if (value.ratio === null || !Number.isFinite(value.ratio) || Math.abs(value.ratio - value.numerator / value.denominator) > 1e-9) {
    throw new Error(`Invalid Build management report ${label}`);
  }
  return { ...value, state: "available" };
}

function durationRatio(numerator: number | null, denominator: number, ratio: number | null, label: string): ReportRatio {
  if (numerator === null) {
    if (ratio !== null) throw new Error(`Invalid Build management report ${label}`);
    return { numerator: 0, denominator: 0, ratio: null, state: "unavailable" };
  }
  if (![numerator, denominator].every((value) => Number.isFinite(value) && value >= 0) || numerator > denominator) throw new Error(`Invalid Build management report ${label}`);
  if (denominator === 0) return reportRatio({ numerator: 0, denominator: 0, ratio }, label);
  if (ratio === null || Math.abs(ratio - numerator / denominator) > 1e-9) throw new Error(`Invalid Build management report ${label}`);
  return { numerator, denominator, ratio, state: "available" };
}

function oneOf(value: string, values: ReadonlyArray<string>, label: string) {
  if (!values.includes(value)) throw new Error(`Invalid Build management report ${label}`);
  return value;
}

export function composeBuildManagementReport(input: BuildManagementReportInput): BuildManagementReport {
  const generatedAt = instant(input.generatedAt, "generatedAt");
  const asOf = instant(input.asOf, "asOf");
  const { project, management } = input;
  if (!project.id || !project.client_id || !project.project_name || management.projectId !== project.id ||
      management.progressPerformance.projectId !== project.id || management.progressPerformance.clientId !== project.client_id ||
      management.qualityAdherence.projectId !== project.id || management.qualityAdherence.clientId !== project.client_id ||
      management.recentExecution.projectId !== project.id || management.recentExecution.clientId !== project.client_id) {
    throw new Error("Invalid Build management report scope");
  }
  if (instant(management.progressPerformance.asOf, "progress asOf") !== asOf) throw new Error("Invalid Build management report evaluation time");
  const periodStart = instant(management.recentExecution.periodStart, "period start");
  const periodEnd = instant(management.recentExecution.periodEnd, "period end");
  if (periodStart >= periodEnd || periodEnd !== asOf || management.recentExecution.timezone !== "UTC") throw new Error("Invalid Build management report period");
  const ids = management.progressPerformance.workPackages.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("Invalid Build management report duplicate Work Package");
  for (const values of [management.workPackages.map((item) => item.id), management.qualityAdherence.workPackages.map((item) => item.id)]) {
    if (new Set(values).size !== values.length) throw new Error("Invalid Build management report duplicate Work Package");
  }
  oneOf(management.progressPerformance.dataQuality, ["complete", "partial", "unavailable", "invalid"], "progress coverage");
  oneOf(management.qualityAdherence.schedule.scheduleCoverageState, ["complete", "partial", "unavailable"], "schedule coverage");
  oneOf(management.qualityAdherence.quality.reviewCoverageState, ["complete", "partial", "unavailable"], "review coverage");
  const qualityByPackage = new Map(management.qualityAdherence.workPackages.map((item) => [item.id, item]));
  const executionByPackage = new Map(management.workPackages.map((item) => [item.id, item]));
  const measurement = management.progressPerformance.measurement;
  const totalDuration = measurement?.durationPosition.totalValidPlannedDurationHours ?? 0;
  const missingAssignments = management.managementAttention.categoryCounts.assignmentsMissing;

  const workPackages = management.progressPerformance.workPackages.map((item) => {
    const execution = executionByPackage.get(item.id);
    const quality = qualityByPackage.get(item.id);
    if (!execution || !quality) throw new Error("Invalid Build management report Work Package scope");
    oneOf(item.measurementAvailability, ["measurable", "partially_measurable", "unavailable"], `Work Package ${item.id} coverage`);
    return {
      id: item.id, name: item.name, siteName: item.siteName, availability: item.measurementAvailability,
      completed: item.measurement?.counts.operationallyCompletedActivities ?? null,
      expectedComplete: item.measurement?.finishPosition.activitiesExpectedFinished ?? null,
      currentOverdue: item.context.overdueActivities, managementAttention: item.context.managementAttentionObligations,
      scheduleAdherence: reportRatio(quality.schedule.finishAdherence, `Work Package ${item.id} schedule adherence`),
      firstPassAcceptance: reportRatio(quality.quality.firstPassAcceptance, `Work Package ${item.id} first-pass acceptance`),
      dataQuality: item.measurement?.dataQuality ?? item.unavailableReason ?? "unavailable",
    };
  });

  return {
    report: { type: "build_management_report", title: "Build Management Report", version: 1 },
    project: { id: project.id, clientId: project.client_id, name: project.project_name, code: project.project_code,
      clientReference: project.client_project_reference, type: project.project_type, status: project.status },
    scope: { kind: "project", projectId: project.id, clientId: project.client_id },
    timing: { generatedAt, asOf, currentStateNotice: "Current-state facts are evaluated as of the time shown.",
      recentExecution: { periodStart, periodEnd, timezone: management.recentExecution.timezone } },
    status: { activitiesCompleted: management.activities.completed, activitiesAccepted: management.activities.approved,
      activitiesExpectedComplete: measurement?.finishPosition.activitiesExpectedFinished ?? null,
      currentOverdue: management.schedule.currentlyOverdue,
      managementAttention: management.managementAttention.outstandingObligations, openExceptions: management.exceptions.active },
    progress: { dataQuality: management.progressPerformance.dataQuality,
      operationalShortfall: measurement?.finishPosition.operationalCompletionShortfallActivities ?? null,
      acceptedShortfall: measurement?.finishPosition.acceptedCompletionShortfallActivities ?? null,
      durationExpected: durationRatio(measurement?.durationPosition.plannedDurationExpectedCompleteHours ?? null, totalDuration, measurement?.durationPosition.plannedDurationExpectedCompleteRatio ?? null, "expected duration"),
      durationCompleted: durationRatio(measurement?.durationPosition.operationalDurationCompletedHours ?? null, totalDuration, measurement?.durationPosition.operationalDurationCompletionRatio ?? null, "completed duration"),
      durationAccepted: durationRatio(measurement?.durationPosition.acceptedDurationCompletedHours ?? null, totalDuration, measurement?.durationPosition.acceptedDurationCompletionRatio ?? null, "accepted duration"),
      durationCoverage: { state: measurement?.coverage.duration.status ?? "unavailable", eligible: measurement?.coverage.duration.validDurationActivities ?? 0, total: measurement?.coverage.totalActivities ?? 0 } },
    schedule: management.schedule,
    attention: { summary: management.managementAttention, preview: management.managementAttentionPreview.slice(0, 6) },
    quality: { scheduleAdherence: reportRatio(management.qualityAdherence.schedule.finishAdherence, "schedule adherence"),
      firstPassAcceptance: reportRatio(management.qualityAdherence.quality.firstPassAcceptance, "first-pass acceptance"),
      activitiesRequiringCorrection: management.qualityAdherence.quality.activitiesRequiringCorrection,
      currentChangesRequired: management.qualityAdherence.quality.currentlyChangesRequiredActivities,
      reviewCoverage: reportRatio(management.qualityAdherence.quality.reviewCoverage, "review coverage"),
      medianReviewTurnaroundHours: management.qualityAdherence.quality.medianReviewTurnaroundHours,
      reviewCoverageState: management.qualityAdherence.quality.reviewCoverageState,
      scheduleCoverageState: management.qualityAdherence.schedule.scheduleCoverageState },
    recentExecution: management.recentExecution,
    dependencies: management.dependencyFacts,
    exceptions: { counts: management.exceptions, preview: management.exceptionsRegister.slice(0, 5) },
    workPackages,
    coverage: { progress: management.progressPerformance.dataQuality,
      schedule: reportRatio(management.qualityAdherence.schedule.scheduleCoverage, "schedule coverage"),
      review: reportRatio(management.qualityAdherence.quality.reviewCoverage, "review coverage"),
      dependencyDataIncomplete: management.dependencyFacts.dataIncompleteConstraints,
      workPackagesWithoutPlan: management.progressPerformance.scope.workPackagesWithoutActiveWorkPlan,
      workPackagesWithMultiplePlans: management.progressPerformance.scope.workPackagesWithAmbiguousActivePlans,
      workPackagesWithIncompleteMeasurement: management.progressPerformance.scope.workPackagesWithIncompleteMeasurement,
      assignmentsMissing: missingAssignments },
  };
}

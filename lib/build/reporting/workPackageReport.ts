import type { BuildManagementSummary, ManagementActivityStatus } from "../management/service.ts";
import type { CanonicalBuildProject } from "../projects/types.ts";

type Ratio = { numerator: number; denominator: number; ratio: number | null };
export type WorkPackageReportRatio = Ratio & { state: "available" | "unavailable" };

export type BuildWorkPackageReport = {
  report: { type: "build_work_package_report"; title: "Work Package Report"; version: 1 };
  project: { id: string; clientId: string; name: string; code: string | null };
  scope: { kind: "work_package"; projectId: string; clientId: string; siteId: string; siteName: string; workPackageId: string; workPackageName: string };
  timing: { generatedAt: string; asOf: string; currentStateNotice: string; recentExecution: { periodStart: string; periodEnd: string; timezone: "UTC" } };
  workPlan: { state: "available" | "unavailable" | "ambiguous" | "empty" | "invalid"; id: string | null; reason: string | null };
  status: { activitiesCompleted: number | null; activitiesAccepted: number | null; activitiesExpectedComplete: number | null; currentOverdue: number; managementAttention: number; openExceptions: number };
  progress: { availability: string; operationalShortfall: number | null; acceptedShortfall: number | null; durationExpected: WorkPackageReportRatio; durationCompleted: WorkPackageReportRatio; durationAccepted: WorkPackageReportRatio; durationCoverage: { state: string; eligible: number; total: number } };
  schedule: BuildManagementSummary["workPackages"][number]["schedule"] & { coverage: WorkPackageReportRatio; coverageState: string; dataIncomplete: number };
  attention: { outstanding: number; overdue: number; activitiesAffected: number; preview: BuildManagementSummary["managementAttentionItems"] };
  quality: { scheduleAdherence: WorkPackageReportRatio; firstPassAcceptance: WorkPackageReportRatio; activitiesRequiringCorrection: number; currentChangesRequired: number; reviewCoverage: WorkPackageReportRatio; medianReviewTurnaroundHours: number | null; reviewCycles: number };
  recentExecution: { periodStart: string; periodEnd: string; timezone: "UTC"; activitiesCompleted: number; activitiesAccepted: number; submissions: number; changesRequiredOutcomes: number; reviewCyclesMeasured: number; medianReviewTurnaroundHours: number | null };
  dependencies: BuildManagementSummary["workPackages"][number]["dependencies"];
  exceptions: { open: number; inRemediation: number; overdue: number; high: number; critical: number; preview: BuildManagementSummary["exceptionsRegister"] };
  activities: Array<{ id: string; name: string; status: ManagementActivityStatus; plannedStartAt: string | null; plannedFinishAt: string | null; actualStartAt: string | null; actualFinishAt: string | null; scheduleClassification: string; ownerName: string | null; supervisorName: string | null; reviewStatus: "not_required" | "not_submitted" | "awaiting_review" | "changes_required" | "accepted" }>;
  coverage: { workPlan: string; schedule: WorkPackageReportRatio; duration: { state: string; eligible: number; total: number }; review: WorkPackageReportRatio; dependencyDataIncomplete: number; assignmentsMissing: number };
};

export type BuildWorkPackageReportInput = { project: CanonicalBuildProject; management: BuildManagementSummary; workPackageId: string; generatedAt: Date; asOf: Date };

function instant(value: Date | string, label: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid Build Work Package report ${label}`);
  return date.toISOString();
}
function integer(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid Build Work Package report ${label}`);
  return value;
}
function ratio(value: Ratio, label: string): WorkPackageReportRatio {
  integer(value.numerator, `${label} numerator`); integer(value.denominator, `${label} denominator`);
  if (value.numerator > value.denominator) throw new Error(`Invalid Build Work Package report ${label}`);
  if (value.denominator === 0) {
    if (value.ratio !== null) throw new Error(`Invalid Build Work Package report ${label}`);
    return { ...value, state: "unavailable" };
  }
  if (value.ratio === null || !Number.isFinite(value.ratio) || Math.abs(value.ratio - value.numerator / value.denominator) > 1e-9) throw new Error(`Invalid Build Work Package report ${label}`);
  return { ...value, state: "available" };
}
function durationRatio(numerator: number | null, denominator: number, value: number | null, label: string) {
  if (numerator === null) return ratio({ numerator: 0, denominator: 0, ratio: value }, label);
  if (![numerator, denominator].every((item) => Number.isFinite(item) && item >= 0) || numerator > denominator) throw new Error(`Invalid Build Work Package report ${label}`);
  return ratio({ numerator, denominator, ratio: value }, label);
}
function exactlyOne<T extends { id: string }>(rows: T[], id: string, label: string) {
  const matches = rows.filter((row) => row.id === id);
  if (matches.length !== 1) throw new Error(`Invalid Build Work Package report ${label}`);
  return matches[0];
}
function reviewStatus(activity: BuildManagementSummary["activityDetails"][number]): BuildWorkPackageReport["activities"][number]["reviewStatus"] {
  if (!activity.requiresApproval) return "not_required";
  if (activity.status === "approved") return "accepted";
  if (activity.status === "changes_required") return "changes_required";
  if (activity.status === "submitted_for_review") return "awaiting_review";
  return "not_submitted";
}

export function composeBuildWorkPackageReport(input: BuildWorkPackageReportInput): BuildWorkPackageReport {
  const generatedAt = instant(input.generatedAt, "generatedAt"), asOf = instant(input.asOf, "asOf");
  const { project, management, workPackageId } = input;
  if (!workPackageId || !project.id || !project.client_id || management.projectId !== project.id ||
      management.progressPerformance.projectId !== project.id || management.progressPerformance.clientId !== project.client_id ||
      management.qualityAdherence.projectId !== project.id || management.qualityAdherence.clientId !== project.client_id ||
      management.recentExecution.projectId !== project.id || management.recentExecution.clientId !== project.client_id) throw new Error("Invalid Build Work Package report scope");
  if (instant(management.progressPerformance.asOf, "management asOf") !== asOf) throw new Error("Invalid Build Work Package report evaluation time");
  const periodStart = instant(management.recentExecution.periodStart, "period start"), periodEnd = instant(management.recentExecution.periodEnd, "period end");
  if (periodStart >= periodEnd || periodEnd !== asOf || management.recentExecution.timezone !== "UTC") throw new Error("Invalid Build Work Package report period");

  const summary = exactlyOne(management.workPackages, workPackageId, "Work Package scope");
  const progress = exactlyOne(management.progressPerformance.workPackages, workPackageId, "progress scope");
  const quality = exactlyOne(management.qualityAdherence.workPackages.filter((row) => !row.historicalOnly), workPackageId, "quality scope");
  if (progress.siteId !== summary.siteId || progress.siteName !== summary.siteName || progress.name !== summary.name) throw new Error("Invalid Build Work Package report ancestry");
  const activities = management.activityDetails.filter((row) => row.workPackageId === workPackageId);
  if (new Set(activities.map((row) => row.id)).size !== activities.length || activities.some((row) => row.clientId !== project.client_id || row.projectId !== project.id || row.siteId !== summary.siteId || (progress.activeWorkPlanId && row.workPlanId !== progress.activeWorkPlanId))) throw new Error("Invalid Build Work Package report Activity ancestry");
  const attention = management.managementAttentionItems.filter((row) => row.workPackageId === workPackageId);
  const exceptions = management.exceptionsRegister.filter((row) => row.workPackageId === workPackageId);
  const recentMatches = management.recentExecution.workPackages.filter((row) => row.id === workPackageId);
  if (recentMatches.length > 1) throw new Error("Invalid Build Work Package report recent execution scope");
  const recent = recentMatches[0] ?? { operationalCompletions: 0, acceptedActivities: 0, submissions: 0, changesRequiredOutcomes: 0, reviewCyclesMeasured: 0, medianReviewTurnaroundHours: null };
  const measurement = progress.measurement, totalDuration = measurement?.durationPosition.totalValidPlannedDurationHours ?? 0;
  const planState = progress.unavailableReason === "multiple_active_work_plans" ? "ambiguous" : progress.unavailableReason === "work_plan_not_available" ? "unavailable" : progress.unavailableReason === "empty_activity_scope" ? "empty" : progress.unavailableReason === "invalid_measurement" ? "invalid" : "available";
  const activeExceptions = exceptions.filter((row) => row.status === "open" || row.status === "in_remediation");
  const missingAssignments = attention.filter((row) => row.type === "assignment_missing").length;

  return {
    report: { type: "build_work_package_report", title: "Work Package Report", version: 1 },
    project: { id: project.id, clientId: project.client_id, name: project.project_name, code: project.project_code },
    scope: { kind: "work_package", projectId: project.id, clientId: project.client_id, siteId: summary.siteId, siteName: summary.siteName, workPackageId, workPackageName: summary.name },
    timing: { generatedAt, asOf, currentStateNotice: "Current-state facts are evaluated as of the time shown.", recentExecution: { periodStart, periodEnd, timezone: "UTC" } },
    workPlan: { state: planState, id: progress.activeWorkPlanId, reason: progress.unavailableReason },
    status: { activitiesCompleted: measurement?.counts.operationallyCompletedActivities ?? null, activitiesAccepted: measurement?.counts.acceptedActivities ?? null,
      activitiesExpectedComplete: measurement?.finishPosition.activitiesExpectedFinished ?? null, currentOverdue: summary.schedule.overdue,
      managementAttention: progress.context.managementAttentionObligations, openExceptions: activeExceptions.length },
    progress: { availability: progress.measurementAvailability,
      operationalShortfall: measurement?.finishPosition.operationalCompletionShortfallActivities ?? null,
      acceptedShortfall: measurement?.finishPosition.acceptedCompletionShortfallActivities ?? null,
      durationExpected: durationRatio(measurement?.durationPosition.plannedDurationExpectedCompleteHours ?? null, totalDuration, measurement?.durationPosition.plannedDurationExpectedCompleteRatio ?? null, "expected duration"),
      durationCompleted: durationRatio(measurement?.durationPosition.operationalDurationCompletedHours ?? null, totalDuration, measurement?.durationPosition.operationalDurationCompletionRatio ?? null, "completed duration"),
      durationAccepted: durationRatio(measurement?.durationPosition.acceptedDurationCompletedHours ?? null, totalDuration, measurement?.durationPosition.acceptedDurationCompletionRatio ?? null, "accepted duration"),
      durationCoverage: { state: measurement?.coverage.duration.status ?? "unavailable", eligible: measurement?.coverage.duration.validDurationActivities ?? 0, total: measurement?.coverage.totalActivities ?? 0 } },
    schedule: { ...summary.schedule, coverage: ratio(quality.schedule.scheduleCoverage, "schedule coverage"), coverageState: quality.schedule.scheduleCoverageState, dataIncomplete: quality.schedule.scheduleCoverage.denominator - quality.schedule.scheduleCoverage.numerator },
    attention: { outstanding: attention.length, overdue: attention.filter((row) => row.overdue).length, activitiesAffected: new Set(attention.flatMap((row) => row.activityId ? [row.activityId] : [])).size, preview: attention.slice(0, 6) },
    quality: { scheduleAdherence: ratio(quality.schedule.finishAdherence, "schedule adherence"), firstPassAcceptance: ratio(quality.quality.firstPassAcceptance, "first-pass acceptance"),
      activitiesRequiringCorrection: quality.quality.activitiesRequiringCorrection, currentChangesRequired: quality.quality.currentlyChangesRequiredActivities,
      reviewCoverage: ratio(quality.quality.reviewCoverage, "review coverage"), medianReviewTurnaroundHours: quality.quality.medianReviewTurnaroundHours,
      reviewCycles: management.recentExecution.activityReviews.filter((row) => row.workPackageId === workPackageId).reduce((sum, row) => sum + row.reviewCycles, 0) },
    recentExecution: { periodStart, periodEnd, timezone: "UTC", activitiesCompleted: recent.operationalCompletions, activitiesAccepted: recent.acceptedActivities,
      submissions: recent.submissions, changesRequiredOutcomes: recent.changesRequiredOutcomes, reviewCyclesMeasured: recent.reviewCyclesMeasured, medianReviewTurnaroundHours: recent.medianReviewTurnaroundHours },
    dependencies: summary.dependencies,
    exceptions: { open: exceptions.filter((row) => row.status === "open").length, inRemediation: exceptions.filter((row) => row.status === "in_remediation").length,
      overdue: exceptions.filter((row) => row.overdue).length, high: activeExceptions.filter((row) => row.severity === "high").length,
      critical: activeExceptions.filter((row) => row.severity === "critical").length, preview: exceptions.slice(0, 5) },
    activities: activities.map((row) => ({ id: row.id, name: row.name, status: row.status, plannedStartAt: row.plannedStartAt, plannedFinishAt: row.plannedFinishAt,
      actualStartAt: row.actualStartAt, actualFinishAt: row.actualFinishAt, scheduleClassification: row.schedule.state,
      ownerName: row.ownerName, supervisorName: row.supervisorName, reviewStatus: reviewStatus(row) })).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    coverage: { workPlan: planState, schedule: ratio(quality.schedule.scheduleCoverage, "schedule coverage"), duration: { state: measurement?.coverage.duration.status ?? "unavailable", eligible: measurement?.coverage.duration.validDurationActivities ?? 0, total: measurement?.coverage.totalActivities ?? 0 },
      review: ratio(quality.quality.reviewCoverage, "review coverage"), dependencyDataIncomplete: summary.dependencies.dataIncompleteConstraints, assignmentsMissing: missingAssignments },
  };
}

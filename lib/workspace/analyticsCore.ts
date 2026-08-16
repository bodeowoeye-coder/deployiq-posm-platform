import {
  getBrandComplianceScores,
  getBrandCounts,
  getDailyCounts,
  getGpsVerifiedPercentage,
  getInstallerAccuracyRanking,
  getInstallerCounts,
  getProjectCounts,
  getRegionCounts,
  getRegionPerformanceRanking,
  getStateCounts,
  hasValidGps,
} from "@/lib/reporting";
import { getPortfolioOperations, getProjectOperations } from "@/lib/operations";
import { resolveSubmissionCampaignName } from "@/lib/projects";
import type { DeploymentProgress, Project, ProjectTarget, Submission } from "@/lib/types";

export function isMissingDeploymentProgressTable(error: { code?: string | null; message?: string | null } | null) {
  return error?.code === "PGRST205" && error.message?.includes("public.deployment_progress") === true;
}

type AnalyticsFilterValue = string | null | undefined;

export type WorkspaceAnalyticsFilters = {
  projectId?: AnalyticsFilterValue;
    campaign?: AnalyticsFilterValue;
  brand?: AnalyticsFilterValue;
  region?: AnalyticsFilterValue;
  state?: AnalyticsFilterValue;
  installer?: AnalyticsFilterValue;
  status?: AnalyticsFilterValue;
  dateFrom?: AnalyticsFilterValue;
  dateTo?: AnalyticsFilterValue;
  gps?: "all" | "verified" | "missing";
};

function text(value: AnalyticsFilterValue) {
  return typeof value === "string" ? value.trim() : "";
}

export function geographyFor(submission: Submission) {
  return submission.resolved_state || submission.installer_state || submission.state_region || "Unknown";
}

function projectMatches(submission: Submission, projectId: string, projects: Project[]) {
  if (!projectId) return true;
  if (submission.project_id) return submission.project_id === projectId;
  const project = projects.find((item) => item.id === projectId);
  return Boolean(project && submission.project_name === project.project_name);
}

export function filterWorkspaceAnalyticsSubmissions(
  submissions: Submission[],
  projects: Project[],
  filters: WorkspaceAnalyticsFilters = {}
) {
  const projectId = text(filters.projectId);
    const campaign = text(filters.campaign).toLowerCase();
  const brand = text(filters.brand).toLowerCase();
  const region = text(filters.region).toLowerCase();
  const state = text(filters.state).toLowerCase();
  const installer = text(filters.installer).toLowerCase();
  const status = text(filters.status);
  const dateFrom = text(filters.dateFrom);
  const dateTo = text(filters.dateTo);
  const gps = filters.gps ?? "all";

  return submissions.filter((submission) => {
    const submissionBrand = (submission.brand_name || "Unassigned").trim().toLowerCase();
    const submissionInstaller = (submission.installer_name || "Unnamed installer").trim().toLowerCase();
    const submissionState = geographyFor(submission).trim().toLowerCase();
    const submissionDate = submission.submitted_at.slice(0, 10);

    return (
      projectMatches(submission, projectId, projects) &&
        (!campaign || (resolveSubmissionCampaignName(projects, submission) || "").toLowerCase() === campaign) &&
      (!brand || submissionBrand === brand) &&
      (!region || (submission.installer_region || "").trim().toLowerCase() === region) &&
      (!state || submissionState === state) &&
      (!installer || submissionInstaller.includes(installer)) &&
      (!status || submission.status === status) &&
      (!dateFrom || submissionDate >= dateFrom) &&
      (!dateTo || submissionDate <= dateTo) &&
      (gps === "all" || (gps === "verified" ? hasValidGps(submission) : !hasValidGps(submission)))
    );
  });
}

export function buildWorkspaceAnalytics(input: {
  submissions: Submission[];
  projects: Project[];
  projectTargets: ProjectTarget[];
  deploymentProgress: DeploymentProgress[];
  filters?: WorkspaceAnalyticsFilters;
}) {
  const filters = input.filters ?? {};
  const filteredSubmissions = filterWorkspaceAnalyticsSubmissions(input.submissions, input.projects, filters);
  const projectId = text(filters.projectId);
  const projects = projectId ? input.projects.filter((project) => project.id === projectId) : input.projects;
  const projectRows = getProjectOperations(projects, input.projectTargets, filteredSubmissions, input.deploymentProgress);
  const portfolio = getPortfolioOperations(projectRows);
  const installerSource = { installers: [], users: [] };

  return {
    submissions: filteredSubmissions,
    portfolio,
    kpis: {
      total: filteredSubmissions.length,
      actual: portfolio.actual,
      completion: portfolio.completion,
      approved: portfolio.approved,
      pending: portfolio.pending,
      rejected: portfolio.rejected,
      outstanding: portfolio.outstanding,
      gpsVerifiedPercent: getGpsVerifiedPercentage(filteredSubmissions),
    },
    projectProgress: projectRows.map((row) => ({
      projectId: row.project.id,
      project: row.project.project_name,
      campaign: row.project.campaign_name,
      brand: row.project.brand?.brand_name ?? null,
      status: row.project.status,
      startDate: row.project.start_date,
      endDate: row.project.end_date,
      expected: row.expected,
      actual: row.actual,
      outstanding: row.outstanding,
      completion: row.completion,
      approved: row.approved,
      pending: row.pending,
      rejected: row.rejected,
      gpsVerified: row.submissions.filter(hasValidGps).length,
      gpsExceptions: row.submissions.filter((submission) => !hasValidGps(submission)).length,
      evidenceRecords: row.submissions.length,
      states: getStateCounts(row.submissions).map((item) => item.state),
      regions: getRegionCounts(row.submissions).map((item) => item.region),
    })),
    stateCounts: getStateCounts(filteredSubmissions),
    regionCounts: getRegionCounts(filteredSubmissions),
    projectCounts: getProjectCounts(filteredSubmissions),
    installerCounts: getInstallerCounts(filteredSubmissions, installerSource),
    installerPerformance: getInstallerAccuracyRanking(filteredSubmissions, installerSource),
    brandCompliance: getBrandComplianceScores(filteredSubmissions),
    regionPerformance: getRegionPerformanceRanking(filteredSubmissions),
    brandCounts: getBrandCounts(filteredSubmissions),
    trend: getDailyCounts(filteredSubmissions),
    statusCounts: ["Approved", "Pending", "Flagged", "Rejected", "Correction Requested"].map((status) => ({
      status,
      count: filteredSubmissions.filter((submission) => submission.status === status).length,
    })),
    gpsQuality: [
      { label: "Verified / valid", count: filteredSubmissions.filter(hasValidGps).length },
      { label: "Missing / unavailable", count: filteredSubmissions.filter((submission) => !hasValidGps(submission)).length },
    ],
  };
}

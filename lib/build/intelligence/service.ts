import "server-only";

import { AccessControlError } from "../../accessControl.ts";
import { getBuildManagementSummary, getBuildExecutionHistory, type BuildManagementSummary } from "../management/service.ts";
import { resolveCanonicalBuildProject } from "../projects/service.ts";
import { getBuildProjectWorkspaceOverview, type BuildProjectWorkspaceOverview } from "../projects/workspaceOverview.ts";
import { composeBuildExecutionHistoryReport, parseExecutionHistoryQuery, type ExecutionHistoryPeriod } from "../reporting/executionHistoryReport.ts";
import { composeBuildManagementReport } from "../reporting/managementReport.ts";
import { composeBuildWorkPackageReport } from "../reporting/workPackageReport.ts";
import {
  attachBuildExecutionHistoryV1,
  composeBuildActivityIntelligenceV1,
  composeBuildProjectIntelligenceV1,
  composeBuildWorkPackageIntelligenceV1,
} from "./dataset.ts";
import type { BuildIntelligenceDatasetV1 } from "./types.ts";

export type BuildIntelligenceHistoryRequest = {
  from: string;
  through: string;
  timezone: "UTC";
  cadence: "daily" | "weekly";
};

export type AuthenticatedBuildIntelligenceRequest =
  | { scope: "project"; projectId: string; history?: BuildIntelligenceHistoryRequest }
  | { scope: "work_package"; projectId: string; workPackageId: string; history?: BuildIntelligenceHistoryRequest }
  | { scope: "activity"; projectId: string; workPackageId: string; activityId: string; history?: never };

export type BuildIntelligenceServiceErrorCode =
  | "unauthenticated"
  | "permission_denied"
  | "project_not_found"
  | "work_package_not_found"
  | "activity_not_found"
  | "scope_mismatch"
  | "invalid_period"
  | "unsupported_cadence"
  | "invalid_as_of"
  | "ambiguous_work_plan"
  | "dataset_validation_failed";

export class BuildIntelligenceServiceError extends Error {
  readonly code: BuildIntelligenceServiceErrorCode;

  constructor(code: BuildIntelligenceServiceErrorCode, message: string) {
    super(message);
    this.name = "BuildIntelligenceServiceError";
    this.code = code;
  }
}

type ServiceDependencies = {
  clock: () => Date;
  resolveProject: typeof resolveCanonicalBuildProject;
  loadOverview: typeof getBuildProjectWorkspaceOverview;
  loadManagement: typeof getBuildManagementSummary;
  loadHistory: typeof getBuildExecutionHistory;
};

const dependencies: ServiceDependencies = {
  clock: () => new Date(),
  resolveProject: resolveCanonicalBuildProject,
  loadOverview: getBuildProjectWorkspaceOverview,
  loadManagement: getBuildManagementSummary,
  loadHistory: getBuildExecutionHistory,
};

function validInstant(value: Date, label: string) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new BuildIntelligenceServiceError(label === "evaluation time" ? "invalid_as_of" : "dataset_validation_failed", `Build intelligence ${label} is invalid.`);
  }
  return value;
}

function serviceError(error: unknown): BuildIntelligenceServiceError {
  if (error instanceof BuildIntelligenceServiceError) return error;
  if (error instanceof AccessControlError) {
    if (error.status === 401) return new BuildIntelligenceServiceError("unauthenticated", "Authentication is required for Build intelligence.");
    if (error.status === 403) return new BuildIntelligenceServiceError("permission_denied", "You do not have access to this Build intelligence scope.");
    if (error.status === 404) return new BuildIntelligenceServiceError("project_not_found", "The requested Build Project was not found.");
    return new BuildIntelligenceServiceError("scope_mismatch", "The requested Build intelligence scope is not valid.");
  }
  return new BuildIntelligenceServiceError("dataset_validation_failed", "Build intelligence could not be composed from authoritative data.");
}

function historyPeriod(history: BuildIntelligenceHistoryRequest): ExecutionHistoryPeriod {
  if (history.cadence !== "daily" && history.cadence !== "weekly") {
    throw new BuildIntelligenceServiceError("unsupported_cadence", "Build intelligence history supports daily or weekly cadence.");
  }
  if (history.timezone !== "UTC") {
    throw new BuildIntelligenceServiceError("invalid_period", "Build intelligence history requires UTC.");
  }
  const parsed = parseExecutionHistoryQuery(history);
  if (parsed.state !== "ready") {
    throw new BuildIntelligenceServiceError("invalid_period", "Select a valid explicit Build intelligence history period.");
  }
  return parsed;
}

function workPackageContext(overview: BuildProjectWorkspaceOverview, workPackageId: string) {
  const matches = overview.workPackages.filter((row) => row.id === workPackageId);
  if (matches.length !== 1) {
    throw new BuildIntelligenceServiceError("work_package_not_found", "The requested Work Package was not found in this Build Project.");
  }
  const workPackage = matches[0];
  const sites = overview.sites.filter((row) => row.id === workPackage.siteId);
  if (sites.length !== 1) {
    throw new BuildIntelligenceServiceError("scope_mismatch", "The requested Work Package ancestry is not valid.");
  }
  return { workPackage, site: sites[0] };
}

async function attachHistory(
  dataset: BuildIntelligenceDatasetV1,
  request: Extract<AuthenticatedBuildIntelligenceRequest, { scope: "project" | "work_package" }>,
  period: ExecutionHistoryPeriod,
  generatedAt: Date,
  project: Awaited<ReturnType<typeof resolveCanonicalBuildProject>>["project"],
  overview: BuildProjectWorkspaceOverview | null,
  deps: ServiceDependencies,
) {
  const history = await deps.loadHistory({
    projectId: project.id,
    periodStart: new Date(period.periodStart),
    periodEnd: new Date(period.periodEnd),
    cadence: period.cadence,
  });
  let workPackage;
  if (request.scope === "work_package") {
    if (!overview) throw new BuildIntelligenceServiceError("scope_mismatch", "Build intelligence Work Package scope is unavailable.");
    const context = workPackageContext(overview, request.workPackageId);
    workPackage = { id: context.workPackage.id, clientId: project.client_id, projectId: project.id, name: context.workPackage.name, siteName: context.site.name };
  }
  const report = composeBuildExecutionHistoryReport({ project, history, period, generatedAt, workPackage });
  return attachBuildExecutionHistoryV1(dataset, report);
}

async function getAuthenticatedBuildIntelligenceInternal(
  request: AuthenticatedBuildIntelligenceRequest,
  deps: ServiceDependencies,
): Promise<BuildIntelligenceDatasetV1> {
  const asOf = validInstant(deps.clock(), "evaluation time");
  const { project } = await deps.resolveProject({ projectId: request.projectId, requiredPermission: "projects:read" });
  const management = await deps.loadManagement(project.id, asOf);
  let overview: BuildProjectWorkspaceOverview | null = null;
  let dataset: BuildIntelligenceDatasetV1;

  if (request.scope === "project") {
    const generatedAt = validInstant(deps.clock(), "generation time");
    if (generatedAt < asOf) throw new BuildIntelligenceServiceError("dataset_validation_failed", "Build intelligence generation time precedes evaluation time.");
    const report = composeBuildManagementReport({ project, management, asOf, generatedAt });
    dataset = composeBuildProjectIntelligenceV1({ report });
    if (request.history) dataset = await attachHistory(dataset, request, historyPeriod(request.history), generatedAt, project, overview, deps);
    return dataset;
  }

  overview = await deps.loadOverview(project.id);
  const context = workPackageContext(overview, request.workPackageId);
  const generatedAt = validInstant(deps.clock(), "generation time");
  if (generatedAt < asOf) throw new BuildIntelligenceServiceError("dataset_validation_failed", "Build intelligence generation time precedes evaluation time.");
  const report = composeBuildWorkPackageReport({ project, management, workPackageId: context.workPackage.id, asOf, generatedAt });

  if (request.scope === "activity") {
    const matches = management.activityDetails.filter((row) => row.id === request.activityId);
    if (matches.length !== 1) throw new BuildIntelligenceServiceError("activity_not_found", "The requested Activity was not found in this Build Project.");
    const activity = matches[0];
    if (activity.projectId !== project.id || activity.clientId !== project.client_id || activity.workPackageId !== context.workPackage.id || activity.siteId !== context.site.id) {
      throw new BuildIntelligenceServiceError("scope_mismatch", "The requested Activity ancestry is not valid.");
    }
    return composeBuildActivityIntelligenceV1({ report, management, activityId: activity.id, dependencies: management.dependencyEdges });
  }

  dataset = composeBuildWorkPackageIntelligenceV1({ report, management, dependencies: management.dependencyEdges });
  if (request.history) dataset = await attachHistory(dataset, request, historyPeriod(request.history), generatedAt, project, overview, deps);
  return dataset;
}

export async function getAuthenticatedBuildIntelligence(
  request: AuthenticatedBuildIntelligenceRequest,
): Promise<BuildIntelligenceDatasetV1> {
  try {
    return await getAuthenticatedBuildIntelligenceInternal(request, dependencies);
  } catch (error) {
    throw serviceError(error);
  }
}

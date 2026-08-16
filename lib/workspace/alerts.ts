import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { getOperationalAlerts, getProjectOperations } from "@/lib/operations";
import { isLegacyProvisioningPlaceholderProject, normalizeProjectRecords } from "@/lib/projects";
import { hasValidGps } from "@/lib/reporting";
import { isMissingDeploymentProgressTable } from "@/lib/workspace/analyticsCore";
import type { DeploymentProgress, Project, ProjectTarget, Submission } from "@/lib/types";
import { resolveCustomerWorkspaceContext, type CustomerWorkspaceContext } from "@/lib/workspace/customerAdmin";

type Row = Record<string, unknown>;

function alertTitle(type: string) {
  const titles: Record<string, string> = {
    low_completion: "Low completion",
    overdue_deployment: "Overdue project",
    rejected_deployment: "Rejected deployment",
    stalled_project: "Stalled project",
  };
  return titles[type] || type.replaceAll("_", " ");
}

export type WorkspaceAlertSeverity = "High" | "Medium" | "Low";

export type WorkspaceAlert = {
  id: string;
  severity: WorkspaceAlertSeverity;
  type: string;
  title: string;
  detail: string;
  href: string;
  projectId?: string | null;
  projectName?: string | null;
  submissionId?: string | null;
  status?: string | null;
  createdAt?: string | null;
};

export type WorkspaceAlertsDashboard = {
  workspace: CustomerWorkspaceContext;
  alerts: WorkspaceAlert[];
  loadError: string | null;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function getWorkspaceAlertsDashboard(projectId?: string | null): Promise<WorkspaceAlertsDashboard> {
  const workspace = await resolveCustomerWorkspaceContext();
  const supabase = createAdminSupabase();
  const [{ data: projects, error: projectsError }, { data: submissions, error: submissionsError }] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("client_id", workspace.clientId)
      .is("archived_at", null)
      .limit(500),
    supabase
      .from("submissions")
      .select("*")
      .eq("client_id", workspace.clientId)
      .is("archived_at", null)
      .limit(5000),
  ]);

  if (projectsError || submissionsError) {
    console.warn("[workspace-alerts]", {
      step: "Tenant alert source skipped",
      projectsError: projectsError?.message,
      submissionsError: submissionsError?.message,
    });
    return { workspace, alerts: [], loadError: "Alerts could not be loaded. Try refreshing this page." };
  }

  const projectRows = normalizeProjectRecords((projects ?? []) as Project[]).filter((project) => !isLegacyProvisioningPlaceholderProject(project) && (!projectId || project.id === projectId)) as Project[];
  const submissionRows = ((submissions ?? []) as Submission[]).filter((submission) => !projectId || submission.project_id === projectId);
  const projectIds = projectRows.map((project) => project.id);
  const [{ data: targets, error: targetsError }, { data: progress, error: progressError }] = projectIds.length
    ? await Promise.all([
        supabase.from("project_targets").select("*").in("project_id", projectIds),
        supabase.from("deployment_progress").select("*").in("project_id", projectIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (targetsError || (progressError && !isMissingDeploymentProgressTable(progressError))) {
    console.warn("[workspace-alerts] optional project operations lookup failed", { targetsError: targetsError?.message, progressError: progressError?.message });
    return { workspace, alerts: [], loadError: "Alerts could not be loaded. Try refreshing this page." };
  }
  const compatibleProgress = progressError && isMissingDeploymentProgressTable(progressError) ? [] : progress ?? [];
  const projectOperations = getProjectOperations(projectRows, (targets ?? []) as ProjectTarget[], submissionRows, compatibleProgress as DeploymentProgress[]);
  const alerts: WorkspaceAlert[] = [];
  const projectById = new Map(projectRows.map((project) => [project.id, project]));
  projectOperations.forEach((row) => {
    getOperationalAlerts([row]).forEach((alert) => {
      alerts.push({ id: `${row.project.id}-${alert.type}`, type: alert.type, severity: alert.severity === "high" ? "High" : "Medium", title: alertTitle(alert.type), detail: alert.message, href: `/workspace/admin/projects/${row.project.id}`, projectId: row.project.id, projectName: row.project.project_name });
    });
  });

  submissionRows.forEach((submission) => {
    const project = submission.project_id ? projectById.get(submission.project_id) : null;
    const projectName = project?.project_name || submission.project_name || "Project";
    const href = "/workspace/admin/submissions";
    if (["Pending", "Flagged"].includes(submission.status)) alerts.push({ id: `${submission.id}-review`, type: "submission_review", severity: "Medium", title: "Submission awaiting review", detail: `${projectName} has submission evidence awaiting review.`, href, projectId: project?.id ?? submission.project_id, projectName, submissionId: submission.id, status: submission.status, createdAt: submission.submitted_at });
    if (["Rejected", "Correction Requested"].includes(submission.status)) alerts.push({ id: `${submission.id}-correction`, type: "submission_correction", severity: "High", title: submission.status === "Rejected" ? "Rejected submission" : "Correction requested", detail: `${projectName} has a ${submission.status.toLowerCase()} submission requiring attention.`, href, projectId: project?.id ?? submission.project_id, projectName, submissionId: submission.id, status: submission.status, createdAt: submission.submitted_at });
    if (!hasValidGps(submission)) alerts.push({ id: `${submission.id}-gps`, type: "gps_exception", severity: "Medium", title: "GPS exception", detail: `${projectName} has a submission without valid GPS coordinates.`, href, projectId: project?.id ?? submission.project_id, projectName, submissionId: submission.id, status: submission.status, createdAt: submission.submitted_at });
    if (submission.duplicate_status && submission.duplicate_status !== "Unique") alerts.push({ id: `${submission.id}-duplicate`, type: "duplicate_exception", severity: "High", title: "Duplicate submission exception", detail: `${projectName} has a ${submission.duplicate_status.toLowerCase()} evidence record.`, href, projectId: project?.id ?? submission.project_id, projectName, submissionId: submission.id, status: submission.status, createdAt: submission.submitted_at });
  });

  return { workspace, alerts, loadError: null };
}

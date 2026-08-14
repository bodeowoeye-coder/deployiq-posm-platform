import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { resolveCustomerWorkspaceContext, type CustomerWorkspaceContext } from "@/lib/workspace/customerAdmin";

type Row = Record<string, unknown>;

export type WorkspaceAlertSeverity = "High" | "Medium" | "Low";

export type WorkspaceAlert = {
  id: string;
  severity: WorkspaceAlertSeverity;
  title: string;
  detail: string;
  href: string;
};

export type WorkspaceAlertsDashboard = {
  workspace: CustomerWorkspaceContext;
  alerts: WorkspaceAlert[];
  loadError: string | null;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function isActiveProject(row: Row) {
  const status = text(row.status).toLowerCase();
  return !text(row.archived_at) && ["active", "in progress", "planning", "on hold", "delayed"].includes(status);
}

export async function getWorkspaceAlertsDashboard(): Promise<WorkspaceAlertsDashboard> {
  const workspace = await resolveCustomerWorkspaceContext();
  const supabase = createAdminSupabase();
  const [{ data: projects, error: projectsError }, { data: submissions, error: submissionsError }] = await Promise.all([
    supabase
      .from("projects")
      .select("id,name,campaign,status,target_quantity,end_date,archived_at")
      .eq("client_id", workspace.clientId)
      .is("archived_at", null)
      .limit(500),
    supabase
      .from("submissions")
      .select("id,project_id,status,submitted_at")
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

  const submissionRows = (submissions ?? []) as Row[];
  const submissionsByProject = new Map<string, Row[]>();
  for (const submission of submissionRows) {
    const projectId = text(submission.project_id);
    if (!projectId) continue;
    if (!submissionsByProject.has(projectId)) submissionsByProject.set(projectId, []);
    submissionsByProject.get(projectId)?.push(submission);
  }

  const today = new Date().toISOString().slice(0, 10);
  const alerts: WorkspaceAlert[] = [];
  for (const project of (projects ?? []) as Row[]) {
    const projectId = text(project.id);
    const projectName = text(project.name) || text(project.campaign) || "Project";
    const projectSubmissions = submissionsByProject.get(projectId) ?? [];
    const approved = projectSubmissions.filter((submission) => text(submission.status) === "Approved").length;
    const pending = projectSubmissions.filter((submission) => ["Pending", "Flagged"].includes(text(submission.status))).length;
    const rejected = projectSubmissions.filter((submission) => ["Rejected", "Correction Requested"].includes(text(submission.status))).length;
    const target = numberValue(project.target_quantity);
    const completion = target > 0 ? Math.round((approved / target) * 100) : 0;
    const href = `/workspace/admin/projects/${projectId}`;

    if (isActiveProject(project) && text(project.end_date) && text(project.end_date) < today && completion < 100) {
      alerts.push({
        id: `${projectId}-overdue`,
        severity: "High",
        title: "Overdue project",
        detail: `${projectName} is past its expected end date with ${completion}% completion.`,
        href,
      });
    }
    if (target > 0 && projectSubmissions.length > 0 && completion < 50) {
      alerts.push({
        id: `${projectId}-low-completion`,
        severity: "Medium",
        title: "Low completion",
        detail: `${projectName} has ${approved} approved submissions against a target of ${target}.`,
        href,
      });
    }
    if (pending > 0) {
      alerts.push({
        id: `${projectId}-pending`,
        severity: "Medium",
        title: "Outstanding deployment risk",
        detail: `${projectName} has ${pending} submissions awaiting review.`,
        href: "/workspace/admin/submissions",
      });
    }
    if (rejected > 0) {
      alerts.push({
        id: `${projectId}-exceptions`,
        severity: "High",
        title: "Project exception",
        detail: `${projectName} has ${rejected} rejected or correction-requested submissions.`,
        href: "/workspace/admin/submissions",
      });
    }
  }

  return { workspace, alerts, loadError: null };
}

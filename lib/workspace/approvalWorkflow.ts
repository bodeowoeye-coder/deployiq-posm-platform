import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { resolveCustomerWorkspaceContext } from "@/lib/workspace/customerAdmin";
import { hasWorkspaceSettingsPermission } from "@/lib/workspace/customerAdminModel";
import { CUSTOMER_WORKSPACE_ROLES, type WorkspaceTeamRoleKey } from "@/lib/workspace/team";

type Row = Record<string, unknown>;

export type ApprovalMode = "customer_review" | "automatic";

export type ApprovalWorkflowConfig = {
  mode: ApprovalMode;
  reviewerRoles: WorkspaceTeamRoleKey[];
  requireRejectionReason: boolean;
  requireCorrectionInstructions: boolean;
  allowApprovalComments: boolean;
  configured: boolean;
  configuredAt: string | null;
  configuredBy: string | null;
};

export const DEFAULT_APPROVAL_WORKFLOW: ApprovalWorkflowConfig = {
  mode: "customer_review",
  reviewerRoles: ["primary_administrator", "administrator", "project_manager", "supervisor"],
  requireRejectionReason: true,
  requireCorrectionInstructions: true,
  allowApprovalComments: true,
  configured: false,
  configuredAt: null,
  configuredBy: null,
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function objectValue(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

export function reviewerRoleOptions() {
  return CUSTOMER_WORKSPACE_ROLES
    .filter((role) => role.permissions.includes("submissions.review") && role.appRole !== "installer")
    .map((role) => ({ key: role.key, label: role.label, description: role.description }));
}

function normalizeReviewerRoles(value: unknown) {
  const allowed = new Set<WorkspaceTeamRoleKey>(reviewerRoleOptions().map((role) => role.key));
  const roles = Array.isArray(value) ? value.map(text).filter((role): role is WorkspaceTeamRoleKey => allowed.has(role as WorkspaceTeamRoleKey)) : [];
  return roles.length > 0 ? [...new Set(roles)] : DEFAULT_APPROVAL_WORKFLOW.reviewerRoles;
}

function normalizeConfig(value: unknown): ApprovalWorkflowConfig {
  const raw = objectValue(value);
  const mode = text(raw.mode) === "automatic" ? "automatic" : "customer_review";
  return {
    mode,
    reviewerRoles: normalizeReviewerRoles(raw.reviewerRoles),
    requireRejectionReason: raw.requireRejectionReason !== false,
    requireCorrectionInstructions: raw.requireCorrectionInstructions !== false,
    allowApprovalComments: raw.allowApprovalComments !== false,
    configured: raw.configured === true,
    configuredAt: text(raw.configuredAt) || null,
    configuredBy: text(raw.configuredBy) || null,
  };
}

function mergeDashboardConfig(current: unknown, workflow: ApprovalWorkflowConfig) {
  return {
    ...objectValue(current),
    approvalWorkflow: workflow,
  };
}

async function markApprovalChecklistComplete(clientId: string) {
  const supabase = createAdminSupabase();
  const { data: checklist } = await supabase
    .from("workspace_onboarding_checklists")
    .select("id")
    .eq("client_id", clientId)
    .maybeSingle();
  const checklistId = text((checklist as Row | null)?.id);
  if (!checklistId) return;
  await supabase
    .from("workspace_onboarding_checklist_items")
    .update({ completed: true, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("checklist_id", checklistId)
    .eq("item_key", "configure_approval_workflow");
}

export async function getApprovalWorkflowDashboard() {
  const workspace = await resolveCustomerWorkspaceContext();
  const { data, error } = await createAdminSupabase()
    .from("workspace_settings")
    .select("dashboard_config")
    .eq("client_id", workspace.clientId)
    .maybeSingle();
  if (error) throw error;
  const dashboardConfig = objectValue((data as Row | null)?.dashboard_config);
  return {
    workspace,
    config: normalizeConfig(dashboardConfig.approvalWorkflow),
    reviewerRoles: reviewerRoleOptions(),
  };
}

export async function saveApprovalWorkflow(input: {
  mode?: string | null;
  reviewerRoles?: unknown;
  requireRejectionReason?: boolean | null;
  requireCorrectionInstructions?: boolean | null;
  allowApprovalComments?: boolean | null;
}) {
  const workspace = await resolveCustomerWorkspaceContext();
  if (!hasWorkspaceSettingsPermission(workspace.permissions)) {
    throw Object.assign(new Error("Approval workflow settings require workspace settings permission."), { status: 403 });
  }
  const supabase = createAdminSupabase();
  const { data: current, error: readError } = await supabase
    .from("workspace_settings")
    .select("dashboard_config")
    .eq("client_id", workspace.clientId)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) throw Object.assign(new Error("Workspace settings were not found."), { status: 404 });

  const existing = normalizeConfig(objectValue((current as Row).dashboard_config).approvalWorkflow);
  const config: ApprovalWorkflowConfig = {
    ...existing,
    mode: input.mode === "automatic" ? "automatic" : "customer_review",
    reviewerRoles: normalizeReviewerRoles(input.reviewerRoles),
    requireRejectionReason: input.requireRejectionReason !== false,
    requireCorrectionInstructions: input.requireCorrectionInstructions !== false,
    allowApprovalComments: input.allowApprovalComments !== false,
    configured: true,
    configuredAt: new Date().toISOString(),
    configuredBy: workspace.userId,
  };
  const { error } = await supabase
    .from("workspace_settings")
    .update({
      dashboard_config: mergeDashboardConfig((current as Row).dashboard_config, config),
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", workspace.clientId);
  if (error) throw error;
  await markApprovalChecklistComplete(workspace.clientId);
  return {
    config,
    reviewerRoles: reviewerRoleOptions(),
  };
}

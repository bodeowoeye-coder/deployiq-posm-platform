import type { WorkspaceAccessDecision, WorkspaceAccessRoleKey } from "./workspaceAccessPolicy.ts";

const OPERATIONAL_ROLE_KEYS = new Set<WorkspaceAccessRoleKey>([
  "workspace_administrator",
  "project_manager",
  "supervisor",
  "agency_manager",
  "field_coordinator",
  "client_viewer",
]);

export type OperationalBuildDenial =
  | "authentication_required"
  | "workspace_authority_unavailable"
  | "customer_admin_workspace"
  | "historical_role_ambiguous"
  | "operational_role_not_eligible"
  | "projects_view_missing"
  | "no_authorized_build_projects";

export function hasBuildProjectReadPermission(permissions: readonly string[]) {
  return permissions.includes("projects.view") || permissions.includes("projects.manage");
}

export function operationalBuildEligibility(decision: WorkspaceAccessDecision) {
  if (!decision.allowed) {
    return {
      eligible: false as const,
      code: decision.reason === "identity_missing"
        ? "authentication_required" as const
        : "workspace_authority_unavailable" as const,
    };
  }
  if (decision.roleKey === "customer_admin" || decision.roleKey === "workspace_owner") {
    return { eligible: false as const, code: "customer_admin_workspace" as const };
  }
  if (decision.roleKey === "workspace_manager" || decision.supervisorRoleAmbiguous) {
    return { eligible: false as const, code: "historical_role_ambiguous" as const };
  }
  if (!OPERATIONAL_ROLE_KEYS.has(decision.roleKey)) {
    return { eligible: false as const, code: "operational_role_not_eligible" as const };
  }
  if (!hasBuildProjectReadPermission(decision.permissions)) {
    return { eligible: false as const, code: "projects_view_missing" as const };
  }
  if (decision.productComposition.buildProjectCount < 1 || decision.authorizedProjectIds.length < 1) {
    return { eligible: false as const, code: "no_authorized_build_projects" as const };
  }
  return { eligible: true as const, decision };
}

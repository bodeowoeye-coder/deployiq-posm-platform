import { resolveWorkspaceComposition, type WorkspaceComposition } from "./composition.ts";

export const WORKSPACE_ACCESS_ROLE_KEYS = [
  "customer_admin",
  "workspace_owner",
  "workspace_manager",
  "workspace_administrator",
  "project_manager",
  "supervisor",
  "agency_manager",
  "field_coordinator",
  "client_viewer",
  "installer",
  "installer_field_agent",
] as const;

export type WorkspaceAccessRoleKey = (typeof WORKSPACE_ACCESS_ROLE_KEYS)[number];
export type WorkspaceAccessAppRole = "client" | "installer";
export type ProjectVisibilityClassification =
  | "tenant_wide_administration"
  | "explicit_project_assignment"
  | "assigned_or_supervised_build_work"
  | "assigned_work"
  | "explicit_read_only_grant"
  | "installer_retail_assignment";

export type WorkspaceAccessProject = {
  id: string;
  clientId: string;
  projectType: string;
  archivedAt?: string | null;
};

export type WorkspaceActivityAssignment = {
  projectId: string;
  ownerUserId?: string | null;
  supervisorUserId?: string | null;
  archivedAt?: string | null;
};

export type WorkspaceAccessPolicyInput = {
  userId: string;
  appRole: WorkspaceAccessAppRole;
  authenticatedClientId: string | null;
  profileStatus: string | null;
  clientStatus: string | null;
  membership: {
    userId: string;
    clientId: string;
    roleKey: string;
    status: string;
  } | null;
  role: {
    roleKey: string;
    appRole: WorkspaceAccessAppRole;
    status: string;
    permissions: string[];
  } | null;
  projects: WorkspaceAccessProject[];
  explicitlyAssignedProjectIds?: string[];
  installerAssignedProjectIds?: string[];
  activityAssignments?: WorkspaceActivityAssignment[];
};

export type WorkspaceAccessDenialReason =
  | "identity_missing"
  | "authority_unavailable"
  | "profile_inactive"
  | "workspace_inactive"
  | "membership_missing"
  | "membership_inactive"
  | "membership_identity_mismatch"
  | "membership_tenant_mismatch"
  | "role_missing"
  | "role_inactive"
  | "role_mismatch"
  | "role_app_mismatch"
  | "role_unsupported";

export type WorkspaceAccessDecision =
  | { allowed: false; reason: WorkspaceAccessDenialReason }
  | {
      allowed: true;
      userId: string;
      clientId: string;
      appRole: WorkspaceAccessAppRole;
      roleKey: WorkspaceAccessRoleKey;
      permissions: string[];
      authorizedProjectIds: string[];
      productComposition: WorkspaceComposition;
      visibility: ProjectVisibilityClassification;
      readOnly: boolean;
      supervisorRoleAmbiguous: boolean;
    };

const ADMINISTRATIVE_ROLES = new Set<WorkspaceAccessRoleKey>([
  "customer_admin",
  "workspace_owner",
  "workspace_manager",
  "workspace_administrator",
]);
const BUILD_PROJECT_TYPES = new Set(["Construction", "Real Estate", "Facility Management"]);

const normalized = (value: string | null | undefined) => value?.trim() ?? "";
const active = (value: string | null | undefined) => normalized(value).toLowerCase() === "active";
const unique = (values: string[]) => [...new Set(values.map(normalized).filter(Boolean))].sort();

function canonicalRoleKey(value: string): WorkspaceAccessRoleKey | null {
  const key = normalized(value) as WorkspaceAccessRoleKey;
  return (WORKSPACE_ACCESS_ROLE_KEYS as readonly string[]).includes(key) ? key : null;
}

function projectKind(projectType: string): "retail" | "build" | null {
  if (projectType === "Retail Deployment") return "retail";
  if (BUILD_PROJECT_TYPES.has(projectType)) return "build";
  return null;
}

/**
 * Pure policy only. It determines visibility, not Build execution authority.
 * Activity lifecycle, review, evidence and exception services must still apply
 * their existing owner/supervisor/role and ancestry checks.
 */
export function assessWorkspaceAccess(input: WorkspaceAccessPolicyInput): WorkspaceAccessDecision {
  const userId = normalized(input.userId);
  const clientId = normalized(input.authenticatedClientId);
  if (!userId || !clientId) return { allowed: false, reason: "identity_missing" };
  if (!active(input.profileStatus)) return { allowed: false, reason: "profile_inactive" };
  if (!active(input.clientStatus)) return { allowed: false, reason: "workspace_inactive" };
  if (!input.membership) return { allowed: false, reason: "membership_missing" };
  if (!active(input.membership.status)) return { allowed: false, reason: "membership_inactive" };
  if (normalized(input.membership.userId) !== userId) return { allowed: false, reason: "membership_identity_mismatch" };
  if (normalized(input.membership.clientId) !== clientId) return { allowed: false, reason: "membership_tenant_mismatch" };
  if (!input.role) return { allowed: false, reason: "role_missing" };
  if (!active(input.role.status)) return { allowed: false, reason: "role_inactive" };

  const roleKey = canonicalRoleKey(input.membership.roleKey);
  if (!roleKey) return { allowed: false, reason: "role_unsupported" };
  if (normalized(input.role.roleKey) !== roleKey) return { allowed: false, reason: "role_mismatch" };
  if (input.role.appRole !== input.appRole) return { allowed: false, reason: "role_app_mismatch" };

  const activeTenantProjects = input.projects.filter((project) => (
    normalized(project.id)
    && normalized(project.clientId) === clientId
    && !normalized(project.archivedAt)
    && projectKind(project.projectType)
  ));
  const projectById = new Map(activeTenantProjects.map((project) => [project.id, project]));
  const explicitIds = unique(input.explicitlyAssignedProjectIds ?? []).filter((id) => projectById.has(id));
  const buildProjectIds = new Set(activeTenantProjects
    .filter((project) => projectKind(project.projectType) === "build")
    .map((project) => project.id));
  const explicitlyAssignedBuildProjectIds = explicitIds.filter((id) => buildProjectIds.has(id));
  const installerIds = unique(input.installerAssignedProjectIds ?? []).filter((id) => projectById.get(id)?.projectType === "Retail Deployment");
  const liveAssignments = (input.activityAssignments ?? []).filter((assignment) => !normalized(assignment.archivedAt) && projectById.has(assignment.projectId));

  let visibility: ProjectVisibilityClassification;
  let authorizedProjectIds: string[];
  if (ADMINISTRATIVE_ROLES.has(roleKey)) {
    visibility = "tenant_wide_administration";
    authorizedProjectIds = activeTenantProjects.map((project) => project.id);
  } else if (roleKey === "project_manager") {
    visibility = "explicit_project_assignment";
    authorizedProjectIds = explicitIds;
  } else if (roleKey === "supervisor") {
    visibility = "assigned_or_supervised_build_work";
    authorizedProjectIds = [
      ...explicitlyAssignedBuildProjectIds,
      ...liveAssignments
        .filter((assignment) => buildProjectIds.has(assignment.projectId) && normalized(assignment.supervisorUserId) === userId)
        .map((assignment) => assignment.projectId),
    ];
  } else if (roleKey === "agency_manager" || roleKey === "field_coordinator") {
    visibility = "assigned_work";
    authorizedProjectIds = [
      ...explicitIds,
      ...liveAssignments
        .filter((assignment) => normalized(assignment.ownerUserId) === userId)
        .map((assignment) => assignment.projectId),
    ];
  } else if (roleKey === "client_viewer") {
    visibility = "explicit_read_only_grant";
    authorizedProjectIds = explicitIds;
  } else {
    // Existing installer authority is Retail-specific. Build assignments do not
    // become visible until a later increment establishes applicable authority.
    visibility = "installer_retail_assignment";
    authorizedProjectIds = installerIds;
  }

  authorizedProjectIds = unique(authorizedProjectIds);
  const accessibleProjects = authorizedProjectIds.map((id) => projectById.get(id)).filter((project): project is WorkspaceAccessProject => Boolean(project));
  const productComposition = resolveWorkspaceComposition({
    projects: accessibleProjects.map((project) => ({ project_type: project.projectType, archived_at: null })),
  });

  return {
    allowed: true,
    userId,
    clientId,
    appRole: input.appRole,
    roleKey,
    permissions: unique(input.role.permissions),
    authorizedProjectIds,
    productComposition,
    visibility,
    readOnly: roleKey === "client_viewer",
    // Historical workspace_manager records cannot reveal whether the UI role
    // originally selected was Administrator or Supervisor.
    supervisorRoleAmbiguous: roleKey === "workspace_manager",
  };
}

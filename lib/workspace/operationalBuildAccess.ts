import "server-only";

import { AccessControlError, getAuthenticatedUserContext } from "@/lib/accessControl";
import type { ProjectAccessRegistry } from "@/lib/core/auth";
import type { DeployIQPermission } from "@/lib/core/permissions";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { resolveWorkspaceAccess, resolveWorkspaceAccessForIdentity } from "@/lib/workspace/workspaceAccess";
import type { WorkspaceAccessRoleKey } from "@/lib/workspace/workspaceAccessPolicy";
import { hasBuildProjectReadPermission, operationalBuildEligibility, type OperationalBuildDenial } from "@/lib/workspace/operationalBuildAccessPolicy";

const BUILD_PROJECT_TYPES = new Set(["Construction", "Real Estate", "Facility Management"]);
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export type OperationalBuildProject = {
  id: string;
  name: string;
  code: string | null;
  projectType: string;
  status: string;
};

export type OperationalBuildAccess = {
  userId: string;
  clientId: string;
  roleKey: WorkspaceAccessRoleKey;
  permissions: string[];
  readOnly: boolean;
  authorizedProjectIds: string[];
  projects: OperationalBuildProject[];
};

export class OperationalBuildAccessError extends AccessControlError {
  code: OperationalBuildDenial;

  constructor(code: OperationalBuildDenial, message: string, status = 403) {
    super(message, status);
    this.name = "OperationalBuildAccessError";
    this.code = code;
  }
}

function projectPermissions(permissions: readonly string[]): DeployIQPermission[] {
  const result: DeployIQPermission[] = [];
  if (hasBuildProjectReadPermission(permissions)) result.push("projects:read");
  if (permissions.includes("projects.manage")) result.push("projects:write");
  return result;
}

function denial(code: OperationalBuildDenial) {
  if (code === "authentication_required") return new OperationalBuildAccessError(code, "Authentication is required.", 401);
  if (code === "customer_admin_workspace") return new OperationalBuildAccessError(code, "Use the Customer Admin Workspace for this account.", 403);
  if (code === "historical_role_ambiguous") return new OperationalBuildAccessError(code, "This historical workspace role requires review before operational Build access can be granted.", 403);
  if (code === "no_authorized_build_projects") return new OperationalBuildAccessError(code, "No authorized Build projects are available.", 403);
  return new OperationalBuildAccessError(code, "Operational Build access is unavailable.", 403);
}

export async function resolveOperationalBuildAccess(): Promise<OperationalBuildAccess> {
  const decision = await resolveWorkspaceAccess();
  const eligibility = operationalBuildEligibility(decision);
  if (!eligibility.eligible) throw denial(eligibility.code);

  const { decision: allowed } = eligibility;
  const { data, error } = await createAdminSupabase()
    .from("projects")
    .select("id,project_name,project_code,project_type,status,client_id,archived_at")
    .eq("client_id", allowed.clientId)
    .in("id", allowed.authorizedProjectIds)
    .is("archived_at", null)
    .order("project_name", { ascending: true });
  if (error) throw new OperationalBuildAccessError("workspace_authority_unavailable", "Authorized Build projects could not be resolved.", 500);

  const projects = (data ?? []).filter((project) => (
    text(project.client_id) === allowed.clientId
    && BUILD_PROJECT_TYPES.has(text(project.project_type))
    && allowed.authorizedProjectIds.includes(text(project.id))
  )).map((project) => ({
    id: text(project.id),
    name: text(project.project_name),
    code: text(project.project_code) || null,
    projectType: text(project.project_type),
    status: text(project.status),
  }));
  if (!projects.length) throw denial("no_authorized_build_projects");

  return {
    userId: allowed.userId,
    clientId: allowed.clientId,
    roleKey: allowed.roleKey,
    permissions: allowed.permissions,
    readOnly: allowed.readOnly,
    authorizedProjectIds: projects.map((project) => project.id),
    projects,
  };
}

export async function resolveBuildProjectAccessRegistry(request?: Request): Promise<ProjectAccessRegistry> {
  const authenticated = await getAuthenticatedUserContext(request);
  if (authenticated.is_admin) {
    return {
      user_id: authenticated.user_id,
      email: authenticated.email,
      role: authenticated.role,
      client_id: authenticated.client_id,
      allowed_projects: authenticated.allowed_project_ids,
      is_admin: true,
      permissions: ["projects:read", "projects:write"],
    };
  }
  if (authenticated.role !== "client" || !authenticated.client_id) {
    throw new OperationalBuildAccessError("operational_role_not_eligible", "Build project access is unavailable.", 403);
  }

  const decision = await resolveWorkspaceAccessForIdentity({
    userId: authenticated.user_id,
    clientId: authenticated.client_id,
    appRole: "client",
  });
  if (!decision.allowed) throw denial(decision.reason === "identity_missing" ? "authentication_required" : "workspace_authority_unavailable");
  if (decision.roleKey === "workspace_manager" || decision.supervisorRoleAmbiguous) throw denial("historical_role_ambiguous");
  const customerAdministrator = decision.roleKey === "customer_admin" || decision.roleKey === "workspace_owner";
  if (!customerAdministrator && !hasBuildProjectReadPermission(decision.permissions)) throw denial("projects_view_missing");

  return {
    user_id: decision.userId,
    email: authenticated.email,
    role: authenticated.role,
    client_id: decision.clientId,
    allowed_projects: decision.authorizedProjectIds,
    is_admin: false,
    permissions: customerAdministrator ? ["projects:read", "projects:write"] : projectPermissions(decision.permissions),
  };
}

export async function resolveOperationalBuildDestination(input?: { userId: string; clientId: string }) {
  const decision = input
    ? await resolveWorkspaceAccessForIdentity({ userId: input.userId, clientId: input.clientId, appRole: "client" })
    : await resolveWorkspaceAccess();
  if (!decision.allowed) return null;
  if (decision.roleKey === "customer_admin" || decision.roleKey === "workspace_owner") return "/workspace/admin";
  const eligibility = operationalBuildEligibility(decision);
  return eligibility.eligible ? "/workspace/build" : null;
}

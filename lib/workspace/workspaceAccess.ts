import "server-only";

import { getCurrentUserContext } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import {
  assessWorkspaceAccess,
  type WorkspaceAccessDecision,
  type WorkspaceAccessProject,
  type WorkspaceAccessAppRole,
} from "@/lib/workspace/workspaceAccessPolicy";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const textArray = (value: unknown) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];

/**
 * Resolves authenticated workspace visibility from server-authoritative rows.
 * This adapter is intentionally not wired into login or existing route guards
 * during E1A.1.
 */
export async function resolveWorkspaceAccess(): Promise<WorkspaceAccessDecision> {
  const context = await getCurrentUserContext();
  const appRole = context?.role.role;
  const clientId = context?.role.client_id ?? null;
  if (!context || (appRole !== "client" && appRole !== "installer")) {
    return { allowed: false, reason: "identity_missing" };
  }

  const supabase = createAdminSupabase();
  const [clientResult, membershipResult, projectsResult, activitiesResult, installerResult] = await Promise.all([
    clientId ? supabase.from("clients").select("id,status").eq("id", clientId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    clientId ? supabase.from("workspace_memberships").select("user_id,client_id,role_id,role_key,status").eq("client_id", clientId).eq("user_id", context.user.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    clientId ? supabase.from("projects").select("id,client_id,project_type,archived_at").eq("client_id", clientId) : Promise.resolve({ data: [], error: null }),
    clientId ? supabase.from("build_runtime_activities").select("project_id,activity_owner_user_id,supervisor_user_id,archived_at").eq("client_id", clientId).or(`activity_owner_user_id.eq.${context.user.id},supervisor_user_id.eq.${context.user.id}`) : Promise.resolve({ data: [], error: null }),
    appRole === "installer" ? supabase.from("installers").select("assigned_project_ids").eq("user_id", context.user.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (clientResult.error || membershipResult.error || projectsResult.error || activitiesResult.error || installerResult.error) {
    return { allowed: false, reason: "authority_unavailable" };
  }
  const client = clientResult.data;
  const membership = membershipResult.data;
  const projects = projectsResult.data;
  const activities = activitiesResult.data;
  const installer = installerResult.data;

  const roleId = text(membership?.role_id);
  const [roleResult, permissionResult] = roleId
    ? await Promise.all([
        supabase.from("workspace_roles").select("role_key,app_role,status").eq("id", roleId).eq("client_id", clientId).maybeSingle(),
        supabase.from("workspace_role_permissions").select("permission").eq("role_id", roleId),
      ])
    : [{ data: null, error: null }, { data: [], error: null }];
  if (roleResult.error || permissionResult.error) return { allowed: false, reason: "authority_unavailable" };
  const role = roleResult.data;
  const permissionRows = permissionResult.data;

  return assessWorkspaceAccess({
    userId: context.user.id,
    appRole: appRole as WorkspaceAccessAppRole,
    authenticatedClientId: clientId,
    profileStatus: text(context.profile?.status) || null,
    clientStatus: text(client?.status) || null,
    membership: membership ? {
      userId: text(membership.user_id),
      clientId: text(membership.client_id),
      roleKey: text(membership.role_key),
      status: text(membership.status),
    } : null,
    role: role ? {
      roleKey: text(role.role_key),
      appRole: text(role.app_role) as WorkspaceAccessAppRole,
      status: text(role.status),
      permissions: (permissionRows ?? []).map((row) => text(row.permission)).filter(Boolean),
    } : null,
    projects: (projects ?? []).map((project): WorkspaceAccessProject => ({
      id: text(project.id),
      clientId: text(project.client_id),
      projectType: text(project.project_type),
      archivedAt: text(project.archived_at) || null,
    })),
    explicitlyAssignedProjectIds: textArray(context.profile?.assigned_project_ids),
    installerAssignedProjectIds: textArray(installer?.assigned_project_ids),
    activityAssignments: (activities ?? []).map((activity) => ({
      projectId: text(activity.project_id),
      ownerUserId: text(activity.activity_owner_user_id) || null,
      supervisorUserId: text(activity.supervisor_user_id) || null,
      archivedAt: text(activity.archived_at) || null,
    })),
  });
}

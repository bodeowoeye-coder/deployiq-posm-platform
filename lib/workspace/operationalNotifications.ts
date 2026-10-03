import "server-only";
import { AccessControlError, getAuthenticatedUserContext } from "@/lib/accessControl";
import { createAdminSupabase } from "@/lib/supabaseAdmin";

const FALLBACK_NOTIFICATION_ROLES = new Set([
  "customer_admin", "workspace_owner", "workspace_manager", "workspace_administrator",
  "project_manager", "agency_manager", "client_viewer", "supervisor", "field_coordinator",
]);
const ADMIN_ROLE_KEYS = new Set(["customer_admin", "workspace_owner"]);
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export type OperationalNotificationContext = {
  userId: string; email: string | null; clientId: string; roleKey: string; organisationName: string;
};

export async function resolveOperationalNotificationMembership(input: { userId: string; clientId: string }) {
  const supabase = createAdminSupabase();
  const { data: membership, error } = await supabase.from("workspace_memberships")
    .select("role_id,role_key,status").eq("user_id", input.userId).eq("client_id", input.clientId).eq("status", "active").maybeSingle();
  if (error || !membership) return null;
  const [{ data: profile }, { data: role }, { data: permissions }] = await Promise.all([
    supabase.from("user_profiles").select("status").eq("user_id", input.userId).maybeSingle(),
    membership.role_id ? supabase.from("workspace_roles").select("status,app_role").eq("id", membership.role_id).maybeSingle() : Promise.resolve({ data: null }),
    membership.role_id ? supabase.from("workspace_role_permissions").select("permission").eq("role_id", membership.role_id) : Promise.resolve({ data: [] }),
  ]);
  if (text(profile?.status) !== "Active") return null;
  if (role && text(role.status).toLowerCase() !== "active") return null;
  if (role && text(role.app_role || "client") !== "client") return null;
  const roleKey = text(membership.role_key);
  const permissionSet = new Set((permissions ?? []).map((row) => text(row.permission)));
  // Older provisioned roles may predate durable permission rows. The canonical
  // built-in role contract remains the fail-closed compatibility authority.
  const canViewNotifications = permissionSet.has("notifications.view") || permissionSet.has("notifications.manage")
    || FALLBACK_NOTIFICATION_ROLES.has(roleKey);
  return { roleKey, canViewNotifications, isCustomerAdministrator: ADMIN_ROLE_KEYS.has(roleKey) };
}

export async function getOperationalNotificationDestination(input: { userId: string; clientId: string | null | undefined }) {
  if (!input.clientId) return null;
  const membership = await resolveOperationalNotificationMembership({ userId: input.userId, clientId: input.clientId });
  if (!membership) return null;
  if (membership.isCustomerAdministrator) return "/workspace/admin";
  return membership.canViewNotifications ? "/workspace/notifications" : null;
}

export async function requireOperationalNotificationContext(): Promise<OperationalNotificationContext> {
  const auth = await getAuthenticatedUserContext();
  if (auth.role !== "client" || !auth.client_id) throw new AccessControlError("Unauthorized.", 403);
  const membership = await resolveOperationalNotificationMembership({ userId: auth.user_id, clientId: auth.client_id });
  if (!membership?.canViewNotifications || membership.isCustomerAdministrator) throw new AccessControlError("Notification access is unavailable.", 403);
  const { data: client } = await createAdminSupabase().from("clients").select("name,status").eq("id", auth.client_id).maybeSingle();
  if (!client || text(client.status).toLowerCase() !== "active") throw new AccessControlError("Notification access is unavailable.", 403);
  return { userId: auth.user_id, email: auth.email, clientId: auth.client_id, roleKey: membership.roleKey, organisationName: text(client.name) || "DeployIQ Workspace" };
}

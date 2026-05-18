import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type { AuditLog, ManagedUser, RoleRecord, UserProfile } from "@/lib/types";

export function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function cleanArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
    : [];
}

export async function requireAdminContext() {
  const { getCurrentUserContext } = await import("@/lib/auth");
  const context = await getCurrentUserContext();
  return context?.role.role === "admin" ? context : null;
}

export async function writeAuditLog({
  actorUserId,
  targetUserId,
  actionType,
  oldValue,
  newValue
}: {
  actorUserId: string | null;
  targetUserId: string | null;
  actionType: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
}) {
  const supabase = createAdminSupabase();
  await supabase.from("audit_logs").insert({
    actor_user_id: actorUserId,
    target_user_id: targetUserId,
    action_type: actionType,
    old_value: oldValue ?? null,
    new_value: newValue ?? null
  });
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const supabase = createAdminSupabase();
  const [{ data: authUsers }, { data: roles }, { data: profiles }] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase.from("user_roles").select("user_id, role, client_id"),
    supabase.from("user_profiles").select("*")
  ]);
  const roleById = new Map((roles ?? []).map((row) => [row.user_id, row as RoleRecord]));
  const profileById = new Map((profiles ?? []).map((row) => [row.user_id, row as UserProfile]));

  return authUsers.users
    .map((user) => {
      const role = roleById.get(user.id);
      if (!role) return null;
      const profile = profileById.get(user.id);
      return {
        user_id: user.id,
        email: user.email ?? profile?.email ?? "",
        full_name: profile?.full_name || user.user_metadata?.full_name || "",
        phone: profile?.phone ?? user.phone ?? null,
        role: role.role,
        client_id: role.client_id,
        agency_id: profile?.agency_id ?? null,
        assigned_project_ids: profile?.assigned_project_ids ?? [],
        assigned_regions: profile?.assigned_regions ?? [],
        assigned_states: profile?.assigned_states ?? [],
        status: profile?.status ?? "Active",
        created_at: profile?.created_at ?? user.created_at,
        last_sign_in_at: user.last_sign_in_at ?? null
      } satisfies ManagedUser;
    })
    .filter((user): user is ManagedUser => Boolean(user));
}

export async function listAuditLogs(): Promise<AuditLog[]> {
  const supabase = createAdminSupabase();
  const { data } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(100);
  return (data ?? []) as AuditLog[];
}

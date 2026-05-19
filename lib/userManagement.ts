import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type { AuditLog, ManagedUser, RoleRecord, UserProfile } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

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

function isSchemaCacheMiss(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "PGRST205" || message.includes("schema cache") || message.includes("could not find the table");
}

function dbErrorPayload(error: { code?: string; message?: string; details?: string; hint?: string } | null | undefined) {
  if (!error) return null;
  return {
    code: error.code ?? null,
    message: error.message ?? "Unknown database error",
    details: error.details ?? null,
    hint: error.hint ?? null
  };
}

async function pause(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function upsertUserProfileWithRetry(
  supabase: SupabaseClient,
  profilePayload: {
    user_id: string;
    full_name: string;
    email: string;
    phone: string | null;
    agency_id: string | null;
    assigned_project_ids: string[];
    assigned_regions: string[];
    assigned_states: string[];
    status: string;
  }
) {
  const writeProfile = () =>
    supabase
      .schema("public")
      .from("user_profiles")
      .upsert(profilePayload, { onConflict: "user_id" })
      .select("user_id")
      .single();

  let result = await writeProfile();
  if (result.error && isSchemaCacheMiss(result.error)) {
    console.warn("[user-management] user_profiles schema cache miss, retrying profile write", dbErrorPayload(result.error));
    await pause(700);
    result = await writeProfile();
  }
  return result;
}

export { dbErrorPayload, isSchemaCacheMiss };

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const supabase = createAdminSupabase();
  const [{ data: authUsers }, { data: roles }, profilesResult] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase.schema("public").from("user_roles").select("user_id, role, client_id"),
    supabase.schema("public").from("user_profiles").select("*")
  ]);
  if (profilesResult.error) {
    console.warn("[user-management] could not read public.user_profiles", dbErrorPayload(profilesResult.error));
  }
  const roleById = new Map((roles ?? []).map((row) => [row.user_id, row as RoleRecord]));
  const profileById = new Map((profilesResult.data ?? []).map((row) => [row.user_id, row as UserProfile]));

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

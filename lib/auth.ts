import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createUserSupabase } from "@/lib/supabaseUser";
import type { Client, RoleRecord, UserRole } from "@/lib/types";

export async function getCurrentAccessToken() {
  return cookies().get("sb-access-token")?.value ?? null;
}

export async function getCurrentUserContext() {
  const accessToken = await getCurrentAccessToken();
  if (!accessToken) return null;

  const userClient = createUserSupabase(accessToken);
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return null;

  const { data: role } = await userClient
    .from("user_roles")
    .select("user_id, role, client_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!role) return null;

  let client: Client | null = null;
  if (role.client_id) {
    const { data: clientRow } = await userClient
      .from("clients")
      .select("id, name, can_review")
      .eq("id", role.client_id)
      .maybeSingle();
    client = (clientRow as Client | null) ?? null;
  }

  return {
    user: data.user,
    role: role as RoleRecord,
    client
  };
}

export async function requireRole(allowedRoles: UserRole[]) {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  if (!allowedRoles.includes(context.role.role)) {
    redirect(context.role.role === "client" ? "/client" : "/submit");
  }

  return context;
}

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { createUserSupabase } from "@/lib/supabaseUser";
import type { Client, RoleRecord, UserRole } from "@/lib/types";

export async function getCurrentAccessToken() {
  return cookies().get("sb-access-token")?.value ?? null;
}

export async function getCurrentUserContext() {
  console.info("[auth-context] entered");

  try {
    const accessToken = await getCurrentAccessToken();
    if (!accessToken) return null;

    const userClient = createUserSupabase(accessToken);
    console.info("[auth-context] before auth.getUser");
    const { data, error } = await userClient.auth.getUser();
    console.info("[auth-context] after auth.getUser", {
      hasUser: Boolean(data.user),
      hasError: Boolean(error)
    });
    if (error || !data.user) {
      console.error("[auth-context] auth.getUser failed", {
        message: error?.message ?? "No user returned"
      });
      return null;
    }

    console.info("[auth-context] user resolved", {
      userId: data.user.id
    });

    console.info("[auth-context] before role lookup");
    const { data: userRole, error: userRoleError } = await userClient
      .from("user_roles")
      .select("user_id, role, client_id")
      .eq("user_id", data.user.id)
      .maybeSingle();
    console.info("[auth-context] role lookup result", {
      found: Boolean(userRole),
      hasError: Boolean(userRoleError)
    });

    if (userRoleError) {
      console.error("[auth-context] user-scoped role lookup failed", {
        message: userRoleError.message
      });
    }

    let role = userRole;
    console.info("[auth-context] user-scoped role row", {
      found: Boolean(role)
    });

    if (!role) {
      try {
        const admin = createAdminSupabase();
        const { data: adminRole, error: adminRoleError } = await admin
          .from("user_roles")
          .select("user_id, role, client_id")
          .eq("user_id", data.user.id)
          .maybeSingle();

        if (adminRoleError) {
          console.error("[auth-context] admin fallback role lookup failed", {
            message: adminRoleError.message
          });
        }

        role = adminRole;
        console.info("[auth-context] fallback role row", {
          found: Boolean(role)
        });
      } catch (adminFallbackError) {
        console.error("[auth-context] admin fallback unavailable", {
          message: adminFallbackError instanceof Error ? adminFallbackError.message : "Unknown error"
        });
      }
    }

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
  } catch (error) {
    console.error("[auth-context] caught exception", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return null;
  }
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

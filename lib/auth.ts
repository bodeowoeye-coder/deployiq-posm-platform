import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { createUserSupabase } from "@/lib/supabaseUser";
import type { Client, RoleRecord, UserRole } from "@/lib/types";

export async function getCurrentAccessToken() {
  const cookieStore = cookies();
  return cookieStore.getAll().find((cookie) => cookie.name === "deployiq-access-token")?.value ?? null;
}

export async function getCurrentAccessTokenCandidates() {
  const cookieStore = cookies();
  const deployiqAccessToken = cookieStore.getAll().find((cookie) => cookie.name === "deployiq-access-token")?.value ?? null;
  return deployiqAccessToken ? [{ name: "deployiq-access-token", value: deployiqAccessToken }] : [];
}

export async function getCurrentRefreshToken() {
  const cookieStore = cookies();
  return cookieStore.getAll().find((cookie) => cookie.name === "deployiq-refresh-token")?.value ?? null;
}

export function inspectAuthCookiePresence() {
  const cookieStore = cookies();
  const allCookies = cookieStore.getAll();
  return {
    names: allCookies.map((cookie) => cookie.name),
    deployiqAccessToken: allCookies.some((cookie) => cookie.name === "deployiq-access-token" && Boolean(cookie.value)),
    deployiqRefreshToken: allCookies.some((cookie) => cookie.name === "deployiq-refresh-token" && Boolean(cookie.value)),
    legacySbAccessToken: allCookies.some((cookie) => cookie.name === "sb-access-token" && Boolean(cookie.value)),
    legacySbRefreshToken: allCookies.some((cookie) => cookie.name === "sb-refresh-token" && Boolean(cookie.value))
  };
}

export async function getCurrentUserContext() {
  try {
    const accessTokens = await getCurrentAccessTokenCandidates();
    if (accessTokens.length === 0) {
      console.info("[auth-context] missing access token", inspectAuthCookiePresence());
      return null;
    }

    let verified:
      | {
          tokenName: string;
          accessToken: string;
          user: NonNullable<Awaited<ReturnType<ReturnType<typeof createUserSupabase>["auth"]["getUser"]>>["data"]["user"]>;
          userClient: ReturnType<typeof createUserSupabase>;
        }
      | null = null;

    for (const candidate of accessTokens) {
      const userClient = createUserSupabase(candidate.value);
      const { data, error } = await userClient.auth.getUser(candidate.value);
      if (error || !data.user) {
        console.error("[auth-context] auth.getUser failed", {
          tokenName: candidate.name,
          message: error?.message ?? "No user returned",
          cookies: inspectAuthCookiePresence()
        });
        continue;
      }
      verified = { tokenName: candidate.name, accessToken: candidate.value, user: data.user, userClient };
      break;
    }

    if (!verified) {
      console.error("[auth-context] no access token verified", inspectAuthCookiePresence());
      return null;
    }

    console.info("[auth-context] token verified", {
      tokenName: verified.tokenName,
      userId: verified.user.id,
      email: verified.user.email ?? null
    });

    const { data: userRole, error: userRoleError } = await verified.userClient
      .from("user_roles")
      .select("user_id, role, client_id")
      .eq("user_id", verified.user.id)
      .maybeSingle();

    if (userRoleError) {
      console.error("[auth-context] user-scoped role lookup failed", {
        message: userRoleError.message
      });
    }

    let role = userRole;

    if (!role) {
      try {
        const admin = createAdminSupabase();
        const { data: adminRole, error: adminRoleError } = await admin
          .from("user_roles")
          .select("user_id, role, client_id")
          .eq("user_id", verified.user.id)
          .maybeSingle();

        if (adminRoleError) {
          console.error("[auth-context] admin fallback role lookup failed", {
            message: adminRoleError.message
          });
        }

        role = adminRole;
      } catch (adminFallbackError) {
        console.error("[auth-context] admin fallback unavailable", {
          message: adminFallbackError instanceof Error ? adminFallbackError.message : "Unknown error"
        });
      }
    }

    if (!role) return null;

    console.info("[auth-context] resolved user", {
      userId: verified.user.id,
      email: verified.user.email ?? null,
      role: role.role
    });

    let client: Client | null = null;
    if (role.client_id) {
      const { data: clientRow } = await verified.userClient
        .from("clients")
        .select("id, name, can_review")
        .eq("id", role.client_id)
        .maybeSingle();
      client = (clientRow as Client | null) ?? null;
    }

    return {
      user: verified.user,
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
    const requestedPath = allowedRoles.includes("admin")
      ? "/admin"
      : allowedRoles.includes("client")
        ? "/client"
        : allowedRoles.includes("installer")
          ? "/submit"
          : "/portal";
    redirect(`/login?returnTo=${encodeURIComponent(requestedPath)}`);
  }

  if (!allowedRoles.includes(context.role.role)) {
    redirect(context.role.role === "client" ? "/client" : "/submit");
  }

  return context;
}

export function defaultRouteForRole(role: UserRole) {
  if (role === "admin") return "/admin";
  if (role === "client") return "/client";
  return "/submit";
}

export function isAllowedReturnTo(role: UserRole, returnTo: string | null | undefined) {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) return false;
  if (returnTo === "/admin") return role === "admin";
  if (returnTo === "/client") return role === "client";
  if (returnTo === "/submit") return role === "installer" || role === "admin";
  if (returnTo === "/installer/history") return role === "installer";
  return false;
}

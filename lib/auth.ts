import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { createUserSupabase } from "@/lib/supabaseUser";
import { dbErrorPayload } from "@/lib/userManagement";
import type { Client, RoleRecord, UserRole } from "@/lib/types";

const VALID_ROLES: UserRole[] = ["admin", "client", "installer"];

async function ensureUserProfile(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }) {
  if (!user.email) return;

  try {
    const adminSupabase = createAdminSupabase();
    const { data: existingProfile, error: profileLookupError } = await adminSupabase
      .schema("public")
      .from("user_profiles")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileLookupError) {
      console.error("[auth-context] profile lookup failed", dbErrorPayload(profileLookupError));
      return;
    }

    if (existingProfile?.user_id) return;

    const metadataFullName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
    const { error: profileCreateError } = await adminSupabase.schema("public").from("user_profiles").insert({
      user_id: user.id,
      email: user.email.toLowerCase(),
      full_name: metadataFullName,
      status: "Active"
    });

    if (profileCreateError) {
      console.error("[auth-context] profile auto-create failed", dbErrorPayload(profileCreateError));
      return;
    }
  } catch (error) {
    console.error("[auth-context] profile auto-create threw", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

export async function getCurrentAccessToken() {
  const cookieStore = cookies();
  return cookieStore.getAll().find((cookie) => cookie.name === "deployiq-access-token")?.value ?? null;
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
    deployiqRefreshToken: allCookies.some((cookie) => cookie.name === "deployiq-refresh-token" && Boolean(cookie.value))
  };
}

export async function getCurrentUserContext() {
  try {
    const accessToken = await getCurrentAccessToken();
    if (!accessToken) {
      return null;
    }

    const userClient = createUserSupabase(accessToken);

    const { data, error } = await userClient.auth.getUser(accessToken);
    if (error || !data.user) {
      console.error("[auth-context] auth.getUser failed", {
        message: error?.message ?? "No user returned",
        cookies: inspectAuthCookiePresence(),
        failureStage: "auth.getUser"
      });
      return null;
    }
    console.info("[auth-context] auth user resolved", {
      userId: data.user.id,
      email: data.user.email ?? null
    });

    const { data: userRole, error: userRoleError } = await userClient
      .from("user_roles")
      .select("user_id, role, client_id")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (userRoleError) {
      console.error("[auth-context] user-scoped role lookup failed", dbErrorPayload(userRoleError));
    }
    console.info("[auth-context] user-scoped role lookup result", {
      userId: data.user.id,
      found: Boolean(userRole),
      role: userRole?.role ?? null,
      clientId: userRole?.client_id ?? null
    });

    let role = userRole as RoleRecord | null;

    if (!role) {
      try {
        const adminSupabase = createAdminSupabase();
        const { data: fallbackRole, error: fallbackRoleError } = await adminSupabase
          .schema("public")
          .from("user_roles")
          .select("user_id, role, client_id")
          .eq("user_id", data.user.id)
          .maybeSingle();

        if (fallbackRoleError) {
          console.error("[auth-context] service role lookup failed", dbErrorPayload(fallbackRoleError));
        }
        console.info("[auth-context] service role fallback result", {
          userId: data.user.id,
          found: Boolean(fallbackRole),
          role: fallbackRole?.role ?? null,
          clientId: fallbackRole?.client_id ?? null
        });

        role = (fallbackRole as RoleRecord | null) ?? null;
      } catch (err) {
        console.error("[auth-context] service role fallback threw", {
          error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
          failureStage: "service_role_user_roles"
        });
      }
    }

    if (!role) {
      console.error("[auth-context] role lookup returned no record", {
        userId: data.user.id,
        email: data.user.email ?? null,
        failureStage: "role_not_found"
      });
      return null;
    }

    if (!VALID_ROLES.includes(role.role)) {
      console.error("[auth-context] invalid role value", {
        userId: data.user.id,
        email: data.user.email ?? null,
        role: role.role,
        failureStage: "invalid_role"
      });
      return null;
    }

    await ensureUserProfile(data.user);

    let client: Client | null = null;
    let profile: Record<string, unknown> | null = null;
    if (role.client_id) {
      console.info("[auth-context] client lookup started", {
        userId: data.user.id,
        email: data.user.email ?? null,
        clientId: role.client_id,
        source: "user-scoped"
      });
      const { data: clientRow, error: clientRowError } = await userClient
        .from("clients")
        .select("id, name")
        .eq("id", role.client_id)
        .maybeSingle();
      if (clientRowError) {
        console.error("[auth-context] client lookup failed", dbErrorPayload(clientRowError));
      }
      client = (clientRow as Client | null) ?? null;

      console.info("[auth-context] user-scoped client lookup result", {
        userId: data.user.id,
        email: data.user.email ?? null,
        clientId: role.client_id,
        found: Boolean(client),
        client: client ? { id: client.id, name: client.name } : null
      });

      if (!client) {
        try {
          const adminSupabase = createAdminSupabase();
          const { data: fallbackClient, error: fallbackClientError } = await adminSupabase
            .schema("public")
            .from("clients")
            .select("id, name")
            .eq("id", role.client_id)
            .maybeSingle();

          if (fallbackClientError) {
            console.error("[auth-context] service client lookup failed", dbErrorPayload(fallbackClientError));
          }

          client = (fallbackClient as Client | null) ?? null;
          console.info("[auth-context] service client lookup result", {
            userId: data.user.id,
            email: data.user.email ?? null,
            clientId: role.client_id,
            found: Boolean(client),
            client: client ? { id: client.id, name: client.name } : null
          });
        } catch (err) {
          console.error("[auth-context] service client fallback threw", {
            userId: data.user.id,
            email: data.user.email ?? null,
            clientId: role.client_id,
            error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
            failureStage: "service_role_clients"
          });
        }
      }
    }

    try {
      const adminSupabase = createAdminSupabase();
      const { data: profileRow, error: profileError } = await adminSupabase
        .schema("public")
        .from("user_profiles")
        .select("user_id, full_name, email, phone, agency_id, assigned_project_ids, assigned_regions, assigned_states, status")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (profileError) {
        console.error("[auth-context] profile lookup failed (service)", dbErrorPayload(profileError));
      }
      profile = (profileRow as Record<string, unknown> | null) ?? null;
    } catch (err) {
      console.error("[auth-context] service profile lookup threw", {
        error: err instanceof Error ? { message: err.message, stack: err.stack } : err
      });
    }

    console.info("[auth-context] final context result", {
      userId: data.user.id,
      email: data.user.email ?? null,
      role: role.role,
      clientId: role.client_id,
      clientFound: Boolean(client),
      client: client ? { id: client.id, name: client.name } : null
    });

    return {
      user: data.user,
      role: role as RoleRecord,
      client,
      profile
    };
  } catch (error) {
    console.error("[auth-context] caught exception", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return null;
  }
}

export async function requireRole(allowedRoles: UserRole[], requestedPath?: string) {
  const context = await getCurrentUserContext();

  if (!context) {
    const fallbackPath = allowedRoles.includes("admin")
      ? "/admin"
      : allowedRoles.includes("client")
        ? "/client"
        : allowedRoles.includes("installer")
          ? "/submit"
          : "/portal";
    redirect(`/login?returnTo=${encodeURIComponent(requestedPath ?? fallbackPath)}`);
  }

  if (!allowedRoles.includes(context.role.role)) {
    redirect(defaultRouteForRole(context.role.role));
  }

  return context;
}

export function defaultRouteForRole(role: UserRole) {
  if (role === "admin") return "/admin";
  if (role === "client") return "/client";
  return "/submit";
}

function normalizeReturnTo(returnTo: string) {
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return null;

  try {
    const url = new URL(returnTo, "http://localhost");
    return url.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function isAllowedReturnTo(role: UserRole, returnTo: string | null | undefined) {
  const normalized = returnTo ? normalizeReturnTo(returnTo) : null;
  if (!normalized) return false;

  if (normalized === "/admin" || normalized === "/admin/reports" || normalized === "/admin/submissions") return role === "admin";
  if (normalized === "/client") return role === "client";
  if (normalized === "/submit") return role === "installer";
  if (normalized === "/installer/history") return role === "installer";
  if (normalized === "/portal") return true;
  return false;
}

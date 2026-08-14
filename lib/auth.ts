import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { createUserSupabase } from "@/lib/supabaseUser";
import { dbErrorPayload } from "@/lib/userManagement";
import type { Client, RoleRecord, UserRole } from "@/lib/types";

const VALID_ROLES: UserRole[] = ["admin", "client", "installer"];

export type AccountSecurityState = {
  passwordMethod: string | null;
  passwordChangeRequired: boolean;
  firstLoginCompleted: boolean;
};

export function readAccountSecurityState(user: { app_metadata?: Record<string, unknown> | null }): AccountSecurityState {
  return {
    passwordMethod: typeof user.app_metadata?.password_method === "string" ? user.app_metadata.password_method : null,
    passwordChangeRequired: user.app_metadata?.password_change_required === true,
    firstLoginCompleted: user.app_metadata?.first_login_completed === true,
  };
}

export async function getAuthoritativeAccountSecurityState(userId: string): Promise<AccountSecurityState> {
  const { data, error } = await createAdminSupabase().auth.admin.getUserById(userId);
  if (error || !data.user) {
    console.error("[auth-security] authoritative auth user lookup failed", {
      userId,
      message: error?.message ?? "No user returned",
    });
    throw error ?? new Error("Authoritative auth user lookup failed.");
  }
  return readAccountSecurityState(data.user);
}

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

export type CurrentUserContext = {
  user: User;
  role: RoleRecord;
  client: Client | null;
  profile: Record<string, unknown> | null;
};

export type CurrentUserContextResolution =
  | { status: "resolved"; context: CurrentUserContext; step: "Customer workspace context"; result: "OK" }
  | { status: "missing_session"; context: null; step: "Authenticated user"; result: "NO_ACCESS_TOKEN" }
  | { status: "expired_session"; context: null; step: "Authenticated user"; result: "EXPIRED_ACCESS_TOKEN"; message: string }
  | { status: "failed"; context: null; step: string; result: string; userId?: string | null; email?: string | null; clientId?: string | null; role?: string | null };

function authContextDiagnostic(input: {
  step: string;
  result: string;
  userId?: string | null;
  email?: string | null;
  sessionRole?: string | null;
  clientId?: string | null;
  elapsedMs?: number | null;
}) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[auth-context]", {
    step: input.step,
    result: input.result,
    userId: input.userId ?? null,
    email: input.email ?? null,
    sessionRole: input.sessionRole ?? null,
    clientId: input.clientId ?? null,
    elapsedMs: input.elapsedMs ?? null,
  });
}

function authContextStartedAt() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function authContextElapsedMs(startedAt: number) {
  return Math.round((authContextStartedAt() - startedAt) * 10) / 10;
}

function failedAuthContext(input: {
  step: string;
  result: string;
  userId?: string | null;
  email?: string | null;
  clientId?: string | null;
  role?: string | null;
  startedAt: number;
}): CurrentUserContextResolution {
  authContextDiagnostic({
    step: input.step,
    result: input.result,
    userId: input.userId,
    email: input.email,
    sessionRole: input.role,
    clientId: input.clientId,
    elapsedMs: authContextElapsedMs(input.startedAt),
  });
  return {
    status: "failed",
    context: null,
    step: input.step,
    result: input.result,
    userId: input.userId ?? null,
    email: input.email ?? null,
    clientId: input.clientId ?? null,
    role: input.role ?? null,
  };
}

export function isExpiredJwtAuthError(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof (error as { message?: unknown } | null)?.message === "string"
      ? String((error as { message: unknown }).message)
      : "";
  const normalized = message.toLowerCase();
  return normalized.includes("jwt") && normalized.includes("expired")
    || normalized.includes("token is expired")
    || normalized.includes("invalid claims") && normalized.includes("expired");
}

export async function resolveCurrentUserContext(): Promise<CurrentUserContextResolution> {
  const totalStartedAt = authContextStartedAt();
  try {
    const accessToken = await getCurrentAccessToken();
    if (!accessToken) {
      authContextDiagnostic({ step: "Authenticated user", result: "NO_ACCESS_TOKEN", elapsedMs: authContextElapsedMs(totalStartedAt) });
      return { status: "missing_session", context: null, step: "Authenticated user", result: "NO_ACCESS_TOKEN" };
    }

    const userClient = createUserSupabase(accessToken);

    const authStartedAt = authContextStartedAt();
    const { data, error } = await userClient.auth.getUser(accessToken);
    if (error || !data.user) {
      console.error("[auth-context] auth.getUser failed", {
        message: error?.message ?? "No user returned",
        cookies: inspectAuthCookiePresence(),
        failureStage: "auth.getUser"
      });
      if (isExpiredJwtAuthError(error)) {
        authContextDiagnostic({
          step: "Authenticated user",
          result: "EXPIRED_ACCESS_TOKEN",
          elapsedMs: authContextElapsedMs(authStartedAt),
        });
        return {
          status: "expired_session",
          context: null,
          step: "Authenticated user",
          result: "EXPIRED_ACCESS_TOKEN",
          message: error?.message ?? "Access token expired.",
        };
      }
      return failedAuthContext({
        step: "Authenticated user",
        result: error?.message ?? "No user returned",
        startedAt: authStartedAt,
      });
    }
    authContextDiagnostic({
      step: "Authenticated user",
      result: "OK",
      userId: data.user.id,
      email: data.user.email ?? null,
      elapsedMs: authContextElapsedMs(authStartedAt),
    });

    const authoritativeStartedAt = authContextStartedAt();
    const authoritativeUserResult = await createAdminSupabase().auth.admin.getUserById(data.user.id);
    if (authoritativeUserResult.error || !authoritativeUserResult.data.user) {
      console.error("[auth-context] authoritative auth user lookup failed", {
        userId: data.user.id,
        message: authoritativeUserResult.error?.message ?? "No user returned",
      });
      return failedAuthContext({
        step: "Authoritative auth user",
        result: authoritativeUserResult.error?.message ?? "No user returned",
        userId: data.user.id,
        email: data.user.email ?? null,
        startedAt: authoritativeStartedAt,
      });
    }
    const resolvedUser = authoritativeUserResult.data.user;
    authContextDiagnostic({
      step: "Authoritative auth user",
      result: "OK",
      userId: resolvedUser.id,
      email: resolvedUser.email ?? null,
      elapsedMs: authContextElapsedMs(authoritativeStartedAt),
    });
    console.info("[auth-context] auth user resolved", {
      userId: resolvedUser.id,
      email: resolvedUser.email ?? null
    });

    const roleStartedAt = authContextStartedAt();
    const { data: userRole, error: userRoleError } = await userClient
      .from("user_roles")
      .select("user_id, role, client_id")
      .eq("user_id", resolvedUser.id)
      .maybeSingle();

    if (userRoleError) {
      console.error("[auth-context] user-scoped role lookup failed", dbErrorPayload(userRoleError));
    }
    console.info("[auth-context] user-scoped role lookup result", {
      userId: resolvedUser.id,
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
          .eq("user_id", resolvedUser.id)
          .maybeSingle();

        if (fallbackRoleError) {
          console.error("[auth-context] service role lookup failed", dbErrorPayload(fallbackRoleError));
        }
        console.info("[auth-context] service role fallback result", {
          userId: resolvedUser.id,
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
        userId: resolvedUser.id,
        email: resolvedUser.email ?? null,
        failureStage: "role_not_found"
      });
      return failedAuthContext({
        step: "Application role lookup",
        result: "NO_ROWS",
        userId: resolvedUser.id,
        email: resolvedUser.email ?? null,
        startedAt: roleStartedAt,
      });
    }

    if (!VALID_ROLES.includes(role.role)) {
      console.error("[auth-context] invalid role value", {
        userId: resolvedUser.id,
        email: resolvedUser.email ?? null,
        role: role.role,
        failureStage: "invalid_role"
      });
      return failedAuthContext({
        step: "Application role lookup",
        result: "INVALID_ROLE",
        userId: resolvedUser.id,
        email: resolvedUser.email ?? null,
        clientId: role.client_id,
        role: role.role,
        startedAt: roleStartedAt,
      });
    }
    authContextDiagnostic({
      step: "Application role lookup",
      result: "OK",
      userId: resolvedUser.id,
      email: resolvedUser.email ?? null,
      sessionRole: role.role,
      clientId: role.client_id,
      elapsedMs: authContextElapsedMs(roleStartedAt),
    });

    await ensureUserProfile(resolvedUser);

    let client: Client | null = null;
    let profile: Record<string, unknown> | null = null;
    if (role.client_id) {
      console.info("[auth-context] client lookup started", {
        userId: resolvedUser.id,
        email: resolvedUser.email ?? null,
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
        userId: resolvedUser.id,
        email: resolvedUser.email ?? null,
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
            userId: resolvedUser.id,
            email: resolvedUser.email ?? null,
            clientId: role.client_id,
            found: Boolean(client),
            client: client ? { id: client.id, name: client.name } : null
          });
        } catch (err) {
          console.error("[auth-context] service client fallback threw", {
            userId: resolvedUser.id,
            email: resolvedUser.email ?? null,
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
        .eq("user_id", resolvedUser.id)
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
      userId: resolvedUser.id,
      email: resolvedUser.email ?? null,
      role: role.role,
      clientId: role.client_id,
      clientFound: Boolean(client),
      client: client ? { id: client.id, name: client.name } : null
    });

    const context = {
      user: resolvedUser,
      role: role as RoleRecord,
      client,
      profile
    };
    authContextDiagnostic({
      step: "Application user context",
      result: "OK",
      userId: resolvedUser.id,
      email: resolvedUser.email ?? null,
      sessionRole: role.role,
      clientId: role.client_id,
      elapsedMs: authContextElapsedMs(totalStartedAt),
    });
    return { status: "resolved", context, step: "Customer workspace context", result: "OK" };
  } catch (error) {
    console.error("[auth-context] caught exception", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return failedAuthContext({
      step: "Application user context",
      result: error instanceof Error ? error.message : "Unknown error",
      startedAt: totalStartedAt,
    });
  }
}

export async function getCurrentUserContext() {
  const resolution = await resolveCurrentUserContext();
  return resolution.status === "resolved" ? resolution.context : null;
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
  if (normalized === "/workspace/admin" || normalized.startsWith("/workspace/admin/")) return role === "client";
  if (normalized === "/submit") return role === "installer";
  if (normalized === "/installer/history") return role === "installer";
  if (normalized === "/portal") return true;
  if (normalized === "/onboarding") return role === "client";
  return false;
}

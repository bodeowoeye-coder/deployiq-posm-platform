import { NextResponse } from "next/server";
import {
  getAuthoritativeAccountSecurityState,
  getCurrentAccessToken,
  getCurrentUserContext,
  inspectAuthCookiePresence,
  isAllowedReturnTo,
} from "@/lib/auth";
import {
  clearDeployIqAuthCookies,
  setDeployIqSessionCookies,
} from "@/lib/authSessionCookies";
import {
  defaultDestinationForResolvedUser,
} from "@/lib/authDestinations";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { createUserSupabase } from "@/lib/supabaseUser";
import { inspectSupabaseEnvironment } from "@/lib/supabaseEnv";

export const dynamic = "force-dynamic";

function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function timingMs(start: number) {
  return Math.round((nowMs() - start) * 10) / 10;
}

function isAllowedSessionReturnTo(role: "admin" | "client" | "installer", clientId: string | null | undefined, returnTo: string | null) {
  if (returnTo === "/client" && role === "client" && !clientId) return false;
  return isAllowedReturnTo(role, returnTo);
}

function normalizePath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  try {
    const url = new URL(value, "http://localhost");
    return url.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return null;
  }
}

function returnToMatchesAuthoritativeDestination(authoritativeDestination: string, requestedReturnTo: string | null) {
  const authoritativePath = normalizePath(authoritativeDestination);
  const requestedPath = normalizePath(requestedReturnTo);
  if (!authoritativePath || !requestedPath) return false;
  if (authoritativePath === "/workspace/admin") return requestedPath === "/workspace/admin" || requestedPath.startsWith("/workspace/admin/");
  if (authoritativePath === "/admin") return requestedPath === "/admin" || requestedPath.startsWith("/admin/");
  if (authoritativePath === "/client") return requestedPath === "/client" || requestedPath.startsWith("/client/");
  if (authoritativePath === "/submit") return requestedPath === "/submit" || requestedPath.startsWith("/installer/");
  return requestedPath === authoritativePath;
}

async function resolveAuthoritativeSessionDestination(input: {
  role: "admin" | "client" | "installer";
  userId: string;
  clientId?: string | null;
  email?: string | null;
  requestedReturnTo: string | null;
}) {
  const authoritativeDestination = await defaultDestinationForResolvedUser({
    role: input.role,
    userId: input.userId,
    clientId: input.clientId,
    email: input.email,
  });
  const returnToAllowed = isAllowedSessionReturnTo(input.role, input.clientId, input.requestedReturnTo);
  const returnToCompatible = returnToAllowed && returnToMatchesAuthoritativeDestination(authoritativeDestination, input.requestedReturnTo);
  return {
    authoritativeDestination,
    destination: returnToCompatible ? input.requestedReturnTo ?? authoritativeDestination : authoritativeDestination,
    returnToAllowed,
    returnToCompatible,
  };
}

export async function POST(request: Request) {
  const totalStart = nowMs();
  try {
    const bodyStart = nowMs();
    const body = await request.json();
    console.info("[login-server-timing]", { stage: "session-body-parse", durationMs: timingMs(bodyStart) });
    const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";
    const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";
    const requestedReturnTo = typeof body.returnTo === "string" ? body.returnTo : null;

    if (!accessToken || !refreshToken) {
      console.error("[auth-session] missing tokens", {
        hasAccessToken: Boolean(accessToken),
        hasRefreshToken: Boolean(refreshToken)
      });
      return NextResponse.json({ error: "Missing session tokens." }, { status: 400 });
    }

    const userClient = createUserSupabase(accessToken);
    const tokenValidationStart = nowMs();
    const { data, error } = await userClient.auth.getUser(accessToken);
    console.info("[login-server-timing]", { stage: "session-token-validation", ok: Boolean(data.user && !error), durationMs: timingMs(tokenValidationStart) });
    if (error || !data.user) {
      console.error("[auth-session] token validation failed", {
        message: error?.message ?? "No user returned",
        env: inspectSupabaseEnvironment()
      });
      return NextResponse.json({ error: "Invalid session tokens." }, { status: 401 });
    }

    const roleLookupStart = nowMs();
    const { data: role, error: roleError } = await createAdminSupabase()
      .schema("public")
      .from("user_roles")
      .select("user_id, role, client_id")
      .eq("user_id", data.user.id)
      .maybeSingle();
    console.info("[login-server-timing]", {
      stage: "session-role-lookup",
      role: role?.role ?? null,
      hasRole: Boolean(role),
      durationMs: timingMs(roleLookupStart)
    });

    if (roleError || !role) {
      console.error("[auth-session] role lookup failed during session create", {
        userId: data.user.id,
        email: data.user.email ?? null,
        message: roleError?.message ?? "No user role found"
      });
      return NextResponse.json({ error: "User exists but no app role/profile found." }, { status: 403 });
    }

    const resolvedRole = role.role === "admin" || role.role === "client" || role.role === "installer" ? role.role : null;
    if (!resolvedRole) {
      console.error("[auth-session] invalid role during session create", {
        userId: data.user.id,
        email: data.user.email ?? null,
        role: role.role
      });
      return NextResponse.json({ error: "Invalid app role configured for this user." }, { status: 403 });
    }

    const destination = await resolveAuthoritativeSessionDestination({
      role: resolvedRole,
      userId: data.user.id,
      clientId: role.client_id,
      email: data.user.email,
      requestedReturnTo,
    });
    const accountSecurity = await getAuthoritativeAccountSecurityState(data.user.id);
    const redirectTo = accountSecurity.passwordChangeRequired
      ? `/login/create-password?returnTo=${encodeURIComponent(destination.destination)}`
      : destination.destination;
    console.info("[auth-session-routing]", {
      source: "POST",
      userId: data.user.id,
      resolvedRole,
      clientId: role.client_id ?? null,
      requestedReturnTo,
      authoritativeDestination: destination.authoritativeDestination,
      returnToAllowed: destination.returnToAllowed,
      returnToCompatible: destination.returnToCompatible,
      passwordChangeRequired: accountSecurity.passwordChangeRequired,
      redirectTo,
    });

    const response = NextResponse.json({
      ok: true,
      authenticated: true,
      role: resolvedRole,
      redirectTo
    });
    response.headers.set("Cache-Control", "private, no-store");
    setDeployIqSessionCookies(response, request, { accessToken, refreshToken });
    console.info("[login-server-timing]", { stage: "session-create-total", durationMs: timingMs(totalStart) });
    return response;
  } catch (error) {
    console.error("[auth-session] unexpected failure", {
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      env: inspectSupabaseEnvironment()
    });
    return NextResponse.json({ error: "Could not create app session." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const response = NextResponse.json({ ok: true });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  clearDeployIqAuthCookies(response, request);
  return response;
}

export async function GET(request: Request) {
  const totalStart = nowMs();
  const accessTokenStart = nowMs();
  const accessToken = await getCurrentAccessToken();
  console.info("[login-server-timing]", { stage: "access-cookie-read", hasAccessToken: Boolean(accessToken), durationMs: timingMs(accessTokenStart) });
  const contextStart = nowMs();
  const context = await getCurrentUserContext();
  console.info("[login-server-timing]", { stage: "role-user-context-lookup", role: context?.role.role ?? null, durationMs: timingMs(contextStart) });

  if (!context) {
    console.error("[auth-session] verification failed", {
      hasAccessCookie: Boolean(accessToken),
      cookiePresence: inspectAuthCookiePresence(),
      failureStage: "getCurrentUserContext"
    });
    return NextResponse.json(
      {
        authenticated: false,
        reason: accessToken ? "role_or_user_context_unavailable" : "access_cookie_missing"
      },
      { status: 401 }
    );
  }

  const requestedReturnTo = new URL(request.url).searchParams.get("returnTo");
  const destination = await resolveAuthoritativeSessionDestination({
    role: context.role.role,
    userId: context.user.id,
    clientId: context.role.client_id,
    email: context.user.email,
    requestedReturnTo,
  });
  const accountSecurity = await getAuthoritativeAccountSecurityState(context.user.id);
  const redirectTo = accountSecurity.passwordChangeRequired
    ? `/login/create-password?returnTo=${encodeURIComponent(destination.destination)}`
    : destination.destination;
  console.info("[auth-session-redirect]", {
    userId: context.user.id,
    email: context.user.email ?? null,
    resolvedRole: context.role.role,
    requestedReturnTo,
    authoritativeDestination: destination.authoritativeDestination,
    returnToAllowed: destination.returnToAllowed,
    returnToCompatible: destination.returnToCompatible,
    redirectTo
  });
  const profileStart = nowMs();
  const profile = (context as any)?.profile ?? null;
  console.info("[login-server-timing]", { stage: "profile-lookup", hasProfile: Boolean(profile), durationMs: timingMs(profileStart) });
  const metadataFullName = typeof context.user.user_metadata?.full_name === "string" ? context.user.user_metadata.full_name.trim() : "";
  const fullName = typeof profile?.full_name === "string" && profile.full_name.trim() ? profile.full_name.trim() : metadataFullName;
  let resolvedAssignedProjectName: string | null = null;
  try {
    const assignedIds = Array.isArray(profile?.assigned_project_ids) ? (profile.assigned_project_ids as string[]) : [];
    if (assignedIds.length > 0) {
      const { data: matching } = await createAdminSupabase().schema("public").from("projects").select("project_name:name").in("id", assignedIds).limit(1);
      if (matching && matching.length > 0) resolvedAssignedProjectName = matching[0].project_name ?? null;
    }
  } catch (err) {
    console.warn("[auth-session] could not resolve assigned project name", err instanceof Error ? err.message : err);
  }
  console.info("[login-server-timing]", { stage: "session-verify-total", redirectTo, durationMs: timingMs(totalStart) });

  return NextResponse.json({
    ok: true,
    authenticated: true,
    userId: context.user.id,
    email: profile?.email ?? context.user.email ?? null,
    fullName: fullName || null,
    profile: profile ?? null,
    resolvedAssignedProjectName,
    role: context.role.role,
    redirectTo
  });
}

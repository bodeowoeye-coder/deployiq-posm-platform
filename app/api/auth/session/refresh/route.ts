import { NextResponse } from "next/server";
import { getAuthoritativeAccountSecurityState, getCurrentRefreshToken, isAllowedReturnTo } from "@/lib/auth";
import { clearDeployIqAuthCookies, setDeployIqSessionCookies } from "@/lib/authSessionCookies";
import { defaultDestinationForResolvedUser } from "@/lib/authDestinations";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { createBrowserSupabase } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

function safeWorkspaceReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/workspace/admin";
  try {
    const url = new URL(value, "http://localhost");
    const destination = `${url.pathname}${url.search}`;
    return url.pathname === "/workspace/admin" || url.pathname.startsWith("/workspace/admin/")
      ? destination
      : "/workspace/admin";
  } catch {
    return "/workspace/admin";
  }
}

function loginRedirect(request: Request, returnTo: string) {
  return new URL(`/login?returnTo=${encodeURIComponent(returnTo)}`, request.url);
}

async function destinationAfterRefresh(input: {
  role: "admin" | "client" | "installer";
  userId: string;
  clientId?: string | null;
  email?: string | null;
  requestedReturnTo: string;
}) {
  if (input.role === "client" && isAllowedReturnTo(input.role, input.requestedReturnTo)) {
    return input.requestedReturnTo;
  }
  return defaultDestinationForResolvedUser({
    role: input.role,
    userId: input.userId,
    clientId: input.clientId,
    email: input.email,
  });
}

export async function GET(request: Request) {
  const requestedReturnTo = safeWorkspaceReturnTo(new URL(request.url).searchParams.get("returnTo"));
  const refreshToken = await getCurrentRefreshToken();
  if (!refreshToken) {
    const response = NextResponse.redirect(loginRedirect(request, requestedReturnTo), { status: 303 });
    response.headers.set("Cache-Control", "no-store, max-age=0");
    clearDeployIqAuthCookies(response, request);
    return response;
  }

  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  const accessToken = data.session?.access_token ?? "";
  const nextRefreshToken = data.session?.refresh_token ?? "";
  const user = data.user ?? data.session?.user ?? null;
  if (error || !accessToken || !nextRefreshToken || !user) {
    console.warn("[auth-session-refresh] refresh failed", {
      message: error?.message ?? "No refreshed session returned",
      requestedReturnTo,
    });
    const response = NextResponse.redirect(loginRedirect(request, requestedReturnTo), { status: 303 });
    response.headers.set("Cache-Control", "no-store, max-age=0");
    clearDeployIqAuthCookies(response, request);
    return response;
  }

  const { data: role, error: roleError } = await createAdminSupabase()
    .schema("public")
    .from("user_roles")
    .select("user_id, role, client_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const resolvedRole = role?.role === "admin" || role?.role === "client" || role?.role === "installer" ? role.role : null;
  if (roleError || !resolvedRole) {
    console.warn("[auth-session-refresh] role lookup failed", {
      userId: user.id,
      message: roleError?.message ?? "No valid app role found",
    });
    const response = NextResponse.redirect(loginRedirect(request, requestedReturnTo), { status: 303 });
    response.headers.set("Cache-Control", "no-store, max-age=0");
    clearDeployIqAuthCookies(response, request);
    return response;
  }
  const clientId = role?.client_id ?? null;

  const destination = await destinationAfterRefresh({
    role: resolvedRole,
    userId: user.id,
    clientId,
    email: user.email,
    requestedReturnTo,
  });
  const accountSecurity = await getAuthoritativeAccountSecurityState(user.id);
  const redirectTo = accountSecurity.passwordChangeRequired
    ? `/login/create-password?returnTo=${encodeURIComponent(destination)}`
    : destination;
  const response = NextResponse.redirect(new URL(redirectTo, request.url), { status: 303 });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  setDeployIqSessionCookies(response, request, { accessToken, refreshToken: nextRefreshToken });
  return response;
}

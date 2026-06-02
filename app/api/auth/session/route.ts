import { NextResponse } from "next/server";
import { defaultRouteForRole, getCurrentAccessToken, getCurrentUserContext, inspectAuthCookiePresence, isAllowedReturnTo } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { createUserSupabase } from "@/lib/supabaseUser";
import { inspectSupabaseEnvironment } from "@/lib/supabaseEnv";

export const dynamic = "force-dynamic";

function isSecureCookie(request: Request) {
  return process.env.NODE_ENV === "production" || new URL(request.url).protocol === "https:";
}

function setAuthCookie(response: NextResponse, request: Request, name: string, value: string, maxAge: number) {
  response.cookies.set(name, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(request),
    path: "/",
    maxAge
  });
}

function clearAuthCookie(response: NextResponse, request: Request, name: string) {
  response.cookies.set(name, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(request),
    path: "/",
    maxAge: 0,
    expires: new Date(0)
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";
    const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";

    if (!accessToken || !refreshToken) {
      console.error("[auth-session] missing tokens", {
        hasAccessToken: Boolean(accessToken),
        hasRefreshToken: Boolean(refreshToken)
      });
      return NextResponse.json({ error: "Missing session tokens." }, { status: 400 });
    }

    const userClient = createUserSupabase(accessToken);
    const { data, error } = await userClient.auth.getUser(accessToken);
    if (error || !data.user) {
      console.error("[auth-session] token validation failed", {
        message: error?.message ?? "No user returned",
        env: inspectSupabaseEnvironment()
      });
      return NextResponse.json({ error: "Invalid session tokens." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.headers.set("Cache-Control", "private, no-store");
    setAuthCookie(response, request, "deployiq-access-token", accessToken, 60 * 60 * 24 * 7);
    setAuthCookie(response, request, "deployiq-refresh-token", refreshToken, 60 * 60 * 24 * 7);
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
  ["deployiq-access-token", "deployiq-refresh-token", "sb-access-token", "sb-refresh-token"].forEach((name) => {
    clearAuthCookie(response, request, name);
  });
  return response;
}

export async function GET(request: Request) {
  const accessToken = await getCurrentAccessToken();
  const context = await getCurrentUserContext();

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
  const redirectTo = isAllowedReturnTo(context.role.role, requestedReturnTo)
    ? requestedReturnTo
    : defaultRouteForRole(context.role.role);
  const { data: profile } = await createAdminSupabase()
    .schema("public")
    .from("user_profiles")
    .select("full_name, email, phone, assigned_regions, assigned_states, status")
    .eq("user_id", context.user.id)
    .maybeSingle();
  const metadataFullName = typeof context.user.user_metadata?.full_name === "string" ? context.user.user_metadata.full_name.trim() : "";
  const fullName = typeof profile?.full_name === "string" && profile.full_name.trim() ? profile.full_name.trim() : metadataFullName;

  return NextResponse.json({
    ok: true,
    authenticated: true,
    userId: context.user.id,
    email: profile?.email ?? context.user.email ?? null,
    fullName: fullName || null,
    profile: profile ?? null,
    role: context.role.role,
    redirectTo
  });
}

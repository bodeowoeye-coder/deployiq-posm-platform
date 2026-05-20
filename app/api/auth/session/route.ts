import { NextResponse } from "next/server";
import { defaultRouteForRole, getCurrentAccessToken, getCurrentUserContext, inspectAuthCookiePresence, isAllowedReturnTo } from "@/lib/auth";
import { createUserSupabase } from "@/lib/supabaseUser";
import { inspectSupabaseEnvironment } from "@/lib/supabaseEnv";

export const dynamic = "force-dynamic";

function setAuthCookie(response: NextResponse, name: string, value: string, maxAge: number) {
  response.cookies.set(name, value, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    path: "/",
    maxAge
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
    setAuthCookie(response, "deployiq-access-token", accessToken, 60 * 60 * 24 * 7);
    setAuthCookie(response, "deployiq-refresh-token", refreshToken, 60 * 60 * 24 * 7);
    console.info("[auth-session] cookies written", {
      userId: data.user.id,
      email: data.user.email ?? null,
      cookieNames: ["deployiq-access-token", "deployiq-refresh-token"],
      cookieOptions: {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/",
        maxAge: 60 * 60 * 24 * 7
      }
    });
    return response;
  } catch (error) {
    console.error("[auth-session] unexpected failure", {
      message: error instanceof Error ? error.message : "Unknown error",
      env: inspectSupabaseEnvironment()
    });
    return NextResponse.json({ error: "Could not create app session." }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("deployiq-access-token");
  response.cookies.delete("deployiq-refresh-token");
  return response;
}

export async function GET(request: Request) {
  const accessToken = await getCurrentAccessToken();
  const cookiePresence = inspectAuthCookiePresence();
  console.info("[auth-session] GET entered", {
    cookieNames: cookiePresence.names,
    cookiePresence
  });
  console.info("[auth-session] access cookie present", {
    hasAccessCookie: Boolean(accessToken),
    accessTokenPrefix: accessToken ? accessToken.slice(0, 20) : null
  });
  console.info("[auth-session] before getCurrentUserContext");
  const context = await getCurrentUserContext();
  console.info("[auth-session] after getCurrentUserContext", {
    resolved: Boolean(context),
    userId: context?.user.id ?? null,
    email: context?.user.email ?? null,
    role: context?.role.role ?? null
  });

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

  console.info("[auth-session] redirect resolved", {
    userId: context.user.id,
    email: context.user.email ?? null,
    role: context.role.role,
    requestedReturnTo,
    redirectTo
  });

  return NextResponse.json({
    ok: true,
    authenticated: true,
    role: context.role.role,
    redirectTo
  });
}

import { NextResponse } from "next/server";
import { getCurrentAccessToken, getCurrentUserContext } from "@/lib/auth";
import { createUserSupabase } from "@/lib/supabaseUser";
import { inspectSupabaseEnvironment } from "@/lib/supabaseEnv";

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
    const { data, error } = await userClient.auth.getUser();
    if (error || !data.user) {
      console.error("[auth-session] token validation failed", {
        message: error?.message ?? "No user returned",
        env: inspectSupabaseEnvironment()
      });
      return NextResponse.json({ error: "Invalid session tokens." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.headers.set("Cache-Control", "private, no-store");
    response.cookies.set("sb-access-token", accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60
    });
    response.cookies.set("sb-refresh-token", refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30
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
  response.cookies.delete("sb-access-token");
  response.cookies.delete("sb-refresh-token");
  return response;
}

export async function GET() {
  const accessToken = await getCurrentAccessToken();
  const context = await getCurrentUserContext();

  if (!context) {
    console.error("[auth-session] verification failed", {
      hasAccessCookie: Boolean(accessToken)
    });
    return NextResponse.json(
      {
        authenticated: false,
        reason: accessToken ? "role_or_user_context_unavailable" : "access_cookie_missing"
      },
      { status: 401 }
    );
  }

  return NextResponse.json({
    authenticated: true,
    redirectTo: context.role.role === "admin" ? "/admin" : context.role.role === "client" ? "/client" : "/submit"
  });
}

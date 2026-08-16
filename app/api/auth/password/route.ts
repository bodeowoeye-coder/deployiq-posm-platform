import { NextResponse } from "next/server";
import { getAuthoritativeAccountSecurityState, getCurrentUserContext, isAllowedReturnTo } from "@/lib/auth";
import { setDeployIqSessionCookies } from "@/lib/authSessionCookies";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { getPublicSupabaseConfig } from "@/lib/supabaseEnv";
import { analysePassword, validatePasswordMatch } from "@/lib/acquisition/identity";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const context = await getCurrentUserContext();
    if (!context?.user) {
      return NextResponse.json({ error: "Sign in before creating a new password." }, { status: 401 });
    }

    const body = await request.json();
    const password = typeof body.password === "string" ? body.password : "";
    const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
    const requestedReturnTo = typeof body.returnTo === "string" ? body.returnTo : "/onboarding";

    if (!analysePassword(password).isAcceptable) {
      return NextResponse.json({ error: "Password does not meet requirements." }, { status: 400 });
    }
    const matchError = validatePasswordMatch(password, confirmPassword);
    if (matchError) {
      return NextResponse.json({ error: matchError }, { status: 400 });
    }

    const redirectTo = isAllowedReturnTo(context.role.role, requestedReturnTo)
      ? requestedReturnTo
      : "/onboarding";

    const accountSecurity = await getAuthoritativeAccountSecurityState(context.user.id);
    if (!accountSecurity.passwordChangeRequired) {
      return NextResponse.json({ error: "A password change is not required for this account." }, { status: 409 });
    }

    const adminSupabase = createAdminSupabase();
    const { error: passwordError } = await adminSupabase.auth.admin.updateUserById(context.user.id, { password });
    if (passwordError) throw passwordError;

    const { error: metadataError } = await adminSupabase.auth.admin.updateUserById(context.user.id, {
      app_metadata: {
        ...(context.user.app_metadata ?? {}),
        password_method: accountSecurity.passwordMethod ?? context.user.app_metadata?.password_method ?? "generated",
        password_change_required: false,
        first_login_completed: true,
      },
    });
    if (metadataError) throw metadataError;

    // Updating a password through the admin API invalidates the session that
    // brought the customer here. Establish a fresh, password-backed session
    // before returning to onboarding so account-owned draft recovery remains
    // authoritative instead of falling through to anonymous Step 1.
    const { url, anonKey } = getPublicSupabaseConfig();
    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: refreshedAuth, error: refreshedAuthError } = await authClient.auth.signInWithPassword({
      email: context.user.email ?? "",
      password,
    });
    if (refreshedAuthError || !refreshedAuth.session) {
      throw refreshedAuthError ?? new Error("Could not establish the updated password session.");
    }

    const response = NextResponse.json({ ok: true, redirectTo });
    setDeployIqSessionCookies(response, request, {
      accessToken: refreshedAuth.session.access_token,
      refreshToken: refreshedAuth.session.refresh_token,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update password.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

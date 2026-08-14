import { NextResponse } from "next/server";
import { getAuthoritativeAccountSecurityState, getCurrentUserContext, isAllowedReturnTo } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { analysePassword, validatePasswordMatch } from "@/lib/acquisition/identity";

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

    return NextResponse.json({ ok: true, redirectTo });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update password.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

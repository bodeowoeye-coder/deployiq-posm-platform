import { NextResponse } from "next/server";
import { getCurrentUserContext, readAccountSecurityState } from "@/lib/auth";
import { getOnboardingDraftByToken } from "@/lib/commercial/onboarding/service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "Resume token is required." }, { status: 400 });
    }
    const draft = await getOnboardingDraftByToken(token);
    if (!draft) {
      return NextResponse.json({ error: "Draft not found." }, { status: 404 });
    }
    const context = await getCurrentUserContext();
    if (context?.user) {
      const accountSecurity = readAccountSecurityState(context.user);
      if (accountSecurity.passwordChangeRequired) {
        return NextResponse.json({
          error: "Create a new password before resuming onboarding.",
          redirectTo: `/login/create-password?returnTo=${encodeURIComponent("/onboarding")}`,
        }, { status: 403 });
      }
      const draftUserId = draft.authenticated_user_id;
      const draftEmail = draft.email?.toLowerCase() ?? "";
      const contextEmail = context.user.email?.toLowerCase() ?? "";
      if ((draftUserId && draftUserId !== context.user.id) || (!draftUserId && draftEmail && draftEmail !== contextEmail)) {
        console.info("[onboarding-resume] account mismatch", {
          draftId: draft.id,
          currentSessionUserId: context.user.id,
          intendedOnboardingUserId: draftUserId ?? null,
          emailMatches: Boolean(draftEmail && draftEmail === contextEmail),
        });
        return NextResponse.json({ error: "This saved setup belongs to another DeployIQ account." }, { status: 403 });
      }
    }
    return NextResponse.json({ draft });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

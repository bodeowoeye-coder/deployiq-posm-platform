import { redirect } from "next/navigation";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { getCurrentUserContext, readAccountSecurityState } from "@/lib/auth";
import { getLatestActivationDraftForCustomer, getOnboardingDraftByToken } from "@/lib/commercial/onboarding/service";
import { isActivationPendingDraft } from "@/lib/commercial/onboarding/stepMapping";

export const dynamic = "force-dynamic";

export default async function WorkspaceActivationPage({
  searchParams,
}: {
  searchParams?: { token?: string };
}) {
  const context = await getCurrentUserContext();
  const returnTo = "/workspace/activation";
  if (!context?.user) {
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  const accountSecurity = readAccountSecurityState(context.user);
  if (accountSecurity.passwordChangeRequired) {
    redirect(`/login/create-password?returnTo=${encodeURIComponent(returnTo)}`);
  }

  const token = typeof searchParams?.token === "string" ? searchParams.token.trim() : "";
  if (token) {
    const draft = await getOnboardingDraftByToken(token);
    const draftEmail = draft?.email?.toLowerCase() ?? "";
    const contextEmail = context.user.email?.toLowerCase() ?? "";
    const ownedByUser = draft?.authenticated_user_id === context.user.id;
    const ownedByVerifiedEmail = !draft?.authenticated_user_id && Boolean(draftEmail && draftEmail === contextEmail);
    if (!draft || (!ownedByUser && !ownedByVerifiedEmail) || !isActivationPendingDraft(draft)) {
      redirect("/onboarding");
    }
    return <OnboardingShell />;
  }

  const activationDraft = await getLatestActivationDraftForCustomer({
    userId: context.user.id,
    email: context.user.email ?? null,
  });
  if (activationDraft) {
    redirect(`/workspace/activation?token=${encodeURIComponent(activationDraft.resume_token)}`);
  }

  redirect("/onboarding");
}

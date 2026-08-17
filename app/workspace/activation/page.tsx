import { redirect } from "next/navigation";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { getCurrentUserContext, readAccountSecurityState } from "@/lib/auth";
import { getLatestActivationDraftForCustomer, getOnboardingDraftByToken } from "@/lib/commercial/onboarding/service";
import { isActivationPendingDraft } from "@/lib/commercial/onboarding/stepMapping";
import { getProvisioningJobForDraft } from "@/lib/acquisition/provisioning/service";
import { cookies } from "next/headers";
import { hasValidatedShadowPlan, shadowPlanAcknowledgementCookie } from "@/lib/ai/provisioning/presentation";

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
    if (!draft || (!ownedByUser && !ownedByVerifiedEmail)) {
      redirect("/onboarding");
    }
    if (draft.status === "provisioned" || draft.draft_data?.provisioningStatus === "completed") {
      const completedJob = await getProvisioningJobForDraft(draft.id);
      const destination = completedJob?.result_data?.workspaceDestination as { adminWorkspaceUrl?: unknown } | undefined;
      const adminWorkspaceUrl = typeof destination?.adminWorkspaceUrl === "string"
        ? destination.adminWorkspaceUrl
        : typeof draft.draft_data?.adminWorkspaceUrl === "string"
          ? draft.draft_data.adminWorkspaceUrl
          : null;
      const shadowPlanning = completedJob?.result_data?.shadowPlanning as React.ComponentProps<typeof OnboardingShell>["initialShadowPlanning"];
      const planAcknowledged = Boolean(completedJob?.id && cookies().get(shadowPlanAcknowledgementCookie(completedJob.id))?.value === "1");
      if (completedJob?.status === "completed" && adminWorkspaceUrl && (!hasValidatedShadowPlan(shadowPlanning) || planAcknowledged)) redirect(adminWorkspaceUrl);
      if (completedJob?.status === "completed" && hasValidatedShadowPlan(shadowPlanning)) {
        return (
          <OnboardingShell
            initialBrowserAuthenticated
            initialShadowPlanning={shadowPlanning}
            initialProvisioningJob={completedJob}
            initialWorkspaceLaunchUrl={adminWorkspaceUrl}
            initialPlanAcknowledged={planAcknowledged}
          />
        );
      }
      redirect("/onboarding");
    }
    if (!isActivationPendingDraft(draft)) redirect("/onboarding");
    return <OnboardingShell initialBrowserAuthenticated />;
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

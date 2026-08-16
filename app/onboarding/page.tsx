import { Suspense } from "react";
import { redirect } from "next/navigation";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { getCurrentUserContext, readAccountSecurityState } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const context = await getCurrentUserContext();
  const accountSecurity = context ? readAccountSecurityState(context.user) : null;
  if (accountSecurity?.passwordChangeRequired) {
    redirect(`/login/create-password?returnTo=${encodeURIComponent("/onboarding")}`);
  }

  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    }>
      <OnboardingShell />
    </Suspense>
  );
}

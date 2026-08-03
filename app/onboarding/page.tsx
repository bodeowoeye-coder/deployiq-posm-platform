import { Suspense } from "react";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
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

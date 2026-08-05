"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, ArrowRight } from "lucide-react";

import { PREPARATION_STEPS, FINAL_MESSAGE } from "@/lib/commercial/checkout/provisioningSteps";

export { PREPARATION_STEPS, FINAL_MESSAGE };

const STEP_DURATION_MS = 750;
const COMPLETE_PAUSE_MS = 180;

type StepStatus = "pending" | "processing" | "complete";

type Props = {
  onComplete: () => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function ProvisioningAnticipation({ onComplete }: Props) {
  const [statuses, setStatuses] = useState<StepStatus[]>(
    PREPARATION_STEPS.map(() => "pending")
  );
  const [announcement, setAnnouncement] = useState("Preparing your workspace…");
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    // Detect reduced-motion inside the effect (SSR-safe — only runs client-side).
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      // Skip animation: mark every step complete immediately.
      setStatuses(PREPARATION_STEPS.map(() => "complete"));
      setAnnouncement(FINAL_MESSAGE);
      setIsDone(true);
      return;
    }

    let cancelled = false;

    async function run() {
      for (let i = 0; i < PREPARATION_STEPS.length; i++) {
        if (cancelled) return;
        setStatuses((prev) => prev.map((s, idx) => (idx === i ? "processing" : s)));
        setAnnouncement(PREPARATION_STEPS[i]);
        await sleep(STEP_DURATION_MS);
        if (cancelled) return;
        setStatuses((prev) => prev.map((s, idx) => (idx === i ? "complete" : s)));
        await sleep(COMPLETE_PAUSE_MS);
      }
      if (cancelled) return;
      setAnnouncement(FINAL_MESSAGE);
      setIsDone(true);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* Screen-reader live region — announces each step as it starts. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      <div className="space-y-2" role="list" aria-label="Workspace preparation progress">
        {PREPARATION_STEPS.map((step, i) => {
          const status = statuses[i];
          return (
            <div
              key={i}
              role="listitem"
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors duration-300 ${
                status === "complete"
                  ? "border-emerald-100 bg-emerald-50"
                  : status === "processing"
                  ? "border-orange-100 bg-orange-50"
                  : "border-slate-100 bg-slate-50"
              }`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
                {status === "complete" ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
                    <Check className="h-3 w-3 text-white" />
                  </span>
                ) : status === "processing" ? (
                  <Loader2 className="h-4 w-4 text-orange-500 animate-spin motion-reduce:animate-none" />
                ) : (
                  <span className="h-4 w-4 rounded-full border-2 border-slate-200" />
                )}
              </span>
              <span
                className={`text-sm transition-colors duration-300 ${
                  status === "complete"
                    ? "font-medium text-emerald-700"
                    : status === "processing"
                    ? "font-medium text-orange-700"
                    : "text-slate-400"
                }`}
              >
                {step}
              </span>
            </div>
          );
        })}
      </div>

      {isDone ? (
        <div className="pt-4 text-center space-y-5">
          <p className="text-base font-semibold text-slate-900" aria-live="polite">
            {FINAL_MESSAGE}
          </p>
          <button
            type="button"
            onClick={onComplete}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-8 py-3 text-sm font-semibold text-white hover:bg-orange-600 shadow-sm transition-colors"
            aria-label="Continue to workspace setup"
          >
            Set up my workspace <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

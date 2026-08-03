"use client";

import { Loader2 } from "lucide-react";
import { BUSINESS_OBJECTIVES } from "@/lib/commercial/onboarding/objectives";

type Props = {
  onSelect: (objectiveId: string) => void;
  loading: boolean;
};

export function BusinessObjectiveStep({ onSelect, loading }: Props) {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
          Step 1 of 4
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          What are you trying to achieve?
        </h1>
        <p className="text-base text-slate-500 leading-relaxed">
          Choose the outcome that best describes your programme. DeployIQ will recommend the
          right solution and calculate your pricing automatically.
        </p>
      </div>

      <fieldset disabled={loading}>
        <legend className="sr-only">Select your business objective</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {BUSINESS_OBJECTIVES.map((obj) => (
            <button
              key={obj.id}
              type="button"
              onClick={() => onSelect(obj.id)}
              className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left transition-all hover:border-orange-300 hover:bg-orange-50 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-50"
              aria-label={obj.label}
            >
              <span
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl transition-colors group-hover:bg-orange-100"
                aria-hidden="true"
              >
                {obj.emoji}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{obj.label}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-slate-500">
                  {obj.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </fieldset>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Setting up your session…
        </div>
      ) : null}
    </div>
  );
}

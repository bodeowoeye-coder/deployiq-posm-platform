"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { BUSINESS_OBJECTIVES } from "@/lib/commercial/onboarding/objectives";

type Props = {
  onSelect: (objectiveId: string) => void;
  loading: boolean;
};

export function BusinessObjectiveStep({ onSelect, loading }: Props) {
  return (
      <section className="flex h-full flex-col justify-center px-6 py-9 sm:px-10 lg:px-12 lg:py-12">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">Step 1 of 4</p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">What are you trying to achieve?</h2>
          <p className="max-w-2xl text-base leading-relaxed text-slate-500">
            Choose the outcome that best describes your programme. DeployIQ will recommend the right solution and calculate your pricing automatically.
          </p>
        </div>

        <fieldset disabled={loading} className="mt-7">
          <legend className="sr-only">Select your business objective</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {BUSINESS_OBJECTIVES.map((obj) => (
              <button
                key={obj.id}
                type="button"
                onClick={() => onSelect(obj.id)}
                className="group flex min-h-32 items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-orange-300 hover:bg-orange-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-50 motion-reduce:hover:translate-y-0"
                aria-label={obj.label}
              >
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl transition-colors group-hover:bg-orange-100" aria-hidden="true">
                  {obj.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-900">{obj.label}</p>
                    <ArrowRight aria-hidden className="mt-0.5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-orange-500 motion-reduce:transform-none" size={17} />
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">{obj.description}</p>
                </div>
              </button>
            ))}
          </div>
        </fieldset>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Setting up your session…
          </div>
        ) : null}
      </section>
  );
}

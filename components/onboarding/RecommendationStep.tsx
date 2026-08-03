"use client";

import { ArrowLeft, CheckCircle2 } from "lucide-react";
import type { RecommendationResult } from "@/lib/commercial/onboarding/recommendation";

type Props = {
  recommendation: RecommendationResult;
  quantity: number;
  country: string;
  onConfirm: () => void;
  onBack: () => void;
  onEnterpriseAssistance: () => void;
};

export function RecommendationStep({
  recommendation,
  quantity,
  country,
  onConfirm,
  onBack,
  onEnterpriseAssistance,
}: Props) {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
          Step 3 of 4
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          We've found your best fit.
        </h1>
      </div>

      {/* Product card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Your DeployIQ solution
          </p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">
            {recommendation.productName}
          </h2>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* Why it fits */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Why this solution
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-700">
              {recommendation.whyItFits}
            </p>
          </div>

          {/* Capabilities */}
          {recommendation.capabilities.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Included capabilities
              </p>
              <ul className="mt-2 space-y-1.5" role="list">
                {recommendation.capabilities.map((cap) => (
                  <li key={cap} className="flex items-start gap-2 text-sm text-slate-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                    {cap}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Rollout summary */}
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span><strong className="text-slate-700">{quantity.toLocaleString("en-US")}</strong> deployment locations</span>
              {country ? <span><strong className="text-slate-700">{country}</strong></span> : null}
            </div>
          </div>
        </div>
      </div>

      {/* Enterprise notice — shown for assisted-setup products */}
      {recommendation.deploymentMode === "ENTERPRISE" ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-4">
          <p className="text-sm font-semibold text-violet-900">
            🤝 Assisted Setup included
          </p>
          <p className="mt-1 text-sm text-violet-800">
            This workspace includes dedicated implementation, solution design, and a tailored commercial proposal from our team.
          </p>
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Adjust requirements
        </button>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {recommendation.deploymentMode === "SELF_SERVICE" ? (
            <>
              <button
                type="button"
                onClick={onEnterpriseAssistance}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Talk to sales instead
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
              >
                Instant Setup
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onConfirm}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
            >
              Request Proposal
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

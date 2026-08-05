"use client";

import { ArrowLeft, CheckCircle2, Clock } from "lucide-react";
import type { RecommendationResult } from "@/lib/commercial/onboarding/recommendation";

type Props = {
  recommendation: RecommendationResult;
  onContinueSetup: () => void;
  onRequestProposal: () => void;
  onTalkToSales: () => void;
  onBack: () => void;
};

const SELF_SERVICE_BENEFITS = [
  "Instant workspace creation",
  "Live pricing — no surprises",
  "Secure online setup",
  "Immediate access on activation",
  "Invite your team from day one",
  "Start your first deployment today",
];

const ENTERPRISE_BENEFITS = [
  "Dedicated Solution Architect",
  "Tailored implementation plan",
  "Deployment planning and support",
  "Team training included",
  "Ongoing Customer Success Manager",
];

export function CommercialDecisionStep({
  recommendation,
  onContinueSetup,
  onRequestProposal,
  onTalkToSales,
  onBack,
}: Props) {
  if (recommendation.deploymentMode === "SELF_SERVICE" && recommendation.pricingReady) {
    return <SelfServiceCard recommendation={recommendation} onContinue={onContinueSetup} onTalkToSales={onTalkToSales} onBack={onBack} />;
  }
  return <EnterpriseCard recommendation={recommendation} onRequestProposal={onRequestProposal} onBack={onBack} />;
}

function SelfServiceCard({
  recommendation,
  onContinue,
  onTalkToSales,
  onBack,
}: {
  recommendation: RecommendationResult;
  onContinue: () => void;
  onTalkToSales: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-0">
      {/* Hero card */}
      <div className="overflow-hidden rounded-3xl bg-slate-900 text-white">
        {/* Top accent */}
        <div className="h-1.5 w-full bg-gradient-to-r from-orange-400 via-orange-500 to-amber-400" />

        <div className="px-8 pb-8 pt-7">
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
              {recommendation.productName}
            </span>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">
              ⚡ Instant Setup
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl font-bold tracking-tight leading-tight sm:text-5xl">
            Ready for<br />instant setup.
          </h1>

          <p className="mt-4 text-base text-slate-300 leading-relaxed max-w-sm">
            Your organisation can create a workspace in minutes — no sales call required.
          </p>

          {/* Benefits */}
          <ul className="mt-7 space-y-2.5" role="list">
            {SELF_SERVICE_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-center gap-3 text-sm text-slate-200">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                {benefit}
              </li>
            ))}
          </ul>

          {/* Time estimate */}
          <div className="mt-7 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 w-fit">
            <Clock className="h-4 w-4 text-orange-400 shrink-0" aria-hidden="true" />
            <span className="text-sm font-medium text-slate-200">
              Estimated setup time: <strong className="text-white">less than 5 minutes</strong>
            </span>
          </div>
        </div>

        {/* CTA area */}
        <div className="border-t border-white/10 bg-white/5 px-8 py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </button>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={onTalkToSales}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
              >
                Talk to Sales
              </button>
              <button
                type="button"
                onClick={onContinue}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-7 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/30 hover:bg-orange-400 transition-colors"
              >
                Continue Setup
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EnterpriseCard({
  recommendation,
  onRequestProposal,
  onBack,
}: {
  recommendation: RecommendationResult;
  onRequestProposal: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-0">
      {/* Hero card */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        {/* Top accent */}
        <div className="h-1.5 w-full bg-gradient-to-r from-slate-700 via-slate-800 to-slate-900" />

        <div className="px-8 pb-8 pt-7">
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {recommendation.productName}
            </span>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
              🤝 Assisted Setup
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl font-bold tracking-tight leading-tight text-slate-900 sm:text-5xl">
            Enterprise<br />implementation<br />included.
          </h1>

          <p className="mt-4 text-base text-slate-500 leading-relaxed max-w-sm">
            This solution includes solution design, workspace configuration, and a dedicated implementation team.
          </p>

          {/* Benefits */}
          <ul className="mt-7 space-y-2.5" role="list">
            {ENTERPRISE_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-center gap-3 text-sm text-slate-700">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-violet-500" aria-hidden="true" />
                {benefit}
              </li>
            ))}
          </ul>

          {/* Process note */}
          <div className="mt-7 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 w-fit">
            <Clock className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
            <span className="text-sm font-medium text-slate-600">
              Typical response time: <strong className="text-slate-800">1–2 business days</strong>
            </span>
          </div>
        </div>

        {/* CTA area */}
        <div className="border-t border-slate-100 bg-slate-50 px-8 py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-600 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </button>

            <button
              type="button"
              onClick={onRequestProposal}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-7 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-700 transition-colors"
            >
              Contact Assisted Sales Team
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

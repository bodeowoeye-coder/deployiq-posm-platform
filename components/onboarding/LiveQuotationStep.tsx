"use client";

import { ArrowLeft } from "lucide-react";
import type { CustomerQuotation } from "@/lib/commercial/onboarding/quotation";
import type { RecommendationResult } from "@/lib/commercial/onboarding/recommendation";

type Props = {
  quotation: CustomerQuotation;
  recommendation: RecommendationResult | null;
  onContinue: () => void;
  onAdjust: () => void;
  onEnterpriseAssistance: () => void;
  onBack: () => void;
};

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-US")}`;
  }
}

export function LiveQuotationStep({
  quotation,
  recommendation,
  onContinue,
  onAdjust,
  onEnterpriseAssistance,
  onBack,
}: Props) {
  if (quotation.requiresEnterpriseReview) {
    return (
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-500">
            Step 4 of 4
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Custom quotation required
          </h1>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-6">
          <p className="text-lg font-semibold text-amber-900">
            Your rollout requires an enterprise proposal
          </p>
          <p className="mt-2 text-sm text-amber-800 leading-relaxed">
            {quotation.pricingExplanation}
          </p>
          <div className="mt-4 flex items-center gap-3 text-sm text-amber-700">
            <span>
              <strong>{quotation.quantity.toLocaleString("en-US")}</strong> deployment locations
            </span>
            {recommendation ? (
              <span>· <strong>{recommendation.productName}</strong></span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={onAdjust}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Adjust requirements
            </button>
            <button type="button" onClick={onEnterpriseAssistance}
              className="rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 transition-colors">
              Request enterprise proposal
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
          Step 4 of 4
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Your estimated quotation
        </h1>
      </div>

      {/* Hero quotation */}
      <div className="overflow-hidden rounded-2xl border border-slate-900 bg-slate-900">
        <div className="px-6 py-8 text-center">
          <p className="text-sm font-medium text-slate-400">Estimated quotation</p>
          <p className="mt-2 text-5xl font-bold tracking-tight text-white">
            {formatMoney(quotation.estimatedTotal, quotation.currency)}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            for {quotation.quantity.toLocaleString("en-US")} deployment locations
          </p>
        </div>

        <div className="border-t border-slate-800 bg-slate-800 px-6 py-3">
          <p className="text-center text-xs text-slate-400">
            {quotation.pricingMethodLabel} · This is an estimate. The final amount is confirmed at checkout.
          </p>
        </div>
      </div>

      {/* Explanation */}
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-4">
        <p className="text-sm font-semibold text-sky-900">How this is calculated</p>
        <p className="mt-1 text-sm text-sky-800">{quotation.pricingExplanation}</p>
      </div>

      {/* Tier breakdown — expandable */}
      {quotation.tierBreakdown.length > 1 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Pricing breakdown
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {quotation.tierBreakdown.map((row, i) => (
              <div key={i} className={`flex items-center justify-between gap-4 px-4 py-3 ${row.isEnterpriseRow ? "bg-amber-50" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{row.label}</p>
                  {!row.isEnterpriseRow ? (
                    <p className="text-xs text-slate-500 font-mono">
                      {row.applicableQuantity.toLocaleString("en-US")} locations × {formatMoney(row.unitPrice, quotation.currency)}
                      {row.fixedCharge > 0 ? ` + ${formatMoney(row.fixedCharge, quotation.currency)} fixed` : ""}
                    </p>
                  ) : (
                    <p className="text-xs text-amber-600">Custom quotation required</p>
                  )}
                </div>
                <div className="shrink-0">
                  {!row.isEnterpriseRow ? (
                    <span className="font-mono text-sm font-semibold text-slate-900">
                      {formatMoney(row.subtotal, quotation.currency)}
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Quotation</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Meta */}
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        {recommendation ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3">
            <p className="text-xs text-slate-400">Solution</p>
            <p className="mt-0.5 font-medium text-slate-800">{recommendation.productName}</p>
          </div>
        ) : null}
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3">
          <p className="text-xs text-slate-400">Included admin seats</p>
          <p className="mt-0.5 font-medium text-slate-800">{quotation.includedAdminUsers}</p>
        </div>
        {quotation.quotationExpiry ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3">
            <p className="text-xs text-slate-400">Quotation valid until</p>
            <p className="mt-0.5 font-medium text-slate-800">
              {new Date(quotation.quotationExpiry).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </button>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={onAdjust}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            Adjust requirements
          </button>
          <button type="button" onClick={onContinue}
            className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { formatMoney, formatQuantity } from "@/lib/commercial/pricing/tierEditor";
import { buildPreviewExplanation } from "./wizardUtils";
import type { FormState, PreviewResult } from "./types";

type Props = {
  form: FormState;
  savedTemplateId: string | null;
};

async function fetchDraftPreview(form: FormState, qty: number): Promise<PreviewResult> {
  const response = await fetch("/api/admin/commercial/pricing-draft-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: form.name || "Draft Preview",
      productKey: form.productKey,
      currency: form.currency,
      pricingMetric: form.pricingMetric,
      pricingMethod: form.pricingMethod,
      quotationValidityDays: form.quotationValidityDays ? Number(form.quotationValidityDays) : null,
      quantity: qty,
      tiers: form.tiers.map((tier) => ({
        sequence: tier.sequence,
        minimumQuantity: tier.minimumQuantity,
        maximumQuantity: tier.isEnterpriseTier ? null : tier.maximumQuantity,
        unitPrice: tier.unitPrice,
        fixedCharge: tier.fixedCharge,
        enterpriseAction: tier.isEnterpriseTier ? "request_quotation" : tier.enterpriseAction,
      })),
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Unable to run draft preview.");
  const r = payload.result;
  return {
    quantity: r.quantity,
    currency: r.currency,
    tierBreakdown: r.tier_breakdown ?? [],
    subtotal: r.subtotal,
    total: r.total,
    includedAdminUsers: r.included_admin_users,
    quotationStatus: r.quotation_status,
    requiresEnterpriseReview: r.requires_enterprise_review,
  };
}

async function fetchSavedPreview(templateId: string, qty: number): Promise<PreviewResult> {
  const response = await fetch("/api/admin/commercial/pricing-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pricingTemplateId: templateId, quantity: qty }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Unable to preview saved template.");
  const r = payload.result;
  return {
    quantity: r.quantity,
    currency: r.currency,
    tierBreakdown: r.tier_breakdown ?? [],
    subtotal: r.subtotal,
    total: r.total,
    includedAdminUsers: r.included_admin_users,
    quotationStatus: r.quotation_status,
    requiresEnterpriseReview: r.requires_enterprise_review,
  };
}

export function PricingPreviewStep({ form, savedTemplateId }: Props) {
  const [quantity, setQuantity] = useState("1000");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useSaved, setUseSaved] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  async function runPreview() {
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
      setError("Enter a positive whole number for the rollout quantity.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setBreakdownOpen(false);
    try {
      const previewResult =
        useSaved && savedTemplateId
          ? await fetchSavedPreview(savedTemplateId, qty)
          : await fetchDraftPreview(form, qty);
      setResult(previewResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to calculate preview.");
    } finally {
      setLoading(false);
    }
  }

  const explanation = result
    ? buildPreviewExplanation(result.quantity, result.tierBreakdown, form.pricingMethod)
    : null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500 leading-relaxed">
        Enter a sample rollout quantity to confirm how DeployIQ will calculate the quotation.
      </p>

      {/* Source toggle */}
      {savedTemplateId ? (
        <div
          className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1"
          role="radiogroup"
          aria-label="Preview source"
        >
          <button type="button" role="radio" aria-checked={!useSaved}
            onClick={() => { setUseSaved(false); setResult(null); }}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${!useSaved ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            Current draft
          </button>
          <button type="button" role="radio" aria-checked={useSaved}
            onClick={() => { setUseSaved(true); setResult(null); }}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${useSaved ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            Saved pricing rule
          </button>
        </div>
      ) : null}

      {/* Quantity row */}
      <fieldset>
        <legend className="mb-2 block text-sm font-medium text-slate-700">
          Rollout quantity
        </legend>
        <div className="flex items-center gap-3">
          <input
            id="preview-qty"
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => { setQuantity(e.target.value); setResult(null); }}
            aria-label="Number of deployment locations"
            className="block w-40 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-mono focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
            placeholder="e.g. 8,750"
          />
          <span className="text-sm text-slate-400">deployment locations</span>
          <button
            type="button"
            onClick={() => { void runPreview(); }}
            disabled={loading}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Calculating…" : "Calculate pricing"}
          </button>
        </div>
      </fieldset>

      {/* Error */}
      {error ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {/* ── RESULT ── */}
      {result ? (
        <div className="space-y-4" aria-live="polite">

          {/* Hero: Estimated quotation */}
          <div className={`rounded-2xl px-6 py-8 text-center ${
            result.requiresEnterpriseReview
              ? "bg-amber-50 border border-amber-200"
              : "bg-slate-900"
          }`}>
            <p className={`text-xs font-semibold uppercase tracking-widest ${
              result.requiresEnterpriseReview ? "text-amber-500" : "text-slate-400"
            }`}>
              Estimated quotation
            </p>
            <p className={`mt-2 text-5xl font-bold tracking-tight ${
              result.requiresEnterpriseReview ? "text-amber-800" : "text-white"
            }`}>
              {result.requiresEnterpriseReview
                ? "Custom quotation"
                : formatMoney(result.total, result.currency)}
            </p>
            <p className={`mt-2 text-sm ${
              result.requiresEnterpriseReview ? "text-amber-600" : "text-slate-400"
            }`}>
              for {formatQuantity(result.quantity)} deployment locations
            </p>
            {result.requiresEnterpriseReview ? (
              <p className="mt-1 text-xs text-amber-600">
                This rollout size requires a custom enterprise quotation.
              </p>
            ) : null}
          </div>

          {/* Plain-language explanation */}
          {explanation ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-4">
              <p className="mb-2 text-sm font-semibold text-sky-900">
                How this was calculated
              </p>
              <p className="text-sm text-sky-800 leading-relaxed">{explanation}</p>
            </div>
          ) : null}

          {/* Admin users */}
          {result.includedAdminUsers > 0 ? (
            <p className="text-xs text-slate-400 text-center">
              Includes {result.includedAdminUsers} admin user seat{result.includedAdminUsers !== 1 ? "s" : ""}
            </p>
          ) : null}

          {/* Expandable breakdown */}
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setBreakdownOpen((v) => !v)}
              aria-expanded={breakdownOpen}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <span>View full pricing breakdown</span>
              {breakdownOpen
                ? <ChevronUp className="h-4 w-4 text-slate-400" />
                : <ChevronDown className="h-4 w-4 text-slate-400" />}
            </button>

            {breakdownOpen ? (
              <div className="border-t border-slate-100">
                <div className="divide-y divide-slate-100">
                  {result.tierBreakdown.map((row) => (
                    <div key={row.sequence} className={`flex items-center justify-between gap-4 px-4 py-3 ${
                      row.enterprise_action === "request_quotation" ? "bg-amber-50" : ""
                    }`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800">{row.label}</p>
                        {row.enterprise_action === "request_quotation" ? (
                          <p className="text-xs text-amber-600">Custom quotation required</p>
                        ) : (
                          <p className="font-mono text-xs text-slate-500">
                            {formatQuantity(row.applicable_quantity)} locations × {formatMoney(row.unit_price, result.currency)}
                            {row.fixed_charge > 0
                              ? ` + ${formatMoney(row.fixed_charge, result.currency)} fixed`
                              : ""}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        {row.enterprise_action === "request_quotation" ? (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                            Quotation
                          </span>
                        ) : (
                          <span className="font-mono text-sm font-semibold text-slate-900">
                            {formatMoney(row.subtotal, result.currency)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-14 text-center">
          <p className="text-sm font-medium text-slate-400">Enter a rollout quantity to see the estimated quotation</p>
          <p className="mt-1 text-xs text-slate-300">Results appear here instantly after calculation</p>
        </div>
      ) : null}
    </div>
  );
}

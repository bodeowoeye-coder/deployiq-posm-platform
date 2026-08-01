"use client";

import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { formatMoney, formatQuantity } from "@/lib/commercial/pricing/tierEditor";
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

  async function runPreview() {
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
      setError("Enter a positive whole number for the quantity.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

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

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Enter a rollout quantity to see how pricing is calculated across the tier structure.
        Preview uses the shared pricing engine — results will match client invoicing exactly.
      </p>

      {savedTemplateId ? (
        <div
          className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1"
          role="radiogroup"
          aria-label="Preview source"
        >
          <button
            type="button"
            role="radio"
            aria-checked={!useSaved}
            onClick={() => { setUseSaved(false); setResult(null); }}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
              !useSaved ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Current draft
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={useSaved}
            onClick={() => { setUseSaved(true); setResult(null); }}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
              useSaved ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Saved template
          </button>
        </div>
      ) : null}

      <div className="flex items-end gap-3">
        <div className="max-w-xs flex-1 space-y-1.5">
          <label htmlFor="preview-qty" className="block text-sm font-medium text-slate-700">
            Number of deployment locations
          </label>
          <input
            id="preview-qty"
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => { setQuantity(e.target.value); setResult(null); }}
            className="block w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-mono focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
            placeholder="e.g. 8,750"
          />
        </div>
        <button
          type="button"
          onClick={() => { void runPreview(); }}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Running…" : "Run preview"}
        </button>
      </div>

      {error ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Pricing breakdown — {formatQuantity(result.quantity)} deployment locations
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
              <span>Method: Progressive tiered</span>
              <span aria-hidden="true">·</span>
              <span>Currency: {result.currency}</span>
              {savedTemplateId && useSaved ? (
                <><span aria-hidden="true">·</span><span className="text-emerald-600">Saved template</span></>
              ) : (
                <><span aria-hidden="true">·</span><span>Current draft</span></>
              )}
            </div>
          </div>

          {result.tierBreakdown.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {result.tierBreakdown.map((row) => (
                <div key={row.sequence} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">{row.label}</p>
                    {row.enterprise_action === "request_quotation" ? (
                      <p className="text-xs text-amber-600">Custom quotation required for this tier</p>
                    ) : (
                      <p className="font-mono text-xs text-slate-500">
                        {formatQuantity(row.applicable_quantity)} ×{" "}
                        {formatMoney(row.unit_price, result.currency)}
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
          ) : (
            <div className="px-4 py-4 text-sm text-slate-400">No tiers matched this quantity.</div>
          )}

          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-700">Estimated total</p>
                <p className="text-xs text-slate-400">
                  Includes {result.includedAdminUsers} admin user seat
                  {result.includedAdminUsers !== 1 ? "s" : ""}
                </p>
              </div>
              <p className={`font-mono text-lg font-bold ${
                result.requiresEnterpriseReview ? "text-amber-600" : "text-slate-900"
              }`}>
                {result.requiresEnterpriseReview
                  ? "Quotation required"
                  : formatMoney(result.total, result.currency)}
              </p>
            </div>
            {result.requiresEnterpriseReview ? (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                This quantity requires a custom enterprise quotation. An account manager will follow up directly.
              </div>
            ) : null}
          </div>
        </div>
      ) : !loading ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
          Enter a quantity above and click{" "}
          <strong className="font-medium text-slate-500">Run preview</strong> to see the breakdown.
        </div>
      ) : null}
    </div>
  );
}

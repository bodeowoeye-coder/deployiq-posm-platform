"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import {
  currencySymbol,
  formatQuantity,
  hasValidationErrors,
  validateFormTiers,
} from "@/lib/commercial/pricing/tierEditor";
import { isEnterpriseOnlyForm } from "./wizardUtils";
import type { FormState } from "./types";

type Props = {
  form: FormState;
  savedTemplateId: string | null;
  saving: boolean;
  activating: boolean;
  readOnly?: boolean;
  onSaveDraft: () => Promise<void>;
  onActivate: (templateId: string) => Promise<void>;
};

export function PricingReviewStep({
  form, savedTemplateId, saving, activating, readOnly = false, onSaveDraft, onActivate,
}: Props) {
  const tierErrors = validateFormTiers(form.tiers);
  const hasTierErrors = hasValidationErrors(tierErrors);
  const enterpriseOnly = isEnterpriseOnlyForm(form);
  const sym = currencySymbol(form.currency);
  const canSave = !hasTierErrors && form.name.trim().length > 0;

  return (
    <div className="space-y-6">
      {/* ── Template summary ── */}
      <div className="overflow-hidden rounded-xl border border-slate-200 divide-y divide-slate-100">
        <div className="bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Template details
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-4 py-4 sm:grid-cols-3">
          {[
            { label: "Name", value: form.name || "—" },
            { label: "Product", value: form.productKey },
            { label: "Currency", value: form.currency },
            { label: "Country", value: form.country || "—" },
            { label: "Quotation validity", value: form.quotationValidityDays ? `${form.quotationValidityDays} days` : "—" },
            { label: "Default template", value: form.isDefault ? "Yes" : "No" },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-slate-400">{label}</p>
              <p className="mt-0.5 text-sm font-medium capitalize text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tier summary ── */}
      <div className="overflow-hidden rounded-xl border border-slate-200 divide-y divide-slate-100">
        <div className="bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Pricing tiers ({form.tiers.length})
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/50">
              <tr className="text-left text-xs text-slate-400">
                <th className="px-4 py-2.5 font-semibold">Tier</th>
                <th className="px-4 py-2.5 font-semibold">From</th>
                <th className="px-4 py-2.5 font-semibold">To</th>
                <th className="px-4 py-2.5 text-right font-semibold">Unit price</th>
                <th className="px-4 py-2.5 text-right font-semibold">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {form.tiers.map((tier) => (
                <tr key={tier.sequence} className="text-slate-700">
                  <td className="px-4 py-2.5 font-medium">{tier.sequence}</td>
                  <td className="px-4 py-2.5 font-mono">{formatQuantity(tier.minimumQuantity)}</td>
                  <td className="px-4 py-2.5 font-mono">
                    {tier.isEnterpriseTier ? (
                      <span className="text-amber-600">No limit</span>
                    ) : tier.maximumQuantity ? (
                      formatQuantity(tier.maximumQuantity)
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {tier.isEnterpriseTier ? "—" : `${sym}${formatQuantity(tier.unitPrice)}`}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {tier.isEnterpriseTier ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                        Quotation
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        Automatic
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Warnings ── */}
      {hasTierErrors ? (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Tier validation errors</p>
            <p className="mt-0.5 text-xs">
              Go back to the Pricing tiers step and fix the highlighted errors before saving.
            </p>
          </div>
        </div>
      ) : null}

      {enterpriseOnly ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Enterprise-only template</p>
            <p className="mt-0.5 text-xs">
              All tiers require a custom quotation. No automatic pricing will be calculated for any quantity.
            </p>
          </div>
        </div>
      ) : null}

      {savedTemplateId && !readOnly ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Saved as draft. You can now activate this template.
        </div>
      ) : null}

      {/* ── Action buttons ── */}
      {!readOnly ? (
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
          {!savedTemplateId ? (
            <button
              type="button"
              onClick={() => { void onSaveDraft(); }}
              disabled={saving || !canSave}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Saving…" : "Save as draft"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { void onActivate(savedTemplateId); }}
              disabled={activating}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {activating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {activating ? "Activating…" : "Activate template"}
            </button>
          )}
        </div>
      ) : null}

      <p className="text-xs text-slate-400">
        Activating makes this template available for client onboarding immediately.
        Only one default template per product and currency combination can be active at a time.
      </p>
    </div>
  );
}

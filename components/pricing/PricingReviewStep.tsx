"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import {
  currencySymbol,
  formatQuantity,
  hasValidationErrors,
  validateFormTiers,
} from "@/lib/commercial/pricing/tierEditor";
import { isEnterpriseOnlyForm, getPricingModelLabel, resolveProductDisplayLabel } from "./wizardUtils";
import { PricingRuleExplanation } from "./PricingRuleExplanation";
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

type CheckItem = {
  label: string;
  value: string;
  warning?: boolean;
};

function ChecklistItem({ label, value, warning = false }: CheckItem) {
  return (
    <div className="flex items-start gap-4 py-3.5 border-b border-slate-100 last:border-0">
      <CheckCircle2
        className={`mt-0.5 h-4 w-4 shrink-0 ${warning ? "text-amber-400" : "text-emerald-500"}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="mt-0.5 text-sm font-medium text-slate-900">{value}</p>
      </div>
    </div>
  );
}

export function PricingReviewStep({
  form, savedTemplateId, saving, activating, readOnly = false, onSaveDraft, onActivate,
}: Props) {
  const tierErrors = validateFormTiers(form.tiers);
  const hasTierErrors = hasValidationErrors(tierErrors);
  const enterpriseOnly = isEnterpriseOnlyForm(form);
  const sym = currencySymbol(form.currency);
  const canSave = !hasTierErrors && form.name.trim().length > 0;

  // Determine enterprise threshold for checklist item
  const enterpriseTier = form.tiers.find(
    (t) => t.isEnterpriseTier || t.enterpriseAction === "request_quotation"
  );
  const quotationThreshold = enterpriseTier
    ? `Above ${formatQuantity(enterpriseTier.minimumQuantity - 1)} locations`
    : "None — fully automatic pricing";

  const checklistItems: CheckItem[] = [
    {
      label: "Pricing rule name",
      value: form.name || "—",
      warning: !form.name.trim(),
    },
    {
      label: "Product",
      value: resolveProductDisplayLabel(form.productKey),
    },
    {
      label: "Pricing model",
      value: getPricingModelLabel(form.pricingMethod),
    },
    {
      label: "Market",
      value: [form.country, form.currency].filter(Boolean).join(" · ") || "—",
    },
    {
      label: "Pricing method",
      value: getPricingModelLabel(form.pricingMethod),
    },
    {
      label: "Pricing bands",
      value: `${form.tiers.length} band${form.tiers.length !== 1 ? "s" : ""}`,
      warning: hasTierErrors,
    },
    {
      label: "Default pricing rule",
      value: form.isDefault ? "Yes — applied when no other rule matches" : "No",
    },
    {
      label: "Quotation threshold",
      value: quotationThreshold,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Checklist */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-3.5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Pre-publication checklist
          </p>
        </div>
        <div className="px-5">
          {checklistItems.map((item) => (
            <ChecklistItem key={item.label} {...item} />
          ))}
        </div>
      </div>

      {/* Pricing summary */}
      <div>
        <p className="mb-3 text-sm font-semibold text-slate-800">Pricing summary</p>
        <PricingRuleExplanation tiers={form.tiers} currency={form.currency} />
      </div>

      {/* Warnings */}
      {hasTierErrors ? (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Pricing band errors</p>
            <p className="mt-0.5 text-xs">Return to step 2 and resolve the highlighted errors before publishing.</p>
          </div>
        </div>
      ) : null}

      {enterpriseOnly ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">All bands require custom quotation</p>
            <p className="mt-0.5 text-xs">No automatic pricing will be calculated. Every rollout triggers a quotation.</p>
          </div>
        </div>
      ) : null}

      {savedTemplateId && !readOnly ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Saved as draft. Ready to publish.
        </div>
      ) : null}

      {/* Actions */}
      {!readOnly ? (
        <div className="space-y-3">
          {!savedTemplateId ? (
            <button
              type="button"
              onClick={() => { void onSaveDraft(); }}
              disabled={saving || !canSave}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Saving…" : "Save as draft"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { void onActivate(savedTemplateId); }}
              disabled={activating || hasTierErrors}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {activating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {activating ? "Publishing…" : "Publish pricing rule"}
            </button>
          )}
          <p className="text-center text-xs text-slate-400">
            {savedTemplateId
              ? "Activating makes this rule available immediately during customer onboarding."
              : "Draft rules are not used during customer onboarding until published."}
          </p>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import {
  applyCommercialModelDefaults,
  buildCommercialRuleExplanation,
  getSupportedMetricsForProduct,
  validateCommercialConfiguration,
  type CommercialValidationIssue,
} from "./wizardUtils";
import type { FormState } from "./types";

// --------------------------------------------------------------------------
// Catalogues
// --------------------------------------------------------------------------

const COMMERCIAL_MODEL_CARDS = [
  {
    value: "one_time_programme",
    label: "One-time Programme",
    icon: "🎯",
    summary: "Customers are charged once for the full programme.",
    guidance: "Best for rollout programmes with a defined scope and quantity.",
  },
  {
    value: "monthly_subscription",
    label: "Monthly Subscription",
    icon: "📅",
    summary: "Customers pay monthly for continued access.",
    guidance: "Best for ongoing SaaS access billed per month.",
  },
  {
    value: "annual_subscription",
    label: "Annual Subscription",
    icon: "📆",
    summary: "Customers pay annually for continued access.",
    guidance: "Best for annual contracts with a fixed commitment period.",
  },
  {
    value: "enterprise_contract",
    label: "Enterprise Contract",
    icon: "🤝",
    summary: "Pricing is handled through an assisted commercial agreement.",
    guidance: "Best for complex, bespoke commercial arrangements.",
  },
] as const;

const PRICING_METRIC_OPTIONS = [
  { value: "deployment_location", label: "Deployment location" },
  { value: "site",                label: "Site" },
  { value: "project",             label: "Project" },
  { value: "phase",               label: "Phase" },
  { value: "milestone",           label: "Milestone" },
  { value: "managed_value",       label: "Managed value (£/$ amount)" },
] as const;

const BILLING_BEHAVIOUR_OPTIONS = [
  { value: "single_payment", label: "Single Payment",    allowedFor: ["one_time_programme"] },
  { value: "monthly",        label: "Monthly",           allowedFor: ["monthly_subscription"] },
  { value: "annual",         label: "Annual",            allowedFor: ["annual_subscription"] },
  { value: "contract",       label: "Contract",          allowedFor: ["enterprise_contract"] },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: "card",           label: "Card",                    icon: "💳" },
  { value: "bank_transfer",  label: "Bank Transfer",           icon: "🏦" },
  { value: "enterprise_po",  label: "Enterprise Purchase Order", icon: "📋" },
];

// --------------------------------------------------------------------------
// Props
// --------------------------------------------------------------------------

type Props = {
  form: FormState;
  isReadOnly: boolean;
  onChange: (updates: Partial<FormState>) => void;
};

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

export function PricingCommercialConfigStep({ form, isReadOnly, onChange }: Props) {
  const issues = validateCommercialConfiguration(form);
  const errors   = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const explanation = buildCommercialRuleExplanation(form);

  const isOneTime    = form.commercialModel === "one_time_programme";
  const isEnterprise = form.commercialModel === "enterprise_contract";
  const isRecurring  = form.commercialModel === "monthly_subscription" || form.commercialModel === "annual_subscription";
  const productMetricOptions = getSupportedMetricsForProduct(form.productKey);

  function handleModelChange(model: string) {
    if (isReadOnly) return;
    const defaults = applyCommercialModelDefaults(model);
    onChange(defaults);
  }

  function togglePaymentMethod(method: string) {
    if (isReadOnly) return;
    const current = form.allowedPaymentMethods ?? [];
    const next = current.includes(method)
      ? current.filter((m) => m !== method)
      : [...current, method];
    onChange({ allowedPaymentMethods: next });
  }

  const inputClass = `block w-full rounded-xl border px-3.5 py-2.5 text-sm placeholder:text-slate-400 ${
    isReadOnly
      ? "bg-slate-50 text-slate-500 border-slate-100 cursor-default"
      : "border-slate-200 bg-white focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
  }`;

  return (
    <div className="space-y-8 max-w-2xl">

      {/* Section header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900">Commercial Configuration</h2>
        <p className="mt-1 text-sm text-slate-500">
          Define how customers are charged and what commercial rules apply to this pricing template.
        </p>
      </div>

      {/* --- Commercial Model --- */}
      <section>
        <p className="mb-3 text-sm font-semibold text-slate-700">
          Commercial Model <span className="text-rose-500" aria-hidden="true">*</span>
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {COMMERCIAL_MODEL_CARDS.map((card) => {
            const selected = form.commercialModel === card.value;
            return (
              <button
                key={card.value}
                type="button"
                aria-pressed={selected}
                onClick={() => handleModelChange(card.value)}
                disabled={isReadOnly}
                className={`flex flex-col items-start gap-1.5 rounded-xl border px-4 py-3 text-left transition-all disabled:cursor-default focus:outline-none focus:ring-2 focus:ring-orange-300 ${
                  selected
                    ? "border-orange-400 bg-orange-50 ring-1 ring-orange-200"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg" aria-hidden="true">{card.icon}</span>
                  <span className={`text-sm font-semibold ${selected ? "text-orange-900" : "text-slate-800"}`}>
                    {card.label}
                  </span>
                  {selected ? <CheckCircle2 className="ml-auto h-4 w-4 text-orange-500" aria-hidden="true" /> : null}
                </div>
                <p className="text-xs text-slate-500 leading-snug">{card.summary}</p>
                {selected ? (
                  <p className="text-xs text-orange-600 italic">{card.guidance}</p>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      {/* --- Charging Metric --- */}
      <section>
        <label htmlFor="cc-metric" className="mb-1.5 block text-sm font-semibold text-slate-700">
          Charging Metric <span className="text-rose-500" aria-hidden="true">*</span>
        </label>
        <select
          id="cc-metric"
          value={form.pricingMetric}
          onChange={(e) => !isReadOnly && onChange({ pricingMetric: e.target.value })}
          disabled={isReadOnly}
          className={inputClass}
        >
          {productMetricOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
          {!productMetricOptions.some((o) => o.value === form.pricingMetric) && form.pricingMetric ? (
            <option value={form.pricingMetric}>{form.pricingMetric} (custom)</option>
          ) : null}
        </select>
        <p className="mt-1 text-xs text-slate-400">The unit being priced in each tier. Changing this resets tier labels but not amounts.</p>
      </section>

      {/* --- Billing Behaviour --- */}
      <section>
        <label htmlFor="cc-billing" className="mb-1.5 block text-sm font-semibold text-slate-700">
          Billing Behaviour
        </label>
        <select
          id="cc-billing"
          value={form.billingBehaviour}
          onChange={(e) => !isReadOnly && onChange({ billingBehaviour: e.target.value })}
          disabled={isReadOnly}
          className={inputClass}
        >
          {BILLING_BEHAVIOUR_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} disabled={!o.allowedFor.includes(form.commercialModel)}>
              {o.label}{!o.allowedFor.includes(form.commercialModel) ? " (incompatible)" : ""}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-400">Billing behaviour is auto-set when you change the Commercial Model but can be adjusted here.</p>
      </section>

      {/* --- Renewal (conditional — hidden for one-time) --- */}
      {!isOneTime ? (
        <section>
          <p className="mb-2 text-sm font-semibold text-slate-700">Renewal Policy</p>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={form.renewalRequired}
              onChange={(e) => !isReadOnly && onChange({ renewalRequired: e.target.checked })}
              disabled={isReadOnly}
              className="h-4 w-4 rounded border-slate-300 accent-orange-500"
            />
            <span className="text-sm text-slate-700">
              Subscription renews automatically
            </span>
          </label>
          <p className="mt-1 ml-7 text-xs text-slate-400">
            {form.renewalRequired
              ? "Customers will be charged again at the end of each billing period unless they cancel."
              : "Customers will not be automatically charged again."}
          </p>
        </section>
      ) : null}

      {/* --- Allowed Payment Methods --- */}
      <section>
        <p className="mb-2 text-sm font-semibold text-slate-700">
          Allowed Payment Methods <span className="text-rose-500" aria-hidden="true">*</span>
        </p>
        <div className="space-y-2">
          {PAYMENT_METHOD_OPTIONS.map((m) => {
            const checked = (form.allowedPaymentMethods ?? []).includes(m.value);
            const isRecommended = isEnterprise && (m.value === "enterprise_po" || m.value === "bank_transfer");
            return (
              <label key={m.value} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                checked ? "border-orange-400 bg-orange-50" : "border-slate-200 bg-white hover:bg-slate-50"
              } ${isReadOnly ? "cursor-default" : ""}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => togglePaymentMethod(m.value)}
                  disabled={isReadOnly}
                  className="h-4 w-4 rounded border-slate-300 accent-orange-500"
                />
                <span className="text-sm text-slate-700">
                  <span className="mr-1.5" aria-hidden="true">{m.icon}</span>
                  {m.label}
                  {isRecommended ? <span className="ml-2 text-xs text-orange-600">(recommended)</span> : null}
                </span>
              </label>
            );
          })}
        </div>
        {isEnterprise && (form.allowedPaymentMethods ?? []).includes("card") ? (
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
            <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-amber-700">Card payment is unusual for Enterprise Contract. Ensure this is intentional.</p>
          </div>
        ) : null}
      </section>

      {/* --- Customer-facing Description --- */}
      <section>
        <label htmlFor="cc-desc" className="mb-1.5 block text-sm font-semibold text-slate-700">
          Customer-Facing Description
        </label>
        <textarea
          id="cc-desc"
          value={form.customerFacingDescription}
          onChange={(e) => !isReadOnly && onChange({ customerFacingDescription: e.target.value })}
          disabled={isReadOnly}
          rows={2}
          maxLength={200}
          placeholder="Short description shown to customers in their Commercial Plan summary."
          className={`${inputClass} resize-none`}
        />
        <p className="mt-1 text-xs text-slate-400">
          {form.customerFacingDescription.length}/200 characters. Shown in the customer's Commercial Plan and quotation summary.
        </p>
      </section>

      {/* --- Internal Notes --- */}
      <section>
        <label htmlFor="cc-notes" className="mb-1.5 block text-sm font-semibold text-slate-700">
          Internal Commercial Notes
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-normal text-slate-500">Admin only</span>
        </label>
        <textarea
          id="cc-notes"
          value={form.internalCommercialNotes}
          onChange={(e) => !isReadOnly && onChange({ internalCommercialNotes: e.target.value })}
          disabled={isReadOnly}
          rows={2}
          maxLength={1000}
          placeholder="Internal notes for the commercial team. Never shown to customers."
          className={`${inputClass} resize-none`}
        />
        <p className="mt-1 text-xs text-slate-400">These notes are never shown to customers.</p>
      </section>

      {/* --- What this commercial rule means --- */}
      <section className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex items-center gap-2 mb-2">
          <Info className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What this commercial rule means</p>
        </div>
        <p className="text-sm text-slate-700 leading-relaxed">{explanation}</p>
      </section>

      {/* --- Compatibility warnings --- */}
      {errors.length > 0 ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" aria-hidden="true" />
            <p className="text-xs font-semibold text-rose-800">Configuration issues must be resolved before activation</p>
          </div>
          <ul className="space-y-1 ml-6">
            {errors.map((e, i) => (
              <li key={i} className="text-xs text-rose-700">• {e.message}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {warnings.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
            <p className="text-xs font-semibold text-amber-800">Review before publishing</p>
          </div>
          <ul className="space-y-1 ml-6">
            {warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-700">• {w.message}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {errors.length === 0 && warnings.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" aria-hidden="true" />
          <p className="text-xs font-semibold text-emerald-700">Commercial configuration is valid.</p>
        </div>
      ) : null}
    </div>
  );
}

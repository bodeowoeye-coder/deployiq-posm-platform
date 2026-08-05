"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Lock } from "lucide-react";
import { ProductPricingSelector } from "./ProductPricingSelector";
import { resolveProductDisplayLabel } from "./wizardUtils";
import type { FormState } from "./types";

type Props = {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
  readOnly?: boolean;
  productLocked?: boolean;
};

const CURRENCY_OPTIONS = [
  { value: "NGN", label: "NGN — Nigerian Naira (₦)" },
  { value: "USD", label: "USD — US Dollar ($)" },
  { value: "GBP", label: "GBP — British Pound (£)" },
  { value: "EUR", label: "EUR — Euro (€)" },
  { value: "KES", label: "KES — Kenyan Shilling" },
  { value: "ZAR", label: "ZAR — South African Rand (R)" },
  { value: "GHS", label: "GHS — Ghanaian Cedi (GH₵)" },
];

const editableInput =
  "block w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400";

const readOnlyInput =
  "block w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600 cursor-default select-text";

function SectionHeading({
  question,
  helper,
  id,
}: {
  question: string;
  helper?: string;
  id?: string;
}) {
  return (
    <div className="pb-2">
      <p className="text-base font-semibold text-slate-800" id={id}>{question}</p>
      {helper ? <p className="mt-0.5 text-xs text-slate-400">{helper}</p> : null}
    </div>
  );
}

export function PricingTemplateDetailsStep({ form, onChange, readOnly = false, productLocked = false }: Props) {
  const [showTargeting, setShowTargeting] = useState(
    !!(form.region || form.customerSegment || form.campaignType)
  );
  const inputClass = readOnly ? readOnlyInput : editableInput;

  return (
    <div className="space-y-7">
      {/* Intro */}
      {!readOnly ? (
        <p className="text-sm text-slate-500 leading-relaxed">
          Create a pricing rule that DeployIQ can apply during customer onboarding and quotation.
        </p>
      ) : null}

      {/* ── Internal label ── */}
      <div className="space-y-2">
        <label htmlFor="tpl-name" className="block text-sm font-medium text-slate-700">
          Pricing rule name
          {!readOnly && <span className="ml-1 text-rose-500" aria-hidden="true">*</span>}
        </label>
        <input
          id="tpl-name"
          type="text"
          required={!readOnly}
          readOnly={readOnly}
          aria-readonly={readOnly}
          value={form.name}
          onChange={readOnly ? undefined : (e) => onChange({ name: e.target.value })}
          className={inputClass}
          placeholder={readOnly ? undefined : "e.g. Nigeria Retail — Q1 2026"}
        />
        {!readOnly ? (
          <p className="text-xs text-slate-400">
            This name is used internally. Customers do not see it.
          </p>
        ) : null}
      </div>

      {/* Description */}
      {(form.description || !readOnly) ? (
        <div className="space-y-2">
          <label htmlFor="tpl-desc" className="block text-sm font-medium text-slate-700">
            Description
          </label>
          <textarea
            id="tpl-desc"
            rows={2}
            readOnly={readOnly}
            aria-readonly={readOnly}
            value={form.description}
            onChange={readOnly ? undefined : (e) => onChange({ description: e.target.value })}
            className={`${inputClass} resize-none`}
            placeholder={readOnly ? undefined : "Optional — describe the intended market or use case."}
          />
        </div>
      ) : null}

      {/* ── SECTION A: What are you pricing? ── */}
      <fieldset className="space-y-3">
        <legend className="w-full">
          <SectionHeading
            id="section-a-heading"
            question="What are you pricing?"
            helper={readOnly ? undefined : "Choose the type of deployments this pricing rule covers."}
          />
        </legend>
        {productLocked ? (
          <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {resolveProductDisplayLabel(form.productKey)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                This template belongs to this product.
              </p>
            </div>
          </div>
        ) : (
          <ProductPricingSelector
            value={form.productKey}
            onChange={(key) => onChange({ productKey: key })}
            readOnly={readOnly}
          />
        )}
      </fieldset>

      <hr className="border-slate-100" />

      {/* ── SECTION B: Where will this apply? ── */}
      <fieldset className="space-y-3">
        <legend className="w-full">
          <SectionHeading
            id="section-b-heading"
            question="Where will this pricing apply?"
            helper={readOnly ? undefined : "Set the country and currency for this pricing rule."}
          />
        </legend>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Country */}
          <div className="space-y-1.5">
            <label htmlFor="tpl-country" className="block text-sm font-medium text-slate-700">
              Country
              {!readOnly && <span className="ml-1 text-rose-500" aria-hidden="true">*</span>}
            </label>
            <input
              id="tpl-country"
              type="text"
              readOnly={readOnly}
              aria-readonly={readOnly}
              value={form.country}
              onChange={readOnly ? undefined : (e) => onChange({ country: e.target.value })}
              className={inputClass}
              placeholder={readOnly ? undefined : "e.g. Nigeria"}
            />
          </div>

          {/* Currency */}
          <div className="space-y-1.5">
            <label htmlFor="tpl-currency" className="block text-sm font-medium text-slate-700">
              Currency
              {!readOnly && <span className="ml-1 text-rose-500" aria-hidden="true">*</span>}
            </label>
            {readOnly ? (
              <div
                id="tpl-currency"
                className={readOnlyInput}
                aria-readonly="true"
                aria-label={`Currency: ${CURRENCY_OPTIONS.find((o) => o.value === form.currency)?.label ?? form.currency}`}
              >
                {CURRENCY_OPTIONS.find((o) => o.value === form.currency)?.label ?? form.currency}
              </div>
            ) : (
              <select
                id="tpl-currency"
                value={form.currency}
                onChange={(e) => onChange({ currency: e.target.value })}
                className={inputClass}
              >
                {CURRENCY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Region — progressive disclosure */}
        {(form.region || !readOnly) ? (
          <div className="space-y-1.5">
            <label htmlFor="tpl-region" className="block text-sm font-medium text-slate-700">
              Region
              <span className="ml-2 text-xs font-normal text-slate-400">optional</span>
            </label>
            <input
              id="tpl-region"
              type="text"
              readOnly={readOnly}
              aria-readonly={readOnly}
              value={form.region}
              onChange={readOnly ? undefined : (e) => onChange({ region: e.target.value })}
              className={inputClass}
              placeholder={readOnly ? undefined : "e.g. South-West Nigeria"}
            />
            {!readOnly ? (
              <p className="text-xs text-slate-400">
                Leave blank to apply to all regions within the selected country.
              </p>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      <hr className="border-slate-100" />

      {/* ── SECTION C: Advanced targeting ── */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={readOnly ? undefined : () => setShowTargeting((v) => !v)}
          className={`flex w-full items-center justify-between px-4 py-4 text-left ${
            readOnly ? "cursor-default" : "hover:bg-slate-50 transition-colors rounded-xl"
          }`}
          aria-expanded={showTargeting}
          aria-controls="targeting-section"
          tabIndex={readOnly && !form.customerSegment && !form.campaignType ? -1 : 0}
        >
          <div>
            <span className="text-sm font-semibold text-slate-700">
              Advanced targeting
            </span>
            <span className="ml-2 text-xs font-normal text-slate-400">
              {showTargeting ? "—" : "customer segment, campaign type, region"}
            </span>
          </div>
          {readOnly ? null : (
            showTargeting
              ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
              : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          )}
        </button>

        {showTargeting ? (
          <div id="targeting-section" className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-4">
            {!readOnly ? (
              <p className="text-xs text-slate-400">
                Leave blank to apply this pricing rule to all customers and campaigns.
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="tpl-segment" className="block text-sm font-medium text-slate-700">
                  Customer segment
                </label>
                <input
                  id="tpl-segment"
                  type="text"
                  readOnly={readOnly}
                  aria-readonly={readOnly}
                  value={form.customerSegment}
                  onChange={readOnly ? undefined : (e) => onChange({ customerSegment: e.target.value })}
                  className={inputClass}
                  placeholder={readOnly ? undefined : "e.g. Enterprise FMCG"}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="tpl-campaign" className="block text-sm font-medium text-slate-700">
                  Campaign type
                </label>
                <input
                  id="tpl-campaign"
                  type="text"
                  readOnly={readOnly}
                  aria-readonly={readOnly}
                  value={form.campaignType}
                  onChange={readOnly ? undefined : (e) => onChange({ campaignType: e.target.value })}
                  className={inputClass}
                  placeholder={readOnly ? undefined : "e.g. Retail visibility rollout"}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Quotation settings ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="tpl-validity" className="block text-sm font-medium text-slate-700">
            Quotation validity
          </label>
          <div className="relative">
            <input
              id="tpl-validity"
              type="number"
              min="1"
              readOnly={readOnly}
              aria-readonly={readOnly}
              value={form.quotationValidityDays}
              onChange={readOnly ? undefined : (e) => onChange({ quotationValidityDays: e.target.value })}
              className={`${inputClass} pr-14`}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-xs text-slate-400">
              days
            </span>
          </div>
          {!readOnly ? (
            <p className="text-xs text-slate-400">
              Custom quotations sent to customers will expire after this many days.
            </p>
          ) : null}
        </div>

        <div className="flex items-end">
          {readOnly ? (
            <div
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5"
              aria-label={`Default template: ${form.isDefault ? "Yes" : "No"}`}
            >
              <input
                type="checkbox"
                checked={form.isDefault}
                disabled
                aria-disabled="true"
                readOnly
                className="h-4 w-4 cursor-not-allowed rounded border-slate-300 opacity-50"
              />
              <div>
                <span className="block text-sm font-medium text-slate-600">
                  {form.isDefault ? "Default pricing rule" : "Not set as default"}
                </span>
                <span className="block text-xs text-slate-400">Applied when no other rule matches</span>
              </div>
            </div>
          ) : (
            <label className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => onChange({ isDefault: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 accent-orange-500"
              />
              <div>
                <span className="block text-sm font-medium text-slate-700">Set as default rule</span>
                <span className="block text-xs text-slate-400">
                  Applied when no other rule matches the customer
                </span>
              </div>
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { FormState } from "./types";

type Props = {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
  readOnly?: boolean;
};

const PRODUCT_OPTIONS = [
  { value: "retail",     label: "Retail" },
  { value: "enterprise", label: "Enterprise" },
  { value: "sme",        label: "SME" },
];

const CURRENCY_OPTIONS = [
  { value: "NGN", label: "NGN — Nigerian Naira (₦)" },
  { value: "USD", label: "USD — US Dollar ($)" },
  { value: "GBP", label: "GBP — British Pound (£)" },
  { value: "EUR", label: "EUR — Euro (€)" },
  { value: "KES", label: "KES — Kenyan Shilling" },
  { value: "ZAR", label: "ZAR — South African Rand (R)" },
  { value: "GHS", label: "GHS — Ghanaian Cedi (GH₵)" },
];

/** Base class for editable fields. */
const editableInput =
  "block w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400";

/** Class for read-only fields: visually muted, no focus ring, pointer stays default. */
const readOnlyInput =
  "block w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600 cursor-default select-text";

export function PricingTemplateDetailsStep({ form, onChange, readOnly = false }: Props) {
  // In read-only mode, auto-expand the optional section if any optional fields have values.
  const [showOptional, setShowOptional] = useState(
    !!(form.region || form.customerSegment || form.campaignType)
  );

  const inputClass = readOnly ? readOnlyInput : editableInput;

  return (
    <div className="space-y-5">
      {/* Template name */}
      <div className="space-y-1.5">
        <label htmlFor="tpl-name" className="block text-sm font-medium text-slate-700">
          Template name
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
          placeholder={readOnly ? undefined : "e.g. Nigeria Retail Standard Q1 2026"}
        />
        {!readOnly ? (
          <p className="text-xs text-slate-400">
            A clear, memorable name used internally by the platform team.
          </p>
        ) : null}
      </div>

      {/* Description */}
      {(form.description || !readOnly) ? (
        <div className="space-y-1.5">
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
            placeholder={readOnly ? undefined : "Optional — briefly describe the intended market or use case."}
          />
        </div>
      ) : null}

      {/* Product + Currency */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="tpl-product" className="block text-sm font-medium text-slate-700">
            Product
            {!readOnly && <span className="ml-1 text-rose-500" aria-hidden="true">*</span>}
          </label>
          {readOnly ? (
            /* Display selected product label in read-only mode */
            <div
              id="tpl-product"
              aria-label={`Product: ${PRODUCT_OPTIONS.find((o) => o.value === form.productKey)?.label ?? form.productKey}`}
              className={readOnlyInput}
              aria-readonly="true"
            >
              {PRODUCT_OPTIONS.find((o) => o.value === form.productKey)?.label ?? form.productKey}
            </div>
          ) : (
            <select
              id="tpl-product"
              value={form.productKey}
              onChange={(e) => onChange({ productKey: e.target.value })}
              className={inputClass}
            >
              {PRODUCT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="tpl-currency" className="block text-sm font-medium text-slate-700">
            Currency
            {!readOnly && <span className="ml-1 text-rose-500" aria-hidden="true">*</span>}
          </label>
          {readOnly ? (
            <div
              id="tpl-currency"
              aria-label={`Currency: ${CURRENCY_OPTIONS.find((o) => o.value === form.currency)?.label ?? form.currency}`}
              className={readOnlyInput}
              aria-readonly="true"
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

      {/* Country */}
      {(form.country || !readOnly) ? (
        <div className="space-y-1.5">
          <label htmlFor="tpl-country" className="block text-sm font-medium text-slate-700">
            Country
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
      ) : null}

      {/* Quotation validity + Default */}
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
        </div>

        <div className="flex items-end">
          {readOnly ? (
            /* Read-only state: display-only checkbox row, removed from tab order */
            <div
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5"
              aria-label={`Default template: ${form.isDefault ? "Yes" : "No"}`}
            >
              <input
                type="checkbox"
                checked={form.isDefault}
                disabled
                aria-disabled="true"
                aria-label="Default template"
                className="h-4 w-4 cursor-not-allowed rounded border-slate-300 opacity-50"
                readOnly
              />
              <div>
                <span className="block text-sm font-medium text-slate-600">
                  {form.isDefault ? "Default template" : "Not default"}
                </span>
                <span className="block text-xs text-slate-400">
                  Applied when no other template matches
                </span>
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
                <span className="block text-sm font-medium text-slate-700">Set as default</span>
                <span className="block text-xs text-slate-400">
                  Applied when no other template matches
                </span>
              </div>
            </label>
          )}
        </div>
      </div>

      {/* Optional targeting */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setShowOptional((v) => !v)}
          className={`flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-left transition-colors ${
            readOnly ? "cursor-default" : "hover:bg-slate-50"
          }`}
          aria-expanded={showOptional}
          tabIndex={readOnly && !form.region && !form.customerSegment && !form.campaignType ? -1 : 0}
        >
          <span className="text-sm font-medium text-slate-700">
            Additional targeting options
            {!readOnly && <span className="ml-2 text-xs font-normal text-slate-400">optional</span>}
          </span>
          {showOptional
            ? <ChevronUp className="h-4 w-4 text-slate-400" />
            : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>

        {showOptional ? (
          <div className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-4">
            {!readOnly ? (
              <p className="text-xs text-slate-400">
                Target this template to a specific region, audience, or campaign.
                Leave blank to match all within the selected product and currency.
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="tpl-region" className="block text-sm font-medium text-slate-700">
                  Region
                </label>
                <input
                  id="tpl-region"
                  type="text"
                  readOnly={readOnly}
                  aria-readonly={readOnly}
                  value={form.region}
                  onChange={readOnly ? undefined : (e) => onChange({ region: e.target.value })}
                  className={inputClass}
                  placeholder={readOnly ? undefined : "e.g. South-West"}
                />
              </div>
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
                  placeholder={readOnly ? undefined : "e.g. enterprise-banks"}
                />
              </div>
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
                placeholder={readOnly ? undefined : "e.g. q1-promo"}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

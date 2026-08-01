"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { KNOWN_PRODUCT_OPTIONS, CUSTOM_PRODUCT_SENTINEL, isCustomProductKey } from "./wizardUtils";

type Props = {
  value: string;
  onChange: (key: string) => void;
  readOnly?: boolean;
};

const DESCRIPTIONS: Record<string, string> = {
  retail:               "Standard retail site and outlet campaigns",
  fleet:                "Vehicle wrapping and fleet marking",
  "asset-verification": "Physical asset auditing and verification",
  construction:         "Site progress and compliance monitoring",
  "outdoor-advertising":"Billboard and outdoor media auditing",
  "event-activation":   "Event setup and activation tracking",
};

export function ProductPricingSelector({ value, onChange, readOnly = false }: Props) {
  const isCustom = isCustomProductKey(value);
  const [customInput, setCustomInput] = useState(isCustom ? value : "");

  if (readOnly) {
    const known = KNOWN_PRODUCT_OPTIONS.find((o) => o.value === value);
    return (
      <div
        className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600 cursor-default"
        aria-readonly="true"
      >
        {known ? known.label : value}
      </div>
    );
  }

  return (
    <div className="space-y-3" role="radiogroup" aria-label="Select product type">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        {KNOWN_PRODUCT_OPTIONS.map((opt) => {
          const isSelected = !isCustom && value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange(opt.value)}
              className={`group relative flex flex-col rounded-xl border px-3.5 py-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-orange-300 ${
                isSelected
                  ? "border-orange-400 bg-orange-50 ring-1 ring-orange-300"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {isSelected ? (
                <span className="absolute right-2.5 top-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500">
                  <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                </span>
              ) : null}
              <span className={`block text-sm font-semibold ${isSelected ? "text-orange-900" : "text-slate-800"}`}>
                {opt.label}
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-slate-400">
                {DESCRIPTIONS[opt.value] ?? ""}
              </span>
            </button>
          );
        })}

        {/* Custom product tile */}
        <button
          type="button"
          role="radio"
          aria-checked={isCustom}
          onClick={() => {
            onChange(customInput || "");
          }}
          className={`group relative flex flex-col rounded-xl border px-3.5 py-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-orange-300 ${
            isCustom
              ? "border-orange-400 bg-orange-50 ring-1 ring-orange-300"
              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
          }`}
        >
          {isCustom ? (
            <span className="absolute right-2.5 top-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500">
              <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
            </span>
          ) : null}
          <span className={`block text-sm font-semibold ${isCustom ? "text-orange-900" : "text-slate-800"}`}>
            Custom product
          </span>
          <span className="mt-0.5 block text-xs leading-snug text-slate-400">
            Define your own product identifier
          </span>
        </button>
      </div>

      {/* Custom product key input */}
      {isCustom ? (
        <div className="space-y-1.5 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
          <label htmlFor="custom-product-key" className="block text-xs font-medium text-orange-800">
            Product identifier <span className="text-rose-500">*</span>
          </label>
          <input
            id="custom-product-key"
            type="text"
            value={customInput}
            onChange={(e) => {
              const v = e.target.value.toLowerCase().replace(/\s+/g, "-");
              setCustomInput(v);
              onChange(v);
            }}
            placeholder="e.g. site-audit"
            className="block w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
          />
          <p className="text-xs text-orange-700">
            Use lowercase letters and hyphens only. This is stored as the internal product key.
          </p>
        </div>
      ) : null}
    </div>
  );
}

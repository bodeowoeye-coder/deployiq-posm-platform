"use client";

import { Check } from "lucide-react";
import { PRICING_MODEL_OPTIONS } from "./wizardUtils";

type Props = {
  value: string;
  onChange: (method: string) => void;
  readOnly?: boolean;
};

export function PricingModelSelector({ value, onChange, readOnly = false }: Props) {
  if (readOnly) {
    const selected = PRICING_MODEL_OPTIONS.find((o) => o.value === value);
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600">
        {selected?.label ?? value}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Select pricing model">
      {PRICING_MODEL_OPTIONS.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(opt.value)}
            className={`relative flex flex-col rounded-xl border px-4 py-4 text-left transition-all focus:outline-none focus:ring-2 focus:ring-orange-300 ${
              isSelected
                ? "border-orange-400 bg-orange-50 ring-1 ring-orange-300"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            {isSelected ? (
              <span className="absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500">
                <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} aria-hidden="true" />
              </span>
            ) : null}
            <span className={`block text-sm font-semibold ${isSelected ? "text-orange-900" : "text-slate-800"}`}>
              {opt.label}
            </span>
            <span className="mt-1.5 block text-xs leading-snug text-slate-500">
              {opt.description}
            </span>
            <span className={`mt-2.5 block rounded-lg px-2.5 py-2 text-xs text-slate-500 font-mono ${
              isSelected ? "bg-orange-100/70" : "bg-slate-50"
            }`}>
              {opt.example}
            </span>
          </button>
        );
      })}
    </div>
  );
}

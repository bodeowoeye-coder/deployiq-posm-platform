"use client";

import { buildPricingRuleExplanation } from "./wizardUtils";
import type { TierFormItem } from "@/lib/commercial/pricing/tierEditor";

type Props = {
  tiers: TierFormItem[];
  currency: string;
  pricingMethod?: string;
};

export function PricingRuleExplanation({ tiers, currency, pricingMethod = "progressive_tiered" }: Props) {
  if (tiers.length === 0) return null;

  const lines = buildPricingRuleExplanation(tiers, currency, pricingMethod);

  if (lines.length === 0) return null;
  return (
    <div
      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4"
      aria-label="Pricing rule explanation"
      aria-live="polite"
    >
      <p className="mb-2.5 text-sm font-semibold text-slate-800">How this pricing works</p>
      <p className="mb-2 text-sm text-slate-500">This pricing rule charges:</p>
      <ul className="space-y-1.5" role="list">
        {lines.map((line, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
            <span
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400"
              aria-hidden="true"
            />
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

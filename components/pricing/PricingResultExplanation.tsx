"use client";

import { buildPreviewExplanation } from "./wizardUtils";
import type { PreviewTierRow } from "./types";

type Props = {
  quantity: number;
  tierBreakdown: PreviewTierRow[];
};

export function PricingResultExplanation({ quantity, tierBreakdown }: Props) {
  const explanation = buildPreviewExplanation(quantity, tierBreakdown);
  if (!explanation) return null;

  return (
    <div
      className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3"
      role="note"
      aria-label="Pricing result explanation"
    >
      <p className="text-sm font-medium text-sky-800">{explanation}</p>
    </div>
  );
}

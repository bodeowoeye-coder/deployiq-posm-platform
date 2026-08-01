/**
 * Pure utility functions for the pricing tier editor UI.
 * No React or DB dependencies — fully testable with node --test.
 */

export type TierFormItem = {
  sequence: number;
  minimumQuantity: number;
  maximumQuantity: number | null; // null = open-ended
  unitPrice: number;
  fixedCharge: number;
  enterpriseAction: string | null;
  isEnterpriseTier: boolean; // UI-only flag; drives enterpriseAction on submit
};

export type TierFieldErrors = {
  minimumQuantity?: string;
  maximumQuantity?: string;
  unitPrice?: string;
  fixedCharge?: string;
};

// ---------------------------------------------------------------------------
// Currency helpers
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: "₦",
  USD: "$",
  GBP: "£",
  EUR: "€",
  ZAR: "R",
  KES: "KSh",
  GHS: "GH₵",
};

export function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? `${currency} `;
}

export function formatQuantity(n: number): string {
  return Math.floor(n).toLocaleString("en-US");
}

export function formatMoney(n: number, currency: string): string {
  return `${currencySymbol(currency)}${Math.floor(n).toLocaleString("en-US")}`;
}

// ---------------------------------------------------------------------------
// Tier construction
// ---------------------------------------------------------------------------

export function createFirstTier(): TierFormItem {
  return {
    sequence: 1,
    minimumQuantity: 1,
    maximumQuantity: 5000,
    unitPrice: 500,
    fixedCharge: 0,
    enterpriseAction: null,
    isEnterpriseTier: false,
  };
}

export function addTierAfterLast(tiers: TierFormItem[]): TierFormItem[] {
  if (tiers.length === 0) return [createFirstTier()];
  const last = tiers[tiers.length - 1];
  const newMin =
    last.maximumQuantity !== null && last.maximumQuantity > 0
      ? last.maximumQuantity + 1
      : last.minimumQuantity + 1;
  return [
    ...tiers,
    {
      sequence: tiers.length + 1,
      minimumQuantity: newMin,
      maximumQuantity: null,
      unitPrice: 0,
      fixedCharge: 0,
      enterpriseAction: null,
      isEnterpriseTier: false,
    },
  ];
}

export function removeTierAt(tiers: TierFormItem[], index: number): TierFormItem[] {
  if (tiers.length <= 1) return tiers;
  return tiers
    .filter((_, i) => i !== index)
    .map((tier, i) => ({ ...tier, sequence: i + 1 }));
}

/**
 * Apply a partial update to tier[index] and, when maximumQuantity changes,
 * automatically propagate the new minimum to the immediately following tier.
 */
export function updateTierAndPropagate(
  tiers: TierFormItem[],
  index: number,
  patch: Partial<TierFormItem>
): TierFormItem[] {
  const next = tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier));
  if ("maximumQuantity" in patch && index < next.length - 1) {
    const newMax = next[index].maximumQuantity;
    if (newMax !== null && newMax > 0) {
      next[index + 1] = { ...next[index + 1], minimumQuantity: newMax + 1 };
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateFormTiers(tiers: TierFormItem[]): TierFieldErrors[] {
  return tiers.map((tier, index) => {
    const errors: TierFieldErrors = {};
    const prev = index > 0 ? tiers[index - 1] : null;

    // Minimum quantity checks
    if (index === 0 && tier.minimumQuantity !== 1) {
      errors.minimumQuantity = "First tier must start at 1.";
    } else if (tier.minimumQuantity < 1) {
      errors.minimumQuantity = "Must be 1 or more.";
    } else if (prev !== null && prev.maximumQuantity !== null) {
      if (tier.minimumQuantity <= prev.maximumQuantity) {
        errors.minimumQuantity = `Overlaps Tier ${prev.sequence} (ends at ${formatQuantity(prev.maximumQuantity)}).`;
      } else if (tier.minimumQuantity !== prev.maximumQuantity + 1) {
        errors.minimumQuantity = `Gap detected — expected ${formatQuantity(prev.maximumQuantity + 1)}.`;
      }
    }

    // Maximum quantity checks (only for non-enterprise tiers)
    if (!tier.isEnterpriseTier) {
      if (tier.maximumQuantity !== null) {
        if (tier.maximumQuantity < 1) {
          errors.maximumQuantity = "Must be 1 or more.";
        } else if (tier.maximumQuantity < tier.minimumQuantity) {
          errors.maximumQuantity = "Must be ≥ From quantity.";
        }
      }
    }

    // Price checks
    if (tier.unitPrice < 0) errors.unitPrice = "Must be 0 or more.";
    if (tier.fixedCharge < 0) errors.fixedCharge = "Must be 0 or more.";

    return errors;
  });
}

export function hasValidationErrors(errors: TierFieldErrors[]): boolean {
  return errors.some((e) => Object.keys(e).length > 0);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export function buildTierSummaryLines(tiers: TierFormItem[], currency: string): string[] {
  const sym = currencySymbol(currency);
  return tiers.map((tier) => {
    const from = formatQuantity(tier.minimumQuantity);
    if (tier.isEnterpriseTier || tier.enterpriseAction === "request_quotation") {
      return `${from}+ — Request quotation`;
    }
    if (tier.maximumQuantity === null) {
      return `${from}+ — ${sym}${tier.unitPrice.toLocaleString("en-US")} per deployment`;
    }
    return `${from}–${formatQuantity(tier.maximumQuantity)} — ${sym}${tier.unitPrice.toLocaleString("en-US")} per deployment`;
  });
}

/**
 * Pure, side-effect-free utilities for the pricing wizard.
 * No React, no fetch — fully testable with node --test.
 * Relative imports with .ts extension for compatibility with node --test runner.
 */
import type { PricingTemplate } from "../../lib/commercial/pricing/types.ts";
import {
  createFirstTier,
  currencySymbol,
  formatQuantity,
  type TierFormItem,
} from "../../lib/commercial/pricing/tierEditor.ts";
import type { FormState, PreviewResult, PreviewTierRow } from "./types.ts";

// ---------------------------------------------------------------------------
// Pricing model catalogue (UI-layer, maps to pricing_method values)
// ---------------------------------------------------------------------------

export const PRICING_MODEL_OPTIONS = [
  {
    value: "progressive_tiered" as const,
    label: "Progressive Pricing",
    summary: "Rollout split across pricing bands",
    description: "Each portion of the rollout is charged using the applicable band.",
    example: "5,000 locations at Band 1 rate + 3,000 locations at Band 2 rate",
  },
  {
    value: "volume_tiered" as const,
    label: "Volume Pricing",
    summary: "Entire rollout priced at the qualifying band rate",
    description: "The full rollout uses the rate for the quantity band it qualifies for.",
    example: "8,000 locations — all charged at the 5,001–10,000 band rate",
  },
  {
    value: "flat_rate" as const,
    label: "Flat-Rate Pricing",
    summary: "One rate applies to all deployment locations",
    description: "Every deployment location uses the same rate.",
    example: "8,000 locations all charged at the same rate",
  },
] as const;

export function getPricingModelLabel(method: string): string {
  return PRICING_MODEL_OPTIONS.find((o) => o.value === method)?.label ?? "Pricing";
}

export function getPricingModelSummary(method: string): string {
  return PRICING_MODEL_OPTIONS.find((o) => o.value === method)?.summary ?? "";
}

// ---------------------------------------------------------------------------
// Model-switch helpers
// ---------------------------------------------------------------------------

/** Returns true when there are more than one automatic (non-enterprise) tiers. */
export function hasMultipleAutoTiers(tiers: TierFormItem[]): boolean {
  return tiers.filter((t) => !t.isEnterpriseTier && t.enterpriseAction !== "request_quotation").length > 1;
}

/**
 * Build a single-tier flat-rate structure from existing tiers,
 * preserving the first automatic tier's unit price and fixed charge.
 */
export function resetTiersForFlatRate(tiers: TierFormItem[]): TierFormItem[] {
  const firstAuto = tiers.find((t) => !t.isEnterpriseTier && t.enterpriseAction !== "request_quotation");
  return [{
    sequence: 1,
    minimumQuantity: 1,
    maximumQuantity: null,
    unitPrice: firstAuto?.unitPrice ?? 0,
    fixedCharge: firstAuto?.fixedCharge ?? 0,
    enterpriseAction: null,
    isEnterpriseTier: false,
  }];
}

export const KNOWN_PRODUCT_OPTIONS = [
  { value: "retail",               label: "Retail Deployment" },
  { value: "fleet",                label: "Fleet Branding" },
  { value: "asset-verification",   label: "Asset Verification" },
  { value: "construction",         label: "Construction Monitoring" },
  { value: "outdoor-advertising",  label: "Outdoor Advertising Audit" },
  { value: "event-activation",     label: "Event Activation Monitoring" },
] as const;

/** Sentinel value used in the product selector to indicate a custom product key. */
export const CUSTOM_PRODUCT_SENTINEL = "__custom__";

export function resolveProductDisplayLabel(productKey: string): string {
  const known = KNOWN_PRODUCT_OPTIONS.find((o) => o.value === productKey);
  return known ? known.label : productKey;
}

export function isCustomProductKey(productKey: string): boolean {
  return !KNOWN_PRODUCT_OPTIONS.some((o) => o.value === productKey);
}

export function createDefaultFormState(): FormState {
  return {
    name: "",
    description: "",
    productKey: "retail",
    currency: "NGN",
    country: "Nigeria",
    region: "",
    customerSegment: "",
    campaignType: "",
    pricingMetric: "deployment_location",
    pricingMethod: "progressive_tiered",
    status: "draft",
    isDefault: false,
    quotationValidityDays: "14",
    tiers: [createFirstTier()],
  };
}

export function templateToFormState(template: PricingTemplate): FormState {
  return {
    name: template.name,
    description: template.description ?? "",
    productKey: template.product_key,
    currency: template.currency,
    country: template.country ?? "",
    region: template.region ?? "",
    customerSegment: template.customer_segment ?? "",
    campaignType: template.campaign_type ?? "",
    pricingMetric: template.pricing_metric,
    pricingMethod: template.pricing_method,
    status: template.status,
    isDefault: template.is_default,
    quotationValidityDays: String(template.quotation_validity_days ?? "14"),
    tiers: template.tiers.map((t) => ({
      sequence: t.sequence,
      minimumQuantity: t.minimum_quantity,
      maximumQuantity: t.maximum_quantity,
      unitPrice: t.unit_price,
      fixedCharge: t.fixed_charge ?? 0,
      isEnterpriseTier: t.enterprise_action === "request_quotation",
      enterpriseAction: t.enterprise_action,
    })),
  };
}

/** Offline preview calculation against current form tiers (no API call). */
export function calcDraftPreview(form: FormState, qty: number): PreviewResult {
  if (form.pricingMethod === "volume_tiered") {
    return calcVolumeDraftPreview(form, qty);
  }
  if (form.pricingMethod === "flat_rate") {
    return calcFlatRateDraftPreview(form, qty);
  }
  return calcProgressiveDraftPreview(form, qty);
}

function makeEnterpriseResult(form: FormState, qty: number, tier: TierFormItem): PreviewResult {
  return {
    quantity: qty,
    currency: form.currency,
    tierBreakdown: [{
      sequence: tier.sequence,
      minimum_quantity: tier.minimumQuantity,
      maximum_quantity: null,
      applicable_quantity: qty,
      unit_price: 0,
      fixed_charge: 0,
      subtotal: 0,
      enterprise_action: "request_quotation",
      label: `Tier ${tier.sequence}: ${formatQuantity(tier.minimumQuantity)}+`,
    }],
    subtotal: 0,
    total: 0,
    includedAdminUsers: 0,
    quotationStatus: "request_quotation",
    requiresEnterpriseReview: true,
  };
}

function calcProgressiveDraftPreview(form: FormState, qty: number): PreviewResult {
  let total = 0;
  const breakdown: PreviewTierRow[] = [];

  for (const tier of form.tiers) {
    const min = tier.minimumQuantity;

    if (tier.isEnterpriseTier) {
      if (qty >= min) breakdown.push({ sequence: tier.sequence, minimum_quantity: min, maximum_quantity: null, applicable_quantity: qty - min + 1, unit_price: 0, fixed_charge: 0, subtotal: 0, enterprise_action: "request_quotation", label: `Tier ${tier.sequence}: ${formatQuantity(min)}+` });
      break;
    }

    const max = tier.maximumQuantity;
    if (max !== null) {
      const end = Math.min(qty, max);
      if (end >= min) {
        const applicable = end - min + 1;
        const subtotal = applicable * tier.unitPrice + tier.fixedCharge;
        total += subtotal;
        breakdown.push({ sequence: tier.sequence, minimum_quantity: min, maximum_quantity: max, applicable_quantity: applicable, unit_price: tier.unitPrice, fixed_charge: tier.fixedCharge, subtotal, enterprise_action: null, label: `Tier ${tier.sequence}: ${formatQuantity(min)} – ${formatQuantity(max)}` });
        if (qty <= max) break;
      }
    } else {
      if (qty >= min) {
        const applicable = qty - min + 1;
        const subtotal = applicable * tier.unitPrice + tier.fixedCharge;
        total += subtotal;
        breakdown.push({ sequence: tier.sequence, minimum_quantity: min, maximum_quantity: null, applicable_quantity: applicable, unit_price: tier.unitPrice, fixed_charge: tier.fixedCharge, subtotal, enterprise_action: null, label: `Tier ${tier.sequence}: ${formatQuantity(min)}+` });
      }
    }
  }

  const requiresEnterprise = breakdown.some((r) => r.enterprise_action === "request_quotation");
  return { quantity: qty, currency: form.currency, tierBreakdown: breakdown, subtotal: total, total: requiresEnterprise ? 0 : total, includedAdminUsers: 0, quotationStatus: requiresEnterprise ? "request_quotation" : "calculated", requiresEnterpriseReview: requiresEnterprise };
}

function calcVolumeDraftPreview(form: FormState, qty: number): PreviewResult {
  for (const tier of form.tiers) {
    const min = tier.minimumQuantity;
    const max = tier.isEnterpriseTier ? null : tier.maximumQuantity;
    if (qty >= min && (max === null || qty <= max)) {
      if (tier.isEnterpriseTier) return makeEnterpriseResult(form, qty, tier);
      const subtotal = qty * tier.unitPrice + tier.fixedCharge;
      return {
        quantity: qty,
        currency: form.currency,
        tierBreakdown: [{ sequence: tier.sequence, minimum_quantity: min, maximum_quantity: max, applicable_quantity: qty, unit_price: tier.unitPrice, fixed_charge: tier.fixedCharge, subtotal, enterprise_action: null, label: `Tier ${tier.sequence}: ${formatQuantity(min)}${max ? ` – ${formatQuantity(max)}` : "+"}` }],
        subtotal,
        total: subtotal,
        includedAdminUsers: 0,
        quotationStatus: "calculated",
        requiresEnterpriseReview: false,
      };
    }
  }
  throw new Error(`No qualifying tier found for quantity ${formatQuantity(qty)}.`);
}

function calcFlatRateDraftPreview(form: FormState, qty: number): PreviewResult {
  const autoTier = form.tiers.find((t) => !t.isEnterpriseTier);
  const enterpriseTier = form.tiers.find((t) => t.isEnterpriseTier);
  if (!autoTier) {
    return enterpriseTier ? makeEnterpriseResult(form, qty, enterpriseTier) : { quantity: qty, currency: form.currency, tierBreakdown: [], subtotal: 0, total: 0, includedAdminUsers: 0, quotationStatus: "request_quotation", requiresEnterpriseReview: true };
  }
  if (autoTier.maximumQuantity !== null && qty > autoTier.maximumQuantity && enterpriseTier) {
    return makeEnterpriseResult(form, qty, enterpriseTier);
  }
  const subtotal = qty * autoTier.unitPrice + autoTier.fixedCharge;
  return {
    quantity: qty,
    currency: form.currency,
    tierBreakdown: [{ sequence: autoTier.sequence, minimum_quantity: autoTier.minimumQuantity, maximum_quantity: autoTier.maximumQuantity, applicable_quantity: qty, unit_price: autoTier.unitPrice, fixed_charge: autoTier.fixedCharge, subtotal, enterprise_action: null, label: `Flat rate` }],
    subtotal,
    total: subtotal,
    includedAdminUsers: 0,
    quotationStatus: "calculated",
    requiresEnterpriseReview: false,
  };
}

export function isEnterpriseOnlyForm(form: FormState): boolean {
  return form.tiers.every(
    (t) => t.isEnterpriseTier || t.enterpriseAction === "request_quotation"
  );
}

/** Build the POST/PATCH body from form state. */
export function formStateToApiBody(
  form: FormState,
  savedTemplateId: string | null
): Record<string, unknown> {
  return {
    ...(savedTemplateId ? { templateId: savedTemplateId } : {}),
    name: form.name,
    description: form.description,
    productKey: form.productKey,
    currency: form.currency,
    country: form.country || null,
    region: form.region || null,
    customerSegment: form.customerSegment || null,
    campaignType: form.campaignType || null,
    pricingMetric: form.pricingMetric,
    pricingMethod: form.pricingMethod,
    status: form.status,
    isDefault: form.isDefault,
    quotationValidityDays: form.quotationValidityDays ? Number(form.quotationValidityDays) : null,
    tiers: form.tiers.map((tier) => ({
      sequence: tier.sequence,
      minimumQuantity: tier.minimumQuantity,
      maximumQuantity: tier.isEnterpriseTier ? null : tier.maximumQuantity,
      unitPrice: tier.unitPrice,
      fixedCharge: tier.fixedCharge,
      enterpriseAction: tier.isEnterpriseTier ? "request_quotation" : tier.enterpriseAction,
    })),
  };
}

// ---------------------------------------------------------------------------
// Plain-language pricing rule explanation
// ---------------------------------------------------------------------------

/**
 * Generate plain-language bullet statements from form tiers.
 * Used by PricingRuleExplanation below the tier table.
 */
export function buildPricingRuleExplanation(tiers: TierFormItem[], currency: string, pricingMethod = "progressive_tiered"): string[] {
  const sym = currencySymbol(currency);

  if (pricingMethod === "flat_rate") {
    const autoTier = tiers.find((t) => !t.isEnterpriseTier);
    const enterpriseTier = tiers.find((t) => t.isEnterpriseTier);
    const lines: string[] = [];
    if (autoTier) {
      lines.push(`${sym}${autoTier.unitPrice.toLocaleString("en-US")} per deployment location for any rollout size.`);
    }
    if (enterpriseTier) {
      const above = formatQuantity(enterpriseTier.minimumQuantity - 1);
      lines.push(`Rollouts above ${above} locations require a custom quotation.`);
    }
    return lines;
  }

  if (pricingMethod === "volume_tiered") {
    return tiers.map((tier) => {
      if (tier.isEnterpriseTier || tier.enterpriseAction === "request_quotation") {
        const above = formatQuantity(tier.minimumQuantity - 1);
        return `Rollouts above ${above} locations require a custom quotation.`;
      }
      const priceStr = `${sym}${tier.unitPrice.toLocaleString("en-US")}`;
      if (tier.maximumQuantity === null) {
        return `${priceStr} per location for ${formatQuantity(tier.minimumQuantity)} locations and above (full rollout charged at this rate).`;
      }
      const to = formatQuantity(tier.maximumQuantity);
      if (tier.minimumQuantity === 1) {
        return `${priceStr} per location for rollouts up to ${to} locations.`;
      }
      return `${priceStr} per location for rollouts of ${formatQuantity(tier.minimumQuantity)} to ${to} locations.`;
    });
  }

  // Progressive (default)
  return tiers.map((tier) => {
    if (tier.isEnterpriseTier || tier.enterpriseAction === "request_quotation") {
      const above = formatQuantity(tier.minimumQuantity - 1);
      return `Rollouts above ${above} locations require a custom quotation.`;
    }
    const priceStr = `${sym}${tier.unitPrice.toLocaleString("en-US")}`;
    if (tier.maximumQuantity === null) {
      return `${priceStr} per deployment location for ${formatQuantity(tier.minimumQuantity)} locations and above.`;
    }
    const to = formatQuantity(tier.maximumQuantity);
    if (tier.minimumQuantity === 1) {
      return `${priceStr} per deployment location for the first ${to} locations.`;
    }
    return `${priceStr} per deployment location for locations ${formatQuantity(tier.minimumQuantity)} to ${to}.`;
  });
}

/**
 * Generate a plain-language sentence from a preview server response.
 * Used by PricingResultExplanation on the preview step.
 */
export function buildPreviewExplanation(
  quantity: number,
  tierBreakdown: PreviewTierRow[],
  pricingMethod = "progressive_tiered"
): string {
  if (tierBreakdown.length === 0) return "";
  const qtyStr = formatQuantity(quantity);

  if (pricingMethod === "flat_rate") {
    const row = tierBreakdown[0];
    if (row.enterprise_action === "request_quotation") {
      return `${qtyStr} locations triggers a custom quotation for the full rollout.`;
    }
    return `All ${qtyStr} deployment locations are charged at the same rate.`;
  }

  if (pricingMethod === "volume_tiered") {
    const row = tierBreakdown[0];
    if (row.enterprise_action === "request_quotation") {
      return `${qtyStr} locations triggers a custom quotation for the full rollout.`;
    }
    const min = formatQuantity(row.minimum_quantity);
    const max = row.maximum_quantity ? formatQuantity(row.maximum_quantity) : null;
    const bandLabel = max ? `${min} – ${max}` : `${min}+`;
    return `${qtyStr} locations qualify for the ${bandLabel} band. All ${qtyStr} locations are charged at this rate.`;
  }

  // Progressive
  if (tierBreakdown.length === 1) {
    const row = tierBreakdown[0];
    if (row.enterprise_action === "request_quotation") {
      return `${qtyStr} locations triggers a custom quotation for the full rollout.`;
    }
    return `For ${qtyStr} locations, DeployIQ applies Tier ${row.sequence} pricing for all ${formatQuantity(row.applicable_quantity)} locations.`;
  }

  const parts = tierBreakdown.map((row, i) => {
    const isFirst = i === 0;
    const isLast = i === tierBreakdown.length - 1;
    const qty = formatQuantity(row.applicable_quantity);
    if (row.enterprise_action === "request_quotation") {
      return `Tier ${row.sequence} triggers a custom quotation for the remaining ${qty}`;
    }
    if (isFirst) return `Tier ${row.sequence} to the first ${qty}`;
    if (isLast) return `Tier ${row.sequence} to the remaining ${qty}`;
    return `Tier ${row.sequence} to the next ${qty}`;
  });

  const lastPart = parts.pop()!;
  return `For ${qtyStr} locations, DeployIQ applies ${parts.join(", ")}, and ${lastPart}.`;
}

/** Returns true if any tier has a non-zero fixed charge. */
export function hasTierFixedCharges(tiers: TierFormItem[]): boolean {
  return tiers.some((t) => t.fixedCharge > 0);
}

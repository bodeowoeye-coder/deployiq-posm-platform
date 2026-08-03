/**
 * Customer-safe quotation transformation.
 * Strips technical pricing fields from the server result before sending to browser.
 * Pure functions — testable without database or HTTP.
 */
import type { PricingCalculationResult, PricingTemplate } from "../../commercial/pricing/types.ts";

export type CustomerQuotation = {
  productKey: string;
  currency: string;
  quantity: number;
  estimatedTotal: number;
  subtotal: number;
  pricingMethodLabel: string;
  pricingExplanation: string;
  includedAdminUsers: number;
  requiresEnterpriseReview: boolean;
  quotationExpiry: string | null;
  calculatedAt: string;
  tierBreakdown: CustomerTierRow[];
};

export type CustomerTierRow = {
  label: string;
  applicableQuantity: number;
  unitPrice: number;
  fixedCharge: number;
  subtotal: number;
  isEnterpriseRow: boolean;
};

/** Map internal pricing_method to a customer-friendly label. */
export function toPricingMethodLabel(pricingMethod: string): string {
  if (pricingMethod === "volume_tiered") return "Volume discount applied";
  if (pricingMethod === "flat_rate") return "Flat price per deployment location";
  return "Standard progressive pricing";
}

/** Generate a plain-language explanation for the customer. */
export function buildCustomerExplanation(
  result: PricingCalculationResult,
  template: Pick<PricingTemplate, "pricing_method">
): string {
  if (result.requires_enterprise_review) {
    return "Your rollout size qualifies for a custom enterprise quotation. Our team will prepare a tailored proposal.";
  }
  const rows = result.tier_breakdown ?? [];
  const qty = result.quantity.toLocaleString("en-US");

  if (template.pricing_method === "flat_rate") {
    return `All ${qty} deployment locations are charged at the same rate.`;
  }
  if (template.pricing_method === "volume_tiered") {
    return `Your rollout of ${qty} locations qualifies for a volume rate. All locations are priced at the applicable band.`;
  }
  if (rows.length <= 1) {
    return `All ${qty} deployment locations are charged at one rate.`;
  }
  return `Your rollout of ${qty} locations is priced progressively across ${rows.length} pricing bands.`;
}

/** Strip internal fields and return a customer-safe quotation object. */
export function toCustomerQuotation(
  result: PricingCalculationResult,
  template: Pick<PricingTemplate, "pricing_method">
): CustomerQuotation {
  return {
    productKey: result.product_key,
    currency: result.currency,
    quantity: result.quantity,
    estimatedTotal: result.total,
    subtotal: result.subtotal,
    pricingMethodLabel: toPricingMethodLabel(template.pricing_method),
    pricingExplanation: buildCustomerExplanation(result, template),
    includedAdminUsers: result.included_admin_users,
    requiresEnterpriseReview: result.requires_enterprise_review,
    quotationExpiry: result.quotation_expiry,
    calculatedAt: result.calculated_at,
    tierBreakdown: (result.tier_breakdown ?? []).map((row) => ({
      label: row.label,
      applicableQuantity: row.applicable_quantity,
      unitPrice: row.unit_price,
      fixedCharge: row.fixed_charge,
      subtotal: row.subtotal,
      isEnterpriseRow: row.enterprise_action === "request_quotation",
    })),
  };
}

/** Map country name to default currency — extend as new markets are configured. */
export function currencyForCountry(country: string): string {
  const map: Record<string, string> = {
    Nigeria: "NGN",
    Ghana: "GHS",
    Kenya: "KES",
    "South Africa": "ZAR",
    "United Kingdom": "GBP",
    "United States": "USD",
  };
  return map[country] ?? "NGN";
}

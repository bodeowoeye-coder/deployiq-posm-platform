/**
 * Customer-safe quotation transformation.
 * Strips technical pricing fields from the server result before sending to browser.
 * Pure functions — testable without database or HTTP.
 */
import type { PricingCalculationResult, PricingTemplate } from "../../commercial/pricing/types.ts";
import { resolveCommercialModel, resolveAllowedPaymentMethods } from "../../commercial/pricing/commercialModel.ts";
import type { CommercialModel, BillingBehaviour } from "../../commercial/pricing/commercialModel.ts";

export type CustomerQuotation = {
  productKey: string;
  /** ID of the pricing template that produced this quotation. */
  pricingTemplateId: string | null;
  pricingTemplateName: string | null;
  currency: string;
  quantity: number;
  estimatedTotal: number;
  subtotal: number;
  discountAmount: number;
  discountPercentage: number;
  discountLabel: string | null;
  pricingMethodLabel: string;
  pricingExplanation: string;
  includedAdminUsers: number;
  requiresEnterpriseReview: boolean;
  quotationExpiry: string | null;
  calculatedAt: string;
  tierBreakdown: CustomerTierRow[];
  /** Commercial model from the template — drives checkout rendering. */
  commercialModel: CommercialModel;
  billingBehaviour: BillingBehaviour;
  renewalRequired: boolean;
  /** Permitted payment methods for this quotation. Empty = all permitted. */
  allowedPaymentMethods: string[];
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
  const commercialModel = resolveCommercialModel(result.commercial_model);
  const billingBehaviour = (result.billing_behaviour as BillingBehaviour | null) ?? "single_payment";
  const discountAmount = result.discount ?? 0;
  const discountPercentage = (discountAmount > 0 && result.subtotal > 0)
    ? Math.round((discountAmount / result.subtotal) * 100)
    : 0;

  return {
    productKey: result.product_key,
    pricingTemplateId: result.pricing_template_id ?? null,
    pricingTemplateName: result.pricing_template_name ?? null,
    currency: result.currency,
    quantity: result.quantity,
    estimatedTotal: result.total,
    subtotal: result.subtotal,
    discountAmount,
    discountPercentage,
    discountLabel: discountAmount > 0 ? null : null, // populated by promotion engine in future
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
    commercialModel,
    billingBehaviour,
    renewalRequired: result.renewal_required ?? false,
    allowedPaymentMethods: resolveAllowedPaymentMethods(result.allowed_payment_methods),
  };
}

import { currencyForNormalisedCountry } from "../../commercial/pricing/countryNormalisation.ts";

/** Map country name or code to default currency — uses normalised country lookup. */
export function currencyForCountry(country: string): string {
  return currencyForNormalisedCountry(country);
}

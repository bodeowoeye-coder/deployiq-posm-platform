import type { PricingTemplateStatus } from "./types";

export function buildPricingTemplatePayload(input: {
  name: string;
  description?: string | null;
  productKey: string;
  currency: string;
  country?: string | null;
  region?: string | null;
  customerSegment?: string | null;
  campaignType?: string | null;
  pricingMetric?: string;
  pricingMethod?: string;
  status?: PricingTemplateStatus;
  isDefault?: boolean;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  quotationValidityDays?: number | null;
  tiers: Array<{
    sequence: number;
    minimumQuantity: number;
    maximumQuantity?: number | null;
    unitPrice: number;
    fixedCharge?: number | null;
    enterpriseAction?: string | null;
  }>;
}) {
  return {
    name: input.name,
    description: input.description ?? null,
    product_key: input.productKey,
    currency: input.currency,
    country: input.country ?? null,
    region: input.region ?? null,
    customer_segment: input.customerSegment ?? null,
    campaign_type: input.campaignType ?? null,
    pricing_metric: input.pricingMetric ?? "deployment_location",
    pricing_method: input.pricingMethod ?? "progressive_tiered",
    status: input.status ?? "draft",
    is_default: input.isDefault ?? false,
    effective_from: input.effectiveFrom ?? null,
    effective_to: input.effectiveTo ?? null,
    quotation_validity_days: input.quotationValidityDays ?? null,
    tiers: input.tiers.map((tier) => ({
      sequence: tier.sequence,
      minimum_quantity: tier.minimumQuantity,
      maximum_quantity: tier.maximumQuantity ?? null,
      unit_price: tier.unitPrice,
      fixed_charge: tier.fixedCharge ?? 0,
      enterprise_action: tier.enterpriseAction ?? null,
      status: "active"
    }))
  };
}

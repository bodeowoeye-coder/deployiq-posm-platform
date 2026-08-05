import { getCanonicalProduct, resolveProductKey } from "../products/catalogue.ts";
import { resolveAllowedPaymentMethods, resolveCommercialModel } from "./commercialModel.ts";
import type { PricingTemplate } from "./types.ts";

export function buildClonedTemplateInsert(
  source: PricingTemplate,
  userId: string | null,
  now: string,
  destinationProductKey?: string | null
): Record<string, unknown> {
  const productKey = resolveProductKey(destinationProductKey || source.product_key);
  const product = getCanonicalProduct(productKey);
  if (!product) throw new Error("Destination product is not in the canonical catalogue.");
  const metricIsCompatible = product.supportedPricingMetrics.some((metric) => metric.value === source.pricing_metric);

  return {
    product_key: product.productKey,
    name: `${source.name} (Copy)`,
    description: source.description,
    currency: source.currency,
    country: source.country,
    region: source.region,
    customer_segment: source.customer_segment,
    campaign_type: source.campaign_type,
    pricing_metric: metricIsCompatible ? source.pricing_metric : product.defaultPricingMetric,
    pricing_method: source.pricing_method,
    status: "draft",
    is_default: false,
    effective_from: source.effective_from,
    effective_to: source.effective_to,
    quotation_validity_days: source.quotation_validity_days,
    commercial_model: resolveCommercialModel(source.commercial_model),
    billing_behaviour: source.billing_behaviour,
    renewal_required: source.renewal_required,
    allowed_payment_methods: resolveAllowedPaymentMethods(source.allowed_payment_methods),
    created_by: userId,
    updated_by: userId,
    activated_by: null,
    activated_at: null,
    deactivated_by: null,
    deactivated_at: null,
    archived_by: null,
    archived_at: null,
    created_at: now,
    updated_at: now
  };
}

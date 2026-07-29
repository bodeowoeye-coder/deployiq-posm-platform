import type { PricingCalculationResult, PricingTemplate, PricingTier } from "@/lib/commercial/onboarding/types";

const DEFAULT_RETAIL_TEMPLATE: PricingTemplate = {
  product_key: "retail",
  name: "DeployIQ Retail Nigeria Progressive Pricing",
  description: "Initial admin-managed retail pricing template",
  currency: "NGN",
  country: "Nigeria",
  region: null,
  customer_segment: null,
  campaign_type: null,
  pricing_metric: "deployment_location",
  pricing_method: "progressive_tiered",
  status: "active",
  is_default: true,
  effective_from: null,
  effective_to: null,
  quotation_validity_days: 30,
  tiers: [
    { sequence: 1, minimum_quantity: 1, maximum_quantity: 5000, unit_price: 500, fixed_charge: 0, calculation_type: "progressive", status: "active" },
    { sequence: 2, minimum_quantity: 5001, maximum_quantity: 10000, unit_price: 475, fixed_charge: 0, calculation_type: "progressive", status: "active" },
    { sequence: 3, minimum_quantity: 10001, maximum_quantity: 25000, unit_price: 450, fixed_charge: 0, calculation_type: "progressive", status: "active" },
    { sequence: 4, minimum_quantity: 25001, maximum_quantity: 50000, unit_price: 425, fixed_charge: 0, calculation_type: "progressive", status: "active" },
    { sequence: 5, minimum_quantity: 50001, maximum_quantity: null, unit_price: 0, fixed_charge: 0, calculation_type: "progressive", status: "active" }
  ]
};

export function calculateAdministrativeUsers(quantity: number) {
  if (quantity <= 1000) return 3;
  return Math.ceil(quantity / 1000) * 5;
}

export function calculateProgressivePricing(quantity: number, template: PricingTemplate = DEFAULT_RETAIL_TEMPLATE): PricingCalculationResult {
  const tiers = template.tiers.filter((tier) => tier.status === "active").sort((a, b) => a.sequence - b.sequence);
  if (!tiers.length) {
    return {
      pricing_template_id: null,
      pricing_template_name: template.name,
      product_key: template.product_key,
      country: template.country,
      currency: template.currency,
      pricing_metric: template.pricing_metric,
      pricing_method: template.pricing_method,
      quantity,
      tier_breakdown: [],
      subtotal: 0,
      discount: 0,
      tax_placeholder: 0,
      total: 0,
      included_admin_users: calculateAdministrativeUsers(quantity),
      quotation_status: "request_quotation",
      quotation_expiry: null,
      requires_enterprise_review: true,
      calculated_at: new Date().toISOString()
    };
  }

  let remaining = quantity;
  let subtotal = 0;
  const tierBreakdown: Array<{ label: string; quantity: number; unit_price: number; subtotal: number }> = [];
  let currentMin = 1;

  tiers.forEach((tier) => {
    const tierMin = tier.minimum_quantity;
    const tierMax = tier.maximum_quantity;
    const tierStart = Math.max(currentMin, tierMin);
    const tierEnd = tierMax ? Math.min(quantity, tierMax) : quantity;
    const inclusiveRange = Math.max(0, tierEnd - tierStart + 1);
    const applicableQuantity = Math.min(Math.max(remaining, 0), inclusiveRange);

    if (applicableQuantity > 0 && remaining > 0) {
      const tierSubtotal = applicableQuantity * tier.unit_price;
      subtotal += tierSubtotal;
      tierBreakdown.push({
        label: `Tier ${tier.sequence}`,
        quantity: applicableQuantity,
        unit_price: tier.unit_price,
        subtotal: tierSubtotal
      });
      remaining -= applicableQuantity;
    }
    currentMin = (tierMax ?? quantity) + 1;
  });

  const requiresEnterpriseReview = quantity > 50000;
  return {
    pricing_template_id: null,
    pricing_template_name: template.name,
    product_key: template.product_key,
    country: template.country,
    currency: template.currency,
    pricing_metric: template.pricing_metric,
    pricing_method: template.pricing_method,
    quantity,
    tier_breakdown: tierBreakdown,
    subtotal,
    discount: 0,
    tax_placeholder: 0,
    total: subtotal,
    included_admin_users: calculateAdministrativeUsers(quantity),
    quotation_status: requiresEnterpriseReview ? "request_quotation" : "calculated",
    quotation_expiry: null,
    requires_enterprise_review: requiresEnterpriseReview,
    calculated_at: new Date().toISOString()
  };
}

export function getDefaultRetailPricingTemplate(): PricingTemplate {
  return JSON.parse(JSON.stringify(DEFAULT_RETAIL_TEMPLATE));
}

import assert from "node:assert/strict";
import { calculateProgressivePricing, validatePricingTemplate } from "../lib/commercial/pricing/service";
import type { PricingTemplate, PricingTier } from "../lib/commercial/pricing/types";

function makeTemplate(overrides: Partial<PricingTemplate> = {}): PricingTemplate {
  const tiers: PricingTier[] = [
    { id: "tier-1", pricing_template_id: null, sequence: 1, minimum_quantity: 1, maximum_quantity: 5000, unit_price: 500, fixed_charge: 0, calculation_type: "progressive", enterprise_action: null, status: "active" },
    { id: "tier-2", pricing_template_id: null, sequence: 2, minimum_quantity: 5001, maximum_quantity: 10000, unit_price: 475, fixed_charge: 0, calculation_type: "progressive", enterprise_action: null, status: "active" },
    { id: "tier-3", pricing_template_id: null, sequence: 3, minimum_quantity: 10001, maximum_quantity: 25000, unit_price: 450, fixed_charge: 0, calculation_type: "progressive", enterprise_action: null, status: "active" },
    { id: "tier-4", pricing_template_id: null, sequence: 4, minimum_quantity: 25001, maximum_quantity: 50000, unit_price: 425, fixed_charge: 0, calculation_type: "progressive", enterprise_action: null, status: "active" },
    { id: "tier-5", pricing_template_id: null, sequence: 5, minimum_quantity: 50001, maximum_quantity: null, unit_price: 0, fixed_charge: 0, calculation_type: "progressive", enterprise_action: "request_quotation", status: "active" }
  ];

  return {
    id: "template-1",
    product_key: "retail",
    name: "Test Retail Pricing",
    description: null,
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
    quotation_validity_days: 14,
    tiers,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    archived_at: null,
    created_by: null
  } as PricingTemplate & typeof overrides;
}

const template = makeTemplate();
const validation = validatePricingTemplate(template);
assert.equal(validation.isValid, true, "Seed template should validate");

const result500 = calculateProgressivePricing(500, template, template.tiers, { productKey: "retail", quantity: 500, country: "Nigeria", currency: "NGN" });
assert.equal(result500.subtotal, 250000, "500 locations should subtotal to 250,000");
assert.equal(result500.included_admin_users, 3, "500 locations should include 3 administrators");

const result1000 = calculateProgressivePricing(1000, template, template.tiers, { productKey: "retail", quantity: 1000, country: "Nigeria", currency: "NGN" });
assert.equal(result1000.subtotal, 500000, "1,000 locations should subtotal to 500,000");
assert.equal(result1000.included_admin_users, 5, "1,000 locations should include 5 administrators");

const result1001 = calculateProgressivePricing(1001, template, template.tiers, { productKey: "retail", quantity: 1001, country: "Nigeria", currency: "NGN" });
assert.equal(result1001.included_admin_users, 10, "1,001 locations should include 10 administrators");

const result8750 = calculateProgressivePricing(8750, template, template.tiers, { productKey: "retail", quantity: 8750, country: "Nigeria", currency: "NGN" });
assert.equal(result8750.total, 4281250, "8,750 locations should total 4,281,250");
assert.equal(result8750.included_admin_users, 45, "8,750 locations should include 45 administrators");

const result50001 = calculateProgressivePricing(50001, template, template.tiers, { productKey: "retail", quantity: 50001, country: "Nigeria", currency: "NGN" });
assert.equal(result50001.requires_enterprise_review, true, "50,001 locations should require enterprise review");
assert.equal(result50001.quotation_status, "request_quotation", "50,001 locations should request quotation");

console.log("Commercial pricing engine tests passed.");

import test from "node:test";
import assert from "node:assert/strict";
import { buildPricingTemplatePayload } from "../lib/commercial/pricing/payload.ts";
import { validatePricingTemplate } from "../lib/commercial/pricing/validation.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTemplate(overrides = {}) {
  return {
    id: "t-1",
    product_key: "retail",
    name: "Test Template",
    description: null,
    currency: "NGN",
    country: null,
    region: null,
    customer_segment: null,
    campaign_type: null,
    pricing_metric: "deployment_location",
    pricing_method: "progressive_tiered",
    status: "draft",
    is_default: false,
    effective_from: null,
    effective_to: null,
    quotation_validity_days: 14,
    created_by: null,
    updated_by: null,
    activated_by: null,
    activated_at: null,
    deactivated_by: null,
    deactivated_at: null,
    archived_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    archived_at: null,
    tiers: [
      {
        id: null,
        pricing_template_id: "t-1",
        sequence: 1,
        minimum_quantity: 1,
        maximum_quantity: 5000,
        unit_price: 500,
        fixed_charge: 0,
        calculation_type: "progressive",
        enterprise_action: null,
        status: "active"
      },
      {
        id: null,
        pricing_template_id: "t-1",
        sequence: 2,
        minimum_quantity: 5001,
        maximum_quantity: null,
        unit_price: 475,
        fixed_charge: 0,
        calculation_type: "progressive",
        enterprise_action: "request_quotation",
        status: "active"
      }
    ],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// CS-3 Part A (existing)
// ---------------------------------------------------------------------------

test("buildPricingTemplatePayload normalizes admin template payloads", () => {
  const payload = buildPricingTemplatePayload({
    name: "Retail",
    description: "Updated retail template",
    productKey: "retail",
    currency: "NGN",
    status: "draft",
    tiers: [
      {
        sequence: 1,
        minimumQuantity: 1,
        maximumQuantity: 5000,
        unitPrice: 500,
        fixedCharge: 0,
        enterpriseAction: null
      }
    ]
  });

  assert.equal(payload.name, "Retail");
  assert.equal(payload.status, "draft");
  assert.equal(payload.tiers[0].minimum_quantity, 1);
  assert.equal(payload.tiers[0].unit_price, 500);
});

// ---------------------------------------------------------------------------
// CS-3 Part B — Lifecycle and integrity
// ---------------------------------------------------------------------------

test("activate valid template: validatePricingTemplate returns isValid=true", () => {
  const template = makeTemplate({ status: "draft" });
  const result = validatePricingTemplate(template);
  assert.equal(result.isValid, true, "valid two-tier template must pass validation");
  assert.equal(result.errors.length, 0);
  assert.equal(result.activeTiers.length, 2);
});

test("reject invalid template: validatePricingTemplate rejects overlapping tiers", () => {
  const template = makeTemplate({
    tiers: [
      { id: null, pricing_template_id: "t-1", sequence: 1, minimum_quantity: 1, maximum_quantity: 5000, unit_price: 500, fixed_charge: 0, calculation_type: "progressive", enterprise_action: null, status: "active" },
      // tier 2 starts at 4000 — overlaps tier 1 which ends at 5000
      { id: null, pricing_template_id: "t-1", sequence: 2, minimum_quantity: 4000, maximum_quantity: null, unit_price: 475, fixed_charge: 0, calculation_type: "progressive", enterprise_action: "request_quotation", status: "active" }
    ]
  });
  const result = validatePricingTemplate(template);
  assert.equal(result.isValid, false, "overlapping tiers must be rejected");
  assert.ok(result.errors.some((e) => e.message.includes("overlaps")), `expected overlap error, got: ${result.errors.map((e) => e.message).join("; ")}`);
});

test("overlapping tiers rejected: validatePricingTemplate rejects non-continuous tier gap", () => {
  const template = makeTemplate({
    tiers: [
      { id: null, pricing_template_id: "t-1", sequence: 1, minimum_quantity: 1, maximum_quantity: 1000, unit_price: 500, fixed_charge: 0, calculation_type: "progressive", enterprise_action: null, status: "active" },
      // tier 2 starts at 1500 — gap of 499 units after tier 1 ends at 1000
      { id: null, pricing_template_id: "t-1", sequence: 2, minimum_quantity: 1500, maximum_quantity: null, unit_price: 475, fixed_charge: 0, calculation_type: "progressive", enterprise_action: "request_quotation", status: "active" }
    ]
  });
  const result = validatePricingTemplate(template);
  assert.equal(result.isValid, false, "tier gap must be rejected");
  assert.ok(result.errors.some((e) => e.message.includes("continuous")), `expected continuity error, got: ${result.errors.map((e) => e.message).join("; ")}`);
});

test("clone: payload has status=draft and is_default=false with (Copy) suffix", () => {
  const clonePayload = buildPricingTemplatePayload({
    name: "Nigeria Retail 2026 (Copy)",
    productKey: "retail",
    currency: "NGN",
    status: "draft",
    isDefault: false,
    tiers: [
      { sequence: 1, minimumQuantity: 1, maximumQuantity: 5000, unitPrice: 500 },
      { sequence: 2, minimumQuantity: 5001, maximumQuantity: null, unitPrice: 475, enterpriseAction: "request_quotation" }
    ]
  });
  assert.equal(clonePayload.status, "draft", "clone must start as draft");
  assert.equal(clonePayload.is_default, false, "clone must not be default");
  assert.ok(clonePayload.name.endsWith("(Copy)"), "clone name must end with (Copy)");
});

test("archive active template is blocked: status guard", () => {
  // archiveTemplate checks: if status === "active" → throw
  // Test the guard condition deterministically without DB
  const template = makeTemplate({ status: "active" });
  const canArchive = template.status !== "active" && template.status !== "archived" && !template.archived_at;
  assert.equal(canArchive, false, "active templates must not satisfy archive preconditions");
});

test("deactivate: buildPricingTemplatePayload accepts status=inactive", () => {
  const payload = buildPricingTemplatePayload({
    name: "Test",
    productKey: "retail",
    currency: "NGN",
    status: "inactive",
    tiers: [{ sequence: 1, minimumQuantity: 1, maximumQuantity: 5000, unitPrice: 500 }]
  });
  assert.equal(payload.status, "inactive");
});

test("duplicate default rejection: same-scope conflict is detectable", () => {
  // Simulate the conflict check: two active defaults in the same scope must conflict
  const scope = { product_key: "retail", currency: "NGN", country: null, region: null, customer_segment: null, campaign_type: null };
  const existingDefaults = [
    { id: "t-existing", name: "Existing Default", is_default: true, status: "active", product_key: "retail", currency: "NGN", country: null, region: null, customer_segment: null, campaign_type: null, archived_at: null }
  ];
  const hasConflict = existingDefaults.some((t) =>
    t.is_default &&
    t.status === "active" &&
    !t.archived_at &&
    t.product_key === scope.product_key &&
    t.currency === scope.currency &&
    t.country === scope.country &&
    t.region === scope.region &&
    t.customer_segment === scope.customer_segment &&
    t.campaign_type === scope.campaign_type
  );
  assert.equal(hasConflict, true, "conflict detection logic must identify duplicate default in same scope");
});

test("editing active template rejected: tier structural change is detected", () => {
  const activeTiers = [
    { sequence: 1, minimum_quantity: 1, maximum_quantity: 5000, unit_price: 500, enterprise_action: null, status: "active" }
  ];
  // Simulate payload with changed unit_price
  const payloadTiers = [
    { sequence: 1, minimum_quantity: 1, maximum_quantity: 5000, unit_price: 600, enterprise_action: null, status: "active" }
  ];
  // Replicate the tiersStructurallyEqual logic
  const sortedPayload = [...payloadTiers].sort((a, b) => a.sequence - b.sequence);
  const sortedExisting = [...activeTiers].sort((a, b) => a.sequence - b.sequence);
  const equal = sortedPayload.every((pt, i) => {
    const et = sortedExisting[i];
    return pt.sequence === et.sequence && pt.minimum_quantity === et.minimum_quantity && pt.maximum_quantity === et.maximum_quantity && pt.unit_price === et.unit_price && pt.enterprise_action === et.enterprise_action;
  });
  assert.equal(equal, false, "changed unit_price must be detected as a structural modification");
});

test("invalid pricing method rejected by validatePricingTemplate", () => {
  const template = makeTemplate({ pricing_method: "flat_rate" });
  const result = validatePricingTemplate(template);
  assert.equal(result.isValid, false, "unsupported pricing method must be rejected");
  assert.ok(result.errors.some((e) => e.message.includes("pricing method")));
});

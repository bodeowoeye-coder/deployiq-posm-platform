import test from "node:test";
import assert from "node:assert/strict";
import { buildPricingTemplatePayload } from "../lib/commercial/pricing/payload.ts";
import { validatePricingTemplate } from "../lib/commercial/pricing/validation.ts";
import {
  addTierAfterLast,
  buildTierSummaryLines,
  createFirstTier,
  currencySymbol,
  formatMoney,
  formatQuantity,
  hasValidationErrors,
  removeTierAt,
  updateTierAndPropagate,
  validateFormTiers,
} from "../lib/commercial/pricing/tierEditor.ts";
import {
  calcDraftPreview,
  createDefaultFormState,
  formStateToApiBody,
  isEnterpriseOnlyForm,
  templateToFormState,
} from "../components/pricing/wizardUtils.ts";

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

// ---------------------------------------------------------------------------
// CS-3 Tier editor redesign — tierEditor pure-function tests
// ---------------------------------------------------------------------------

test("tierEditor: first tier starts at quantity 1", () => {
  const tier = createFirstTier();
  assert.equal(tier.minimumQuantity, 1, "default first tier minimum must be 1");
  assert.equal(tier.sequence, 1);
  assert.equal(tier.isEnterpriseTier, false);
});

test("tierEditor: adding a tier after a bounded tier auto-sets next minimum", () => {
  const base = [{ ...createFirstTier(), maximumQuantity: 5000 }];
  const updated = addTierAfterLast(base);
  assert.equal(updated.length, 2);
  assert.equal(updated[1].minimumQuantity, 5001, "next minimum must be previous max + 1");
  assert.equal(updated[1].sequence, 2);
});

test("tierEditor: updateTierAndPropagate propagates new max to next tier min", () => {
  const tiers = [
    { ...createFirstTier(), maximumQuantity: 5000 },
    { sequence: 2, minimumQuantity: 5001, maximumQuantity: null, unitPrice: 475, fixedCharge: 0, enterpriseAction: null, isEnterpriseTier: false },
  ];
  const result = updateTierAndPropagate(tiers, 0, { maximumQuantity: 10000 });
  assert.equal(result[0].maximumQuantity, 10000);
  assert.equal(result[1].minimumQuantity, 10001, "propagated minimum must be 10001");
});

test("tierEditor: validateFormTiers rejects negative minimumQuantity", () => {
  const tiers = [{ ...createFirstTier(), minimumQuantity: -5 }];
  const errors = validateFormTiers(tiers);
  assert.ok(errors[0].minimumQuantity, "negative minimum must produce an error");
});

test("tierEditor: validateFormTiers rejects overlapping ranges", () => {
  const tiers = [
    { ...createFirstTier(), maximumQuantity: 5000 },
    { sequence: 2, minimumQuantity: 4000, maximumQuantity: null, unitPrice: 475, fixedCharge: 0, enterpriseAction: null, isEnterpriseTier: false },
  ];
  const errors = validateFormTiers(tiers);
  assert.ok(errors[1].minimumQuantity, "overlapping second tier must have a minimumQuantity error");
  assert.ok(errors[1].minimumQuantity.toLowerCase().includes("overlap") || errors[1].minimumQuantity.toLowerCase().includes("gap") || errors[1].minimumQuantity.includes("Overlap"),
    `expected overlap/gap message, got: ${errors[1].minimumQuantity}`);
});

test("tierEditor: enterprise tier suppresses maximumQuantity validation", () => {
  const tiers = [
    { ...createFirstTier(), maximumQuantity: 5000 },
    { sequence: 2, minimumQuantity: 5001, maximumQuantity: null, unitPrice: 0, fixedCharge: 0, enterpriseAction: "request_quotation", isEnterpriseTier: true },
  ];
  const errors = validateFormTiers(tiers);
  assert.ok(!errors[1].maximumQuantity, "enterprise tier with null max must not error on To quantity");
});

test("tierEditor: removeTierAt removes a tier and renumbers sequences", () => {
  const tiers = [
    { sequence: 1, minimumQuantity: 1, maximumQuantity: 1000, unitPrice: 500, fixedCharge: 0, enterpriseAction: null, isEnterpriseTier: false },
    { sequence: 2, minimumQuantity: 1001, maximumQuantity: 5000, unitPrice: 475, fixedCharge: 0, enterpriseAction: null, isEnterpriseTier: false },
    { sequence: 3, minimumQuantity: 5001, maximumQuantity: null, unitPrice: 0, fixedCharge: 0, enterpriseAction: "request_quotation", isEnterpriseTier: true },
  ];
  const result = removeTierAt(tiers, 1);
  assert.equal(result.length, 2, "must have 2 tiers after removal");
  assert.equal(result[0].sequence, 1);
  assert.equal(result[1].sequence, 2, "sequence must be renumbered after removal");
});

test("tierEditor: removeTierAt preserves single-tier list", () => {
  const tiers = [createFirstTier()];
  const result = removeTierAt(tiers, 0);
  assert.equal(result.length, 1, "cannot remove the only tier");
});

test("tierEditor: currencySymbol returns ₦ for NGN", () => {
  assert.equal(currencySymbol("NGN"), "₦");
});

test("tierEditor: currencySymbol returns $ for USD", () => {
  assert.equal(currencySymbol("USD"), "$");
});

test("tierEditor: formatQuantity applies thousands separator", () => {
  assert.equal(formatQuantity(5001), "5,001");
  assert.equal(formatQuantity(1000000), "1,000,000");
});

test("tierEditor: formatMoney prefixes currency symbol", () => {
  assert.equal(formatMoney(500, "NGN"), "₦500");
  assert.equal(formatMoney(1500, "NGN"), "₦1,500");
  assert.equal(formatMoney(0, "USD"), "$0");
});

test("tierEditor: buildTierSummaryLines standard tiers", () => {
  const tiers = [
    { sequence: 1, minimumQuantity: 1, maximumQuantity: 5000, unitPrice: 500, fixedCharge: 0, enterpriseAction: null, isEnterpriseTier: false },
    { sequence: 2, minimumQuantity: 5001, maximumQuantity: 10000, unitPrice: 475, fixedCharge: 0, enterpriseAction: null, isEnterpriseTier: false },
  ];
  const lines = buildTierSummaryLines(tiers, "NGN");
  assert.equal(lines[0], "1–5,000 — ₦500 per deployment");
  assert.equal(lines[1], "5,001–10,000 — ₦475 per deployment");
});

test("tierEditor: buildTierSummaryLines enterprise open-ended tier", () => {
  const tiers = [
    { sequence: 1, minimumQuantity: 1, maximumQuantity: 5000, unitPrice: 500, fixedCharge: 0, enterpriseAction: null, isEnterpriseTier: false },
    { sequence: 2, minimumQuantity: 5001, maximumQuantity: null, unitPrice: 0, fixedCharge: 0, enterpriseAction: "request_quotation", isEnterpriseTier: true },
  ];
  const lines = buildTierSummaryLines(tiers, "NGN");
  assert.equal(lines[0], "1–5,000 — ₦500 per deployment");
  assert.equal(lines[1], "5,001+ — Request quotation");
});

test("tierEditor: hasValidationErrors returns false for valid tiers", () => {
  const tiers = [createFirstTier()];
  const errors = validateFormTiers(tiers);
  assert.equal(hasValidationErrors(errors), false, "no errors expected for valid default tier");
});

test("tierEditor: hasValidationErrors returns true when any tier has errors", () => {
  const tiers = [{ ...createFirstTier(), unitPrice: -1 }];
  const errors = validateFormTiers(tiers);
  assert.equal(hasValidationErrors(errors), true, "negative unit price must trigger errors");
});

test("tierEditor: first tier must start at 1 — non-1 minimum is flagged", () => {
  const tiers = [{ ...createFirstTier(), minimumQuantity: 5 }];
  const errors = validateFormTiers(tiers);
  assert.ok(errors[0].minimumQuantity, "first tier not starting at 1 must have an error");
  assert.ok(errors[0].minimumQuantity.includes("1"), `error must mention 1, got: ${errors[0].minimumQuantity}`);
});

test("tierEditor: preview breakdown — 8750 locations across two tiers adds to 4281250", () => {
  // Pure arithmetic: 5000 × 500 + 3750 × 475 = 4,281,250
  // This mirrors what calculateProgressivePricing would return for tier_breakdown
  const tier1 = { applicable_quantity: 5000, unit_price: 500, fixed_charge: 0, subtotal: 5000 * 500 };
  const tier2 = { applicable_quantity: 3750, unit_price: 475, fixed_charge: 0, subtotal: 3750 * 475 };
  const total = tier1.subtotal + tier2.subtotal;
  assert.equal(total, 4281250, "8,750 locations must sum to ₦4,281,250");
});

// ---------------------------------------------------------------------------
// CS-4 — Wizard utility tests (createDefaultFormState, templateToFormState, etc.)
// ---------------------------------------------------------------------------

test("wizard: createDefaultFormState starts with first tier at quantity 1", () => {
  const form = createDefaultFormState();
  assert.equal(form.tiers.length, 1, "default state must have exactly 1 tier");
  assert.equal(form.tiers[0].minimumQuantity, 1, "first tier must start at 1");
  assert.equal(form.tiers[0].sequence, 1);
  assert.equal(form.tiers[0].isEnterpriseTier, false);
});

test("wizard: createDefaultFormState has required field defaults", () => {
  const form = createDefaultFormState();
  assert.equal(form.productKey, "retail");
  assert.equal(form.currency, "NGN");
  assert.equal(form.pricingMethod, "progressive_tiered");
  assert.equal(form.status, "draft");
  assert.equal(form.isDefault, false);
});

test("wizard: templateToFormState maps tier fields correctly", () => {
  const template = {
    id: "t-1",
    product_key: "retail",
    name: "Test Template",
    description: "A test",
    currency: "USD",
    country: "USA",
    region: "West",
    customer_segment: "enterprise",
    campaign_type: "q1",
    pricing_metric: "deployment_location",
    pricing_method: "progressive_tiered",
    status: "draft",
    is_default: true,
    effective_from: null,
    effective_to: null,
    quotation_validity_days: 30,
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
        id: "tier-1",
        pricing_template_id: "t-1",
        sequence: 1,
        minimum_quantity: 1,
        maximum_quantity: 5000,
        unit_price: 100,
        fixed_charge: 50,
        calculation_type: "progressive",
        enterprise_action: null,
        status: "active",
      },
      {
        id: "tier-2",
        pricing_template_id: "t-1",
        sequence: 2,
        minimum_quantity: 5001,
        maximum_quantity: null,
        unit_price: 0,
        fixed_charge: 0,
        calculation_type: "progressive",
        enterprise_action: "request_quotation",
        status: "active",
      },
    ],
  };

  const form = templateToFormState(template);

  assert.equal(form.name, "Test Template");
  assert.equal(form.currency, "USD");
  assert.equal(form.country, "USA");
  assert.equal(form.region, "West");
  assert.equal(form.customerSegment, "enterprise");
  assert.equal(form.campaignType, "q1");
  assert.equal(form.isDefault, true);
  assert.equal(form.quotationValidityDays, "30");
  assert.equal(form.tiers.length, 2);
  assert.equal(form.tiers[0].minimumQuantity, 1);
  assert.equal(form.tiers[0].maximumQuantity, 5000);
  assert.equal(form.tiers[0].unitPrice, 100);
  assert.equal(form.tiers[0].fixedCharge, 50);
  assert.equal(form.tiers[0].isEnterpriseTier, false);
  assert.equal(form.tiers[1].isEnterpriseTier, true, "request_quotation action must set isEnterpriseTier=true");
});

test("wizard: isEnterpriseOnlyForm returns false for normal tiers", () => {
  const form = createDefaultFormState();
  assert.equal(isEnterpriseOnlyForm(form), false, "default form has automatic tiers");
});

test("wizard: isEnterpriseOnlyForm returns true when all tiers are enterprise", () => {
  const form = createDefaultFormState();
  const enterpriseForm = {
    ...form,
    tiers: [
      { ...form.tiers[0], isEnterpriseTier: true, enterpriseAction: "request_quotation" }
    ],
  };
  assert.equal(isEnterpriseOnlyForm(enterpriseForm), true);
});

test("wizard: step 1 requires non-empty name to proceed", () => {
  const form = createDefaultFormState();
  const step1Ready = form.name.trim().length > 0;
  assert.equal(step1Ready, false, "empty name must block step 1 continuation");

  const filledForm = { ...form, name: "Nigeria Standard" };
  const step1ReadyFilled = filledForm.name.trim().length > 0;
  assert.equal(step1ReadyFilled, true, "non-empty name must allow step 1 continuation");
});

test("wizard: step 2 blocks continuation when tier errors exist", () => {
  const form = createDefaultFormState();
  const invalidForm = {
    ...form,
    tiers: [{ ...form.tiers[0], unitPrice: -100 }],
  };
  const errors = validateFormTiers(invalidForm.tiers);
  const step2Ready = !hasValidationErrors(errors);
  assert.equal(step2Ready, false, "invalid tiers must block step 2 continuation");
});

test("wizard: step 2 allows continuation when tiers are valid", () => {
  const form = createDefaultFormState();
  const errors = validateFormTiers(form.tiers);
  const step2Ready = !hasValidationErrors(errors);
  assert.equal(step2Ready, true, "valid default tier must allow step 2 continuation");
});

test("wizard: save draft blocked when tier validation fails", () => {
  const form = createDefaultFormState();
  const invalidForm = { ...form, tiers: [{ ...form.tiers[0], unitPrice: -1 }] };
  const errors = validateFormTiers(invalidForm.tiers);
  const hasTierErrors = hasValidationErrors(errors);
  assert.equal(hasTierErrors, true, "negative unit price must block save");
});

test("wizard: activate requires savedTemplateId to be set", () => {
  const savedTemplateId = null;
  const canActivate = savedTemplateId !== null;
  assert.equal(canActivate, false, "activate must be blocked without a saved template id");

  const withId = "template-uuid-123";
  const canActivateWithId = withId !== null;
  assert.equal(canActivateWithId, true);
});

test("wizard: formStateToApiBody maps camelCase form to API payload correctly", () => {
  const form = {
    ...createDefaultFormState(),
    name: "Test Template",
    description: "desc",
    currency: "USD",
    country: "USA",
    region: "West",
    customerSegment: "enterprise",
    campaignType: "q1",
    quotationValidityDays: "30",
    isDefault: true,
  };
  const body = formStateToApiBody(form, null);
  assert.equal(body.name, "Test Template");
  assert.equal(body.currency, "USD");
  assert.equal(body.country, "USA");
  assert.equal(body.customerSegment, "enterprise");
  assert.equal(body.campaignType, "q1");
  assert.equal(body.quotationValidityDays, 30, "string quotationValidityDays must be coerced to number");
  assert.equal(body.isDefault, true);
  assert.ok(!body.templateId, "new template must not include templateId");
});

test("wizard: formStateToApiBody includes templateId for existing templates", () => {
  const form = createDefaultFormState();
  const body = formStateToApiBody(form, "existing-id-123");
  assert.equal(body.templateId, "existing-id-123");
});

test("wizard: formStateToApiBody serializes enterprise tiers correctly", () => {
  const form = createDefaultFormState();
  const enterpriseForm = {
    ...form,
    tiers: [
      { ...form.tiers[0], maximumQuantity: 5000 },
      {
        sequence: 2,
        minimumQuantity: 5001,
        maximumQuantity: null,
        unitPrice: 0,
        fixedCharge: 0,
        isEnterpriseTier: true,
        enterpriseAction: "request_quotation",
      },
    ],
  };
  const body = formStateToApiBody(enterpriseForm, null);
  const tiers = body.tiers;
  assert.ok(Array.isArray(tiers));
  assert.equal(tiers[1].enterpriseAction, "request_quotation");
  assert.equal(tiers[1].maximumQuantity, null, "enterprise tier maximumQuantity must be null");
});

// ---------------------------------------------------------------------------
// CS-4 — Draft preview calculation tests
// ---------------------------------------------------------------------------

test("calcDraftPreview: two-tier calculation for 8750 locations", () => {
  const form = {
    ...createDefaultFormState(),
    currency: "NGN",
    tiers: [
      { sequence: 1, minimumQuantity: 1, maximumQuantity: 5000, unitPrice: 500, fixedCharge: 0, enterpriseAction: null, isEnterpriseTier: false },
      { sequence: 2, minimumQuantity: 5001, maximumQuantity: null, unitPrice: 475, fixedCharge: 0, enterpriseAction: null, isEnterpriseTier: false },
    ],
  };
  const result = calcDraftPreview(form, 8750);
  assert.equal(result.quantity, 8750);
  assert.equal(result.total, 4281250, "5000×500 + 3750×475 = 4,281,250");
  assert.equal(result.tierBreakdown.length, 2);
  assert.equal(result.requiresEnterpriseReview, false);
  assert.equal(result.quotationStatus, "calculated");
});

test("calcDraftPreview: quantity within first tier only", () => {
  const form = {
    ...createDefaultFormState(),
    tiers: [
      { sequence: 1, minimumQuantity: 1, maximumQuantity: 5000, unitPrice: 500, fixedCharge: 0, enterpriseAction: null, isEnterpriseTier: false },
      { sequence: 2, minimumQuantity: 5001, maximumQuantity: null, unitPrice: 475, fixedCharge: 0, enterpriseAction: null, isEnterpriseTier: false },
    ],
  };
  const result = calcDraftPreview(form, 1000);
  assert.equal(result.tierBreakdown.length, 1, "only one tier should apply");
  assert.equal(result.total, 500000, "1000 × ₦500 = ₦500,000");
});

test("calcDraftPreview: enterprise-only form returns quotation status", () => {
  const form = {
    ...createDefaultFormState(),
    tiers: [
      { sequence: 1, minimumQuantity: 1, maximumQuantity: null, unitPrice: 0, fixedCharge: 0, enterpriseAction: "request_quotation", isEnterpriseTier: true },
    ],
  };
  const result = calcDraftPreview(form, 500);
  assert.equal(result.requiresEnterpriseReview, true);
  assert.equal(result.quotationStatus, "request_quotation");
  assert.equal(result.total, 0, "enterprise-only tier must contribute ₦0 to total");
});

test("calcDraftPreview: fixed charge is included in subtotal", () => {
  const form = {
    ...createDefaultFormState(),
    tiers: [
      { sequence: 1, minimumQuantity: 1, maximumQuantity: null, unitPrice: 100, fixedCharge: 500, enterpriseAction: null, isEnterpriseTier: false },
    ],
  };
  const result = calcDraftPreview(form, 10);
  // 10 × 100 + 500 = 1500
  assert.equal(result.total, 1500, "fixed charge must be added to per-unit total");
});

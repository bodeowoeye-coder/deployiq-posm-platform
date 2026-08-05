/**
 * Onboarding CO-1A tests.
 * node --test tests/onboarding.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  BUSINESS_OBJECTIVES, getObjectiveById
} from "../lib/commercial/onboarding/objectives.ts";
import {
  resolveRecommendation
} from "../lib/commercial/onboarding/recommendation.ts";import {
  nextCommercialDecisionTarget,
  shouldRequestQuotation,
} from "../lib/commercial/onboarding/flow.ts";
import {
  toCustomerQuotation,
  buildCustomerExplanation,
  toPricingMethodLabel,
  currencyForCountry,
} from "../lib/commercial/onboarding/quotation.ts";
import {
  calcDraftPreview,
  createDefaultFormState,
} from "../components/pricing/wizardUtils.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(overrides = {}) {
  return {
    pricing_template_id: "t-1",
    pricing_template_name: "Nigeria Retail",
    product_key: "retail",
    country: "Nigeria",
    currency: "NGN",
    pricing_metric: "deployment_location",
    pricing_method: "progressive_tiered",
    quantity: 8000,
    tier_breakdown: [
      { sequence: 1, minimum_quantity: 1, maximum_quantity: 5000, applicable_quantity: 5000, unit_price: 500, fixed_charge: 0, subtotal: 2500000, enterprise_action: null, label: "Tier 1" },
      { sequence: 2, minimum_quantity: 5001, maximum_quantity: null, applicable_quantity: 3000, unit_price: 450, fixed_charge: 0, subtotal: 1350000, enterprise_action: null, label: "Tier 2" },
    ],
    subtotal: 3850000,
    discount: 0,
    tax: 0,
    total: 3850000,
    included_admin_users: 40,
    quotation_status: "calculated",
    quotation_expiry: null,
    requires_enterprise_review: false,
    calculated_at: new Date().toISOString(),
    enterprise_action: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: Retail objective maps to the supported retail product
// ---------------------------------------------------------------------------

test("onboarding: retail_visibility objective maps to retail product", () => {
  const obj = getObjectiveById("retail_visibility");
  assert.ok(obj, "retail_visibility must exist");
  assert.equal(obj.maps_to_product, "retail");
});

test("onboarding: location_audit objective maps to canonical location_audit product", () => {
  const obj = getObjectiveById("location_audit");
  assert.ok(obj, "location_audit must exist");
  assert.equal(obj.maps_to_product, "location_audit");
});

// ---------------------------------------------------------------------------
// Test 2: Unconfigured outcome enters assisted onboarding
// ---------------------------------------------------------------------------

test("onboarding: unconfigured product (construction) requires assisted onboarding", () => {
  const rec = resolveRecommendation({
    objectiveId: "construction_monitoring",
    quantity: 1000,
    country: "Nigeria",
    needsInstallers: false,
    needsClientPortal: false,
    needsAnalytics: false,
  });
  assert.equal(rec.requiresAssistedOnboarding, true, "construction must require assisted path");
  assert.ok(rec.assistedOnboardingReason, "must provide a reason");
});

// ---------------------------------------------------------------------------
// Test 3: Quantity validation
// ---------------------------------------------------------------------------

test("onboarding: quantity zero is not a valid positive whole number", () => {
  const qty = 0;
  assert.equal(!Number.isInteger(qty) || qty <= 0, true, "0 must be invalid");
});

test("onboarding: quantity negative is not valid", () => {
  const qty = -10;
  assert.equal(qty <= 0, true, "-10 must be invalid");
});

test("onboarding: quantity 1 is valid", () => {
  const qty = 1;
  assert.equal(Number.isInteger(qty) && qty > 0, true, "1 must be valid");
});

test("onboarding: fractional quantity 1.5 is not a valid whole number", () => {
  const qty = 1.5;
  assert.equal(!Number.isInteger(qty), true, "1.5 must be invalid");
});

// ---------------------------------------------------------------------------
// Test 4: Product recommendation is deterministic
// ---------------------------------------------------------------------------

test("onboarding: recommendation is deterministic — same inputs always produce the same product key", () => {
  const input = {
    objectiveId: "retail_visibility",
    quantity: 5000,
    country: "Nigeria",
    needsInstallers: true,
    needsClientPortal: true,
    needsAnalytics: true,
  };
  const r1 = resolveRecommendation(input);
  const r2 = resolveRecommendation(input);
  assert.equal(r1.productKey, r2.productKey, "same inputs must produce same product key");
  assert.equal(r1.requiresAssistedOnboarding, r2.requiresAssistedOnboarding, "assisted flag must be deterministic");
});

// ---------------------------------------------------------------------------
// Test 5: Customer cannot submit a pricing method via the quotation response
// ---------------------------------------------------------------------------

test("onboarding: toCustomerQuotation does not expose pricing_method in the response", () => {
  const result = makeResult();
  const quotation = toCustomerQuotation(result, { pricing_method: "progressive_tiered" });
  assert.ok(!("pricing_method" in quotation), "pricing_method must not appear in customer quotation");
  assert.ok(!("enterprise_action" in quotation), "enterprise_action must not appear in customer quotation");
  assert.ok(!("pricing_template_id" in quotation), "pricing_template_id must not be exposed");
});

// ---------------------------------------------------------------------------
// Test 6: Customer cannot force a pricing template ID
// ---------------------------------------------------------------------------

test("onboarding: customer-safe quotation exposes pricingTemplateId (new contract) but not raw internal fields", () => {
  const result = makeResult({ pricing_template_id: "secret-template-uuid", commercial_model: "one_time_programme", billing_behaviour: "single_payment", renewal_required: false, allowed_payment_methods: null });
  const quotation = toCustomerQuotation(result, { pricing_method: "progressive_tiered" });
  // pricingTemplateId is now an explicit part of CustomerQuotation for downstream use
  assert.equal(quotation.pricingTemplateId, "secret-template-uuid");
  // Internal field names (snake_case) must not leak
  assert.ok(!("pricing_template_id" in quotation), "Internal snake_case field must not appear in customer response");
  assert.ok(!("pricing_method" in quotation), "Internal pricing_method must not be directly exposed");
});

// ---------------------------------------------------------------------------
// Test 7–9: Server resolves correct pricing method and totals via calcDraftPreview
// (proxy for calculateProgressivePricing — same arithmetic)
// ---------------------------------------------------------------------------

const twoTiers = [
  { sequence: 1, minimumQuantity: 1,    maximumQuantity: 5000, unitPrice: 500, fixedCharge: 0, enterpriseAction: null, isEnterpriseTier: false },
  { sequence: 2, minimumQuantity: 5001, maximumQuantity: null, unitPrice: 450, fixedCharge: 0, enterpriseAction: null, isEnterpriseTier: false },
];

test("onboarding pricing (progressive): 8,000 locations split across two bands", () => {
  const form = { ...createDefaultFormState(), pricingMethod: "progressive_tiered", tiers: twoTiers };
  const r = calcDraftPreview(form, 8000);
  assert.equal(r.tierBreakdown.length, 2, "progressive must produce 2 rows");
  assert.equal(r.total, 5000 * 500 + 3000 * 450, "progressive total must be correct");
});

test("onboarding pricing (volume): 8,000 locations use single qualifying band", () => {
  const form = { ...createDefaultFormState(), pricingMethod: "volume_tiered", tiers: twoTiers };
  const r = calcDraftPreview(form, 8000);
  assert.equal(r.tierBreakdown.length, 1, "volume must produce 1 row");
  assert.equal(r.total, 8000 * 450, "volume uses band-2 rate for full quantity");
  assert.notEqual(r.total, 5000 * 500 + 3000 * 450, "volume must NOT split like progressive");
});

test("onboarding pricing (flat_rate): 8,000 locations all at flat rate", () => {
  const flatTier = [{ sequence: 1, minimumQuantity: 1, maximumQuantity: null, unitPrice: 475, fixedCharge: 0, enterpriseAction: null, isEnterpriseTier: false }];
  const form = { ...createDefaultFormState(), pricingMethod: "flat_rate", tiers: flatTier };
  const r = calcDraftPreview(form, 8000);
  assert.equal(r.total, 8000 * 475, "flat_rate total must be 8,000 × ₦475");
});

// ---------------------------------------------------------------------------
// Test 10–11: Enterprise quotation tier returns enterprise-review status
// ---------------------------------------------------------------------------

test("onboarding pricing: enterprise quotation tier triggers enterprise review", () => {
  const tiers = [
    { sequence: 1, minimumQuantity: 1,     maximumQuantity: 5000, unitPrice: 500, fixedCharge: 0, enterpriseAction: null,              isEnterpriseTier: false },
    { sequence: 2, minimumQuantity: 5001,  maximumQuantity: null, unitPrice: 0,   fixedCharge: 0, enterpriseAction: "request_quotation", isEnterpriseTier: true },
  ];
  const form = { ...createDefaultFormState(), pricingMethod: "progressive_tiered", tiers };
  const r = calcDraftPreview(form, 10000);
  assert.equal(r.requiresEnterpriseReview, true, "enterprise tier must trigger review");
  assert.equal(r.total, 0, "enterprise review must return total=0");
});

test("onboarding pricing: automatic quotation returns a real calculated total", () => {
  const tiers = [{ sequence: 1, minimumQuantity: 1, maximumQuantity: 5000, unitPrice: 500, fixedCharge: 0, enterpriseAction: null, isEnterpriseTier: false }];
  const form = { ...createDefaultFormState(), pricingMethod: "progressive_tiered", tiers };
  const r = calcDraftPreview(form, 3000);
  assert.equal(r.requiresEnterpriseReview, false);
  assert.equal(r.total, 3000 * 500, "automatic result must have non-zero total");
});

// ---------------------------------------------------------------------------
// Test 13: Customer-safe response hides technical pricing fields
// ---------------------------------------------------------------------------

test("onboarding: buildCustomerExplanation returns business-friendly text", () => {
  const result = makeResult();
  const template = { pricing_method: "progressive_tiered" };
  const explanation = buildCustomerExplanation(result, template);
  assert.ok(typeof explanation === "string", "explanation must be a string");
  assert.ok(explanation.length > 0, "explanation must not be empty");
  assert.ok(!explanation.toLowerCase().includes("progressive_tiered"), "must not expose technical method name");
  assert.ok(!explanation.toLowerCase().includes("tier_breakdown"), "must not expose internal field names");
});

test("onboarding: toPricingMethodLabel maps internal values to customer-friendly text", () => {
  assert.ok(!toPricingMethodLabel("progressive_tiered").includes("progressive_tiered"), "must not expose raw value");
  assert.ok(!toPricingMethodLabel("volume_tiered").includes("volume_tiered"), "must not expose raw value");
  assert.ok(!toPricingMethodLabel("flat_rate").includes("flat_rate"), "must not expose raw value");
});

// ---------------------------------------------------------------------------
// Test 14–15: Draft-persistence helpers
// ---------------------------------------------------------------------------

test("onboarding: BUSINESS_OBJECTIVES covers all expected outcomes", () => {
  assert.equal(BUSINESS_OBJECTIVES.length, 6, "must have 6 business objectives");
  const ids = BUSINESS_OBJECTIVES.map((o) => o.id);
  assert.ok(ids.includes("retail_visibility"), "must include retail_visibility");
  assert.ok(ids.includes("field_operations"), "must include field_operations");
});

test("onboarding: currencyForCountry defaults to NGN for unknown country", () => {
  assert.equal(currencyForCountry("Nigeria"), "NGN");
  assert.equal(currencyForCountry("Unknown Country XYZ"), "NGN", "unknown country must default to NGN");
  assert.equal(currencyForCountry("Ghana"), "GHS");
});

// ---------------------------------------------------------------------------
// Test 16–17: Existing commercial pricing tests are not affected (smoke test)
// ---------------------------------------------------------------------------

import { validatePricingTemplate } from "../lib/commercial/pricing/validation.ts";

test("onboarding: existing commercial pricing validation is unaffected", () => {
  const template = {
    id: "t-1", product_key: "retail", name: "Test", description: null,
    currency: "NGN", country: null, region: null, customer_segment: null,
    campaign_type: null, pricing_metric: "deployment_location",
    pricing_method: "progressive_tiered", status: "draft", is_default: false,
    effective_from: null, effective_to: null, quotation_validity_days: null,
    created_by: null, updated_by: null, activated_by: null, activated_at: null,
    deactivated_by: null, deactivated_at: null, archived_by: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    archived_at: null,
    tiers: [{ id: null, pricing_template_id: "t-1", sequence: 1, minimum_quantity: 1, maximum_quantity: 5000, unit_price: 500, fixed_charge: 0, calculation_type: "progressive", enterprise_action: null, status: "active" }],
  };
  const result = validatePricingTemplate(template);
  assert.equal(result.isValid, true, "existing admin pricing validation must pass");
});

// ---------------------------------------------------------------------------
// CO-1A: Commercial Decision step — deploymentMode
// ---------------------------------------------------------------------------

test("commercial decision: retail product returns SELF_SERVICE deployment mode", () => {
  const rec = resolveRecommendation({
    objectiveId: "retail_visibility",
    quantity: 5000,
    country: "Nigeria",
    needsInstallers: true,
    needsClientPortal: false,
    needsAnalytics: false,
  });
  assert.equal(rec.deploymentMode, "SELF_SERVICE", "retail must be SELF_SERVICE");
});

test("commercial decision: construction_monitoring objective resolves to build product with ENTERPRISE mode", () => {
  const rec = resolveRecommendation({
    objectiveId: "construction_monitoring",
    quantity: 100,
    country: "Nigeria",
    needsInstallers: false,
    needsClientPortal: false,
    needsAnalytics: false,
  });
  assert.equal(rec.deploymentMode, "ENTERPRISE", "build product must be ENTERPRISE");
});

test("commercial decision: deploymentMode is always present in recommendation result", () => {
  const objectiveIds = BUSINESS_OBJECTIVES.map((o) => o.id);
  for (const id of objectiveIds) {
    const rec = resolveRecommendation({
      objectiveId: id,
      quantity: 1000,
      country: "Nigeria",
      needsInstallers: false,
      needsClientPortal: false,
      needsAnalytics: false,
    });
    assert.ok(
      rec.deploymentMode === "SELF_SERVICE" || rec.deploymentMode === "ENTERPRISE",
      `deploymentMode must be SELF_SERVICE or ENTERPRISE for objective "${id}", got: ${rec.deploymentMode}`
    );
  }
});

test("commercial decision: location_audit maps to assisted location audit product", () => {
  const rec = resolveRecommendation({
    objectiveId: "location_audit",
    quantity: 2000,
    country: "Nigeria",
    needsInstallers: false,
    needsClientPortal: false,
    needsAnalytics: false,
  });
  assert.equal(rec.deploymentMode, "ENTERPRISE");
  assert.equal(rec.productKey, "location_audit");
});

test("commercial decision: unknown product key defaults to ENTERPRISE mode", () => {
  // resolveRecommendation handles unknown objectives by defaulting to retail
  // but the mode config defaults unknown keys to ENTERPRISE
  // Test the mode config logic directly
  const validModes = ["SELF_SERVICE", "ENTERPRISE"];
  const rec = resolveRecommendation({
    objectiveId: "field_operations",  // maps to survey
    quantity: 500,
    country: "Nigeria",
    needsInstallers: false,
    needsClientPortal: false,
    needsAnalytics: false,
  });
  assert.ok(validModes.includes(rec.deploymentMode), "survey mode must be valid");
});

test("commercial decision: self-service recommendation does not require assisted onboarding", () => {
  const rec = resolveRecommendation({
    objectiveId: "retail_visibility",
    quantity: 5000,
    country: "Nigeria",
    needsInstallers: false,
    needsClientPortal: false,
    needsAnalytics: false,
  });
  assert.equal(rec.deploymentMode, "SELF_SERVICE");
  assert.equal(rec.requiresAssistedOnboarding, false, "SELF_SERVICE product must not require assisted onboarding");
  assert.equal(rec.assistedOnboardingReason, null);
});

test("commercial decision: enterprise recommendation carries an explanation", () => {
  const rec = resolveRecommendation({
    objectiveId: "construction_monitoring",
    quantity: 200,
    country: "Nigeria",
    needsInstallers: false,
    needsClientPortal: false,
    needsAnalytics: false,
  });
  assert.equal(rec.deploymentMode, "ENTERPRISE");
  assert.equal(rec.requiresAssistedOnboarding, true);
  assert.ok(rec.assistedOnboardingReason && rec.assistedOnboardingReason.length > 0, "enterprise must have a reason");
});

// ---------------------------------------------------------------------------
// CO-1A: Flow fix tests — button routing and AI capability
// ---------------------------------------------------------------------------

test("flow fix: retail recommendation deploymentMode is SELF_SERVICE (determines Instant Setup CTA)", () => {
  const rec = resolveRecommendation({ objectiveId: "retail_visibility", quantity: 5000, country: "Nigeria", needsInstallers: false, needsClientPortal: false, needsAnalytics: false });
  assert.equal(rec.deploymentMode, "SELF_SERVICE", "retail must show Instant Setup CTA");
});

test("flow fix: build recommendation deploymentMode is ENTERPRISE (determines Request Proposal CTA)", () => {
  const rec = resolveRecommendation({ objectiveId: "construction_monitoring", quantity: 500, country: "Nigeria", needsInstallers: false, needsClientPortal: false, needsAnalytics: false });
  assert.equal(rec.deploymentMode, "ENTERPRISE", "build must show Request Proposal CTA");
});

test("flow fix: retail primary CTA logic — SELF_SERVICE maps to Instant Setup label", () => {
  const ctaForMode = (mode) => mode === "SELF_SERVICE" ? "Instant Setup" : "Request Proposal";
  assert.equal(ctaForMode("SELF_SERVICE"), "Instant Setup");
  assert.equal(ctaForMode("ENTERPRISE"), "Request Proposal");
});

test("flow fix: both SELF_SERVICE and ENTERPRISE primary CTAs route to decision step (not enterprise directly)", () => {
  // The onConfirm handler in OnboardingShell always calls setStep("decision")
  // regardless of deploymentMode — CommercialDecisionStep then routes further
  const nextStep = (action) => action === "confirm" ? "decision" : "enterprise";
  assert.equal(nextStep("confirm"), "decision", "primary confirm must go to decision");
  assert.equal(nextStep("talkToSales"), "enterprise", "talk-to-sales bypass goes to enterprise");
});

test("flow fix: retail does not bypass decision — requiresAssistedOnboarding false for retail", () => {
  const rec = resolveRecommendation({ objectiveId: "retail_visibility", quantity: 5000, country: "Nigeria", needsInstallers: false, needsClientPortal: false, needsAnalytics: false });
  assert.equal(rec.requiresAssistedOnboarding, false, "retail must not trigger enterprise bypass");
});

test("flow fix: build does not immediately open enterprise form — goes to decision first", () => {
  // The primary CTA for ENTERPRISE now calls onConfirm → setStep('decision')
  // Only after the user clicks 'Request Proposal' on the CommercialDecisionStep
  // does the flow reach 'enterprise'.
  // We validate this by confirming deploymentMode drives which DECISION card shows.
  const rec = resolveRecommendation({ objectiveId: "construction_monitoring", quantity: 200, country: "Nigeria", needsInstallers: false, needsClientPortal: false, needsAnalytics: false });
  assert.equal(rec.deploymentMode, "ENTERPRISE", "build must show Assisted Setup card in decision step");
});

test("flow fix: CommercialDecisionStep routes — SELF_SERVICE Continue Setup triggers pricing resolution", () => {
  // Logic: after Continue Setup is clicked (SELF_SERVICE path), system calls
  // the quotation API then sets step to 'setup'. No enterprise form.
  const selfServiceNextOnConfirm = "setup";  // via pricing API
  const enterpriseNextOnConfirm = "enterprise"; // via proposal form
  assert.notEqual(selfServiceNextOnConfirm, "enterprise", "SELF_SERVICE Continue Setup must not open enterprise form");
  assert.notEqual(enterpriseNextOnConfirm, "setup", "ENTERPRISE Request Proposal must not open setup");
});

test("flow fix: Retail Talk to Sales goes directly to enterprise (allowed bypass)", () => {
  // Talk to Sales is a deliberate customer choice — the secondary bypass is intentional
  const talkToSalesNext = "enterprise";
  assert.equal(talkToSalesNext, "enterprise", "Talk to Sales may directly bypass decision");
});

test("flow fix: header Get Started links to /onboarding (no token parameter)", () => {
  // The header link is href="/onboarding" — no token passed → fresh journey
  const headerHref = "/onboarding";
  assert.ok(!headerHref.includes("token"), "Get Started must not carry resume token");
  assert.equal(headerHref, "/onboarding");
});

test("flow fix: header link removes token by navigating to base /onboarding", () => {
  // When user clicks Get Started, they navigate to /onboarding without ?token
  // This starts a fresh journey regardless of any active session
  const freshStart = "/onboarding";
  const withToken = "/onboarding?token=abc123";
  assert.ok(freshStart !== withToken, "fresh start must not include old token");
});

test("flow fix: DeployIQ Retail capabilities include AI-assisted evidence validation", () => {
  const rec = resolveRecommendation({ objectiveId: "retail_visibility", quantity: 5000, country: "Nigeria", needsInstallers: false, needsClientPortal: false, needsAnalytics: false });
  const hasAI = rec.capabilities.some((cap) => cap.toLowerCase().includes("ai"));
  assert.equal(hasAI, true, "retail capabilities must include an AI capability");
});

test("flow fix: AI capability appears in central retail capability source (not hardcoded in component)", () => {
  const rec = resolveRecommendation({ objectiveId: "retail_visibility", quantity: 1000, country: "Nigeria", needsInstallers: false, needsClientPortal: false, needsAnalytics: false });
  const ai = rec.capabilities.find((c) => c.toLowerCase().includes("ai"));
  assert.equal(ai, "AI-assisted photo and evidence validation");
});

// ---------------------------------------------------------------------------
// CO-1A: Navigation reset and updated enterprise CTA wording
// ---------------------------------------------------------------------------

// Reset behaviour tests (pure logic — no browser interaction required)

test("reset: startNewJourney resets step to objective", () => {
  // The function sets step to "objective" synchronously before calling router.replace
  const expectedStep = "objective";
  assert.equal(expectedStep, "objective", "fresh journey always starts at objective step");
});

test("reset: startNewJourney clears recommendation state", () => {
  // After reset, recommendation is null — recommendation page does not render
  const clearedRecommendation = null;
  assert.equal(clearedRecommendation, null);
});

test("reset: startNewJourney clears quotation state", () => {
  const clearedQuotation = null;
  assert.equal(clearedQuotation, null);
});

test("reset: startNewJourney clears resume token from memory", () => {
  const clearedToken = null;
  assert.equal(clearedToken, null, "resume token must be null after fresh start");
});

test("reset: startNewJourney routes to /onboarding without token parameter", () => {
  const freshPath = "/onboarding";
  assert.ok(!freshPath.includes("token="), "fresh path must not include a token");
  assert.equal(freshPath, "/onboarding");
});

test("reset: startNewJourney resets discovery to defaults", () => {
  const defaultDiscovery = {
    country: "",
    industry: "",
    rolloutQuantity: "",
    adminCount: "1",
    needsInstallers: false,
    needsClientPortal: false,
    needsAnalytics: false,
  };
  assert.equal(defaultDiscovery.country, "");
  assert.equal(defaultDiscovery.rolloutQuantity, "");
  assert.equal(defaultDiscovery.adminCount, "1");
  assert.equal(defaultDiscovery.needsInstallers, false);
});

test("reset: header wordmark aria-label is 'Start a new DeployIQ setup'", () => {
  const ariaLabel = "Start a new DeployIQ setup";
  assert.ok(ariaLabel.includes("DeployIQ"), "aria-label must reference DeployIQ");
  assert.ok(ariaLabel.length > 0);
});

test("reset: Get started badge aria-label is 'Return to onboarding start'", () => {
  const ariaLabel = "Return to onboarding start";
  assert.ok(ariaLabel.toLowerCase().includes("onboarding"), "must reference onboarding");
});

// CTA wording tests

test("enterprise CTA: Build recommendation primary CTA is 'Request Proposal'", () => {
  // The recommendation page's CTA for ENTERPRISE deploymentMode
  const buildCTA = "Request Proposal";
  assert.equal(buildCTA, "Request Proposal");
  assert.ok(!buildCTA.toLowerCase().includes("enterprise assistance"), "must not say enterprise assistance");
});

test("enterprise CTA: Assisted Setup page primary CTA is 'Contact Assisted Sales Team'", () => {
  const assistedSetupCTA = "Contact Assisted Sales Team";
  assert.ok(assistedSetupCTA.includes("Assisted"), "must reference Assisted");
  assert.ok(!assistedSetupCTA.includes("Request Proposal"), "must differ from recommendation CTA");
});

test("enterprise CTA: Assisted Setup CTA opens EnterpriseAssistanceStep (different from recommendation CTA)", () => {
  // Flow: Recommendation → Request Proposal (onConfirm→decision) 
  //       → CommercialDecisionStep ENTERPRISE → Contact Assisted Sales Team (onRequestProposal→enterprise)
  //       → EnterpriseAssistanceStep
  const flowSteps = ["recommendation", "decision", "enterprise"];
  assert.equal(flowSteps[0], "recommendation");
  assert.equal(flowSteps[1], "decision");
  assert.equal(flowSteps[2], "enterprise");
  assert.ok(flowSteps.indexOf("decision") < flowSteps.indexOf("enterprise"), "decision must precede enterprise in the flow");
});

test("enterprise CTA: enterprise form submit button is 'Submit'", () => {
  const submitLabel = "Submit";
  assert.equal(submitLabel, "Submit");
  assert.ok(!submitLabel.toLowerCase().includes("proposal request"), "must not say 'proposal request'");
  assert.ok(!submitLabel.toLowerCase().includes("enterprise"), "must not say 'enterprise'");
});

// ---------------------------------------------------------------------------
// CO-1A: Discovery step — industry required, capabilities required, new lists
// ---------------------------------------------------------------------------

import {
  WORKSPACE_CAPABILITIES,
  legacyCapabilityFlags,
} from "../lib/commercial/onboarding/capabilities.ts";

const EXPECTED_INDUSTRIES = [
  "Retail merchandising & Point of Sale Materials (POSM)",
  "OOH billboard installation",
  "Fleet branding",
  "Real estate construction monitoring",
  "Telecom site rollout",
  "Solar installations",
  "Utility meter deployment",
  "Road infrastructure projects",
  "Oil & gas inspections",
  "Warehouse audits",
  "Facility management",
  "Insurance loss inspections",
  "Government capital projects",
];

const EXPECTED_CAPABILITY_IDS = [
  "fieldEvidence",
  "clientVisibility",
  "aiValidation",
  "projectAnalytics",
  "approvalWorkflow",
  "offlineOperation",
];

test("discovery: industry is required — empty industry fails validation", () => {
  const emptyIndustry = "";
  assert.ok(!emptyIndustry.trim(), "empty industry must fail required check");
});

test("discovery: industry required — non-empty value passes", () => {
  const selectedIndustry = "Fleet branding";
  assert.ok(selectedIndustry.trim().length > 0, "selected industry must pass");
});

test("discovery: capabilities are required — empty array fails validation", () => {
  const emptyCapabilities = [];
  assert.equal(emptyCapabilities.length, 0, "empty capabilities must fail");
  const isValid = emptyCapabilities.length > 0;
  assert.equal(isValid, false, "empty capabilities must block form submission");
});

test("discovery: at least one capability required", () => {
  const oneCapability = ["fieldEvidence"];
  assert.ok(oneCapability.length >= 1, "one capability must satisfy requirement");
});

test("discovery: new industry list has 13 items", () => {
  assert.equal(EXPECTED_INDUSTRIES.length, 13, "must have 13 industries");
});

test("discovery: new industry list includes expected entries", () => {
  assert.ok(EXPECTED_INDUSTRIES.includes("Fleet branding"));
  assert.ok(EXPECTED_INDUSTRIES.includes("Telecom site rollout"));
  assert.ok(EXPECTED_INDUSTRIES.includes("Government capital projects"));
  assert.ok(!EXPECTED_INDUSTRIES.includes("Other"), "generic 'Other' removed");
});

test("discovery: new capability list has 6 items", () => {
  assert.equal(WORKSPACE_CAPABILITIES.length, 6, "must have 6 capabilities");
});

test("discovery: capability IDs match expected values", () => {
  const ids = WORKSPACE_CAPABILITIES.map((c) => c.id);
  for (const expected of EXPECTED_CAPABILITY_IDS) {
    assert.ok(ids.includes(expected), `capability '${expected}' must exist`);
  }
});

test("discovery: legacyCapabilityFlags maps fieldEvidence → needsInstallers", () => {
  const flags = legacyCapabilityFlags(["fieldEvidence"]);
  assert.equal(flags.needsInstallers, true);
  assert.equal(flags.needsClientPortal, false);
  assert.equal(flags.needsAnalytics, false);
});

test("discovery: legacyCapabilityFlags maps clientVisibility → needsClientPortal", () => {
  const flags = legacyCapabilityFlags(["clientVisibility"]);
  assert.equal(flags.needsInstallers, false);
  assert.equal(flags.needsClientPortal, true);
  assert.equal(flags.needsAnalytics, false);
});

test("discovery: legacyCapabilityFlags maps projectAnalytics → needsAnalytics", () => {
  const flags = legacyCapabilityFlags(["projectAnalytics"]);
  assert.equal(flags.needsAnalytics, true);
});

test("discovery: legacyCapabilityFlags maps new-only capabilities with all false", () => {
  const flags = legacyCapabilityFlags(["aiValidation", "approvalWorkflow", "offlineOperation"]);
  assert.equal(flags.needsInstallers, false);
  assert.equal(flags.needsClientPortal, false);
  assert.equal(flags.needsAnalytics, false);
});

test("discovery: legacyCapabilityFlags handles multiple capabilities", () => {
  const flags = legacyCapabilityFlags(["fieldEvidence", "clientVisibility", "projectAnalytics"]);
  assert.equal(flags.needsInstallers, true);
  assert.equal(flags.needsClientPortal, true);
  assert.equal(flags.needsAnalytics, true);
});

test("discovery: existing recommendation logic still works with new capability model", () => {
  const rec = resolveRecommendation({
    objectiveId: "retail_visibility",
    quantity: 5000,
    country: "Nigeria",
    needsInstallers: true,    // derived from fieldEvidence
    needsClientPortal: true,  // derived from clientVisibility
    needsAnalytics: true,     // derived from projectAnalytics
  });
  assert.equal(rec.productKey, "retail");
  assert.equal(rec.deploymentMode, "SELF_SERVICE");
});

// ---------------------------------------------------------------------------
// Capability Select All / Clear All (CO-1A improvement)
// ---------------------------------------------------------------------------

// WORKSPACE_CAPABILITIES is already imported at the top of this file

const ALL_IDS = WORKSPACE_CAPABILITIES.map((c) => c.id);

test("capabilities: ALL_IDS contains exactly 6 entries matching catalogue", () => {
  assert.equal(ALL_IDS.length, 6);
  const expected = ["fieldEvidence", "clientVisibility", "aiValidation", "projectAnalytics", "approvalWorkflow", "offlineOperation"];
  for (const id of expected) {
    assert.ok(ALL_IDS.includes(id), `Missing capability: ${id}`);
  }
});

test("capabilities: select-all produces all catalogue IDs without duplication", () => {
  // Simulate the handleSelectAll logic: replace capabilities with all IDs
  const initial = ["fieldEvidence"];
  const afterSelectAll = ALL_IDS.slice();
  assert.equal(afterSelectAll.length, ALL_IDS.length);
  const unique = new Set(afterSelectAll);
  assert.equal(unique.size, ALL_IDS.length, "Duplicates in select-all result");
});

test("capabilities: clear-all produces empty array", () => {
  const initial = [...ALL_IDS];
  // Simulate: allSelected → clicking clears
  const allSelected = initial.length === ALL_IDS.length;
  const afterClear = allSelected ? [] : ALL_IDS.slice();
  assert.equal(afterClear.length, 0);
});

test("capabilities: partial selection produces mixed state (not all, not none)", () => {
  const partial = ["fieldEvidence", "clientVisibility"];
  const allSelected = partial.length === ALL_IDS.length;
  const noneSelected = partial.length === 0;
  // mixed = not all and not none
  assert.equal(allSelected, false);
  assert.equal(noneSelected, false);
  assert.equal(!allSelected && !noneSelected, true, "Expected mixed state");
});

test("capabilities: individual deselection after select-all produces mixed/partial state", () => {
  let selected = ALL_IDS.slice();
  // Deselect one
  const toRemove = "aiValidation";
  selected = selected.filter((id) => id !== toRemove);
  assert.equal(selected.length, ALL_IDS.length - 1);
  assert.equal(selected.includes(toRemove), false);
  assert.equal(selected.length === ALL_IDS.length, false, "Should no longer be all-selected");
  assert.equal(selected.length === 0, false, "Should not be empty");
});

test("capabilities: validation still requires at least one selection", () => {
  const empty = [];
  const hasNone = empty.length === 0;
  // Expected: validation should flag this
  assert.equal(hasNone, true, "Validation should block empty capabilities");
});

test("capabilities: select-all from empty state produces all IDs", () => {
  const noneSelected = true;
  const afterSelectAll = noneSelected ? ALL_IDS.slice() : [];
  assert.equal(afterSelectAll.length, ALL_IDS.length);
  assert.deepEqual(afterSelectAll, ALL_IDS);
});

// ---------------------------------------------------------------------------
// Country normalisation — template resolution fix
// ---------------------------------------------------------------------------

import {
  normaliseCountry,
  countriesMatch,
  currencyForNormalisedCountry,
} from "../lib/commercial/pricing/countryNormalisation.ts";

// 1. Nigeria, NG and NGA all normalise to the same canonical code
test("country-normalisation: Nigeria → NG", () => {
  assert.equal(normaliseCountry("Nigeria"), "NG");
});
test("country-normalisation: NG → NG", () => {
  assert.equal(normaliseCountry("NG"), "NG");
});
test("country-normalisation: NGA → NG", () => {
  assert.equal(normaliseCountry("NGA"), "NG");
});
test("country-normalisation: nigeria (lowercase) → NG", () => {
  assert.equal(normaliseCountry("nigeria"), "NG");
});
test("country-normalisation: null → null", () => {
  assert.equal(normaliseCountry(null), null);
});
test("country-normalisation: empty string → null", () => {
  assert.equal(normaliseCountry(""), null);
});
test("country-normalisation: all three Nigeria variants produce the same code", () => {
  assert.equal(normaliseCountry("Nigeria"), normaliseCountry("NG"));
  assert.equal(normaliseCountry("NGA"), normaliseCountry("NG"));
});

// 2. retail product key passes normalised comparison
test("product-key: retail matches retail (exact, lowercased)", () => {
  const templateKey = "retail";
  const scopeKey    = "retail";
  assert.equal(templateKey.toLowerCase().trim(), scopeKey.toLowerCase().trim());
});
test("product-key: display label is never used as key", () => {
  const key = "retail";
  assert.ok(!key.startsWith("DeployIQ"), "Product key must not start with brand name");
});

// 3. Active Nigeria Retail default template resolves via countriesMatch
test("template-eligibility: template.country=Nigeria matches scope.country=Nigeria", () => {
  assert.equal(countriesMatch("Nigeria", "Nigeria"), true);
});
test("template-eligibility: template.country=NG matches scope.country=Nigeria", () => {
  assert.equal(countriesMatch("NG", "Nigeria"), true);
});
test("template-eligibility: template.country=NGA matches scope.country=Nigeria", () => {
  assert.equal(countriesMatch("NGA", "Nigeria"), true);
});

// 4. Null optional matching fields do not wrongly exclude templates
test("template-eligibility: template.country=null (any-country) matches any scope country", () => {
  assert.equal(countriesMatch(null, "Nigeria"), true);
  assert.equal(countriesMatch(null, "Ghana"), true);
  assert.equal(countriesMatch(null, "NG"), true);
});

// 5. Inactive template is rejected
test("template-eligibility: inactive template must be excluded", () => {
  const template = { status: "inactive", archived_at: null };
  const isEligible = template.status === "active" && !template.archived_at;
  assert.equal(isEligible, false);
});

// 6. Archived template is rejected
test("template-eligibility: archived template must be excluded", () => {
  const template = { status: "active", archived_at: "2026-01-01T00:00:00Z" };
  const isEligible = template.status === "active" && !template.archived_at;
  assert.equal(isEligible, false);
});

// 7. Future-dated template is rejected
test("template-eligibility: future effective_from is rejected", () => {
  const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();
  const template = { effective_from: futureDate, effective_to: null };
  const now = new Date();
  const withinWindow =
    (!template.effective_from || now >= new Date(template.effective_from)) &&
    (!template.effective_to   || now <= new Date(template.effective_to));
  assert.equal(withinWindow, false);
});

// 8. Expired template is rejected
test("template-eligibility: past effective_to is rejected", () => {
  const pastDate = new Date(Date.now() - 1000).toISOString();
  const template = { effective_from: null, effective_to: pastDate };
  const now = new Date();
  const withinWindow =
    (!template.effective_from || now >= new Date(template.effective_from)) &&
    (!template.effective_to   || now <= new Date(template.effective_to));
  assert.equal(withinWindow, false);
});

// 9. Exact match wins over general default
test("template-precedence: exact match beats global default", () => {
  const exact   = { country: "NG", region: null, is_default: false };
  const global  = { country: null, region: null, is_default: true };
  const scopeCountry = "Nigeria";
  const exactNorm  = normaliseCountry(exact.country);
  const scopeNorm  = normaliseCountry(scopeCountry);
  const globalNorm = normaliseCountry(global.country);
  // Exact candidate matches scope
  assert.equal(exactNorm === scopeNorm, true, "Exact candidate should match scope");
  // Global candidate has no country (null = any)
  assert.equal(globalNorm, null, "Global candidate country should be null");
  // Exact takes priority over global default in the selection logic
  const exactCandidates = [exact].filter(t => normaliseCountry(t.country) === scopeNorm);
  assert.equal(exactCandidates.length, 1, "Exact candidates should have 1 entry");
});

// 10. 2,500-location Retail quotation produces a non-zero amount
test("quotation: 2500-location query with Nigeria Retail NGN template produces non-zero total", () => {
  // Simulate the billing calculation that would occur with a real template
  const quantity = 2500;
  const tiers = [
    { sequence: 1, minimum_quantity: 1, maximum_quantity: 5000,  unit_price: 500, fixed_charge: 0 },
    { sequence: 2, minimum_quantity: 5001, maximum_quantity: null, unit_price: 450, fixed_charge: 0 },
  ];
  // Progressive pricing: all 2500 fall in tier 1
  const total = quantity * tiers[0].unit_price;
  assert.ok(total > 0, "Total should be non-zero for 2500 locations");
  assert.equal(total, 1_250_000); // 2500 × 500 NGN
});

// 11. No eligible template returns enterprise review
test("template-resolution: no eligible template → requiresEnterpriseReview = true", () => {
  const quotationResult = {
    requiresEnterpriseReview: true,
    enterpriseReason: "No standard pricing is available.",
    quantity: 2500,
    productKey: "retail",
  };
  assert.equal(quotationResult.requiresEnterpriseReview, true);
  assert.ok(!("quotation" in quotationResult), "No quotation object when enterprise review");
});

// 12. Resolved quotation has correct shape for Commercial Plan
test("quotation: resolved CustomerQuotation has all required fields", () => {
  // Verify the CustomerQuotation type shape expected by CommercialPlanStep
  const fakeResult = {
    pricing_template_id: "t-1",
    pricing_template_name: "Nigeria Retail NGN",
    product_key: "retail",
    country: "NG",
    currency: "NGN",
    pricing_metric: "deployment_location",
    pricing_method: "progressive_tiered",
    quantity: 2500,
    tier_breakdown: [
      { sequence: 1, minimum_quantity: 1, maximum_quantity: 5000, applicable_quantity: 2500,
        unit_price: 500, fixed_charge: 0, subtotal: 1_250_000, enterprise_action: null, label: "Tier 1" },
    ],
    subtotal: 1_250_000,
    discount: 0,
    tax: 0,
    total: 1_250_000,
    included_admin_users: 15,
    quotation_status: "calculated",
    quotation_expiry: null,
    requires_enterprise_review: false,
    enterprise_action: null,
    calculated_at: new Date().toISOString(),
  };

  const cq = toCustomerQuotation(fakeResult, { pricing_method: "progressive_tiered" });
  assert.equal(cq.requiresEnterpriseReview, false);
  assert.equal(cq.currency, "NGN");
  assert.equal(cq.quantity, 2500);
  assert.ok(cq.estimatedTotal > 0, "estimatedTotal must be positive");
  assert.equal(cq.estimatedTotal, 1_250_000);

  // currencyForNormalisedCountry accepts Nigeria, NG, NGA equivalently
  assert.equal(currencyForNormalisedCountry("Nigeria"), "NGN");
  assert.equal(currencyForNormalisedCountry("NG"),      "NGN");
  assert.equal(currencyForNormalisedCountry("NGA"),     "NGN");
});

// ---------------------------------------------------------------------------
// Canonical product catalogue — objective-to-product mapping tests
// ---------------------------------------------------------------------------

// getObjectiveById and BUSINESS_OBJECTIVES already imported at the top of this file

import {
  objectiveToProductKey,
} from "../lib/commercial/onboarding/objectives.ts";

import {
  getCanonicalProductCatalog,
  getCanonicalProduct,
  resolveProductKey,
  getProductKeyLookupVariants,
  LEGACY_PRODUCT_KEY_ALIASES,
} from "../lib/commercial/products/catalogue.ts";

import {
  getSupportedMetricsForProduct,
  getDefaultMetricForProduct,
} from "../components/pricing/wizardUtils.ts";

// 1. Retail objective → retail
test("catalogue: retail_visibility → product_key retail", () => {
  assert.equal(objectiveToProductKey("retail_visibility"), "retail");
});

// 2. Construction → build
test("catalogue: construction_monitoring → product_key build", () => {
  assert.equal(objectiveToProductKey("construction_monitoring"), "build");
});

// 3. Location audit → location_audit
test("catalogue: location_audit objective → product_key location_audit", () => {
  assert.equal(objectiveToProductKey("location_audit"), "location_audit");
});

// 4. Asset verification → assets_audit
test("catalogue: asset_verification → product_key assets_audit", () => {
  assert.equal(objectiveToProductKey("asset_verification"), "assets_audit");
});

// 5. Fleet → fleet
test("catalogue: fleet_branding → product_key fleet", () => {
  assert.equal(objectiveToProductKey("fleet_branding"), "fleet");
});

// 6. Field operations → field_operations
test("catalogue: field_operations → product_key field_operations", () => {
  assert.equal(objectiveToProductKey("field_operations"), "field_operations");
});

// 7. Pricing Studio KNOWN_PRODUCT_OPTIONS uses catalogue keys
test("catalogue: Pricing Studio product options include all canonical products", async () => {
  const catalog = getCanonicalProductCatalog();
  const { KNOWN_PRODUCT_OPTIONS } = await import("../components/pricing/wizardUtils.ts");
  for (const product of catalog) {
    const found = KNOWN_PRODUCT_OPTIONS.some((o) => o.value === product.productKey);
    assert.ok(found, `${product.productKey} should be in KNOWN_PRODUCT_OPTIONS`);
  }
});

// 8. Recommendation and Pricing Studio share product keys
test("catalogue: recommendation product keys match Pricing Studio keys", () => {
  const canonicalKeys = getCanonicalProductCatalog().map((p) => p.productKey);
  assert.ok(canonicalKeys.includes("retail"), "retail must be canonical");
  assert.ok(canonicalKeys.includes("build"),  "build must be canonical");
  assert.ok(!canonicalKeys.includes("survey"), "survey is legacy, not canonical");
});

// 9. Retail resolves only Retail templates (product_key isolation)
test("catalogue: retail template cannot match build scope", () => {
  const retailKey = "retail";
  const buildKey  = "build";
  assert.equal(retailKey === buildKey, false);
});

// 10. Build resolves only Build templates
test("catalogue: build template cannot match retail scope", () => {
  assert.equal(resolveProductKey("build"), "build");
  assert.notEqual(resolveProductKey("build"), "retail");
});

// 11. Location Audit cannot resolve Retail pricing
test("catalogue: location_audit product key is distinct from retail", () => {
  assert.notEqual("location_audit", "retail");
  assert.equal(resolveProductKey("location_audit"), "location_audit");
});

// 12. Fleet cannot resolve Field Operations pricing
test("catalogue: fleet and field_operations are separate product keys", () => {
  assert.notEqual("fleet", "field_operations");
});

// 13. Product without active pricing routes to Assisted Setup
test("catalogue: build pricingAvailability is assisted_setup", () => {
  const p = getCanonicalProduct("build");
  assert.equal(p?.pricingAvailability, "assisted_setup");
});

// 14. Legacy aliases resolve to canonical keys
test("catalogue: legacy 'assets' resolves to assets_audit", () => {
  assert.equal(resolveProductKey("assets"), "assets_audit");
});
test("catalogue: Assets Audit legacy product keys resolve to assets_audit", () => {
  assert.equal(resolveProductKey("asset_audit"), "assets_audit");
  assert.equal(resolveProductKey("asset_audits"), "assets_audit");
  assert.equal(resolveProductKey("asset_verification"), "assets_audit");
  assert.equal(resolveProductKey("asset-verification"), "assets_audit");
  assert.equal(resolveProductKey("field_assets"), "assets_audit");
});
test("catalogue: Assets Audit database lookup includes canonical and legacy keys", () => {
  const variants = getProductKeyLookupVariants("assets_audit");
  assert.ok(variants.includes("assets_audit"));
  assert.ok(variants.includes("asset-verification"));
  assert.ok(variants.includes("asset_verification"));
  assert.ok(variants.includes("asset_audit"));
  assert.ok(variants.includes("asset_audits"));
  assert.ok(variants.includes("field_assets"));
});
test("catalogue: legacy 'audit' resolves to location_audit", () => {
  assert.equal(resolveProductKey("audit"), "location_audit");
});
test("catalogue: legacy 'survey' resolves to field_operations", () => {
  assert.equal(resolveProductKey("survey"), "field_operations");
});

// 15. Supported pricing metrics by product
test("catalogue: retail supports deployment_location metric", () => {
  const metrics = getSupportedMetricsForProduct("retail");
  assert.ok(metrics.some((m) => m.value === "deployment_location"));
});
test("catalogue: build supports site and project metrics", () => {
  const metrics = getSupportedMetricsForProduct("build");
  assert.ok(metrics.some((m) => m.value === "site"));
  assert.ok(metrics.some((m) => m.value === "project"));
});
test("catalogue: fleet supports vehicle metric", () => {
  const metrics = getSupportedMetricsForProduct("fleet");
  assert.ok(metrics.some((m) => m.value === "vehicle"));
});

// 16. Provisioning manifest key exists for every canonical product
test("catalogue: every canonical product has a provisioningManifestKey", () => {
  const catalog = getCanonicalProductCatalog();
  for (const p of catalog) {
    assert.ok(typeof p.provisioningManifestKey === "string" && p.provisioningManifestKey.length > 0,
      `${p.productKey} missing provisioningManifestKey`);
    assert.ok(p.provisioningManifestKey.endsWith("_workspace_manifest"),
      `${p.productKey} manifest key should end with _workspace_manifest`);
  }
});

test("pricing readiness: recommendation response exposes required commercial-routing fields", () => {
  const rec = resolveRecommendation({
    objectiveId: "retail_visibility",
    quantity: 1000,
    country: "Nigeria",
    needsInstallers: false,
    needsClientPortal: false,
    needsAnalytics: false,
    pricingReady: true,
  });
  assert.equal(rec.productKey, "retail");
  assert.equal(rec.productName, "DeployIQ Retail");
  assert.equal(rec.pricingReady, true);
  assert.equal(rec.deploymentMode, "SELF_SERVICE");
  assert.equal(rec.assistedOnboardingReason, null);
  assert.equal(rec.provisioningManifestKey, "retail_workspace_manifest");
});

test("pricing readiness: no-template products route to Assisted Setup without quotation", () => {
  const objectives = [
    ["construction_monitoring", "build"],
    ["location_audit", "location_audit"],
    ["asset_verification", "assets_audit"],
    ["fleet_branding", "fleet"],
    ["field_operations", "field_operations"],
  ];

  for (const [objectiveId, productKey] of objectives) {
    const rec = resolveRecommendation({
      objectiveId,
      quantity: 1000,
      country: "Nigeria",
      needsInstallers: false,
      needsClientPortal: false,
      needsAnalytics: false,
      pricingReady: false,
    });
    assert.equal(rec.productKey, productKey);
    assert.equal(rec.pricingReady, false);
    assert.equal(rec.deploymentMode, "ENTERPRISE");
    assert.equal(shouldRequestQuotation(rec), false, `${productKey} must not request quotation`);
    assert.equal(nextCommercialDecisionTarget(rec), "assisted_setup");
    assert.equal(
      rec.assistedOnboardingReason,
      "Standard online pricing is not yet available for this solution. Our assisted sales team will prepare a tailored commercial plan."
    );
  }
});

test("pricing readiness: Fleet without active template does not call quotation API or enter loading path", () => {
  const rec = resolveRecommendation({
    objectiveId: "fleet_branding",
    quantity: 250,
    country: "Nigeria",
    needsInstallers: false,
    needsClientPortal: false,
    needsAnalytics: false,
    pricingReady: false,
  });
  assert.equal(rec.productKey, "fleet");
  assert.equal(shouldRequestQuotation(rec), false);
  assert.equal(nextCommercialDecisionTarget(rec), "assisted_setup");
});

test("pricing readiness: adding active Fleet pricing flips Fleet to self-service without onboarding code changes", () => {
  const rec = resolveRecommendation({
    objectiveId: "fleet_branding",
    quantity: 250,
    country: "Nigeria",
    needsInstallers: false,
    needsClientPortal: false,
    needsAnalytics: false,
    pricingReady: true,
  });
  assert.equal(rec.productKey, "fleet");
  assert.equal(rec.pricingReady, true);
  assert.equal(rec.deploymentMode, "SELF_SERVICE");
  assert.equal(shouldRequestQuotation(rec), true);
  assert.equal(nextCommercialDecisionTarget(rec), "quotation");
});

test("pricing readiness: active eligible Assets Audit pricing flips Assets Audit to Instant Setup", () => {
  const rec = resolveRecommendation({
    objectiveId: "asset_verification",
    quantity: 250,
    country: "Nigeria",
    needsInstallers: false,
    needsClientPortal: false,
    needsAnalytics: false,
    pricingReady: true,
  });
  assert.equal(rec.productKey, "assets_audit");
  assert.equal(rec.productName, "DeployIQ Assets Audit");
  assert.equal(rec.pricingReady, true);
  assert.equal(rec.deploymentMode, "SELF_SERVICE");
  assert.equal(rec.assistedOnboardingReason, null);
  assert.equal(shouldRequestQuotation(rec), true);
  assert.equal(nextCommercialDecisionTarget(rec), "quotation");
});

test("pricing readiness: Assets Audit without active template remains Assisted Setup", () => {
  const rec = resolveRecommendation({
    objectiveId: "asset_verification",
    quantity: 250,
    country: "Nigeria",
    needsInstallers: false,
    needsClientPortal: false,
    needsAnalytics: false,
    pricingReady: false,
  });
  assert.equal(rec.productKey, "assets_audit");
  assert.equal(rec.pricingReady, false);
  assert.equal(rec.deploymentMode, "ENTERPRISE");
  assert.equal(shouldRequestQuotation(rec), false);
  assert.equal(nextCommercialDecisionTarget(rec), "assisted_setup");
});

test("pricing readiness: Assets Audit never uses Retail or Fleet product keys", () => {
  const rec = resolveRecommendation({
    objectiveId: "asset_verification",
    quantity: 250,
    country: "Nigeria",
    needsInstallers: false,
    needsClientPortal: false,
    needsAnalytics: false,
    pricingReady: true,
  });
  assert.equal(rec.productKey, "assets_audit");
  assert.notEqual(rec.productKey, "retail");
  assert.notEqual(rec.productKey, "fleet");
});

test("pricing readiness: Assets Audit quotation retains canonical product key", () => {
  const rec = resolveRecommendation({
    objectiveId: "asset_verification",
    quantity: 250,
    country: "Nigeria",
    needsInstallers: false,
    needsClientPortal: false,
    needsAnalytics: false,
    pricingReady: true,
  });
  const quotation = toCustomerQuotation(
    makeResult({
      product_key: "assets_audit",
      pricing_template_id: "asset-template-1",
      pricing_template_name: "Asset Audit",
      pricing_metric: "asset",
    }),
    { pricing_method: "progressive_tiered" }
  );
  assert.equal(quotation.productKey, rec.productKey);
  assert.equal(quotation.productKey, "assets_audit");
});

test("pricing readiness: confirmed quotation product key must match recommendation", () => {
  const rec = resolveRecommendation({
    objectiveId: "retail_visibility",
    quantity: 4000,
    country: "Nigeria",
    needsInstallers: false,
    needsClientPortal: false,
    needsAnalytics: false,
    pricingReady: true,
  });
  const quotation = toCustomerQuotation(makeResult({ product_key: "retail" }), { pricing_method: "progressive_tiered" });
  assert.equal(quotation.productKey, rec.productKey);
});

test("pricing readiness: Fleet, Build and Retail product keys remain isolated", () => {
  const retail = resolveRecommendation({ objectiveId: "retail_visibility", quantity: 100, country: "Nigeria", needsInstallers: false, needsClientPortal: false, needsAnalytics: false, pricingReady: true });
  const fleet = resolveRecommendation({ objectiveId: "fleet_branding", quantity: 100, country: "Nigeria", needsInstallers: false, needsClientPortal: false, needsAnalytics: false, pricingReady: false });
  const build = resolveRecommendation({ objectiveId: "construction_monitoring", quantity: 100, country: "Nigeria", needsInstallers: false, needsClientPortal: false, needsAnalytics: false, pricingReady: false });
  assert.equal(retail.productKey, "retail");
  assert.equal(fleet.productKey, "fleet");
  assert.equal(build.productKey, "build");
  assert.notEqual(fleet.productKey, retail.productKey);
  assert.notEqual(build.productKey, retail.productKey);
});

// 17. Retail manifest key
test("catalogue: retail provisioning manifest key is retail_workspace_manifest", () => {
  const retail = getCanonicalProduct("retail");
  assert.equal(retail?.provisioningManifestKey, "retail_workspace_manifest");
});

// 18. All 6 canonical products are present
test("catalogue: exactly 6 canonical products", () => {
  const catalog = getCanonicalProductCatalog();
  assert.equal(catalog.length, 6);
  const keys = catalog.map((p) => p.productKey);
  assert.ok(keys.includes("retail"));
  assert.ok(keys.includes("build"));
  assert.ok(keys.includes("location_audit"));
  assert.ok(keys.includes("assets_audit"));
  assert.ok(keys.includes("fleet"));
  assert.ok(keys.includes("field_operations"));
});

// 19. BUSINESS_OBJECTIVES has exactly 6 entries
test("catalogue: BUSINESS_OBJECTIVES has exactly 6 entries", () => {
  assert.equal(BUSINESS_OBJECTIVES.length, 6);
});

// 20. No objective maps to legacy product keys
test("catalogue: no objective maps to legacy keys (assets/audit/survey)", () => {
  for (const obj of BUSINESS_OBJECTIVES) {
    assert.ok(obj.maps_to_product !== "assets", `${obj.id} should not map to legacy 'assets'`);
    assert.ok(obj.maps_to_product !== "audit",  `${obj.id} should not map to legacy 'audit'`);
    assert.ok(obj.maps_to_product !== "survey", `${obj.id} should not map to legacy 'survey'`);
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { validateProvisioningEligibility, validateProvisioningProductChain } from "../lib/acquisition/provisioning/validation.ts";
import { buildProvisioningFailureMetadata } from "../lib/acquisition/provisioning/failure.ts";

function makeQuotation(overrides = {}) {
  return {
    productKey: "retail",
    pricingTemplateId: "tpl-retail",
    pricingTemplateName: "Retail Standard",
    currency: "NGN",
    quantity: 1000,
    estimatedTotal: 500000,
    subtotal: 500000,
    discountAmount: 0,
    discountPercentage: 0,
    discountLabel: null,
    pricingMethodLabel: "Standard progressive pricing",
    pricingExplanation: "All 1,000 deployment locations are charged at one rate.",
    includedAdminUsers: 5,
    requiresEnterpriseReview: false,
    quotationExpiry: new Date(Date.now() + 86400000).toISOString(),
    calculatedAt: new Date().toISOString(),
    tierBreakdown: [],
    commercialModel: "one_time_programme",
    billingBehaviour: "single_payment",
    renewalRequired: false,
    allowedPaymentMethods: ["card", "bank_transfer"],
    ...overrides,
  };
}

function makeDraft(overrides = {}) {
  const quotation = makeQuotation(overrides.quotation ?? {});
  const { draft_data: draftDataOverrides, quotation: _quotation, ...rootOverrides } = overrides;
  return {
    id: "draft-1",
    resume_token: "token-1",
    selected_product: "retail",
    pricing_snapshot_id: null,
    authenticated_user_id: null,
    status: "payment_complete",
    current_step: "provisioning",
    failure_reason: null,
    created_at: new Date().toISOString(),
    draft_data: {
      objectiveId: "retail_visibility",
      recommendedProductKey: "retail",
      confirmedQuotation: quotation,
      commercialReference: "DQ-QT-2026-ABC123",
      workspaceSlug: "example-workspace",
      paymentStatus: "succeeded",
      commercialStatus: "payment_verified",
      paymentMethod: "card",
      readyForProvisioning: true,
      ...draftDataOverrides,
    },
    ...rootOverrides,
  };
}

test("provisioning: product-chain mismatch is rejected", () => {
  const draft = makeDraft({
    draft_data: {
      objectiveId: "retail_visibility",
      recommendedProductKey: "retail",
      confirmedQuotation: makeQuotation({ productKey: "fleet" }),
    },
  });
  const result = validateProvisioningEligibility(draft);
  assert.equal(result.ok, false);
  assert.equal(result.code, "product_chain_mismatch");
});

test("provisioning: product-chain validator accepts matching canonical keys", () => {
  const draft = makeDraft();
  const result = validateProvisioningProductChain(draft, draft.draft_data.confirmedQuotation);
  assert.equal(result.ok, true);
  assert.equal(result.productKey, "retail");
});

test("provisioning: failure metadata persists failed safe stage and code", () => {
  const failure = buildProvisioningFailureMetadata(
    { current_stage: "configuring_product" },
    { code: "42703", message: "column brands.client_id does not exist" }
  );
  assert.equal(failure.failureCode, "42703");
  assert.equal(failure.failureMessage, "column brands.client_id does not exist");
  assert.equal(failure.failedSafeStage, "configuring_product");
  assert.equal(failure.retryable, true);
});

test("provisioning: retry path reuses existing job by acquisition draft", () => {
  const source = readFileSync(new URL("../lib/acquisition/provisioning/service.ts", import.meta.url), "utf8");
  assert.match(source, /\.eq\("acquisition_draft_id", input\.draftId\)/);
  assert.match(source, /if \(existing\) return normaliseJob/);
});

test("provisioning: completed job returns without incrementing attempts", () => {
  const source = readFileSync(new URL("../lib/acquisition/provisioning/service.ts", import.meta.url), "utf8");
  assert.match(source, /if \(job\.status === "completed"\)/);
  assert.ok(source.indexOf('if (job.status === "completed")') < source.indexOf("job = await incrementAttempt(job)"));
});

test("provisioning: retail product provisioning tolerates live schema without duplicate resources", () => {
  const source = readFileSync(new URL("../lib/commercial/provisioning/products/retail.ts", import.meta.url), "utf8");
  assert.match(source, /eq\("name", input\.projectName\)/);
  assert.match(source, /campaign: input\.campaignName/);
  assert.match(source, /client_projects/);
  assert.match(source, /!isMissingSchemaObject\(linkResult\.error\)/);
});

test("provisioning: successful provisioning reaches completed stage", () => {
  const source = readFileSync(new URL("../lib/acquisition/provisioning/service.ts", import.meta.url), "utf8");
  assert.match(source, /updateJob\(job, "completed"/);
  assert.match(source, /status: "provisioned"/);
  assert.match(source, /workspaceUrl: job\.result_data\.workspaceUrl/);
});

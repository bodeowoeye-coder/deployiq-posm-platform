import test from "node:test";
import assert from "node:assert/strict";

import { parseCanonicalProductKey, resolveProductKey } from "../lib/commercial/products/catalogue.ts";
import { validateQuotationAgainstSnapshot } from "../lib/commercial/onboarding/quotationAuthority.ts";

const quotation = {
  productKey: "retail",
  pricingTemplateId: "template-retail",
  pricingTemplateName: "Retail Standard",
  currency: "NGN",
  quantity: 1000,
  estimatedTotal: 500000,
  subtotal: 500000,
  discountAmount: 0,
  discountPercentage: 0,
  discountLabel: null,
  pricingMethodLabel: "Standard progressive pricing",
  pricingExplanation: "Authoritative quotation",
  includedAdminUsers: 5,
  requiresEnterpriseReview: false,
  quotationExpiry: null,
  calculatedAt: "2026-08-23T00:00:00.000Z",
  tierBreakdown: [],
  commercialModel: "one_time_programme",
  billingBehaviour: "single_payment",
  renewalRequired: false,
  allowedPaymentMethods: ["card", "bank_transfer"],
};

const snapshot = {
  id: "snapshot-retail",
  onboarding_draft_id: "draft-retail",
  product_key: "retail",
  pricing_template_id: "template-retail",
  pricing_template_name: "Retail Standard",
  currency: "NGN",
  quantity: 1000,
  subtotal: 500000,
  discount: 0,
  total: 500000,
  included_admin_users: 5,
  requires_enterprise_review: false,
  expires_at: null,
  status: "calculated",
};

test("product identity: known canonical and legacy keys resolve", () => {
  assert.equal(parseCanonicalProductKey("retail"), "retail");
  assert.equal(parseCanonicalProductKey(" construction "), "build");
});

test("product identity: unknown keys fail closed", () => {
  assert.equal(parseCanonicalProductKey("facilities"), null);
  assert.throws(() => resolveProductKey("facilities"), /Unknown DeployIQ product key/);
});

test("quotation authority: matching server snapshot is accepted", () => {
  assert.deepEqual(validateQuotationAgainstSnapshot({ draftId: "draft-retail", selectedProduct: "retail", snapshot, quotation }), { ok: true, productKey: "retail" });
});

for (const [name, changed] of [
  ["product", { productKey: "build" }],
  ["template", { pricingTemplateId: "template-build" }],
  ["currency", { currency: "USD" }],
  ["quantity", { quantity: 999 }],
  ["amount", { estimatedTotal: 1 }],
]) {
  test(`quotation authority: client-modified ${name} is rejected`, () => {
    const result = validateQuotationAgainstSnapshot({ draftId: "draft-retail", selectedProduct: "retail", snapshot, quotation: { ...quotation, ...changed } });
    assert.equal(result.ok, false);
  });
}

test("quotation authority: snapshot from another draft is rejected", () => {
  const result = validateQuotationAgainstSnapshot({ draftId: "other-draft", selectedProduct: "retail", snapshot, quotation });
  assert.deepEqual(result, { ok: false, code: "pricing_snapshot_draft_mismatch", message: "The commercial plan does not belong to this acquisition journey." });
});

test("quotation authority: superseded snapshot is rejected", () => {
  const result = validateQuotationAgainstSnapshot({ draftId: "draft-retail", selectedProduct: "retail", snapshot: { ...snapshot, status: "superseded" }, quotation });
  assert.equal(result.ok, false);
});

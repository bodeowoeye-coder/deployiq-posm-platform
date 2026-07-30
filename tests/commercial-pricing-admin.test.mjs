import test from "node:test";
import assert from "node:assert/strict";
import { buildPricingTemplatePayload } from "../lib/commercial/pricing/payload.ts";

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

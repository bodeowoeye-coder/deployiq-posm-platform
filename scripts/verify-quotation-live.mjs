/**
 * Verify the live quotation API after template activation.
 * Sends POST /api/onboarding/quotation for Nigeria Retail, qty 4000.
 *
 * Run:  node --env-file=.env.local scripts/verify-quotation-live.mjs
 */

const BASE_URL = "http://localhost:3000";
const ENDPOINT = `${BASE_URL}/api/onboarding/quotation`;

const payload = {
  productKey: "retail",
  country: "Nigeria",
  currency: "NGN",
  quantity: 4000,
  resumeToken: null,
};

console.log("\n========================================");
console.log("Live quotation verification");
console.log("========================================");
console.log(`POST ${ENDPOINT}`);
console.log("Payload:", JSON.stringify(payload, null, 2));

let response;
try {
  response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
} catch (err) {
  console.error("\n❌  Could not connect to localhost:3000.");
  console.error("   Is 'npm run dev' running? Error:", err.message);
  process.exit(1);
}

const data = await response.json();
console.log("\nHTTP status:", response.status);
console.log("\nResponse:");
console.log(JSON.stringify(data, null, 2));

if (data.requiresEnterpriseReview) {
  console.log("\n❌  Still returning enterprise review. Template may not be active yet.");
} else if (data.quotation) {
  const q = data.quotation;
  console.log("\n✅  Standard quotation returned.");
  console.log(`   Template:             ${q.pricingMethodLabel}`);
  console.log(`   Currency:             ${q.currency}`);
  console.log(`   Quantity:             ${q.quantity}`);
  console.log(`   Estimated total:      ${q.estimatedTotal.toLocaleString("en-US")} ${q.currency}`);
  console.log(`   Tiers in breakdown:   ${q.tierBreakdown?.length ?? 0}`);
  console.log(`   requiresEnterprise:   ${q.requiresEnterpriseReview}`);
} else {
  console.log("\n⚠️  Unexpected response shape:", data);
}

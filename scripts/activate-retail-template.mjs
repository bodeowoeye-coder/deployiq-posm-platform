/**
 * Activate the correct Nigeria Retail pricing template.
 *
 * Run:  node --env-file=.env.local scripts/activate-retail-template.mjs
 *
 * This activates the existing template
 * "DeployIQ Retail Nigeria Standard Pricing" (id: 6f6a0db0-...)
 * which is the only properly configured Nigeria Retail NGN template
 * with valid tiers and all optional scope fields set to NULL.
 *
 * Safe to run multiple times (idempotent).
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const TARGET_TEMPLATE_ID = "6f6a0db0-0f4d-4f95-b66c-79f70ce48b60";

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Confirm the template exists before updating
const { data: before, error: fetchError } = await supabase
  .from("commercial_pricing_templates")
  .select("id, name, status, is_default, country, currency")
  .eq("id", TARGET_TEMPLATE_ID)
  .single();

if (fetchError || !before) {
  console.error("❌  Template not found. Cannot activate.", fetchError?.message ?? "no data");
  process.exit(1);
}

console.log(`\nFound template: ${before.name}`);
console.log(`  ID:       ${before.id}`);
console.log(`  Status:   ${before.status}`);
console.log(`  Country:  ${before.country}`);
console.log(`  Currency: ${before.currency}`);

if (before.status === "active") {
  console.log("\n✅  Template is already active. No change needed.");
  process.exit(0);
}

// Activate
const { error: updateError } = await supabase
  .from("commercial_pricing_templates")
  .update({
    status: "active",
    updated_at: new Date().toISOString(),
  })
  .eq("id", TARGET_TEMPLATE_ID);

if (updateError) {
  console.error("❌  Failed to activate template:", updateError.message);
  process.exit(1);
}

// Confirm
const { data: after } = await supabase
  .from("commercial_pricing_templates")
  .select("id, name, status")
  .eq("id", TARGET_TEMPLATE_ID)
  .single();

console.log(`\n✅  Template activated successfully.`);
console.log(`  New status: ${after?.status}`);
console.log("\nEquivalent SQL:");
console.log(`  UPDATE public.commercial_pricing_templates`);
console.log(`  SET status = 'active', updated_at = now()`);
console.log(`  WHERE id = '${TARGET_TEMPLATE_ID}';`);

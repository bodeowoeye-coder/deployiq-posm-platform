/**
 * Runtime pricing-template diagnostic.
 * Queries the live Supabase project used by localhost and reports
 * every retail template found, with eligibility analysis.
 *
 * Run:  node --env-file=.env.local scripts/diagnose-pricing-templates.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { normaliseCountry, countriesMatch } from "../lib/commercial/pricing/countryNormalisation.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const hostname = new URL(url).hostname;
console.log("\n========================================");
console.log("DeployIQ — Pricing Template Diagnostic");
console.log("========================================");
console.log(`Supabase project: ${hostname}`);
console.log(`Client: service-role (admin, server-side only)\n`);

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── 1. Fetch all Retail templates ──────────────────────────────────────────

const { data: templates, error: tplError } = await supabase
  .from("commercial_pricing_templates")
  .select("id, name, product_key, currency, country, region, customer_segment, campaign_type, status, is_default, effective_from, effective_to, archived_at, pricing_method, pricing_metric, created_at, updated_at")
  .eq("product_key", "retail");

if (tplError) {
  console.error("❌  Failed to query commercial_pricing_templates:", tplError.message);
  process.exit(1);
}

console.log(`Retail templates found in DB: ${templates?.length ?? 0}\n`);

if (!templates?.length) {
  console.log("⚠️  NO RETAIL TEMPLATES EXIST in this Supabase project.");
  console.log("   The Admin Pricing Studio may be connected to a different project,");
  console.log("   or no template has been created yet.");
  process.exit(0);
}

// ── 2. Tier counts ─────────────────────────────────────────────────────────

const templateIds = templates.map((t) => t.id);
const { data: tiers, error: tierError } = await supabase
  .from("commercial_pricing_tiers")
  .select("id, pricing_template_id, status")
  .in("pricing_template_id", templateIds);

const tierCounts = {};
for (const t of templateIds) tierCounts[t] = { total: 0, active: 0 };
for (const tier of (tiers ?? [])) {
  if (tierCounts[tier.pricing_template_id]) {
    tierCounts[tier.pricing_template_id].total++;
    if (tier.status === "active") tierCounts[tier.pricing_template_id].active++;
  }
}

// ── 3. Test scope (mirrors what the quotation route sends) ─────────────────

const testScope = {
  productKey:      "retail",
  currency:        "NGN",
  country:         "Nigeria",
  region:          null,
  customerSegment: null,
  campaignType:    null,
};

const now = new Date();
const normalisedScopeCountry = normaliseCountry(testScope.country);

console.log("Live scope for 4,000-location Nigeria Retail query:");
console.log(JSON.stringify({ ...testScope, normalisedCountry: normalisedScopeCountry, now: now.toISOString() }, null, 2));
console.log();

// ── 4. Eligibility analysis ────────────────────────────────────────────────

console.log("Template eligibility analysis:");
console.log("─".repeat(90));

for (const t of templates) {
  const rejections = [];

  if (t.status !== "active")       rejections.push(`status = '${t.status}' (not active)`);
  if (t.archived_at)               rejections.push(`archived_at is set (${t.archived_at})`);
  if (t.currency !== testScope.currency) rejections.push(`currency = '${t.currency}' (expected ${testScope.currency})`);

  if (t.effective_from && now < new Date(t.effective_from))
    rejections.push(`effective_from ${t.effective_from} is in the future`);
  if (t.effective_to && now > new Date(t.effective_to))
    rejections.push(`effective_to ${t.effective_to} is expired`);

  // Country check (with normalisation)
  const normalisedTemplateCountry = normaliseCountry(t.country);
  const countryMatch = normalisedTemplateCountry === null || normalisedTemplateCountry === normalisedScopeCountry;
  if (!countryMatch)
    rejections.push(`country '${t.country}' (normalised: '${normalisedTemplateCountry}') ≠ scope '${testScope.country}' (normalised: '${normalisedScopeCountry}')`);

  if (t.region !== null && t.region !== testScope.region)
    rejections.push(`region '${t.region}' does not match scope null`);
  if (t.customer_segment !== null && t.customer_segment !== testScope.customerSegment)
    rejections.push(`customer_segment '${t.customer_segment}' does not match scope null`);
  if (t.campaign_type !== null && t.campaign_type !== testScope.campaignType)
    rejections.push(`campaign_type '${t.campaign_type}' does not match scope null`);

  const tc = tierCounts[t.id];
  if (tc.active === 0)  rejections.push(`no active tiers (total tiers: ${tc.total})`);

  const eligible = rejections.length === 0;

  console.log(`\nTemplate: ${t.name}`);
  console.log(`  ID:             ${t.id}`);
  console.log(`  Status:         ${t.status}`);
  console.log(`  is_default:     ${t.is_default}`);
  console.log(`  currency:       ${t.currency}`);
  console.log(`  country:        '${t.country}' → normalised '${normalisedTemplateCountry}'`);
  console.log(`  region:         ${t.region ?? "null"}`);
  console.log(`  segment:        ${t.customer_segment ?? "null"}`);
  console.log(`  campaign:       ${t.campaign_type ?? "null"}`);
  console.log(`  pricing_method: ${t.pricing_method}`);
  console.log(`  pricing_metric: ${t.pricing_metric}`);
  console.log(`  effective_from: ${t.effective_from ?? "null"}`);
  console.log(`  effective_to:   ${t.effective_to ?? "null"}`);
  console.log(`  archived_at:    ${t.archived_at ?? "null"}`);
  console.log(`  tiers (active/total): ${tc.active}/${tc.total}`);
  console.log(`  ✅ ELIGIBLE: ${eligible}`);
  if (!eligible) {
    rejections.forEach((r) => console.log(`  ❌ ${r}`));
  }
}

console.log("\n" + "─".repeat(90));
console.log("Diagnostic complete.\n");

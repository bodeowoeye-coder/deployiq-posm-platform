/**
 * Apply commercial model migration to the live Supabase database.
 * Run: node --env-file=.env.local scripts/apply-commercial-model-migration.mjs
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Check current column state
const { data: cols } = await sb
  .from("information_schema.columns")
  .select("column_name")
  .eq("table_schema", "public")
  .eq("table_name", "commercial_pricing_templates")
  .in("column_name", ["commercial_model", "billing_behaviour", "renewal_required", "allowed_payment_methods"]);

const existingCols = (cols ?? []).map((c) => c.column_name);
console.log("Existing columns:", existingCols);

if (existingCols.length === 4) {
  console.log("✅  All columns already exist. Checking backfill...");
} else {
  console.log("⚠️  Missing columns:", ["commercial_model","billing_behaviour","renewal_required","allowed_payment_methods"].filter(c => !existingCols.includes(c)));
  console.log("   Run the migration SQL via Supabase Dashboard SQL Editor:");
  console.log("   supabase/migrations/20260804000000_add_commercial_model_fields.sql");
}

// Check backfill state regardless
const { data: tpl, error: tplErr } = await sb
  .from("commercial_pricing_templates")
  .select("id,name,status,commercial_model,billing_behaviour,renewal_required,allowed_payment_methods")
  .eq("id", "6f6a0db0-0f4d-4f95-b66c-79f70ce48b60")
  .maybeSingle();

if (tplErr) {
  // Column may not exist yet — expected if migration not applied
  console.log("Column not yet available:", tplErr.message);
  console.log("\n📋  SQL to run in Supabase Dashboard → SQL Editor:");
  console.log(`
ALTER TABLE public.commercial_pricing_templates
  ADD COLUMN IF NOT EXISTS commercial_model text
    CHECK (commercial_model IS NULL OR commercial_model IN ('one_time_programme','monthly_subscription','annual_subscription','enterprise_contract')),
  ADD COLUMN IF NOT EXISTS billing_behaviour text
    CHECK (billing_behaviour IS NULL OR billing_behaviour IN ('single_payment','monthly','annual','contract')),
  ADD COLUMN IF NOT EXISTS renewal_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allowed_payment_methods jsonb;

UPDATE public.commercial_pricing_templates
SET commercial_model='one_time_programme', billing_behaviour='single_payment',
    renewal_required=false,
    allowed_payment_methods='["card","bank_transfer"]'::jsonb
WHERE id='6f6a0db0-0f4d-4f95-b66c-79f70ce48b60' AND status='active';
`);
} else {
  console.log("\nTemplate state:");
  console.log(JSON.stringify(tpl, null, 2));

  if (tpl && !tpl.commercial_model) {
    console.log("\n⚠️  Template has no commercial_model — backfill needed.");
    // Attempt backfill
    const { error: backfillErr } = await sb
      .from("commercial_pricing_templates")
      .update({
        commercial_model: "one_time_programme",
        billing_behaviour: "single_payment",
        renewal_required: false,
        allowed_payment_methods: ["card", "bank_transfer"],
      })
      .eq("id", "6f6a0db0-0f4d-4f95-b66c-79f70ce48b60");
    if (backfillErr) {
      console.log("❌  Backfill failed:", backfillErr.message);
    } else {
      console.log("✅  Backfill applied.");
    }
  } else if (tpl?.commercial_model) {
    console.log(`\n✅  Template already has commercial_model = '${tpl.commercial_model}'`);
  }
}

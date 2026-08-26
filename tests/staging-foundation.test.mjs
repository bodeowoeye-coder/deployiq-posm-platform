import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { assertSafeSupabaseTarget } from "../scripts/lib/assert-safe-supabase-target.mjs";

const baseline = readFileSync(new URL("../supabase/baselines/20260816020000_pre_core2a.sql", import.meta.url), "utf8");
const reference = readFileSync(new URL("../supabase/seeds/canonical_reference_data.sql", import.meta.url), "utf8");
const fixtures = readFileSync(new URL("../supabase/seeds/staging_synthetic_fixtures.sql", import.meta.url), "utf8");
const bootstrap = readFileSync(new URL("../scripts/bootstrap-staging-database.mjs", import.meta.url), "utf8");

test("baseline includes required pre-CORE-2A objects and RPC security", () => {
  for (const value of ["public.provisioning_jobs","public.workspace_settings","public.workspace_campaigns","public.workspace_support_sessions","claim_acquisition_provisioning_job","commit_workspace_directory_import","installation-images","grant execute","service_role"])
    assert.match(baseline.toLowerCase(), new RegExp(value.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("baseline retains the hardened acquisition backfill and executable lease RPC", () => {
  assert.match(baseline, /with unambiguous_acquisition_clients[\s\S]*?update public\.clients client[\s\S]*?set acquisition_draft_id = link\.acquisition_draft_id/i);
  assert.match(baseline, /function public\.claim_acquisition_provisioning_job[\s\S]*?as \$\$[\s\S]*?update public\.provisioning_jobs[\s\S]*?returning true;[\s\S]*?\$\$;/i);
  assert.doesNotMatch(baseline, /as \$\$\s*\$\$;/i);
});

test("baseline excludes Build, CORE-2A, and historical fixtures", () => {
  for (const forbidden of ["public.build_sites","public.build_activity_templates","commercial_payment_records","commercial_approvals","Godrej Nigeria","Monetium Nigeria","Salon Dealer Board","MegaGrowth"])
    assert.doesNotMatch(baseline, new RegExp(forbidden, "i"));
});

test("reference seed is idempotent and contains no customer PII", () => {
  assert.match(reference, /on conflict/gi);
  assert.doesNotMatch(reference, /insert into public\.(clients|projects|submissions|onboarding_drafts|provisioning_jobs)/i);
  assert.doesNotMatch(reference, /Godrej|Monetium|Trade Depot/i);
});

test("fixtures are visibly synthetic and pre-CORE-2A", () => {
  assert.match(fixtures, /@retail\.example/);
  assert.match(fixtures, /STAGING-SIMULATED/);
  assert.doesNotMatch(fixtures, /commercial_payment_records|commercial_approvals/i);
});

function guarded(env) { return () => assertSafeSupabaseTarget({ env, operationClass: "test", log() {} }); }
const stagingUrl = "https://stagingref123.supabase.co";
test("guard rejects production", () => assert.throws(guarded({ DEPLOYIQ_ENVIRONMENT:"staging",DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS:"vmurvcpmqwnxgruhqevf",NEXT_PUBLIC_SUPABASE_URL:"https://vmurvcpmqwnxgruhqevf.supabase.co" }), /production_project_rejected/));
test("guard rejects missing environment", () => assert.throws(guarded({ DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS:"stagingref123",NEXT_PUBLIC_SUPABASE_URL:stagingUrl }), /environment_missing/));
test("guard rejects missing allowlist", () => assert.throws(guarded({ DEPLOYIQ_ENVIRONMENT:"staging",NEXT_PUBLIC_SUPABASE_URL:stagingUrl }), /allowlist_missing/));
test("guard rejects unlisted staging", () => assert.throws(guarded({ DEPLOYIQ_ENVIRONMENT:"staging",DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS:"other",NEXT_PUBLIC_SUPABASE_URL:stagingUrl }), /not_allowlisted/));
test("guard accepts allowlisted staging", () => assert.equal(guarded({ DEPLOYIQ_ENVIRONMENT:"staging",DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS:"stagingref123",NEXT_PUBLIC_SUPABASE_URL:stagingUrl })().projectRef,"stagingref123"));
test("guard rejects malformed URL", () => assert.throws(guarded({ DEPLOYIQ_ENVIRONMENT:"staging",DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS:"stagingref123",NEXT_PUBLIC_SUPABASE_URL:"not-a-url" }), /url_malformed/));
test("guard rejects a production database URL even when the public target is staging", () => assert.throws(() => assertSafeSupabaseTarget({
  env: { DEPLOYIQ_ENVIRONMENT:"staging", DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS:"stagingref123", NEXT_PUBLIC_SUPABASE_URL:stagingUrl },
  operationClass: "test", databaseUrl: "postgresql://postgres.vmurvcpmqwnxgruhqevf:secret@aws-0.example.pooler.supabase.com:6543/postgres", log() {},
}), /production_database_project_rejected/));
test("guard rejects mismatched public and database projects", () => assert.throws(() => assertSafeSupabaseTarget({
  env: { DEPLOYIQ_ENVIRONMENT:"staging", DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS:"stagingref123", NEXT_PUBLIC_SUPABASE_URL:stagingUrl },
  operationClass: "test", databaseUrl: "postgresql://postgres.otherref456:secret@aws-0.example.pooler.supabase.com:6543/postgres", log() {},
}), /supabase_target_mismatch/));
test("guard permits loopback databases only in local or test", () => {
  const env = { DEPLOYIQ_ENVIRONMENT:"local", DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS:"local", NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:54321" };
  assert.equal(assertSafeSupabaseTarget({ env, operationClass:"test", databaseUrl:"postgresql://postgres:postgres@127.0.0.1:54322/postgres", log() {} }).projectRef, "local");
  assert.throws(() => assertSafeSupabaseTarget({ env: { ...env, DEPLOYIQ_ENVIRONMENT:"staging" }, operationClass:"test", databaseUrl:"postgresql://postgres:postgres@127.0.0.1:54322/postgres", log() {} }), /local_database_environment_mismatch/);
});
test("bootstrap invokes the production-denying shared guard", () => assert.match(bootstrap, /assertSafeSupabaseTarget/));
test("bootstrap refuses the production project before database tooling", () => {
  const result = spawnSync(process.execPath, ["scripts/bootstrap-staging-database.mjs"], {
    encoding: "utf8",
    env: {
      ...process.env,
      DEPLOYIQ_ENVIRONMENT: "staging",
      DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS: "vmurvcpmqwnxgruhqevf",
      NEXT_PUBLIC_SUPABASE_URL: "https://vmurvcpmqwnxgruhqevf.supabase.co",
      SUPABASE_DB_URL: "postgresql://unused.invalid/db",
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /production_project_rejected/);
});

test("baseline fingerprint input is stable and self-contained", () => {
  const normalizedOnce = baseline.replace(/\r\n/g, "\n");
  const normalizedTwice = normalizedOnce.replace(/\r\n/g, "\n");
  assert.equal(normalizedTwice, normalizedOnce);
  assert.doesNotMatch(baseline, /^\s*\\ir\b|supabase\/migrations\//im);
});

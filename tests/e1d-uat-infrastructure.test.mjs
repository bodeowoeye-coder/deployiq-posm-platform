import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  assertE1DUatApplicationEnvironment,
  assertSafeSupabaseTarget,
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF,
} from "../scripts/lib/assert-safe-supabase-target.mjs";

const UAT_REF = "uatref12345678901234";
const UAT_APP_URL = "https://deployiq-build-uat.vercel.app";
const UAT_DB_URL = `postgresql://postgres.${UAT_REF}:secret@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`;

const environmentTemplate = readFileSync(new URL("../.env.uat.example", import.meta.url), "utf8");
const seedScript = readFileSync(new URL("../scripts/seed-e1d-uat-fixtures.mjs", import.meta.url), "utf8");
const verifyScript = readFileSync(new URL("../scripts/verify-e1d-uat.mjs", import.meta.url), "utf8");
const fixtureLibrary = readFileSync(new URL("../scripts/lib/e1c-build-uat.mjs", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function uatEnvironment(overrides = {}) {
  return {
    DEPLOYIQ_ENVIRONMENT: "uat",
    DEPLOYIQ_UAT_PROJECT_REF: UAT_REF,
    SUPABASE_PROJECT_REF: UAT_REF,
    DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS: UAT_REF,
    NEXT_PUBLIC_SUPABASE_URL: `https://${UAT_REF}.supabase.co`,
    SUPABASE_DB_URL: UAT_DB_URL,
    NEXT_PUBLIC_APP_URL: UAT_APP_URL,
    DEPLOYIQ_APP_URL: UAT_APP_URL,
    ...overrides,
  };
}

function assertTarget(env, options = {}) {
  return assertSafeSupabaseTarget({
    env,
    databaseUrl: env.SUPABASE_DB_URL,
    operationClass: "E1D test operation",
    log() {},
    ...options,
  });
}

test("E1D accepts only an explicitly declared isolated UAT project", () => {
  assert.deepEqual(assertE1DUatApplicationEnvironment(uatEnvironment()), { appUrl: UAT_APP_URL });
  assert.deepEqual(assertTarget(uatEnvironment()), { environment: "uat", projectRef: UAT_REF });
});

test("E1D unconditionally rejects production and canonical staging projects", () => {
  assert.throws(() => assertTarget(uatEnvironment({
    DEPLOYIQ_UAT_PROJECT_REF: PRODUCTION_PROJECT_REF,
    SUPABASE_PROJECT_REF: PRODUCTION_PROJECT_REF,
    DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS: PRODUCTION_PROJECT_REF,
    NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
    SUPABASE_DB_URL: `postgresql://postgres.${PRODUCTION_PROJECT_REF}:secret@pooler.supabase.com:5432/postgres`,
  })), /production_project_rejected/);
  assert.throws(() => assertTarget(uatEnvironment({
    DEPLOYIQ_UAT_PROJECT_REF: STAGING_PROJECT_REF,
    SUPABASE_PROJECT_REF: STAGING_PROJECT_REF,
    DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS: STAGING_PROJECT_REF,
    NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
    SUPABASE_DB_URL: `postgresql://postgres.${STAGING_PROJECT_REF}:secret@pooler.supabase.com:5432/postgres`,
  })), /canonical_staging_project_rejected_for_uat/);
});

test("E1D fails closed for project declarations, allowlists, and database mismatch", () => {
  assert.throws(() => assertTarget(uatEnvironment({ DEPLOYIQ_UAT_PROJECT_REF: "" })), /e1d_uat_project_ref_missing/);
  assert.throws(() => assertTarget(uatEnvironment({ SUPABASE_PROJECT_REF: "anotherref1234567890" })), /e1d_uat_project_ref_mismatch/);
  assert.throws(() => assertTarget(uatEnvironment({ DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS: `${UAT_REF},anotherref1234567890` })), /e1d_uat_allowlist_must_be_exact/);
  assert.throws(() => assertTarget(uatEnvironment({ SUPABASE_DB_URL: "postgresql://postgres.anotherref1234567890:secret@pooler.supabase.com:5432/postgres" })), /supabase_target_mismatch/);
});

test("E1D application identity requires one generated HTTPS Vercel origin", () => {
  assert.throws(() => assertE1DUatApplicationEnvironment(uatEnvironment({ NEXT_PUBLIC_APP_URL: "http://deployiq-build-uat.vercel.app", DEPLOYIQ_APP_URL: "http://deployiq-build-uat.vercel.app" })), /e1d_uat_https_origin_required/);
  assert.throws(() => assertE1DUatApplicationEnvironment(uatEnvironment({ NEXT_PUBLIC_APP_URL: "https://uat.deployiq.ng", DEPLOYIQ_APP_URL: "https://uat.deployiq.ng" })), /e1d_uat_generated_vercel_hostname_required/);
  assert.throws(() => assertE1DUatApplicationEnvironment(uatEnvironment({ NEXT_PUBLIC_APP_URL: `${UAT_APP_URL}/onboarding`, DEPLOYIQ_APP_URL: `${UAT_APP_URL}/onboarding` })), /e1d_uat_https_origin_required/);
  assert.throws(() => assertE1DUatApplicationEnvironment(uatEnvironment({ DEPLOYIQ_APP_URL: "https://other-uat.vercel.app" })), /e1d_uat_app_url_mismatch/);
});

test("destructive UAT operations retain the generic explicit confirmation", () => {
  assert.throws(() => assertTarget(uatEnvironment(), { destructive: true }), /destructive_confirmation_missing/);
  assert.doesNotThrow(() => assertTarget(uatEnvironment({ DEPLOYIQ_CONFIRM_DESTRUCTIVE_OPERATION: "YES" }), { destructive: true }));
});

test("the UAT template contains placeholders only and confirmations default off", () => {
  for (const variable of [
    "DEPLOYIQ_ENVIRONMENT", "DEPLOYIQ_UAT_PROJECT_REF", "SUPABASE_PROJECT_REF",
    "DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS", "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL",
    "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SITE_URL", "DEPLOYIQ_APP_URL", "E1D_UAT_PASSWORD",
    "SUPABASE_STORAGE_BUCKET", "ONBOARDING_PASSWORD_ENCRYPTION_KEY",
    "DEPLOYIQ_TRANSACTIONAL_EMAIL_PROVIDER", "DEPLOYIQ_TRANSACTIONAL_EMAIL_TOKEN",
  ]) assert.match(environmentTemplate, new RegExp(`^${variable}=`, "m"));
  assert.match(environmentTemplate, /^DEPLOYIQ_CONFIRM_REMOTE_UAT_MUTATION=NO$/m);
  assert.match(environmentTemplate, /^DEPLOYIQ_CONFIRM_DESTRUCTIVE_OPERATION=NO$/m);
  assert.doesNotMatch(environmentTemplate, new RegExp(PRODUCTION_PROJECT_REF, "i"));
  assert.doesNotMatch(environmentTemplate, new RegExp(STAGING_PROJECT_REF, "i"));
  assert.match(environmentTemplate, /<UAT_[A-Z0-9_]+>/);
});

test("fixture seeding is schema-gated, doubly confirmed, and remains synthetic", () => {
  assert.match(seedScript, /DEPLOYIQ_CONFIRM_REMOTE_UAT_MUTATION/);
  assert.match(seedScript, /destructive:\s*true/);
  assert.ok(seedScript.indexOf("\nassertCurrentSchema") < seedScript.indexOf("\nconst manifest = await seedE1CBuildFixture"));
  assert.match(fixtureLibrary, /@e1c\.deployiq\.test/);
  assert.match(fixtureLibrary, /Meridian Civil Works Ltd/);
  assert.match(fixtureLibrary, /Lagos Eastern Drainage & Bridge Rehabilitation/);
  assert.doesNotMatch(fixtureLibrary, /@deployiq\.ng/);
});

test("fixture command stops before database access without remote-UAT confirmation", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/seed-e1d-uat-fixtures.mjs", import.meta.url))], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...uatEnvironment(),
      DEPLOYIQ_CONFIRM_REMOTE_UAT_MUTATION: "NO",
      DEPLOYIQ_CONFIRM_DESTRUCTIVE_OPERATION: "YES",
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /e1d_remote_uat_confirmation_missing/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /secret/);
});

test("UAT verification is read-only and checks evidence integrity", () => {
  assert.match(verifyScript, /assertCurrentSchema/);
  assert.match(verifyScript, /duplicate_evidence_operations/);
  assert.match(verifyScript, /invalid_evidence_ancestry/);
  assert.doesNotMatch(verifyScript, /\.(?:insert|upsert|update|delete)\s*\(/);
  assert.doesNotMatch(verifyScript, /\b(?:insert|update|delete|truncate|alter|drop|create)\s+(?:table|into|from)/i);
});

test("package commands use only the ignored UAT environment file", () => {
  assert.equal(packageJson.scripts["e1d:uat:seed"], "node --env-file=.env.uat.local scripts/seed-e1d-uat-fixtures.mjs");
  assert.equal(packageJson.scripts["e1d:uat:verify"], "node --env-file=.env.uat.local scripts/verify-e1d-uat.mjs");
  assert.equal(packageJson.scripts["e1d:uat:test"], "node --test tests/e1d-uat-infrastructure.test.mjs");
});

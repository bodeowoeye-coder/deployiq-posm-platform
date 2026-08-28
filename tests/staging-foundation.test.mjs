import test from "node:test";
import assert from "node:assert/strict";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assertSafeSupabaseTarget } from "../scripts/lib/assert-safe-supabase-target.mjs";
import {
  buildIsolatedChildEnvironment,
  createIsolatedProjectView,
  loadAndValidateStagingEnvironment,
  STAGING_APP_URL,
} from "../scripts/run-staging-dev.mjs";

const baseline = readFileSync(new URL("../supabase/baselines/20260816020000_pre_core2a.sql", import.meta.url), "utf8");
const reference = readFileSync(new URL("../supabase/seeds/canonical_reference_data.sql", import.meta.url), "utf8");
const fixtures = readFileSync(new URL("../supabase/seeds/staging_synthetic_fixtures.sql", import.meta.url), "utf8");
const bootstrap = readFileSync(new URL("../scripts/bootstrap-staging-database.mjs", import.meta.url), "utf8");
const packageJson = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const gitignore = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
const stagingEnvironmentExample = readFileSync(new URL("../.env.staging.example", import.meta.url), "utf8");
const stagingWorkflow = readFileSync(new URL("../docs/staging-database-workflow.md", import.meta.url), "utf8");
const stagingLauncher = readFileSync(new URL("../scripts/run-staging-dev.mjs", import.meta.url), "utf8");
const acceptedPreCore2aFingerprint = "b35de7769e399d8f463614f4031d95dd75feb3f00d7a56eb1e988bce5ab141e6";

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

test("staging commands use an isolated ignored environment file with placeholders only", () => {
  assert.match(packageJson, /"dev:staging"\s*:\s*"node scripts\/run-staging-dev\.mjs"/);
  assert.match(packageJson, /--env-file=\.env\.staging\.local/);
  assert.doesNotMatch(packageJson, /"staging:[^"]+"\s*:\s*"[^"]*--env-file=\.env\.local/);
  assert.match(gitignore, /^\.env\.staging\.local$/m);
  for (const variable of ["DEPLOYIQ_ENVIRONMENT", "SUPABASE_PROJECT_REF", "DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL", "NEXT_PUBLIC_APP_URL"])
    assert.match(stagingEnvironmentExample, new RegExp(`^${variable}=`, "m"));
  assert.match(stagingEnvironmentExample, /<STAGING_PUBLISHABLE_KEY>/);
  assert.match(stagingEnvironmentExample, /<STAGING_SECRET_KEY>/);
  assert.match(stagingEnvironmentExample, /<STAGING_POSTGRESQL_CONNECTION_STRING>/);
  assert.match(stagingEnvironmentExample, /^OPENAI_API_KEY=<STAGING_OPENAI_API_KEY>$/m);
  assert.match(stagingEnvironmentExample, /^DEPLOYIQ_PROVISIONING_AGENT_ENABLED=1$/m);
  assert.match(stagingEnvironmentExample, /^DEPLOYIQ_PROVISIONING_AGENT_MODE=shadow$/m);
  assert.match(stagingEnvironmentExample, /^DEPLOYIQ_PROVISIONING_AGENT_PRODUCTS=retail$/m);
  assert.match(stagingEnvironmentExample, /^DEPLOYIQ_PROVISIONING_AGENT_PROVIDER=openai$/m);
  assert.match(stagingEnvironmentExample, /^DEPLOYIQ_PROVISIONING_AGENT_EXECUTION_ENABLED=0$/m);
});

function stagingFixture(overrides = {}) {
  return {
    DEPLOYIQ_ENVIRONMENT: "staging",
    SUPABASE_PROJECT_REF: "pmdgpgfbtolrgmuusszy",
    DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS: "pmdgpgfbtolrgmuusszy",
    NEXT_PUBLIC_SUPABASE_URL: "https://pmdgpgfbtolrgmuusszy.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-publishable-placeholder",
    SUPABASE_SERVICE_ROLE_KEY: "test-secret-placeholder",
    SUPABASE_DB_URL: "postgresql://postgres.pmdgpgfbtolrgmuusszy:test@aws-1-eu-west-1.pooler.supabase.com:5432/postgres",
    NEXT_PUBLIC_APP_URL: STAGING_APP_URL,
    ...overrides,
  };
}

function withStagingEnvironmentFile(values, callback) {
  const directory = mkdtempSync(path.join(tmpdir(), "deployiq-staging-env-test-"));
  writeFileSync(path.join(directory, ".env.staging.local"), Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n"));
  try { return callback(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("dev:staging loads only the explicit staging environment", () => {
  withStagingEnvironmentFile(stagingFixture(), (projectRoot) => {
    const loaded = loadAndValidateStagingEnvironment({ projectRoot });
    const child = buildIsolatedChildEnvironment(loaded, { PATH: process.env.PATH, PRODUCTION_ONLY_SENTINEL: "must-not-leak" });
    assert.equal(child.NEXT_PUBLIC_APP_URL, "http://localhost:3000");
    assert.equal(child.PRODUCTION_ONLY_SENTINEL, undefined);
    assert.equal(child.SUPABASE_PROJECT_REF, "pmdgpgfbtolrgmuusszy");
  });
  assert.match(stagingLauncher, /entry\.name\.startsWith\("\.env"\)/);
});

test("dev:staging fails closed instead of falling back from the canonical port", () => {
  assert.match(stagingLauncher, /spawn\(process\.execPath, \[nextCli, "dev", "--port", STAGING_DEV_PORT\]/);
  assert.match(stagingLauncher, /export const STAGING_DEV_PORT = "3000"/);
  assert.doesNotMatch(stagingLauncher, /\[nextCli, "dev"\],/);
});

test("dev:staging exposes App Router directories without a top-level app symlink", async () => {
  const sourceRoot = mkdtempSync(path.join(tmpdir(), "deployiq-staging-source-test-"));
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "deployiq-staging-view-test-"));
  writeFileSync(path.join(sourceRoot, "package.json"), "{}");
  writeFileSync(path.join(sourceRoot, ".env.local"), "PRODUCTION_ONLY_SENTINEL=must-not-leak\n");
  writeFileSync(path.join(sourceRoot, ".env.staging.local"), "STAGING_ONLY_SENTINEL=present\n");
  writeFileSync(path.join(sourceRoot, "README.md"), "test");
  const routeDirectories = ["app/onboarding", "app/portal", "app/login", "app/workspace/admin", "app/api/onboarding/latest"];
  for (const directory of routeDirectories) {
    const absolute = path.join(sourceRoot, directory);
    mkdirSync(absolute, { recursive: true });
    writeFileSync(path.join(absolute, directory.includes("api/") ? "route.ts" : "page.tsx"), "export default function Test() { return null; }");
  }
  let isolatedRoot;
  try {
    isolatedRoot = await createIsolatedProjectView(sourceRoot, temporaryRoot);
    assert.equal(lstatSync(path.join(isolatedRoot, "app")).isDirectory(), true);
    assert.equal(lstatSync(path.join(isolatedRoot, "app")).isSymbolicLink(), false);
    assert.equal(lstatSync(path.join(isolatedRoot, "app/onboarding")).isDirectory(), true);
    assert.equal(lstatSync(path.join(isolatedRoot, "app/onboarding/page.tsx")).isSymbolicLink(), true);
    for (const route of ["app/onboarding/page.tsx", "app/portal/page.tsx", "app/login/page.tsx", "app/workspace/admin/page.tsx", "app/api/onboarding/latest/route.ts"])
      assert.doesNotThrow(() => readFileSync(path.join(isolatedRoot, route)));
    assert.throws(() => lstatSync(path.join(isolatedRoot, ".env.local")));
    assert.throws(() => lstatSync(path.join(isolatedRoot, ".env.staging.local")));
  } finally {
    if (isolatedRoot) rmSync(isolatedRoot, { recursive: true, force: true });
    rmSync(sourceRoot, { recursive: true, force: true });
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("dev:staging fails closed for missing file or required value", () => {
  const emptyRoot = mkdtempSync(path.join(tmpdir(), "deployiq-staging-env-missing-"));
  try { assert.throws(() => loadAndValidateStagingEnvironment({ projectRoot: emptyRoot }), /staging_environment_file_missing/); }
  finally { rmSync(emptyRoot, { recursive: true, force: true }); }
  withStagingEnvironmentFile(stagingFixture({ SUPABASE_SERVICE_ROLE_KEY: "" }), (projectRoot) => {
    assert.throws(() => loadAndValidateStagingEnvironment({ projectRoot }), /staging_environment_variable_missing:SUPABASE_SERVICE_ROLE_KEY/);
  });
});

test("dev:staging validates enabled AI Shadow Mode without reading host secrets", () => {
  const enabledShadow = {
    DEPLOYIQ_PROVISIONING_AGENT_ENABLED: "1",
    DEPLOYIQ_PROVISIONING_AGENT_MODE: "shadow",
    DEPLOYIQ_PROVISIONING_AGENT_PRODUCTS: "retail",
    DEPLOYIQ_PROVISIONING_AGENT_PROVIDER: "openai",
    DEPLOYIQ_PROVISIONING_AGENT_MODEL: "gpt-5.4-mini",
    DEPLOYIQ_PROVISIONING_AGENT_EXECUTION_ENABLED: "0",
    OPENAI_API_KEY: "test-staging-openai-placeholder",
  };
  withStagingEnvironmentFile(stagingFixture(enabledShadow), (projectRoot) => {
    const loaded = loadAndValidateStagingEnvironment({ projectRoot });
    const child = buildIsolatedChildEnvironment(loaded, {
      PATH: process.env.PATH,
      OPENAI_API_KEY: "must-not-leak-from-env-local-or-host",
    });
    assert.equal(child.OPENAI_API_KEY, enabledShadow.OPENAI_API_KEY);
    assert.equal(child.DEPLOYIQ_PROVISIONING_AGENT_MODE, "shadow");
  });
});

test("dev:staging fails closed for incomplete or authority-bearing Shadow configuration", () => {
  const enabledShadow = {
    DEPLOYIQ_PROVISIONING_AGENT_ENABLED: "1",
    DEPLOYIQ_PROVISIONING_AGENT_MODE: "shadow",
    DEPLOYIQ_PROVISIONING_AGENT_PRODUCTS: "retail",
    DEPLOYIQ_PROVISIONING_AGENT_PROVIDER: "openai",
    DEPLOYIQ_PROVISIONING_AGENT_MODEL: "gpt-5.4-mini",
    DEPLOYIQ_PROVISIONING_AGENT_EXECUTION_ENABLED: "0",
    OPENAI_API_KEY: "test-staging-openai-placeholder",
  };
  withStagingEnvironmentFile(stagingFixture({ ...enabledShadow, OPENAI_API_KEY: "" }), (projectRoot) => {
    assert.throws(() => loadAndValidateStagingEnvironment({ projectRoot }), /staging_shadow_variable_missing:OPENAI_API_KEY/);
  });
  withStagingEnvironmentFile(stagingFixture({ ...enabledShadow, DEPLOYIQ_PROVISIONING_AGENT_PRODUCTS: "build" }), (projectRoot) => {
    assert.throws(() => loadAndValidateStagingEnvironment({ projectRoot }), /staging_shadow_retail_required/);
  });
  withStagingEnvironmentFile(stagingFixture({ ...enabledShadow, DEPLOYIQ_PROVISIONING_AGENT_EXECUTION_ENABLED: "1" }), (projectRoot) => {
    assert.throws(() => loadAndValidateStagingEnvironment({ projectRoot }), /staging_ai_execution_forbidden/);
  });
});

test("dev:staging rejects production and logs no secret values", () => {
  withStagingEnvironmentFile(stagingFixture({
    SUPABASE_PROJECT_REF: "vmurvcpmqwnxgruhqevf",
    DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS: "vmurvcpmqwnxgruhqevf",
    NEXT_PUBLIC_SUPABASE_URL: "https://vmurvcpmqwnxgruhqevf.supabase.co",
  }), (projectRoot) => {
    assert.throws(() => loadAndValidateStagingEnvironment({ projectRoot }), /canonical_staging_project_required/);
  });
  assert.doesNotMatch(stagingLauncher, /console\.(?:log|info|error)\([^\n]*(?:ANON_KEY|SERVICE_ROLE_KEY|DB_URL)/);
});

test("normal dev remains the unchanged Next development command", () => {
  assert.equal(JSON.parse(packageJson).scripts.dev, "next dev");
});

function guarded(env) { return () => assertSafeSupabaseTarget({ env, operationClass: "test", log() {} }); }
const stagingRef = "pmdgpgfbtolrgmuusszy";
const stagingUrl = `https://${stagingRef}.supabase.co`;
const stagingEnv = { DEPLOYIQ_ENVIRONMENT:"staging", SUPABASE_PROJECT_REF:stagingRef, DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS:stagingRef, NEXT_PUBLIC_SUPABASE_URL:stagingUrl };
test("guard rejects production", () => assert.throws(guarded({ DEPLOYIQ_ENVIRONMENT:"staging",DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS:"vmurvcpmqwnxgruhqevf",NEXT_PUBLIC_SUPABASE_URL:"https://vmurvcpmqwnxgruhqevf.supabase.co" }), /production_project_rejected/));
test("guard rejects production environment with any mutation target", () => assert.throws(guarded({ ...stagingEnv, DEPLOYIQ_ENVIRONMENT:"production" }), /environment_not_mutable/));
test("guard rejects missing environment", () => assert.throws(guarded({ SUPABASE_PROJECT_REF:stagingRef,DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS:stagingRef,NEXT_PUBLIC_SUPABASE_URL:stagingUrl }), /environment_missing/));
test("guard rejects missing allowlist", () => assert.throws(guarded({ DEPLOYIQ_ENVIRONMENT:"staging",SUPABASE_PROJECT_REF:stagingRef,NEXT_PUBLIC_SUPABASE_URL:stagingUrl }), /allowlist_missing/));
test("guard rejects unlisted canonical staging", () => assert.throws(guarded({ ...stagingEnv,DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS:"other" }), /not_allowlisted/));
test("guard accepts canonical allowlisted staging", () => assert.equal(guarded(stagingEnv)().projectRef,stagingRef));
test("guard rejects an unknown project even if runtime-allowlisted", () => assert.throws(guarded({ ...stagingEnv,SUPABASE_PROJECT_REF:"unknownref123",DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS:"unknownref123",NEXT_PUBLIC_SUPABASE_URL:"https://unknownref123.supabase.co" }), /canonical_staging_project_required/));
test("guard rejects a missing or mismatched declared staging ref", () => {
  assert.throws(guarded({ ...stagingEnv, SUPABASE_PROJECT_REF:"" }), /project_ref_missing/);
  assert.throws(guarded({ ...stagingEnv, SUPABASE_PROJECT_REF:"otherref456" }), /project_ref_mismatch/);
});
test("guard rejects malformed URL", () => assert.throws(guarded({ ...stagingEnv,NEXT_PUBLIC_SUPABASE_URL:"not-a-url" }), /url_malformed/));
test("guard rejects a production database URL even when the public target is staging", () => assert.throws(() => assertSafeSupabaseTarget({
  env: stagingEnv,
  operationClass: "test", databaseUrl: "postgresql://postgres.vmurvcpmqwnxgruhqevf:secret@aws-0.example.pooler.supabase.com:6543/postgres", log() {},
}), /production_database_project_rejected/));
test("guard rejects mismatched public and database projects", () => assert.throws(() => assertSafeSupabaseTarget({
  env: stagingEnv,
  operationClass: "test", databaseUrl: "postgresql://postgres.otherref456:secret@aws-0.example.pooler.supabase.com:6543/postgres", log() {},
}), /supabase_target_mismatch/));
test("guard permits loopback databases only in local or test", () => {
  const env = { DEPLOYIQ_ENVIRONMENT:"local", DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS:"local", NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:54321" };
  assert.equal(assertSafeSupabaseTarget({ env, operationClass:"test", databaseUrl:"postgresql://postgres:postgres@127.0.0.1:54322/postgres", log() {} }).projectRef, "local");
  assert.throws(() => assertSafeSupabaseTarget({ env: stagingEnv, operationClass:"test", databaseUrl:"postgresql://postgres:postgres@127.0.0.1:54322/postgres", log() {} }), /local_database_environment_mismatch/);
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

test("workflow records the reproducible accepted pre-CORE-2A fingerprint", () => {
  assert.match(stagingWorkflow, new RegExp(acceptedPreCore2aFingerprint));
  assert.match(stagingWorkflow, /two fresh disposable local databases/i);
  assert.match(stagingWorkflow, /remote staging database/i);
  assert.match(stagingWorkflow, /runtime\/image drift/i);
});

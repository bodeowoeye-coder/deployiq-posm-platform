import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { seedE1CBuildFixture } from "./lib/e1c-build-uat.mjs";
import { applySqlFile, appliedMigrationVersions, assertCurrentSchema, assertRecoveryFiles, assertTenantIsolationEnforced, fingerprintInventory, migrationFiles, normalizedInventory, representedMigrationVersions, run } from "./lib/local-baseline-recovery.mjs";

const root = resolve(import.meta.dirname, "..");
const workspace = mkdtempSync(resolve(tmpdir(), "deployiq-e1c-uat-"));
const projectId = `deployiq-e1c-uat-${process.pid}`;
const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const supabaseDirectory = resolve(workspace, "supabase");
let started = false;
let application;

async function waitForApplication(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error("e1c_application_start_timeout");
}

try {
  if (process.env.DEPLOYIQ_CONFIRM_DESTRUCTIVE_OPERATION !== "YES") throw new Error("destructive_confirmation_missing");
  if (existsSync(resolve(root, "supabase/.temp/project-ref"))) throw new Error("repository_remote_link_present");
  assertRecoveryFiles(root);
  mkdirSync(resolve(supabaseDirectory, "migrations"), { recursive: true });
  const config = readFileSync(resolve(root, "supabase/config.toml"), "utf8").replace(/^project_id\s*=.*$/m, `project_id = "${projectId}"`);
  writeFileSync(resolve(supabaseDirectory, "config.toml"), config);
  const baseEnv = { ...process.env, DEPLOYIQ_ENVIRONMENT: "local", DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS: "local", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_DB_URL: databaseUrl };
  run("docker", ["info", "--format", "{{.ServerVersion}}"], { capture: true });
  run("supabase", ["start", "--workdir", workspace, "--yes"], { env: baseEnv, capture: true });
  started = true;
  applySqlFile(databaseUrl, resolve(root, "supabase/baselines/20260816020000_pre_core2a.sql"));
  applySqlFile(databaseUrl, resolve(root, "supabase/seeds/canonical_reference_data.sql"));
  rmSync(resolve(supabaseDirectory, "migrations"), { recursive: true, force: true });
  symlinkSync(resolve(root, "supabase/migrations"), resolve(supabaseDirectory, "migrations"), "dir");
  run("supabase", ["migration", "repair", "--local", "--status", "applied", ...representedMigrationVersions(root), "--workdir", workspace], { env: baseEnv, capture: true });
  run("supabase", ["migration", "up", "--local", "--include-all", "--workdir", workspace], { env: baseEnv, capture: true });
  if (appliedMigrationVersions(databaseUrl).length !== migrationFiles(root).length) throw new Error("e1c_migration_ledger_mismatch");
  const inventory = normalizedInventory(databaseUrl);
  assertCurrentSchema(inventory);
  assertTenantIsolationEnforced(databaseUrl);

  const status = JSON.parse(run("supabase", ["status", "--workdir", workspace, "-o", "json"], { env: baseEnv, capture: true }));
  const fixtureEnv = { ...baseEnv, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY, E1C_UAT_PASSWORD: randomBytes(24).toString("base64url") };
  const manifestPath = resolve(workspace, "e1c-manifest.json");
  const first = await seedE1CBuildFixture({ env: fixtureEnv, outputPath: manifestPath });
  const second = await seedE1CBuildFixture({ env: fixtureEnv, outputPath: manifestPath });
  if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error("e1c_fixture_not_repeatable");
  console.log(`E1C fixture rehearsal passed: ${first.fixture.projectCode}`);
  console.log(`Personas: ${Object.keys(first.identities).length}; Work Packages: ${first.workPackages.length}; Activity templates: ${first.activityTemplates.length}`);
  console.log(`Schema fingerprint: ${fingerprintInventory(inventory)}`);
  console.log("No credential values were written to the manifest or logs.");
  if (process.argv.includes("--browser")) {
    const browserEnv = { ...fixtureEnv, NEXT_PUBLIC_APP_URL: "http://localhost:3000", DEPLOYIQ_APP_URL: "http://localhost:3000", DEPLOYIQ_ALWAYS_SHOW_LOGIN_CAROUSEL: "0", DEPLOYIQ_BUILD_AI_ENABLED: "0", E1C_UAT_MANIFEST: manifestPath, E1C_UAT_BASE_URL: "http://localhost:3000" };
    application = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1"], { cwd: root, env: browserEnv, stdio: ["ignore", "ignore", "pipe"] });
    let applicationError = "";
    application.stderr.on("data", (chunk) => { applicationError = `${applicationError}${chunk}`.slice(-2000); });
    await waitForApplication("http://localhost:3000/login");
    try { run("npx", ["playwright", "test", "tests/e1c-integrated-build-uat.spec.ts", "--workers=1", "--reporter=line"], { cwd: root, env: browserEnv }); }
    catch (error) {
      const safeDiagnostic = applicationError
        .replace(/eyJ[A-Za-z0-9._-]+/g, "[redacted-token]")
        .trim().split("\n").slice(-20).join(" | ");
      throw new Error(`${error instanceof Error ? error.message : "e1c_browser_failed"}:${safeDiagnostic}`);
    }
    console.log("E1C authenticated browser workflow passed.");
  }
} finally {
  if (application) {
    application.kill("SIGTERM");
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    if (!application.killed) application.kill("SIGKILL");
  }
  if (started) {
    try { run("supabase", ["stop", "--project-id", projectId, "--no-backup", "--yes"], { capture: true }); }
    catch (error) { console.error(`E1C cleanup warning: ${error instanceof Error ? error.message : "unknown"}`); }
  }
  rmSync(workspace, { recursive: true, force: true });
}

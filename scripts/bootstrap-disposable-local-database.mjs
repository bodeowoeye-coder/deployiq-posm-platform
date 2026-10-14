import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeSupabaseTarget } from "./lib/assert-safe-supabase-target.mjs";
import {
  BASELINE_BOUNDARY,
  FIRST_FORWARD_MIGRATION,
  appliedMigrationVersions,
  applySqlFile,
  assertCanonicalLocalData,
  assertCurrentSchema,
  assertRecoveryFiles,
  assertTenantIsolationEnforced,
  baselineDigest,
  fingerprintInventory,
  forwardMigrations,
  migrationFiles,
  normalizedInventory,
  psql,
  representedMigrationVersions,
  run,
} from "./lib/local-baseline-recovery.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const localEnvironment = {
  ...process.env,
  DEPLOYIQ_ENVIRONMENT: "local",
  DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS: "local",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_DB_URL: databaseUrl,
};
const countArgument = process.argv.find((value) => value.startsWith("--rehearsals="))?.split("=")[1] ?? "1";
const rehearsals = Number(countArgument);
if (!Number.isInteger(rehearsals) || rehearsals < 1 || rehearsals > 2) throw new Error("rehearsal_count_invalid");
if (process.argv.some((value) => /--(?:linked|project-ref|db-url)/.test(value))) throw new Error("remote_target_argument_forbidden");

assertSafeSupabaseTarget({ operationClass: "destructive disposable-local baseline recovery", destructive: true, databaseUrl, env: localEnvironment });
assertRecoveryFiles(root);
if (existsSync(resolve(root, "supabase/.temp/project-ref"))) throw new Error("repository_remote_link_present");
run("docker", ["info", "--format", "{{.ServerVersion}}"], { capture: true });
run("psql", ["--version"], { capture: true });
run("supabase", ["--version"], { capture: true });

const fingerprints = [];
const baselineSha256 = baselineDigest(root);

for (let index = 1; index <= rehearsals; index += 1) {
  const workspace = mkdtempSync(resolve(tmpdir(), `deployiq-baseline-rehearsal-${index}-`));
  const supabaseDirectory = resolve(workspace, "supabase");
  const projectId = `deployiq-baseline-rehearsal-${index}`;
  let startAttempted = false;
  try {
    mkdirSync(resolve(supabaseDirectory, "migrations"), { recursive: true });
    const sourceConfig = readFileSync(resolve(root, "supabase/config.toml"), "utf8");
    const isolatedConfig = sourceConfig.replace(/^project_id\s*=.*$/m, `project_id = "${projectId}"`);
    if (isolatedConfig === sourceConfig) throw new Error("local_project_id_not_replaced");
    writeFileSync(resolve(supabaseDirectory, "config.toml"), isolatedConfig);
    if (existsSync(resolve(supabaseDirectory, ".temp/project-ref"))) throw new Error("isolated_remote_link_present");

    console.log(`Rehearsal ${index}: starting isolated local stack with an empty migration directory.`);
    startAttempted = true;
    run("supabase", ["start", "--workdir", workspace, "--yes"], { env: localEnvironment, capture: true });
    const initialTableCount = Number(psql(databaseUrl, "select count(*) from pg_tables where schemaname='public' and tablename not in ('spatial_ref_sys');"));
    if (initialTableCount !== 0) throw new Error(`initial_public_schema_not_empty:${initialTableCount}`);
    if (appliedMigrationVersions(databaseUrl).length !== 0) throw new Error("automatic_migration_replay_detected");

    console.log(`Rehearsal ${index}: applying canonical baseline ${baselineSha256}.`);
    applySqlFile(databaseUrl, resolve(root, "supabase/baselines/20260816020000_pre_core2a.sql"));
    applySqlFile(databaseUrl, resolve(root, "supabase/seeds/canonical_reference_data.sql"));

    rmSync(resolve(supabaseDirectory, "migrations"), { recursive: true, force: true });
    symlinkSync(resolve(root, "supabase/migrations"), resolve(supabaseDirectory, "migrations"), "dir");
    const represented = representedMigrationVersions(root);
    run("supabase", ["migration", "repair", "--local", "--status", "applied", ...represented, "--workdir", workspace], { env: localEnvironment });
    const appliedAfterRepair = appliedMigrationVersions(databaseUrl);
    if (JSON.stringify(appliedAfterRepair) !== JSON.stringify(represented)) throw new Error("historical_migration_reconciliation_mismatch");
    const pending = migrationFiles(root).filter(({ version }) => !new Set(appliedAfterRepair).has(version));
    if (pending[0]?.version !== FIRST_FORWARD_MIGRATION) throw new Error(`first_pending_migration_invalid:${pending[0]?.version ?? "none"}`);
    console.log(`Rehearsal ${index}: verified ${FIRST_FORWARD_MIGRATION} as the first pending migration after boundary ${BASELINE_BOUNDARY}.`);

    run("supabase", ["migration", "up", "--local", "--include-all", "--workdir", workspace], { env: localEnvironment });
    const expectedVersions = migrationFiles(root).map(({ version }) => version);
    const finalVersions = appliedMigrationVersions(databaseUrl);
    if (JSON.stringify(finalVersions) !== JSON.stringify(expectedVersions)) throw new Error("forward_migration_history_mismatch");
    const expectedForward = forwardMigrations(root).map(({ version }) => version);
    if (!expectedForward.every((version) => finalVersions.includes(version))) throw new Error("forward_migration_missing");

    const inventory = normalizedInventory(databaseUrl);
    assertCurrentSchema(inventory);
    assertCanonicalLocalData(databaseUrl);
    assertTenantIsolationEnforced(databaseUrl);
    const fingerprint = fingerprintInventory(inventory);
    fingerprints.push(fingerprint);
    console.log(`Rehearsal ${index}: ${forwardMigrations(root).length} forward migrations applied.`);
    console.log(`Rehearsal ${index}: schema fingerprint ${fingerprint}`);
  } finally {
    if (startAttempted) {
      try {
        run("supabase", ["stop", "--project-id", projectId, "--no-backup", "--yes"], { env: localEnvironment, capture: true });
      } catch (error) {
        console.error(`Disposable cleanup warning: ${error instanceof Error ? error.message : "unknown"}`);
      }
    }
    rmSync(workspace, { recursive: true, force: true });
  }
}

if (fingerprints.length === 2 && fingerprints[0] !== fingerprints[1]) throw new Error("schema_fingerprint_mismatch");
console.log(`Disposable-local baseline recovery passed (${fingerprints.length} rehearsal${fingerprints.length === 1 ? "" : "s"}).`);
if (fingerprints.length === 2) console.log(`Matching schema fingerprint: ${fingerprints[0]}`);

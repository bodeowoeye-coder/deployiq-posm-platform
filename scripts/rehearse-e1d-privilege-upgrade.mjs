import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { seedE1CBuildFixture } from "./lib/e1c-build-uat.mjs";
import {
  E1D_PLATFORM_PRIVILEGE_MIGRATION,
  SERVER_AUTHORITATIVE_LEGACY_TABLES,
  appliedMigrationVersions,
  assertCurrentSchema,
  assertPlatformLegacyPrivileges,
  assertRecoveryFiles,
  assertTenantIsolationEnforced,
  assertWorkspaceAuthorizationPrivileges,
  migrationFiles,
  normalizedInventory,
  psql,
  representedMigrationVersions,
  run,
} from "./lib/local-baseline-recovery.mjs";

const root = resolve(import.meta.dirname, "..");
const workspace = mkdtempSync(resolve(tmpdir(), "deployiq-e1d-privilege-upgrade-"));
const supabaseDirectory = resolve(workspace, "supabase");
const migrationDirectory = resolve(supabaseDirectory, "migrations");
const projectId = `deployiq-e1d-privilege-upgrade-${process.pid}`;
const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const baseEnv = {
  ...process.env,
  DEPLOYIQ_ENVIRONMENT: "local",
  DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS: "local",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_DB_URL: databaseUrl,
};
let started = false;

function tableCounts() {
  const tables = [...new Set([
    ...SERVER_AUTHORITATIVE_LEGACY_TABLES,
    "user_roles", "user_profiles", "clients", "workspace_memberships", "workspace_roles", "workspace_role_permissions",
  ])].sort();
  return Object.fromEntries(tables.map((table) => [table, Number(psql(databaseUrl, `select count(*) from public.${table};`))]));
}

function requireDenied(result, label) {
  if (!result.error || !["42501", "PGRST301"].includes(result.error.code ?? "")) {
    throw new Error(`${label}_was_not_permission_denied`);
  }
}

try {
  if (process.env.DEPLOYIQ_CONFIRM_DESTRUCTIVE_OPERATION !== "YES") throw new Error("destructive_confirmation_missing");
  if (existsSync(resolve(root, "supabase/.temp/project-ref"))) throw new Error("repository_remote_link_present");
  assertRecoveryFiles(root);
  mkdirSync(migrationDirectory, { recursive: true });
  const config = readFileSync(resolve(root, "supabase/config.toml"), "utf8").replace(/^project_id\s*=.*$/m, `project_id = "${projectId}"`);
  writeFileSync(resolve(supabaseDirectory, "config.toml"), config);
  run("docker", ["info", "--format", "{{.ServerVersion}}"], { capture: true });
  run("supabase", ["start", "--workdir", workspace, "--yes"], { env: baseEnv, capture: true });
  started = true;
  run("psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "--single-transaction", "-f", resolve(root, "supabase/baselines/20260816020000_pre_core2a.sql")], { capture: true });
  run("psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "--single-transaction", "-f", resolve(root, "supabase/seeds/canonical_reference_data.sql")], { capture: true });
  for (const migration of migrationFiles(root).filter(({ version }) => version <= "20261016010000")) {
    copyFileSync(migration.path, resolve(migrationDirectory, migration.name));
  }
  run("supabase", ["migration", "repair", "--local", "--status", "applied", ...representedMigrationVersions(root), "--workdir", workspace], { env: baseEnv, capture: true });
  run("supabase", ["migration", "up", "--local", "--include-all", "--workdir", workspace], { env: baseEnv, capture: true });

  const status = JSON.parse(run("supabase", ["status", "--workdir", workspace, "-o", "json"], { env: baseEnv, capture: true }));
  const password = randomBytes(24).toString("base64url");
  const fixtureEnv = { ...baseEnv, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY, E1C_UAT_PASSWORD: password };
  const manifest = await seedE1CBuildFixture({ env: fixtureEnv });
  run("psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-v", `synthetic_admin_user_id=${manifest.identities.customerAdmin.userId}`, "--single-transaction", "-f", resolve(root, "supabase/seeds/staging_synthetic_fixtures.sql")], { capture: true });
  const before = tableCounts();

  const finalMigration = migrationFiles(root).find(({ version }) => version === E1D_PLATFORM_PRIVILEGE_MIGRATION);
  if (!finalMigration) throw new Error("e1d_platform_privilege_migration_missing");
  copyFileSync(finalMigration.path, resolve(migrationDirectory, finalMigration.name));
  run("supabase", ["migration", "up", "--local", "--include-all", "--workdir", workspace], { env: baseEnv, capture: true });
  const after = tableCounts();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("privilege_upgrade_changed_row_counts");
  if (appliedMigrationVersions(databaseUrl).at(-1) !== E1D_PLATFORM_PRIVILEGE_MIGRATION) throw new Error("privilege_upgrade_ledger_invalid");

  const inventory = normalizedInventory(databaseUrl);
  assertCurrentSchema(inventory);
  assertWorkspaceAuthorizationPrivileges(databaseUrl);
  assertPlatformLegacyPrivileges(databaseUrl);
  assertTenantIsolationEnforced(databaseUrl);

  const anon = createClient(baseEnv.NEXT_PUBLIC_SUPABASE_URL, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  requireDenied(await anon.from("projects").select("id").limit(1), "anonymous_projects");
  requireDenied(await anon.from("onboarding_drafts").select("id").limit(1), "anonymous_onboarding_drafts");

  const authenticated = createClient(baseEnv.NEXT_PUBLIC_SUPABASE_URL, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await authenticated.auth.signInWithPassword({ email: manifest.identities.customerAdmin.email, password });
  if (signedIn.error || !signedIn.data.user) throw new Error("synthetic_authenticated_session_failed");
  const ownRole = await authenticated.from("user_roles").select("user_id,role,client_id").eq("user_id", signedIn.data.user.id).single();
  if (ownRole.error || ownRole.data.user_id !== signedIn.data.user.id) throw new Error("authenticated_self_role_read_failed");
  const ownClient = await authenticated.from("clients").select("id").eq("id", ownRole.data.client_id).single();
  if (ownClient.error || ownClient.data.id !== ownRole.data.client_id) throw new Error("authenticated_tenant_client_read_failed");
  requireDenied(await authenticated.from("projects").select("id").limit(1), "authenticated_projects");
  requireDenied(await authenticated.from("workspace_memberships").select("id").limit(1), "authenticated_workspace_memberships");

  const service = createClient(baseEnv.NEXT_PUBLIC_SUPABASE_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const serviceRead = await service.from("projects").select("id", { count: "exact", head: true });
  if (serviceRead.error || Number(serviceRead.count) < 2) throw new Error("service_authoritative_read_failed");

  console.log(`Data-bearing privilege upgrade passed with ${Object.values(after).reduce((sum, value) => sum + value, 0)} rows across audited tables.`);
  console.log("Anonymous and authenticated server-only table access denied; bounded session reads and service access passed.");
} finally {
  if (started) {
    try { run("supabase", ["stop", "--project-id", projectId, "--no-backup", "--yes"], { capture: true }); }
    catch (error) { console.error(`E1D cleanup warning: ${error instanceof Error ? error.message : "unknown"}`); }
  }
  rmSync(workspace, { recursive: true, force: true });
}

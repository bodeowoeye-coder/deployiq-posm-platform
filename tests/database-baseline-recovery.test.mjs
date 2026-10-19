import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BASELINE_BOUNDARY,
  AUTHORIZATION_REPAIR_MIGRATION,
  E1C_FIELD_COORDINATOR_MIGRATION,
  E1C_WORKSPACE_STATUS_PRIVILEGE_MIGRATION,
  E1D_WORKSPACE_AUTHORIZATION_PRIVILEGE_MIGRATION,
  E1D_PLATFORM_PRIVILEGE_MIGRATION,
  E1B_MIGRATION,
  FIRST_FORWARD_MIGRATION,
  assertRecoveryFiles,
  forwardMigrations,
  representedMigrationVersions,
} from "../scripts/lib/local-baseline-recovery.mjs";

const root = new URL("..", import.meta.url).pathname;
const bootstrap = readFileSync(new URL("../scripts/bootstrap-disposable-local-database.mjs", import.meta.url), "utf8");
const verify = readFileSync(new URL("../scripts/lib/local-baseline-recovery.mjs", import.meta.url), "utf8");
const baseline = readFileSync(new URL("../supabase/baselines/20260816020000_pre_core2a.sql", import.meta.url), "utf8");

test("canonical baseline boundary and forward migration order are stable", () => {
  assert.doesNotThrow(() => assertRecoveryFiles(root));
  assert.equal(BASELINE_BOUNDARY, "20260816020000");
  assert.equal(forwardMigrations(root)[0].version, FIRST_FORWARD_MIGRATION);
  assert.ok(forwardMigrations(root).some(({ version }) => version === E1C_FIELD_COORDINATOR_MIGRATION));
  assert.ok(forwardMigrations(root).some(({ version }) => version === E1C_WORKSPACE_STATUS_PRIVILEGE_MIGRATION));
  assert.ok(forwardMigrations(root).some(({ version }) => version === E1D_WORKSPACE_AUTHORIZATION_PRIVILEGE_MIGRATION));
  assert.equal(forwardMigrations(root).at(-1).version, E1D_PLATFORM_PRIVILEGE_MIGRATION);
  assert.ok(representedMigrationVersions(root).includes("20260625000000"));
});

test("canonical session grants preserve RLS and least-privilege browser access", () => {
  for (const table of ["user_roles", "user_profiles", "clients"]) {
    assert.match(baseline, new RegExp(`public\\.${table}`));
  }
  assert.match(baseline, /revoke all privileges[\s\S]*from anon/);
  assert.match(baseline, /grant select on table public\.user_roles, public\.user_profiles, public\.clients to authenticated/);
  for (const token of ["session_table_rls_missing", "authenticated_session_select_missing", "authenticated_session_grant_excessive", "anonymous_session_table_grant", "service_session_select_missing"])
    assert.match(verify, new RegExp(token));
});

test("workspace authorization tables remain server-authoritative", () => {
  for (const token of ["browser_workspace_authority_grant", "E1D_WORKSPACE_AUTHORIZATION_PRIVILEGE_MIGRATION", "e1d_workspace_authorization_privilege_migration_not_applied", "assertWorkspaceAuthorizationPrivileges", "browser_workspace_authority_privilege", "service_workspace_authority_privilege_missing"])
    assert.match(verify, new RegExp(token));
  assert.match(bootstrap, /assertWorkspaceAuthorizationPrivileges\(databaseUrl\)/);
});

test("legacy application tables deny browser roles while session reads remain bounded", () => {
  for (const token of ["browser_server_authoritative_grant", "service_server_authoritative_select_missing", "E1D_PLATFORM_PRIVILEGE_MIGRATION", "e1d_platform_privilege_migration_not_applied", "assertPlatformLegacyPrivileges", "session_browser_privileges_invalid"])
    assert.match(verify, new RegExp(token));
  assert.match(bootstrap, /assertPlatformLegacyPrivileges\(databaseUrl\)/);
});

test("bootstrap starts from an isolated empty migration directory before repair", () => {
  assert.match(bootstrap, /mkdirSync\(resolve\(supabaseDirectory, "migrations"\)/);
  assert.match(bootstrap, /initial_public_schema_not_empty/);
  assert.match(bootstrap, /automatic_migration_replay_detected/);
  assert.match(bootstrap, /symlinkSync\(resolve\(root, "supabase\/migrations"\)/);
  assert.match(verify, /to_regclass\('supabase_migrations\.schema_migrations'\) is not null/);
});

test("bootstrap is fail-closed for remote targets and linked repositories", () => {
  assert.match(bootstrap, /assertSafeSupabaseTarget/);
  assert.match(bootstrap, /destructive: true/);
  assert.match(bootstrap, /remote_target_argument_forbidden/);
  assert.match(bootstrap, /repository_remote_link_present/);
  assert.match(bootstrap, /isolated_remote_link_present/);
  assert.doesNotMatch(bootstrap, /--linked|vmurvcpmqwnxgruhqevf|pmdgpgfbtolrgmuusszy/);
});

test("historical versions are repaired locally and first forward migration is checked", () => {
  assert.match(bootstrap, /"migration", "repair", "--local"/);
  assert.match(bootstrap, /historical_migration_reconciliation_mismatch/);
  assert.match(bootstrap, /first_pending_migration_invalid/);
  assert.match(bootstrap, /"migration", "up", "--local"/);
});

test("canonical baseline remains an external immutable input", () => {
  assert.match(baseline, /Boundary: 20260816020000_harden_acquisition_provisioning_boundary\.sql/);
  assert.match(bootstrap, /baselineDigest/);
  assert.doesNotMatch(bootstrap, /writeFileSync\([^\n]*pre_core2a/);
});

test("verification covers E1B idempotency GPS constraints tenant FKs RLS RPC grants and private storage", () => {
  for (const token of [
    "build_runtime_evidence_mobile_operation_uidx","build_runtime_evidence_uploads_active_mobile_operation_uidx",
    "build_runtime_evidence_gps_accuracy_check","build_runtime_evidence_location_status_check",
    "build_sites_project_client_fkey","build_work_packages_site_project_client_fkey",
    "legacyNotValid","required_constraint_invalid","required_constraint_unvalidated","build_rls_missing","unsafe_rpc_grant","unexpected_authenticated_build_grant","build_evidence_bucket_invalid",
    "canonical_reference_data_invalid","unexpected_fixture_rows",
  ]) assert.match(verify, new RegExp(token));
  assert.match(verify, /assertTenantIsolationEnforced/);
  assert.match(verify, /tenant_isolation_probe_failed/);
  assert.match(verify, /tenant_isolation_probe_residue/);
});

test("two rehearsals must produce identical normalized fingerprints", () => {
  assert.match(bootstrap, /rehearsals > 2/);
  assert.match(bootstrap, /fingerprints\[0\] !== fingerprints\[1\]/);
  assert.match(bootstrap, /schema_fingerprint_mismatch/);
});

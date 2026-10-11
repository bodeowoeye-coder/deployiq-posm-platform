import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20261011010000_add_transactional_canonical_supervisor_provisioning.sql", import.meta.url), "utf8");
const helper = readFileSync(new URL("../lib/workspace/canonicalSupervisorRole.ts", import.meta.url), "utf8");
const team = readFileSync(new URL("../lib/workspace/team.ts", import.meta.url), "utf8");
const retail = readFileSync(new URL("../lib/acquisition/provisioning/retailWorkspace.ts", import.meta.url), "utf8");

const approved = [
  "projects.view",
  "campaigns.view",
  "submissions.review",
  "deployment_locations.view",
  "reports.view",
  "notifications.view",
];

test("transactional function hardcodes only the approved Supervisor defaults", () => {
  for (const permission of approved) assert.match(migration, new RegExp(`'${permission.replace(".", "\\.")}'`));
  for (const forbidden of ["projects.manage", "campaigns.manage", "users.manage", "settings.manage", "billing.view", "notifications.manage"]) {
    assert.doesNotMatch(migration, new RegExp(`'${forbidden.replace(".", "\\.")}'`));
  }
  assert.doesNotMatch(migration, /p_permissions|dynamic sql|execute format/i);
});

test("role and permission creation share one transactional database function", () => {
  assert.match(migration, /create or replace function public\.ensure_canonical_supervisor_role/);
  assert.match(migration, /insert into public\.workspace_roles/);
  assert.match(migration, /insert into public\.workspace_role_permissions/);
  assert.doesNotMatch(migration, /exception[\s\S]*when[\s\S]*then[\s\S]*commit/i);
});

test("existing roles are locked, diagnosed and never rewritten or reseeded", () => {
  assert.match(migration, /where role\.client_id = p_client_id and role\.role_key = 'supervisor'[\s\S]*for update/);
  assert.match(migration, /existing_complete/);
  assert.match(migration, /existing_customized/);
  assert.match(migration, /existing_incomplete/);
  assert.match(migration, /existing_conflicting/);
  assert.doesNotMatch(migration, /update public\.workspace_roles/i);
  assert.doesNotMatch(migration, /on conflict[\s\S]*do update/i);
});

test("tenant and interactive Customer Admin authority are verified", () => {
  assert.match(migration, /public\.clients client where client\.id = p_client_id/);
  assert.match(migration, /membership\.client_id = p_client_id/);
  assert.match(migration, /membership\.user_id = p_actor_user_id/);
  assert.match(migration, /membership\.status = 'active'/);
  assert.match(migration, /membership\.role_key = 'customer_admin'/);
});

test("function is service-only with hardened search path", () => {
  assert.match(migration, /security definer[\s\S]*set search_path = pg_catalog/);
  assert.match(migration, /revoke all on function public\.ensure_canonical_supervisor_role\(uuid, uuid\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.ensure_canonical_supervisor_role\(uuid, uuid\)[\s\S]*to service_role/);
});

test("tenant-scoped advisory locking and uniqueness serialize concurrent creation", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /p_client_id::text \|\| ':supervisor'/);
  assert.doesNotMatch(migration, /lock table/i);
});

test("application helper calls the RPC and exposes bounded diagnostics", () => {
  assert.match(helper, /\.rpc\("ensure_canonical_supervisor_role"/);
  assert.match(helper, /p_client_id: input\.clientId/);
  assert.match(helper, /p_actor_user_id: input\.actorUserId/);
  assert.match(helper, /existing_incomplete/);
  assert.match(helper, /existing_conflicting/);
  assert.doesNotMatch(helper, /SUPABASE_SERVICE_ROLE_KEY|service_role.*key/i);
});

test("Team invitation and role updates use the atomic Supervisor operation", () => {
  assert.match(team, /technicalRoleKey === "supervisor"[\s\S]*ensureCanonicalSupervisorRole\(\{ clientId, actorUserId \}\)/);
  assert.match(team, /getWorkspaceRoleId\(workspace\.clientId, role\.key, workspace\.userId\)/);
  assert.match(team, /role_key: role\.technicalRoleKey/);
});

test("Retail provisioning isolates Supervisor from generic upsert and permission reseeding", () => {
  assert.match(retail, /ensureCanonicalSupervisorRole\(\{ clientId: input\.clientId, actorUserId: null \}\)/);
  assert.match(retail, /manifest\.roles\.filter\(\(role\) => role\.key !== "supervisor"\)/);
  assert.match(retail, /nonSupervisorRoles\.flatMap/);
  assert.doesNotMatch(retail, /manifest\.roles\.flatMap\(\(role\)/);
});

test("Administrator, Retail field_supervisor and memberships are outside the migration", () => {
  assert.doesNotMatch(migration, /workspace_manager|field_supervisor/);
  assert.doesNotMatch(migration, /update\s+public\.workspace_memberships|insert\s+into\s+public\.workspace_memberships|delete\s+from\s+public\.workspace_memberships/i);
});

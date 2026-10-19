import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261016010000_repair_workspace_authorization_table_privileges.sql");
const access = read("lib/workspace/workspaceAccess.ts");
const team = read("lib/workspace/team.ts");

const authorityTables = ["workspace_memberships", "workspace_roles", "workspace_role_permissions"];

test("workspace authority tables deny both browser database roles", () => {
  for (const role of ["anon", "authenticated"]) {
    assert.match(migration, new RegExp(`revoke all privileges on table[\\s\\S]*public\\.workspace_memberships,[\\s\\S]*public\\.workspace_roles,[\\s\\S]*public\\.workspace_role_permissions[\\s\\S]*from ${role};`, "i"));
  }
  assert.doesNotMatch(migration, /grant\s+[^;]*\s+to\s+(?:anon|authenticated)\b/i);
});

test("legitimate server-authoritative access remains explicit", () => {
  for (const table of authorityTables) assert.match(migration, new RegExp(`public\\.${table}`));
  assert.match(migration, /grant all privileges on table[\s\S]*to service_role;/i);
  assert.match(access, /createAdminSupabase\(\)/);
  assert.match(team, /createAdminSupabase\(\)/);
});

test("repair is forward-only privilege DCL with no data or authority rewrite", () => {
  assert.doesNotMatch(migration, /\b(?:insert|update|delete|truncate|alter\s+table|create\s+policy|drop)\b/i);
  assert.doesNotMatch(migration, /workspace_manager|supervisor|customer_admin|role_key|permission\s*=/i);
});

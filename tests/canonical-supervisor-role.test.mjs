import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const team = readFileSync(new URL("../lib/workspace/team.ts", import.meta.url), "utf8");
const manifest = readFileSync(new URL("../lib/acquisition/provisioning/retailManifest.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261008010000_add_canonical_supervisor_workspace_role.sql", import.meta.url), "utf8");

function roleBlock(key) {
  const match = team.match(new RegExp(`key: "${key}",[\\s\\S]*?permissions: \\[([^\\]]*)\\]`));
  assert.ok(match, `${key} role definition is present`);
  return match[0];
}

test("Administrator and Supervisor use distinct canonical technical keys", () => {
  assert.match(roleBlock("administrator"), /technicalRoleKey: "workspace_manager"/);
  assert.match(roleBlock("supervisor"), /technicalRoleKey: "supervisor"/);
});

test("Supervisor receives only the approved non-administrative defaults", () => {
  const supervisor = roleBlock("supervisor");
  for (const permission of ["projects.view", "campaigns.view", "submissions.review", "deployment_locations.view", "reports.view", "notifications.view"]) {
    assert.match(supervisor, new RegExp(`"${permission.replace(".", "\\.")}"`));
  }
  for (const forbidden of ["projects.manage", "campaigns.manage", "users.manage", "settings.manage", "billing.view", "notifications.manage"]) {
    assert.doesNotMatch(supervisor, new RegExp(`"${forbidden.replace(".", "\\.")}"`));
  }
});

test("role creation seeds defaults only when it creates the role and preserves established permissions", () => {
  assert.match(team, /if \(existing\?\.id\) return String\(existing\.id\)/);
  assert.match(team, /workspace_role_permissions/);
  assert.match(team, /ignoreDuplicates: true/);
  assert.match(team, /insertError as \{ code\?: string \}\)\.code === "23505"/);
  const existingBranch = team.indexOf("if (existing?.id) return String(existing.id)");
  const permissionWrite = team.indexOf('.from("workspace_role_permissions")', existingBranch);
  assert.ok(existingBranch > -1 && permissionWrite > existingBranch);
});

test("future workspace provisioning adds canonical Supervisor without replacing Retail field_supervisor", () => {
  assert.match(manifest, /key: "field_supervisor"/);
  assert.match(manifest, /key: "supervisor"/);
  assert.match(manifest, /key: "supervisor"[\s\S]*?appRole: "client"[\s\S]*?notifications\.view/);
});

test("migration is additive tenant-scoped and seeds permissions only for newly inserted roles", () => {
  assert.match(migration, /on conflict \(client_id, role_key\) do nothing/i);
  assert.match(migration, /inserted_supervisor_roles as \([\s\S]*returning id[\s\S]*insert into public\.workspace_role_permissions/i);
  assert.match(migration, /from inserted_supervisor_roles role/);
  assert.match(migration, /on conflict \(role_id, permission\) do nothing/i);
  assert.match(migration, /raise warning 'E1A\.2A preserved conflicting supervisor role/);
});

test("migration never reclassifies memberships or mutates existing role definitions", () => {
  assert.doesNotMatch(migration, /update\s+public\.workspace_memberships/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.workspace_memberships/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.workspace_memberships/i);
  assert.doesNotMatch(migration, /update\s+public\.workspace_roles/i);
  assert.doesNotMatch(migration, /role_key\s*=\s*'field_supervisor'/i);
  assert.doesNotMatch(migration, /role_key\s*=\s*'workspace_manager'/i);
});

test("invitation acceptance preserves the stored technical key", () => {
  assert.match(team, /acceptWorkspaceInvitations[\s\S]*\.update\(\{ status: "active", updated_at:/);
  assert.doesNotMatch(team, /acceptWorkspaceInvitations[\s\S]{0,700}role_key:\s*"workspace_manager"/);
});

test("invitation and member-role writes persist each selected canonical technical key", () => {
  assert.match(team, /inviteWorkspaceUser[\s\S]*role_key: role\.technicalRoleKey/);
  assert.match(team, /updateWorkspaceMemberRole[\s\S]*role_key: role\.technicalRoleKey/);
  assert.match(roleBlock("administrator"), /technicalRoleKey: "workspace_manager"/);
  assert.match(roleBlock("supervisor"), /technicalRoleKey: "supervisor"/);
});

test("team display reconstructs Administrator and Supervisor from distinct stored keys", () => {
  assert.match(team, /CUSTOMER_WORKSPACE_ROLES\.find\(\(role\) => role\.technicalRoleKey === text\(row\.role_key\)\)/);
  assert.match(team, /const role = roleDefinition\(text\(membership\.role_key\)\)/);
});

test("E1A.2A does not alter routing or Build mutation services", () => {
  assert.doesNotMatch(team, /authDestinations|defaultDestinationForResolvedUser/);
  assert.doesNotMatch(migration, /build_runtime_activities|build_runtime_inspections|build_runtime_exceptions|build_recipient_notifications/i);
});

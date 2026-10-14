import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261015010000_align_field_coordinator_activity_owner_authority.sql", "utf8");
const workspaceStatusPrivilegeMigration = readFileSync("supabase/migrations/20261015020000_repair_customer_workspace_status_lookup_privilege.sql", "utf8");
const runtimeService = readFileSync("lib/build/runtime/service.ts", "utf8");
const accessPolicy = readFileSync("lib/workspace/workspaceAccessPolicy.ts", "utf8");
const operationalActivity = readFileSync("app/workspace/build/projects/[id]/activities/[activityId]/page.tsx", "utf8");

test("Field Coordinator becomes eligible only as an explicitly assigned Activity owner", () => {
  assert.match(migration, /owner_allowlist[\s\S]*field_coordinator/);
  assert.match(migration, /BUILD_FIELD_COORDINATOR_AUTHORITY_SOURCE_UNEXPECTED/);
  assert.match(runtimeService, /authContext\.user_id === text\(activity\.activity_owner_user_id\)/);
  assert.match(runtimeService, /Activity execution is restricted to assigned responsibility and workspace management/);
  assert.match(operationalActivity, /access\.roleKey === "field_coordinator" && assignedOwner/);
});

test("Field Coordinator receives no management, supervision, review, or exception authority", () => {
  assert.doesNotMatch(migration, /BUILD_RESPONSIBILITY_ASSIGNMENT_FORBIDDEN[\s\S]*field_coordinator/);
  assert.doesNotMatch(migration, /p_supervisor_user_id[\s\S]*field_coordinator/);
  assert.doesNotMatch(migration, /record_build_runtime_inspection|apply_build_runtime_exception_action/);
  assert.match(accessPolicy, /roleKey === "agency_manager" \|\| roleKey === "field_coordinator"/);
});

test("the repaired function remains service-role only", () => {
  assert.match(migration, /revoke all on function public\.apply_build_runtime_activity_action[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.apply_build_runtime_activity_action[\s\S]*to service_role/);
});

test("Customer Workspace status lookup is restored only for the server role", () => {
  assert.match(workspaceStatusPrivilegeMigration, /grant select on table public\.workspace_statuses to service_role/i);
  assert.match(workspaceStatusPrivilegeMigration, /revoke all privileges on table public\.workspace_statuses from anon/i);
  assert.doesNotMatch(workspaceStatusPrivilegeMigration, /grant\s+\w+[^;]*\s+to\s+authenticated/i);
});

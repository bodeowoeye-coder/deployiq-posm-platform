import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261016020000_repair_legacy_browser_table_privileges.sql");
const authMigration = read("supabase/migrations/20261014010000_repair_canonical_session_table_privileges.sql");
const browserClient = read("lib/supabaseClient.ts");
const userClient = read("lib/supabaseUser.ts");
const auth = read("lib/auth.ts");
const mobileEvidence = read("components/workspace/BuildMobileEvidenceOutbox.tsx");

const serverOnlyTables = [
  "agencies", "alert_events", "audit_logs", "brands", "client_profiles", "client_projects",
  "commercial_pricing_snapshots", "commercial_pricing_templates", "commercial_pricing_tiers",
  "deployment_locations", "deployment_progress", "deployment_stages", "installer_performance", "installers",
  "notification_events", "onboarding_drafts", "product_entitlements", "project_targets", "projects",
  "provisioning_events", "provisioning_jobs", "submission_status_history", "submissions",
  "workspace_activation_notifications", "workspace_branding", "workspace_campaign_locations", "workspace_campaigns",
  "workspace_directory_import_batches", "workspace_field_assignments", "workspace_navigation",
  "workspace_notification_defaults", "workspace_onboarding_checklist_items", "workspace_onboarding_checklists",
  "workspace_report_configs", "workspace_settings", "workspace_statuses", "workspace_support_sessions",
];

test("all 37 conclusively server-authoritative tables revoke both browser roles", () => {
  for (const table of serverOnlyTables) {
    assert.equal((migration.match(new RegExp(`public\\.${table}\\b`, "g")) ?? []).length, 3, table);
  }
  assert.match(migration, /from anon;/i);
  assert.match(migration, /from authenticated;/i);
  assert.match(migration, /grant all privileges on table[\s\S]*to service_role;/i);
  assert.doesNotMatch(migration, /grant\s+[^;]*\s+to\s+(?:anon|authenticated|public)\b/i);
});

test("Global Auth retains only the intended authenticated session reads", () => {
  for (const table of ["user_roles", "user_profiles", "clients"]) {
    assert.doesNotMatch(migration, new RegExp(`public\\.${table}\\b`));
  }
  assert.match(authMigration, /grant select on table public\.user_roles, public\.user_profiles, public\.clients to authenticated/);
  assert.match(auth, /userClient[\s\S]*\.from\("user_roles"\)/);
  assert.match(auth, /userClient[\s\S]*\.from\("clients"\)/);
});

test("browser clients remain limited to Auth and signed evidence Storage", () => {
  assert.doesNotMatch(browserClient, /service.role|SUPABASE_SERVICE_ROLE_KEY|\.from\(/i);
  assert.doesNotMatch(userClient, /service.role|SUPABASE_SERVICE_ROLE_KEY/i);
  assert.match(mobileEvidence, /uploadToSignedUrl/);
  assert.doesNotMatch(mobileEvidence, /\.from\("(?:projects|submissions|workspace_)/);
});

test("migration changes privileges only and cannot rewrite data or policies", () => {
  assert.doesNotMatch(migration, /\b(?:insert|update|delete|truncate|alter\s+table|create\s+policy|drop)\b/i);
});

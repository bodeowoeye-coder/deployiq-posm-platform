import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20261101010000_enable_rls_on_server_authoritative_public_tables.sql", import.meta.url), "utf8");
const tables = [
  "commercial_pricing_snapshots", "commercial_pricing_templates", "commercial_pricing_tiers",
  "provisioning_events", "provisioning_jobs", "workspace_branding", "workspace_campaign_locations",
  "workspace_campaigns", "workspace_directory_import_batches", "workspace_field_assignments",
  "workspace_memberships", "workspace_navigation", "workspace_notification_defaults",
  "workspace_onboarding_checklist_items", "workspace_onboarding_checklists", "workspace_report_configs",
  "workspace_role_permissions", "workspace_roles", "workspace_settings", "workspace_statuses",
];

test("migration enables ordinary RLS on exactly the accepted 20-table inventory", () => {
  const enabled = [...migration.matchAll(/alter table public\.([a-z_]+) enable row level security;/gi)].map((match) => match[1]);
  assert.deepEqual(enabled, tables);
  assert.equal(new Set(enabled).size, 20);
  assert.doesNotMatch(migration, /force row level security/i);
});

test("browser and PUBLIC privileges are revoked while service authority is preserved", () => {
  for (const table of tables) assert.equal((migration.match(new RegExp(`public\\.${table}\\b`, "g")) ?? []).length, 3, table);
  assert.match(migration, /from public, anon, authenticated;/i);
  assert.match(migration, /grant all privileges on table[\s\S]*to service_role;/i);
  assert.doesNotMatch(migration, /grant\s+[^;]*\s+to\s+(?:anon|authenticated|public)\b/i);
});

test("migration adds no browser policy, data rewrite, destructive DDL, or session-table change", () => {
  assert.doesNotMatch(migration, /create\s+policy|alter\s+policy|drop\s+policy/i);
  assert.doesNotMatch(migration, /\b(?:insert\s+into|update\s+public|delete\s+from|truncate\s+table|drop\s+table)\b/i);
  for (const table of ["user_roles", "user_profiles", "clients"])
    assert.doesNotMatch(migration, new RegExp(`public\\.${table}\\b`));
});

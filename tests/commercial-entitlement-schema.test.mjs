import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationPath = new URL("../supabase/migrations/20260823010000_add_commercial_entitlement_authority_foundation.sql", import.meta.url);
const sql = readFileSync(migrationPath, "utf8");
const retailFoundation = readFileSync(new URL("../supabase/migrations/20260805000000_add_retail_workspace_reference_foundation.sql", import.meta.url), "utf8");

test("entitlement schema: migration is additive and permits pre-client authority", () => {
  assert.match(sql, /alter column client_id drop not null/i);
  assert.match(sql, /client_id is not null or \(acquisition_draft_id is not null and authenticated_user_id is not null\)/i);
  assert.doesNotMatch(sql, /drop table/i);
});

test("entitlement schema: commercial and operational lifecycle dimensions remain separate", () => {
  for (const status of ["pending", "verified", "revoked", "superseded", "legacy_unverified"]) assert.match(sql, new RegExp(`'${status}'`));
  assert.match(sql, /authority_status text not null default 'legacy_unverified'/i);
  assert.doesNotMatch(sql, /alter column status/i);
});

test("entitlement schema: verified authority requires a verification timestamp", () => {
  assert.match(sql, /authority_status <> 'verified' or verified_at is not null/i);
});

test("entitlement schema: payment and assisted authority require their evidence references", () => {
  assert.match(sql, /authority_source <> 'self_service_payment' or commercial_payment_record_id is not null/i);
  assert.match(sql, /authority_source not in \('sales_assisted_approval', 'enterprise_commercial_approval'\) or commercial_approval_id is not null/i);
});

test("entitlement schema: one client may hold distinct product entitlements", () => {
  assert.match(retailFoundation, /unique \(client_id, product_key\)/i);
  assert.doesNotMatch(sql, /drop constraint if exists product_entitlements_client_id_product_key_key/i);
  assert.doesNotMatch(sql, /unique\s*\(client_id\)\s*[;,]/i);
});

test("entitlement schema: Phase A preserves the Retail writer conflict target", () => {
  assert.doesNotMatch(sql, /drop constraint if exists product_entitlements_client_id_product_key_key/i);
  assert.match(sql, /Keep the existing UNIQUE \(client_id, product_key\) constraint during Phase A/i);
  assert.match(sql, /ON CONFLICT \(client_id,[\s\S]*product_key\)/i);
  assert.match(sql, /supersedes_entitlement_id uuid references public\.product_entitlements\(id\) on delete restrict/i);
});

test("entitlement schema: duplicate current pre-client draft/product authority is prevented", () => {
  assert.match(sql, /product_entitlements_current_preclient_draft_product_uidx/i);
  assert.match(sql, /where client_id is null\s+and acquisition_draft_id is not null/i);
});

test("entitlement schema: provisioning job and workspace link to one retained entitlement", () => {
  assert.match(sql, /provisioning_jobs[\s\S]*commercial_entitlement_id uuid references public\.product_entitlements\(id\) on delete restrict/i);
  assert.match(sql, /workspace_settings[\s\S]*commercial_entitlement_id uuid references public\.product_entitlements\(id\) on delete restrict/i);
  assert.match(sql, /workspace_settings_commercial_entitlement_id_uidx/i);
});

test("entitlement schema: payment records contain bounded commercial evidence and no credential fields", () => {
  assert.match(sql, /create table if not exists public\.commercial_payment_records/i);
  for (const field of ["acquisition_draft_id", "authenticated_user_id", "pricing_snapshot_id", "product_key", "payment_reference", "provider_reference", "amount", "currency", "payment_provider", "payment_method", "succeeded_at"]) assert.match(sql, new RegExp(`\\b${field}\\b`));
  assert.doesNotMatch(sql, /card_number|card_details|access_token|password|provider_payload/i);
});

test("entitlement schema: assisted commercial approvals are never auto-approved", () => {
  assert.match(sql, /create table if not exists public\.commercial_approvals/i);
  assert.match(sql, /approval_status text not null default 'pending'/i);
  assert.doesNotMatch(sql, /insert into public\.commercial_approvals/i);
});

test("entitlement schema: legacy rows fail closed unless the full Retail chain agrees", () => {
  assert.match(sql, /legacyClassification'.*'AMBIGUOUS'/is);
  assert.match(sql, /legacyClassification'.*'LEGACY_MANUAL'/is);
  assert.match(sql, /legacyClassification', 'UNAMBIGUOUS'/i);
  assert.match(sql, /snapshot\.status = 'accepted'/i);
  assert.match(sql, /job\.result_data->>'healthChecksPassed' = 'true'/i);
  assert.match(sql, /client\.acquisition_draft_id = draft\.id/i);
  assert.match(sql, /draft\.authenticated_user_id is not null/i);
  assert.match(sql, /workspace\.currency = snapshot\.currency/i);
  assert.match(sql, /workspace\.commercial_model = entitlement\.commercial_model/i);
  assert.doesNotMatch(sql, /client\.name\s*=|organisation.*name\s*=/i);
});

test("entitlement schema: authority tables are not directly writable by browser roles", () => {
  assert.match(sql, /alter table public\.product_entitlements enable row level security/i);
  assert.match(sql, /alter table public\.commercial_payment_records enable row level security/i);
  assert.match(sql, /alter table public\.commercial_approvals enable row level security/i);
  assert.match(sql, /revoke all on public\.commercial_payment_records from anon, authenticated/i);
  assert.match(sql, /revoke all on public\.commercial_approvals from anon, authenticated/i);
});

test("entitlement schema: Phase 2A does not enable or invoke a product writer", () => {
  assert.doesNotMatch(sql, /provisionRetailWorkspaceReference|isProvisioningBlueprintEnabled|DEPLOYIQ_PROVISIONING_AGENT/i);
});

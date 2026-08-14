import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = () => readFileSync(new URL("../lib/workspace/fieldResources.ts", import.meta.url), "utf8");
const migration = () => readFileSync(new URL("../supabase/migrations/20260806040000_add_workspace_field_resources.sql", import.meta.url), "utf8");
const page = () => readFileSync(new URL("../app/workspace/admin/agencies/page.tsx", import.meta.url), "utf8");
const client = () => readFileSync(new URL("../components/workspace/AgenciesClient.tsx", import.meta.url), "utf8");
const route = () => readFileSync(new URL("../app/api/workspace/agencies/route.ts", import.meta.url), "utf8");

test("agencies: reuses canonical Core agencies table with Customer Workspace scope", () => {
  const sql = migration();
  assert.match(sql, /alter table public\.agencies add column if not exists client_id/);
  assert.match(sql, /alter table public\.agencies add column if not exists workspace_id/);
  assert.match(sql, /agencies_client_workspace_match_chk/);
  assert.doesNotMatch(sql, /create table if not exists public\.workspace_agencies|create table if not exists public\.customer_agencies/);
});

test("agencies: CRUD lifecycle supports active suspended archived and restore", () => {
  const source = service();
  const ui = client() + service();
  assert.match(source, /export async function createAgency/);
  assert.match(source, /export async function updateAgency/);
  assert.match(source, /action === "archive"/);
  assert.match(source, /action === "suspend"/);
  assert.match(source, /action === "restore"/);
  assert.match(ui, /Create Agency/);
  assert.match(ui, /Edit Agency/);
  assert.match(ui, /Suspend/);
  assert.match(ui, /Archive/);
  assert.match(ui, /Restore/);
});

test("agencies: customer workspace API derives tenant scope server-side", () => {
  const source = service();
  const api = route();
  assert.match(source, /resolveCustomerWorkspaceContext/);
  assert.match(source, /client_id: resolvedWorkspace\.clientId/);
  assert.match(source, /workspace_id: resolvedWorkspace\.clientId/);
  assert.match(source, /\.eq\("client_id", resolvedWorkspace\.clientId\)/);
  assert.doesNotMatch(api, /clientId|workspaceId|tenantId|organisationId/);
});

test("agencies: duplicate agency names are protected per workspace", () => {
  assert.match(migration(), /agencies_workspace_name_uidx/);
  assert.match(migration(), /client_id, lower\(trim\(agency_name\)\)/);
});

test("agencies: summary cards and empty state are customer-facing", () => {
  const ui = client() + service();
  for (const label of ["Total Agencies", "Active", "Suspended", "Archived", "Assigned Campaigns", "Assigned Installers"]) {
    assert.match(ui, new RegExp(label));
  }
  assert.match(ui, /Create your first Agency\./);
  assert.doesNotMatch(page() + ui, /tenant ID|service role|Core engine|database record|Client Dashboard|Platform Admin/);
});

test("agencies: sidebar is available in Customer Workspace navigation", () => {
  const foundation = readFileSync(new URL("../lib/workspace/customerAdminFoundation.ts", import.meta.url), "utf8");
  assert.match(foundation, /\{ label: "Agencies", href: "\/workspace\/admin\/agencies", status: "available" \}/);
});

test("agencies: events are non-blocking notifications", () => {
  const source = service();
  assert.match(source, /notification_events/);
  assert.match(source, /void notifyFieldResourceEvent/);
  assert.match(source, /Agency Created/);
  assert.match(source, /\[field-resource-performance\]/);
});

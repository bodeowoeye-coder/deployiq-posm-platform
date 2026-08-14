import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = () => readFileSync(new URL("../lib/workspace/campaignLocations.ts", import.meta.url), "utf8");
const migration = () => readFileSync(new URL("../supabase/migrations/20260806030000_add_campaign_location_assignments.sql", import.meta.url), "utf8");
const client = () => readFileSync(new URL("../components/workspace/CampaignLocationsClient.tsx", import.meta.url), "utf8");
const route = () => readFileSync(new URL("../app/api/workspace/campaigns/[id]/locations/route.ts", import.meta.url), "utf8");

test("campaign locations: junction table references canonical directory records", () => {
  const sql = migration();
  assert.match(sql, /create table if not exists public\.workspace_campaign_locations/);
  assert.match(sql, /deployment_location_id uuid not null references public\.deployment_locations\(id\)/);
  assert.match(sql, /workspace_campaign_locations_campaign_location_uidx/);
  assert.match(sql, /assignment_status in \('assigned', 'ready', 'in_progress', 'completed', 'excluded'\)/);
  assert.doesNotMatch(sql, /create table if not exists public\.campaign_deployment_locations|outlet_name text|address text/);
});

test("campaign locations: tenant and product scope are enforced by database constraints", () => {
  const sql = migration();
  assert.match(sql, /workspace_campaign_locations_campaign_scope_fk/);
  assert.match(sql, /foreign key \(campaign_id, client_id, project_id\)/);
  assert.match(sql, /workspace_campaign_locations_project_scope_fk/);
  assert.match(sql, /foreign key \(project_id, client_id\)/);
  assert.match(sql, /workspace_campaign_locations_location_scope_fk/);
  assert.match(sql, /foreign key \(deployment_location_id, client_id, workspace_id, product_key\)/);
});

test("campaign locations: Customer Admin can view only eligible workspace directory records", () => {
  const source = service();
  assert.match(source, /resolveCustomerWorkspaceContext/);
  assert.match(source, /from\("deployment_locations"\)/);
  assert.match(source, /\.eq\("client_id", resolvedWorkspace\.clientId\)/);
  assert.match(source, /\.eq\("workspace_id", resolvedWorkspace\.clientId\)/);
  assert.match(source, /\.eq\("product_key", resolvedWorkspace\.productKey\)/);
});

test("campaign locations: browser tenant override is ignored", () => {
  const api = route();
  const source = service();
  assert.doesNotMatch(api, /clientId|workspaceId|tenantId|organisationId/);
  assert.doesNotMatch(source.match(/export type CampaignLocationFilters[\s\S]*?\};/)?.[0] ?? "", /clientId|workspaceId|tenantId|organisationId/);
});

test("campaign locations: campaign, project and location tenant mismatch are rejected", () => {
  const source = service();
  assert.match(source, /campaignForWorkspace/);
  assert.match(source, /Campaign not found\./);
  assert.match(source, /validateLocationIds/);
  assert.match(source, /Select deployment locations from this workspace\./);
  assert.match(source, /\.eq\("project_id", campaign\.project_id\)/);
  assert.match(source, /ensureWorkspaceCampaignCompatibilityAnchor\(campaign, resolvedWorkspace\)/);
  assert.match(source, /project_id: campaign\.project_id/);
});

test("campaign locations: selected and all eligible assignment are supported and idempotent", () => {
  const source = service();
  const ui = client();
  assert.match(source, /assignAll/);
  assert.match(source, /\.upsert\(rows, \{ onConflict: "campaign_id,deployment_location_id" \}\)/);
  assert.match(source, /assignedRows/);
  assert.match(ui, /Assign Selected/);
  assert.match(ui, /Assign Locations/);
  assert.match(ui, /Assign All Eligible Locations/);
  assert.match(ui, /You are about to assign/);
});

test("campaign locations: duplicate assignment is prevented", () => {
  assert.match(migration(), /workspace_campaign_locations_campaign_location_uidx/);
  assert.match(service(), /onConflict: "campaign_id,deployment_location_id"/);
});

test("campaign locations: Draft removal works and activity-linked locations are excluded", () => {
  const source = service();
  const ui = client();
  assert.match(source, /Locations can only be changed while the campaign is in Draft\./);
  assert.match(source, /from\("submissions"\)/);
  assert.match(source, /assignment_status: "excluded"/);
  assert.match(source, /\.delete\(\)/);
  assert.match(ui, /Remove Assignment/);
  assert.match(ui, /Exclude from Campaign/);
});

test("campaign locations: target warnings and simple Retail per-location quantity are shown", () => {
  const source = service();
  const ui = client();
  assert.match(source, /Campaign target is higher than the number of assigned locations\./);
  assert.match(source, /Assigned locations exceed the campaign target\./);
  assert.match(ui, /targetQuantityPerLocation: 1/);
  assert.match(ui, /Campaign Target/);
  assert.match(ui, /Remaining Target/);
});

test("campaign locations: tab exposes summary filters table and customer empty states", () => {
  const ui = client();
  for (const label of ["Assigned Locations", "Ready", "In Progress", "Completed", "Excluded", "Remaining Campaign Target"]) {
    assert.match(ui, new RegExp(label));
  }
  for (const heading of ["Location / Outlet Name", "Outlet Code / External ID", "Address", "State", "Region", "City", "Target Quantity", "Assigned Agency", "Assigned Installer", "Deployment Status", "Assignment Date", "Actions"]) {
    assert.match(ui, new RegExp(heading.replace("/", "\\/")));
  }
  assert.match(ui, /No deployment locations are available yet\./);
  assert.match(ui, /No locations have been assigned to this campaign\./);
  assert.match(ui, /All eligible workspace locations are already assigned\./);
  assert.match(ui, /Page \{dashboard\.pagination\.page\} of \{dashboard\.pagination\.pages\}/);
});

test("campaign locations: canonical directory record remains source of truth", () => {
  const source = service();
  assert.match(source, /mergeLocation\(location/);
  assert.match(source, /locationName\(location\)/);
  assert.doesNotMatch(migration(), /outlet_name text|address text|external_id text/);
});

test("campaign locations: project integration uses same assignments", () => {
  const projectService = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");
  const projectPage = readFileSync(new URL("../app/workspace/admin/projects/[id]/page.tsx", import.meta.url), "utf8");
  const locationService = service();
  assert.match(projectService, /from\("workspace_campaign_locations"\)/);
  assert.match(locationService, /\.eq\("project_id", campaign\.project_id\)/);
  assert.match(projectService, /assignedAcrossCampaigns/);
  assert.match(projectService, /unassignedEligible/);
  assert.match(projectPage, /Campaign Management/);
});

test("campaign locations: no home metrics resolver or route-wide opening overlay is used", () => {
  const source = service();
  const ui = client();
  assert.doesNotMatch(source + ui, /resolveCustomerWorkspaceHomeContext|Opening workspace\.\.\.|WorkspaceLoadingOverlay/);
});

test("campaign locations: activity events are non-blocking and customer-facing", () => {
  const source = service();
  assert.match(source, /notification_events/);
  assert.match(source, /void notifyCampaignLocationEvent/);
  assert.match(source, /locations assigned to/);
  assert.match(source, /Location Excluded/);
  assert.match(source, /Location Removed/);
});

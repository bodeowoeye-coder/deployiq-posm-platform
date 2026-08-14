import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = () => readFileSync(new URL("../lib/workspace/fieldResources.ts", import.meta.url), "utf8");
const migration = () => readFileSync(new URL("../supabase/migrations/20260806040000_add_workspace_field_resources.sql", import.meta.url), "utf8");
const listPage = () => readFileSync(new URL("../app/workspace/admin/installers/page.tsx", import.meta.url), "utf8");
const newPage = () => readFileSync(new URL("../app/workspace/admin/installers/new/page.tsx", import.meta.url), "utf8");
const detailPage = () => readFileSync(new URL("../app/workspace/admin/installers/[id]/page.tsx", import.meta.url), "utf8");
const client = () => readFileSync(new URL("../components/workspace/InstallersClient.tsx", import.meta.url), "utf8");
const form = () => readFileSync(new URL("../components/workspace/InstallerCreateForm.tsx", import.meta.url), "utf8");

test("installers: reuses canonical Core installers table with Customer Workspace scope", () => {
  const sql = migration();
  assert.match(sql, /alter table public\.installers add column if not exists client_id/);
  assert.match(sql, /alter table public\.installers add column if not exists workspace_id/);
  assert.match(sql, /installers_client_workspace_match_chk/);
  assert.doesNotMatch(sql, /create table if not exists public\.workspace_installers|create table if not exists public\.field_users/);
});

test("installers: list create and detail routes stay inside Customer Workspace", () => {
  const source = listPage() + newPage() + detailPage() + client() + form();
  assert.match(source, /\/workspace\/admin\/installers/);
  assert.doesNotMatch(source, /href="\/client|href="\/admin|router\.push\("\/client|router\.push\("\/admin/);
});

test("installers: compatibility lifecycle services are retained without active registration UX", () => {
  const source = service();
  const ui = client() + form();
  assert.match(source, /Installer name is required\./);
  assert.match(source, /Installer phone is required\./);
  assert.match(source, /action === "deactivate"/);
  assert.match(source, /action === "archive"/);
  assert.match(source, /action === "restore"/);
  assert.doesNotMatch(client(), /Create Installer|>Deactivate<|>Archive<|>Restore</);
  assert.match(newPage(), /redirect\("\/workspace\/admin\/team"\)/);
});

test("installers: bulk import compatibility is retained without active analytics UX", () => {
  const source = service();
  assert.match(source, /installerCsvTemplate/);
  assert.match(source, /previewInstallerImport/);
  assert.match(source, /Duplicate phone\./);
  assert.match(source, /Duplicate email\./);
  assert.match(source, /Resolve duplicate or invalid installer records before importing\./);
  assert.doesNotMatch(client(), /Download Template|Preview Import|Import Installers|Resolve duplicate or invalid installer records before importing\./);
});

test("installers: assignment engine prevents duplicates and enforces tenant relationships", () => {
  const sql = migration();
  const source = service();
  assert.match(sql, /create table if not exists public\.workspace_field_assignments/);
  assert.match(sql, /workspace_field_assignments_campaign_scope_fk/);
  assert.match(sql, /workspace_field_assignments_campaign_location_scope_fk/);
  assert.match(sql, /workspace_field_assignments_campaign_location_installer_uidx/);
  assert.match(source, /export async function assignFieldResources/);
  assert.match(source, /Select campaign locations from this workspace\./);
  assert.match(source, /Select an installer from this workspace\./);
  assert.match(source, /Select an agency from this workspace\./);
});

test("installers: deployment location tab exposes assigned field resource columns and actions", () => {
  const ui = readFileSync(new URL("../components/workspace/CampaignLocationsClient.tsx", import.meta.url), "utf8");
  const source = readFileSync(new URL("../lib/workspace/campaignLocations.ts", import.meta.url), "utf8");
  assert.match(source, /workspace_field_assignments/);
  assert.match(ui, /Assign People/);
  assert.match(ui, /Assigned Agency/);
  assert.match(ui, /Assigned Installer/);
  assert.match(ui, /Assign Resource/);
});

test("installers: campaign readiness includes real field assignments", () => {
  const campaigns = readFileSync(new URL("../lib/workspace/campaigns.ts", import.meta.url), "utf8");
  assert.match(campaigns, /from\("workspace_field_assignments"\)/);
  assert.match(campaigns, /assignedResourceCount/);
  assert.match(campaigns, /Team assignment available/);
});

test("installers: Project Review Edit reads current assignments without duplicating assignment writes", () => {
  const projects = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");
  const form = readFileSync(new URL("../components/workspace/ProjectCreateWizard.tsx", import.meta.url), "utf8");
  assert.match(projects, /\.from\("workspace_field_assignments"\)/);
  assert.match(projects, /\.eq\("client_id", resolvedWorkspace\.clientId\)/);
  assert.match(projects, /\.eq\("workspace_id", workspace\.clientId\)/);
  assert.match(projects, /\.eq\("project_id", projectId\)/);
  assert.match(projects, /\.from\("agencies"\)\.select\("id,agency_name"\)/);
  assert.match(projects, /\.from\("installers"\)\.select\("id,installer_name"\)/);
  assert.doesNotMatch(projects.match(/export async function getCustomerProject[\s\S]*?return \{/)?.[0] ?? "", /\.insert\(|\.upsert\(|assignFieldResources/);
  assert.match(form, /resources\?\.agencyName/);
  assert.match(form, /resources\?\.leadInstallerName/);
  assert.match(form, /No agency assigned/);
  assert.match(form, /No lead installer assigned/);
});

test("installers: list summary includes workload and availability metrics", () => {
  const page = listPage();
  const ui = client() + service();
  assert.match(page, /Installers/);
  assert.match(page, /Review installer assignment coverage, completion, outstanding work and evidence accuracy\./);
  for (const label of ["Total Installers", "Available", "Busy", "Inactive", "Archived", "Current Assignments"]) {
    assert.match(ui, new RegExp(label));
  }
  for (const heading of ["Installer", "Assigned Project\\(s\\)", "Assigned Region / State", "Completed", "Outstanding", "Completion %", "GPS Accuracy", "Status", "Actions"]) {
    assert.match(ui, new RegExp(heading));
  }
});

test("installers: profile metrics use canonical submission installer_id with legacy name fallback", () => {
  const source = service();
  assert.match(source, /\.from\("submissions"\)[\s\S]*?\.eq\("installer_id", installerId\)/);
  assert.doesNotMatch(source, /\.eq\("installer_name", installerId\)/);
  assert.match(source, /\.is\("installer_id", null\)[\s\S]*?\.eq\("installer_name", installerName\)/);
  assert.match(source, /gps_status/);
  assert.match(source, /correction requested/);
});

test("installers: profile page is overview-only while preserving service capabilities", () => {
  const page = detailPage();
  assert.match(page, /Overview/);
  assert.match(page, /Personal Information/);
  assert.match(page, /Assigned Projects/);
  assert.doesNotMatch(page, /const tabs|activeTab|searchParams/);
  for (const removedTab of ["Assignments", "Campaigns", "Performance", "Activity", "Availability", "Settings"]) {
    assert.doesNotMatch(page, new RegExp(`>${removedTab}<`));
  }
  assert.match(service(), /assignFieldResources/);
});

test("installers: optional resource lookups do not become false access denial", () => {
  const source = service();
  assert.match(source, /async function workspace\(\) \{\s*return await resolveCustomerWorkspaceContext\(\);\s*\}/);
  assert.doesNotMatch(source.match(/async function workspace\(\)[\s\S]*?\n\}/)?.[0] ?? "", /CustomerWorkspaceRedirect|status:\s*401|does not currently have access/);
  assert.match(source, /Optional assignment metrics skipped/);
  assert.match(source, /return \{ agencyCampaigns: new Map<string, Set<string>>\(\), installerCampaigns: new Map<string, Set<string>>\(\), installerProjects: new Map<string, Set<string>>\(\), installerLocations: new Map<string, Set<string>>\(\), installerCompleted: new Map<string, number>\(\) \}/);
  assert.match(source, /Optional agency filter lookup skipped/);
  assert.match(source, /agencies: \(agencyResult\.data \?\? \[\]\)\.map/);
});

test("installers: home optional metrics and global search include field resources", () => {
  const homeService = readFileSync(new URL("../lib/workspace/customerAdmin.ts", import.meta.url), "utf8");
  const homePage = readFileSync(new URL("../app/workspace/admin/page.tsx", import.meta.url), "utf8");
  const search = readFileSync(new URL("../app/api/workspace/search/route.ts", import.meta.url), "utf8");
  assert.match(homeService, /Agency count lookup/);
  assert.match(homeService, /Installer count lookup/);
  assert.match(homePage, /Field readiness/);
  assert.match(search, /group: "Agencies"/);
  assert.match(search, /group: "Installers"/);
  assert.match(search, /\.eq\("client_id", workspace\.clientId\)/);
});

test("installers: no full home resolver or opening overlay is introduced", () => {
  const source = service() + client() + form();
  assert.doesNotMatch(source, /resolveCustomerWorkspaceHomeContext|Opening workspace\.\.\.|WorkspaceLoadingOverlay|router\.refresh\(/);
});

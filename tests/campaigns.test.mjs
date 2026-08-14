import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("campaigns: routes stay inside Customer Workspace", () => {
  const list = readFileSync(new URL("../app/workspace/admin/campaigns/page.tsx", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../app/workspace/admin/campaigns/[id]/page.tsx", import.meta.url), "utf8");
  const create = readFileSync(new URL("../app/workspace/admin/campaigns/new/page.tsx", import.meta.url), "utf8");
  assert.match(list + detail + create, /\/workspace\/admin\/campaigns/);
  assert.doesNotMatch(list + detail + create, /href="\/client|href="\/admin|router\.push\("\/client|router\.push\("\/admin/);
});

test("campaigns: list uses shared Customer Workspace context and redirect pages avoid duplicate workflows", () => {
  const list = readFileSync(new URL("../app/workspace/admin/campaigns/page.tsx", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../app/workspace/admin/campaigns/[id]/page.tsx", import.meta.url), "utf8");
  const create = readFileSync(new URL("../app/workspace/admin/campaigns/new/page.tsx", import.meta.url), "utf8");
  assert.match(list, /const workspace = await resolveCustomerWorkspaceContext\(\)/);
  assert.match(list, /getWorkspaceCampaignDashboard\([\s\S]*\}, workspace\)/);
  assert.match(create, /redirect\("\/workspace\/admin\/projects\/new"\)/);
  assert.doesNotMatch(create, /CampaignCreateWizard|getCampaignCreateOptions|Create campaigns through Projects|View Projects/);
  assert.match(detail, /const workspace = await resolveCustomerWorkspaceContext\(\)/);
  assert.match(detail, /getWorkspaceCampaign\(params\.id, workspace\)/);
  assert.match(detail, /redirect\(`\/workspace\/admin\/projects\/\$\{result\.campaign\.project_id\}`\)/);
  assert.doesNotMatch(detail, /CampaignActionsPanel|CampaignLocationsClient|const tabs = \[/);
});

test("campaigns: services accept resolved context without replacing shell redirects", () => {
  const service = readFileSync(new URL("../lib/workspace/campaigns.ts", import.meta.url), "utf8");
  const locations = readFileSync(new URL("../lib/workspace/campaignLocations.ts", import.meta.url), "utf8");
  assert.match(service, /async function workspace\(workspaceContext\?: CustomerWorkspaceContext\)/);
  assert.match(service, /return workspaceContext \?\? await resolveCustomerWorkspaceContext\(\)/);
  assert.match(service, /getWorkspaceCampaignDashboard\(filters: CampaignDashboardFilters = \{\}, workspaceContext\?: CustomerWorkspaceContext\)/);
  assert.match(service, /getWorkspaceCampaign\(campaignId: string, workspaceContext\?: CustomerWorkspaceContext\)/);
  assert.match(locations, /async function workspace\(workspaceContext\?: CustomerWorkspaceContext\)/);
  assert.match(locations, /getCampaignLocationDashboard\(campaignId: string, filters: CampaignLocationFilters = \{\}, workspaceContext\?: CustomerWorkspaceContext\)/);
  assert.doesNotMatch(service + locations, /Customer workspace access is required\.[\s\S]*status: 401/);
});

test("campaigns: API routes keep server-side context and do not accept browser tenant scope", () => {
  const route = readFileSync(new URL("../app/api/workspace/campaigns/route.ts", import.meta.url), "utf8");
  const detailRoute = readFileSync(new URL("../app/api/workspace/campaigns/[id]/route.ts", import.meta.url), "utf8");
  const locationRoute = readFileSync(new URL("../app/api/workspace/campaigns/[id]/locations/route.ts", import.meta.url), "utf8");
  assert.match(route + detailRoute + locationRoute, /CustomerWorkspaceRedirect/);
  assert.doesNotMatch(route + detailRoute + locationRoute, /clientId|workspaceId|organisationId|tenantId/);
  assert.match(route, /status: 410/);
  assert.match(route, /Create campaigns through Projects/);
  assert.match(detailRoute, /getWorkspaceCampaign\(params\.id\)/);
  assert.match(detailRoute, /updateWorkspaceCampaignStatus\(\{/);
  assert.match(locationRoute, /getCampaignLocationDashboard\(params\.id,/);
});

test("campaigns: Project campaign metadata is the primary Campaign Management model", () => {
  const service = readFileSync(new URL("../lib/workspace/campaigns.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/20260806020000_add_customer_workspace_campaigns.sql", import.meta.url), "utf8");
  const list = readFileSync(new URL("../app/workspace/admin/campaigns/page.tsx", import.meta.url), "utf8");
  assert.match(service.match(/export async function getWorkspaceCampaignDashboard[\s\S]*?return \{/)?.[0] ?? "", /from\("projects"\)/);
  assert.match(service, /from\("workspace_campaigns"\)/);
  assert.match(migration, /create table if not exists public\.workspace_campaigns/);
  assert.match(service, /function normalizeProjectCampaign/);
  assert.match(service, /compatibility_campaign_id: legacy\?\.id \|\| null/);
  assert.match(service, /kpis: \[\]/);
  assert.match(list, /Campaign Management/);
  assert.match(list, /Manage campaign details across your projects\./);
  assert.match(list, /\["Campaign", "Project", "Brand", "Status", "Target", "Start Date", "End Date", "Region \/ State", "Actions"\]/);
  assert.match(list, /Review \/ Edit/);
  assert.match(list, /\/workspace\/admin\/projects\/\$\{campaign\.project_id\}\/edit/);
  assert.doesNotMatch(list, /\/workspace\/admin\/projects\/\$\{campaign\.project_id\}`/);
  assert.doesNotMatch(list, /Total Campaigns|Draft<\/p>|Scheduled<\/p>|Paused<\/p>|Completed<\/p>|Archived<\/p>|Create Campaign|Create Project<\/Link>/);
});

test("campaigns: workspace_campaigns is retained as compatibility assignment anchor", () => {
  const service = readFileSync(new URL("../lib/workspace/campaigns.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/20260806020000_add_customer_workspace_campaigns.sql", import.meta.url), "utf8");
  assert.match(service, /ensureWorkspaceCampaignCompatibilityAnchor/);
  assert.match(service, /Complete project campaign dates and deployment target before assigning locations\./);
  assert.doesNotMatch(service, /workspace_campaigns"[\s\S]*projects\(id,project_name,start_date,end_date\)/);
  assert.match(migration, /constraint workspace_campaigns_project_client_fk/);
  assert.match(migration, /foreign key \(project_id, client_id\)/);
  assert.match(migration, /references public\.projects\(id, client_id\)/);
  assert.match(migration, /project_id uuid not null references public\.projects\(id\)/);
});

test("campaigns: project display name uses runtime projects.name column with project_name UI alias", () => {
  const service = readFileSync(new URL("../lib/workspace/campaigns.ts", import.meta.url), "utf8");
  const projectService = readFileSync(new URL("../lib/core/projects/service.ts", import.meta.url), "utf8");
  const searchRoute = readFileSync(new URL("../app/api/workspace/search/route.ts", import.meta.url), "utf8");
  const executionService = readFileSync(new URL("../lib/workspace/deploymentExecution.ts", import.meta.url), "utf8");
  assert.match(projectService, /name: text\(input\.projectName\)/);
  assert.doesNotMatch(projectService.match(/export function buildCoreProjectInsertPayload[\s\S]*?\n\}/)?.[0] ?? "", /project_name: text\(input\.projectName\)/);
  assert.match(service, /\.select\("id,client_id,project_name:name,campaign_name:campaign,brand_name:brand,status,start_date,end_date,regions_covered,target_quantity,assigned_installers,primary_target_region,primary_target_state,archived_at,created_at"\)/);
  assert.match(searchRoute, /\.select\("id,project_name:name,status"\)/);
  assert.match(searchRoute, /\.ilike\("name", pattern\)/);
  assert.match(executionService, /projects\(project_name:name\)/);
  assert.match(service, /projectName: project\.project_name/);
});

test("campaigns: create options do not select nonexistent projects.project_type", () => {
  const service = readFileSync(new URL("../lib/workspace/campaigns.ts", import.meta.url), "utf8");
  const newPage = readFileSync(new URL("../app/workspace/admin/campaigns/new/page.tsx", import.meta.url), "utf8");
  const projectSelects = [...service.matchAll(/\.from\("projects"\)[\s\S]*?\.select\("([^"]+)"\)/g)].map((match) => match[1]);
  assert.ok(projectSelects.length >= 2);
  assert.ok(projectSelects.every((selection) => !selection.split(",").map((field) => field.trim()).includes("project_type")));
  assert.match(service, /function normalizeCampaignProjectOption/);
  assert.match(service, /CUSTOMER_CAMPAIGN_DEPLOYMENT_TYPES\.includes\(projectType as ProjectType\)/);
  assert.match(service, /: "Retail Deployment"/);
  assert.match(newPage, /redirect\("\/workspace\/admin\/projects\/new"\)/);
  assert.doesNotMatch(newPage, /CampaignCreateWizard|Review & Create|Campaign Details|DeployIQ manages campaign identity|View Projects/);
  assert.doesNotMatch(readFileSync(new URL("../app/api/workspace/campaigns/route.ts", import.meta.url), "utf8"), /createWorkspaceCampaign\(body\)/);
});

test("campaigns: active UX has no Campaign Detail application tabs or actions", () => {
  const detail = readFileSync(new URL("../app/workspace/admin/campaigns/[id]/page.tsx", import.meta.url), "utf8");
  const list = readFileSync(new URL("../app/workspace/admin/campaigns/page.tsx", import.meta.url), "utf8");
  const searchRoute = readFileSync(new URL("../app/api/workspace/search/route.ts", import.meta.url), "utf8");
  assert.match(detail, /redirect\(`\/workspace\/admin\/projects\/\$\{result\.campaign\.project_id\}`\)/);
  assert.doesNotMatch(detail, /Overview|Deployment Locations|Team|Submissions|Reports|Analytics|Activity|Settings|Campaign Readiness|Launch \/ Activate|Delete Draft/);
  assert.doesNotMatch(list, /\/workspace\/admin\/campaigns\/\$\{campaign\.id\}/);
  assert.match(list, /\/workspace\/admin\/projects\/\$\{campaign\.project_id\}\/edit/);
  assert.match(searchRoute, /href: safeHref\(`\/workspace\/admin\/projects\/\$\{text\(assignment\.project_id\)\}`\)/);
  assert.doesNotMatch(searchRoute, /tab=Deployment%20Locations/);
});

test("campaigns: Review Edit opens canonical Project edit form directly", () => {
  const list = readFileSync(new URL("../app/workspace/admin/campaigns/page.tsx", import.meta.url), "utf8");
  const editPage = readFileSync(new URL("../app/workspace/admin/projects/[id]/edit/page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("../components/workspace/ProjectCreateWizard.tsx", import.meta.url), "utf8");
  const projectRoute = readFileSync(new URL("../app/api/workspace/projects/[id]/route.ts", import.meta.url), "utf8");
  const projectService = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");

  assert.match(list, /Review \/ Edit/);
  assert.match(list, /\/workspace\/admin\/projects\/\$\{campaign\.project_id\}\/edit/);
  assert.match(editPage, /ProjectEditForm/);
  assert.match(editPage, /getCustomerProject\(params\.id\)/);
  assert.doesNotMatch(editPage, /organisationName|workspaceName|clientCompanyName/);
  assert.match(form, /Campaign Management/);
  assert.match(form, /Review \/ Edit Project/);
  assert.match(form, /Review project and campaign details, make any required changes, then save\./);
  assert.match(form, /Save Changes/);
  assert.match(form, /Cancel/);
  assert.match(form, /router\.push\(isEdit \? "\/workspace\/admin\/campaigns"/);
  assert.doesNotMatch(form, /Client Company|canonical projects\.campaign|workspace membership/);
  assert.match(form, /const projectStatuses = \["Planning", "Active", "On Hold", "Completed"\] as const/);
  assert.match(form, /status: form\.status/);
  assert.match(projectRoute, /updateCustomerProjectDetails/);
  assert.match(projectService, /updateCoreProject/);
  assert.match(projectService, /campaignName: input\.campaignName/);
  assert.match(projectService, /status: projectWriteStatus\(input\.status \|\| existing\.project\.status\)/);
  assert.match(projectService, /\.from\("agencies"\)\.select\("id,agency_name"\)/);
  assert.match(projectService, /\.from\("installers"\)\.select\("id,installer_name"\)/);
  assert.doesNotMatch(projectService.match(/export async function updateCustomerProjectDetails[\s\S]*?return summarizeProject/)?.[0] ?? "", /workspace_campaigns|createWorkspaceCampaign|updateWorkspaceCampaign|project_targets|agency_name/);
  assert.doesNotMatch(editPage + projectRoute, /ProjectActionsPanel|Continue Setup|View Reports|View Submissions|View Analytics|View Deployment Map/);
});

test("campaigns: launch readiness now requires real assigned campaign locations", () => {
  const service = readFileSync(new URL("../lib/workspace/campaigns.ts", import.meta.url), "utf8");
  assert.match(service, /from\("workspace_campaign_locations"\)/);
  assert.match(service, /assignedLocationCount/);
  assert.match(service, /label: "Deployment locations assigned"[\s\S]*category: "Required before launch"/);
  assert.doesNotMatch(service, /campaign\.deployment_location_ids\.length > 0, category: "Recommended"/);
});

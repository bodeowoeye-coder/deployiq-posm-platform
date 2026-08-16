import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isLegacyProvisioningPlaceholderProject } from "../lib/projects.ts";

test("projects: legacy provisioning placeholder is identified by its full legacy shape", () => {
  assert.equal(isLegacyProvisioningPlaceholderProject({
    name: "Getting Started",
    campaign: "Getting Started",
    target_quantity: 0,
    status: "Planning",
    start_date: null,
    end_date: null,
    brand: null,
    brand_id: null,
    regions_covered: [],
    assigned_installers: [],
  }), true);
  assert.equal(isLegacyProvisioningPlaceholderProject({
    name: "Getting Started",
    campaign: "Live Campaign",
    target_quantity: 10,
    status: "Planning",
    start_date: "2026-08-15",
    end_date: null,
    brand: "Darling",
    brand_id: null,
    regions_covered: ["Lagos"],
    assigned_installers: [],
  }), false);
});

test("projects: Customer Workspace project list displays required dashboard controls", () => {
  const page = readFileSync(new URL("../app/workspace/admin/projects/page.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");
  for (const label of [
    "Total Projects",
    "Active Projects",
    "Completed Projects",
    "Planning Projects",
    "On Hold Projects",
    "Archived Projects",
    "Upcoming Launches",
  ]) {
    assert.match(service, new RegExp(label));
  }
  for (const label of [
    "Project Name",
    "Product",
    "Campaign",
    "Deployment Type",
    "States",
    "Progress",
    "Status",
    "Created",
    "Last Updated",
    "Actions",
  ]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /Search/);
  assert.match(page, /Sort/);
  assert.match(service, /pageSize/);
  assert.match(page, /No projects yet\./);
  assert.match(page, /Create your first project to begin managing deployments\./);
});

test("projects: Customer Workspace create form mirrors Core Admin simplicity without tenant controls", () => {
  const wizard = readFileSync(new URL("../components/workspace/ProjectCreateWizard.tsx", import.meta.url), "utf8");
  for (const field of [
    "Project Name",
    "Campaign Name",
    "Brand / Multi-brand",
    "Target Quantity",
    "Status",
    "Start Date",
    "Expected End Date",
    "Regions",
    "States",
    "Assigned Agency",
    "Lead Installer",
  ]) {
    assert.match(wizard, new RegExp(field));
  }
  assert.doesNotMatch(wizard, /Client Company|clientCompanyName|workspace membership/);
  assert.doesNotMatch(wizard, /name="clientId"|body: JSON\.stringify\(\{[\s\S]*clientId/);
  assert.doesNotMatch(wizard, /const steps = \[/);
  assert.doesNotMatch(wizard, /Upload CSV \/ Excel|DirectoryImportClient|getWorkspaceDirectoryDashboard/);
});

test("projects: Customer Workspace edit form reuses Create Project fields and saves back to Campaign Management", () => {
  const editPage = readFileSync(new URL("../app/workspace/admin/projects/[id]/edit/page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("../components/workspace/ProjectCreateWizard.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/workspace/projects/[id]/route.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");

  assert.match(editPage, /getCustomerProject\(params\.id\)/);
  assert.match(editPage, /ProjectEditForm/);
  for (const field of ["Project Name", "Campaign Name", "Brand / Multi-brand", "Target Quantity", "Start Date", "Expected End Date", "Region", "State", "Status"]) {
    assert.match(form, new RegExp(field));
  }
  assert.doesNotMatch(form, /Client Company|clientCompanyName/);
  assert.match(form, /name="agencyId"/);
  assert.match(form, /name="installerId"/);
  assert.match(form, /const projectStatuses = \["Planning", "Active", "On Hold", "Completed"\] as const/);
  assert.match(form, /value=\{form\.status\}/);
  assert.match(form, /status: form\.status/);
  assert.match(form, /Save Changes/);
  assert.match(form, /Cancel/);
  assert.match(form, /fetch\(isEdit \? `\/api\/workspace\/projects\/\$\{project\?\.id\}`/);
  assert.match(form, /router\.push\("\/workspace\/admin\/campaigns"\)/);
  assert.doesNotMatch(form, /name="clientId"|body: JSON\.stringify\(\{[\s\S]*clientId/);
  assert.match(route, /PATCH/);
  assert.match(route, /updateCustomerProjectDetails/);
  assert.match(route, /code: errorCode\(error\)/);
  assert.match(service, /const existing = await getCustomerProject\(projectId\)/);
  assert.match(service, /campaignName: input\.campaignName/);
  assert.match(service, /status: projectWriteStatus\(input\.status \|\| existing\.project\.status\)/);
  assert.doesNotMatch(service.match(/export async function updateCustomerProjectDetails[\s\S]*?return summarizeProject/)?.[0] ?? "", /workspace_campaigns/);
});

test("projects: status dropdown uses canonical Customer Workspace project statuses", () => {
  const form = readFileSync(new URL("../components/workspace/ProjectCreateWizard.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  assert.match(schema, /status text not null default 'Planning' check \(status in \('Planning', 'Active', 'On Hold', 'Completed', 'Not Started', 'In Progress', 'Delayed', 'Cancelled'\)\)/);
  assert.match(form, /const projectStatuses = \["Planning", "Active", "On Hold", "Completed"\] as const/);
  assert.match(form, /status: "Planning"/);
  assert.match(form, /statusFor\(project\.status\)/);
  assert.match(service, /function projectWriteStatus/);
  assert.match(service, /\["Planning", "Active", "On Hold", "Completed"\]\.includes\(status\)/);
  assert.match(service, /status: projectWriteStatus\(input\.status\)/);
  assert.match(service, /status: projectWriteStatus\(input\.status \|\| existing\.project\.status\)/);
});

test("projects: edit form prepopulates brand status and geography without blanking existing values", () => {
  const form = readFileSync(new URL("../components/workspace/ProjectCreateWizard.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");
  assert.match(form, /brandName: \(project\.brand\?\.brand_name \?\? String\(\(project as Record<string, unknown>\)\.brand \?\? ""\)\) \|\| "Multi-brand"/);
  // Legacy single-value projects still read back through the multi-value model.
  const geography = readFileSync(new URL("../lib/geography.ts", import.meta.url), "utf8");
  assert.match(geography, /export function selectionFromProject/);
  assert.match(geography, /const states = normalizeStates\(\[\.\.\.\(project\.regions_covered \?\? \[\]\), project\.primary_target_state \?\? ""\]\)/);
  assert.match(geography, /regions: deriveProjectRegions\(\{ states, storedRegions: \[\.\.\.\(project\.project_regions \?\? \[\]\), project\.primary_target_region \?\? ""\] \}\)/);
  assert.match(form, /const selection = selectionFromProject\(project\)/);
  assert.match(form, /targetRegions: selection\.regions/);
  assert.match(form, /targetStates: selection\.states/);
  assert.match(form, /status: statusFor\(project\.status\)/);
  assert.match(service, /const submittedStates = normalizeStates\(textArray\(input\.states\)\)/);
  assert.match(service, /const submittedRegions = normalizeRegions\(textArray\(input\.regions\)\)/);
  assert.match(service, /const states = submittedStates\.length > 0 \? submittedStates : normalizeStates\(existing\.project\.regions_covered \?\? \[\]\)/);
});

test("projects: geography is multi-region and multi-state end to end", () => {
  const form = readFileSync(new URL("../components/workspace/ProjectCreateWizard.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");
  const geography = readFileSync(new URL("../lib/geography.ts", import.meta.url), "utf8");

  // Canonical geography is reused; no free text.
  assert.match(geography, /export function deriveProjectRegions/);
  assert.match(geography, /export function normalizeRegions/);
  assert.match(geography, /export function normalizeStates/);
  assert.match(geography, /\.filter\(isCanonicalRegion\)/);
  assert.match(geography, /\.filter\(isCanonicalState\)/);

  // Multi-value UI replaces the single selects in both Create and Edit (one shared form component).
  assert.match(form, /function MultiGeographyPicker/);
  assert.match(form, /targetRegions: string\[\]/);
  assert.match(form, /targetStates: string\[\]/);
  assert.match(form, /addLabel="Add region"/);
  assert.match(form, /addLabel="Add state"/);
  assert.match(form, /aria-label=\{`Remove \$\{value\}`\}/);
  assert.doesNotMatch(form, /Select region<\/option>|Select state<\/option>/);
  assert.doesNotMatch(form, /Primary Target Region|Primary Target State/);

  // A composite control must not be wrapped in a <label>: the label re-dispatches the click to the
  // nested <select>, which reopens and immediately closes it, making the picker unusable.
  assert.match(form, /function FieldGroup\(\{ label, htmlFor, children, hint \}/);
  assert.match(form, /<label htmlFor=\{htmlFor\}>\{label\}<\/label>/);
  assert.match(form, /<FieldGroup label="Regions" htmlFor="regions-picker"/);
  assert.match(form, /<FieldGroup label="States" htmlFor="states-picker"/);
  assert.doesNotMatch(form, /<Field label="Regions">|<Field label="States">/);
  assert.match(form, /id=\{`\$\{name\}-picker`\}/);

  // Form state changes are delegated to the canonical geography state machine.
  assert.match(form, /addRegionToSelection\(selection, region\)/);
  assert.match(form, /removeRegionFromSelection\(selection, region\)/);
  assert.match(form, /addStateToSelection\(selection, state\)/);
  assert.match(form, /removeStateFromSelection\(selection, state\)/);
  assert.match(form, /visibleStatesFor\(\{ regions: form\.targetRegions, states: form\.targetStates \}\)/);
  assert.match(form, /selectionFromProject\(project\)/);

  // Every selected value is submitted, not just the first.
  assert.match(form, /regions: form\.targetRegions/);
  assert.match(form, /states: form\.targetStates/);

  // Detail read model returns full coverage, not the first value.
  assert.match(service, /states: normalizeStates\(normalized\.regions_covered \?\? \[\]\)/);
  assert.match(service, /regions: deriveProjectRegions\(\{/);
  assert.doesNotMatch(service, /regions: \[text\(\(normalized as Record<string, unknown>\)\.primary_target_region\)\]\.filter\(Boolean\)/);
});

test("projects: downstream filters derive options from all configured project geography", () => {
  const analytics = readFileSync(new URL("../lib/workspace/analytics.ts", import.meta.url), "utf8");
  const analyticsClient = readFileSync(new URL("../components/workspace/WorkspaceAnalyticsClient.tsx", import.meta.url), "utf8");
  const reportsClient = readFileSync(new URL("../components/workspace/WorkspaceReportsClient.tsx", import.meta.url), "utf8");
  const team = readFileSync(new URL("../lib/workspace/team.ts", import.meta.url), "utf8");

  assert.match(analytics, /projects\.flatMap\(\(project\) => deriveProjectRegions\(/);
  assert.match(analytics, /projects\.flatMap\(\(project\) => \[\.\.\.\(project\.regions_covered \?\? \[\]\), project\.primary_target_state \?\? ""\]\)/);
  assert.match(analyticsClient, /selectedProject\.regions_covered \?\? \[\]/);
  assert.match(reportsClient, /selectedProject\.regions_covered \?\? \[\]/);
  // User Management territory options cover every project region.
  assert.match(team, /projectRows\.flatMap\(\(project\) => deriveProjectRegions\(/);
});

test("projects: resource assignment is tenant scoped and uses project-level canonical columns", () => {
  const service = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");
  const fieldResources = readFileSync(new URL("../lib/workspace/fieldResources.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/20260815000000_add_project_resource_and_region_columns.sql", import.meta.url), "utf8");

  // Migration is additive only and keeps workspace_field_assignments campaign-scoped.
  assert.match(migration, /add column if not exists agency_id uuid references public\.agencies\(id\) on delete set null/);
  assert.match(migration, /add column if not exists lead_installer_id uuid references public\.installers\(id\) on delete set null/);
  assert.match(migration, /add column if not exists project_regions text\[\] not null default '\{\}'/);
  assert.doesNotMatch(migration, /alter column campaign_id drop not null/);
  assert.doesNotMatch(migration, /drop column|rename column|delete from|truncate/i);

  // Project-level configuration is written to projects, never duplicated into field assignments.
  assert.match(service, /async function persistProjectConfiguration/);
  assert.match(service, /agency_id: text\(input\.agencyId\) \|\| null/);
  assert.match(service, /lead_installer_id: text\(input\.installerId\) \|\| null/);
  assert.match(service, /project_regions: input\.regions/);
  assert.doesNotMatch(service, /\.from\("workspace_field_assignments"\)\s*\.insert\(/);

  // Read-back uses the same canonical columns through tenant-scoped lookups.
  assert.match(service, /const agencyId = text\(project\.agency_id\) \|\| null/);
  assert.match(service, /const installerId = text\(project\.lead_installer_id\) \|\| null/);
  assert.match(service, /\.from\("agencies"\)\.select\("id,agency_name"\)[\s\S]{0,140}\.eq\("client_id", workspace\.clientId\)/);
  assert.match(service, /\.from\("installers"\)\.select\("id,installer_name"\)[\s\S]{0,140}\.eq\("client_id", workspace\.clientId\)/);

  // One shared guard runs on both create and update.
  assert.match(service, /async function assertProjectResourcesOwned/);
  assert.equal((service.match(/await assertProjectResourcesOwned\(supabase, resolvedWorkspace, input\)/g) ?? []).length, 2);
  assert.match(service, /\.from\("agencies"\)\.select\("id"\)[\s\S]{0,200}\.eq\("client_id", workspace\.clientId\)/);
  assert.match(service, /if \(installerId\) await assertInstallerAssignable\(workspace\.clientId, installerId\)/);

  // Lead Installer eligibility reuses the single User Management installer model.
  assert.match(fieldResources, /export async function assertInstallerAssignable/);
  assert.match(fieldResources, /\.eq\("client_id", clientId\)\s*\.eq\("workspace_id", clientId\)/);
  assert.match(fieldResources, /installerMembershipStatuses\(clientId, \[text\(data\.user_id\)\]\)/);
  assert.match(fieldResources, /if \(!eligibility\.assignable\) throw Object\.assign\(new Error\(eligibility\.reason\), \{ status: 409 \}\)/);
});

test("projects: project_regions is the canonical multi-region store with legacy fallback", () => {
  const service = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");
  const form = readFileSync(new URL("../components/workspace/ProjectCreateWizard.tsx", import.meta.url), "utf8");
  const types = readFileSync(new URL("../lib/types.ts", import.meta.url), "utf8");
  const analytics = readFileSync(new URL("../lib/workspace/analytics.ts", import.meta.url), "utf8");
  const team = readFileSync(new URL("../lib/workspace/team.ts", import.meta.url), "utf8");

  assert.match(types, /project_regions\?: string\[\] \| null/);
  assert.match(types, /agency_id\?: string \| null/);
  assert.match(types, /lead_installer_id\?: string \| null/);

  // Detail read prefers project_regions and still falls back to legacy single values.
  assert.match(service, /\(project as Row\)\.project_regions as string\[\]/);
  assert.match(service, /text\(\(normalized as Record<string, unknown>\)\.primary_target_region\)/);
  // Edit restores from project_regions plus the legacy fallback.
  const geographyModule = readFileSync(new URL("../lib/geography.ts", import.meta.url), "utf8");
  assert.match(geographyModule, /storedRegions: \[\.\.\.\(project\.project_regions \?\? \[\]\), project\.primary_target_region \?\? ""\]/);
  assert.match(form, /selectionFromProject\(project\)/);
  // Downstream options read the canonical column too.
  assert.match(analytics, /\.\.\.\(project\.project_regions \?\? \[\]\)/);
  assert.match(team, /project\.project_regions as string\[\]/);
});

test("projects: edit PATCH persists canonical fields only and reports safe diagnostics", () => {
  const route = readFileSync(new URL("../app/api/workspace/projects/[id]/route.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");
  const coreService = readFileSync(new URL("../lib/core/projects/service.ts", import.meta.url), "utf8");
  assert.match(route, /export async function PATCH/);
  for (const field of ["projectName", "campaignName", "brandName", "status", "expectedDeploymentQuantity", "regions", "states", "startDate", "expectedEndDate"]) {
    assert.match(route, new RegExp(`${field}: body\\.${field}`));
  }
  assert.doesNotMatch(route, /body\.clientId|body\.workspaceId|body\.compatibility/);
  assert.match(service, /campaignName: input\.campaignName/);
  assert.match(service, /targetQuantity/);
  assert.match(service, /targetRegion/);
  assert.match(service, /targetState/);
  assert.match(coreService, /delete \(payload as Row\)\.client_id/);
  assert.match(route, /diagnosticFor\(error\)/);
  assert.match(route, /code: errorCode\(error\)/);
  const updateBlock = service.match(/export async function updateCustomerProjectDetails[\s\S]*?return summarizeProject/)?.[0] ?? "";
  assert.match(updateBlock, /updateCoreProject/);
  assert.match(updateBlock, /const \{ data: persistedProject, error: persistedProjectError \} = await supabase/);
  assert.match(updateBlock, /\.eq\("id", projectId\)[\s\S]*\.eq\("client_id", resolvedWorkspace\.clientId\)[\s\S]*\.single\(\)/);
  assert.match(service, /return summarizeProject\(normalizeProjectRecord\(persistedProject\) as Project, resolvedWorkspace, 0\)/);
  assert.doesNotMatch(updateBlock, /project_targets|agency_name|insert\(|upsert\(/);
  assert.doesNotMatch(coreService.match(/project_targets"\)\.insert\(\{[\s\S]*?\}\)/)?.[0] ?? "", /agency_name/);
});

test("projects: review edit shows tenant-scoped editable resource selectors", () => {
  const form = readFileSync(new URL("../components/workspace/ProjectCreateWizard.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");
  const editPage = readFileSync(new URL("../app/workspace/admin/projects/[id]/edit/page.tsx", import.meta.url), "utf8");
  assert.match(service, /\.from\("workspace_field_assignments"\)/);
  assert.match(service, /\.eq\("client_id", resolvedWorkspace\.clientId\)/);
  assert.match(service, /\.eq\("workspace_id", workspace\.clientId\)/);
  assert.match(service, /\.eq\("project_id", projectId\)/);
  assert.match(service, /\.from\("agencies"\)\.select\("id,agency_name"\)/);
  assert.match(service, /\.from\("installers"\)\.select\("id,installer_name"\)/);
  assert.match(editPage, /resources=\{\{ \.\.\.result\.resources, agencies:/);
  assert.match(form, /resources\?\.agencies/);
  assert.match(form, /resources\?\.installers/);
  assert.match(form, /No agency assigned/);
  assert.match(form, /No lead installer assigned/);
  assert.doesNotMatch(form, /No agency assigned yet|No lead installer assigned yet/);
  assert.doesNotMatch(form, /Manage in Field Resources|Field Resources after project creation/);
});

test("projects: Customer Workspace service resolves tenant from authenticated membership only", () => {
  const service = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");
  const coreService = readFileSync(new URL("../lib/core/projects/service.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/workspace/projects/route.ts", import.meta.url), "utf8");
  assert.match(service, /resolveCustomerWorkspaceContext/);
  assert.match(service, /\.eq\("client_id", resolvedWorkspace\.clientId\)/);
  assert.match(service, /clientId: resolvedWorkspace\.clientId/);
  assert.match(coreService, /client_id: clientId/);
  assert.doesNotMatch(route, /clientId/);
  const createInput = service.match(/export type CreateCustomerProjectInput = \{[\s\S]*?\};/)?.[0] ?? "";
  assert.doesNotMatch(createInput, /clientId/);
  assert.doesNotMatch(route, /searchParams\.get\("clientId"\)|body\.clientId/);
});

test("projects: Customer Workspace reuses Core validation normalization notifications and project engine", () => {
  const service = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");
  const coreService = readFileSync(new URL("../lib/core/projects/service.ts", import.meta.url), "utf8");
  const legacyRoute = readFileSync(new URL("../app/api/projects/route.ts", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../app/workspace/admin/projects/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(coreService, /validateProjectHierarchyInput/);
  assert.match(coreService, /export async function createCoreProject/);
  assert.match(coreService, /export async function updateCoreProject/);
  assert.match(service, /createCoreProject/);
  assert.match(legacyRoute, /createCoreProject/);
  assert.match(legacyRoute, /updateCoreProject/);
  assert.match(service, /normalizeProjectRecord/);
  assert.match(service, /normalizeProjectRecords/);
  assert.match(coreService, /deployment_progress/);
  assert.match(coreService, /project_targets/);
  assert.match(coreService, /client_projects/);
  assert.match(service, /notification_events/);
  assert.match(detail, /PROJECT DETAILS/);
  assert.match(detail, /Open Shared Modules/);
});

test("projects: Core insert payload uses only canonical public.projects fields", () => {
  const coreService = readFileSync(new URL("../lib/core/projects/service.ts", import.meta.url), "utf8");
  const insertColumns = coreService.match(/CORE_PROJECT_INSERT_COLUMNS = \[[\s\S]*?\] as const;/)?.[0] ?? "";
  const payload = coreService.match(/return \{[\s\S]*?\n  \};\n\}\n\nfunction projectPayload/)?.[0] ?? "";
  for (const field of [
    "client_id",
    "name",
    "brand",
    "brand_id",
    "campaign",
    "target_quantity",
    "status",
    "regions_covered",
    "assigned_installers",
    "primary_target_region",
    "primary_target_state",
    "start_date",
    "end_date",
    "planned_completion",
    "actual_completion",
  ]) {
    assert.match(insertColumns, new RegExp(`"${field}"`));
    assert.match(payload, new RegExp(`${field}:`));
  }
  for (const invalid of [
    "business_unit_id",
    "portfolio_id",
    "project_name",
    "campaign_name",
    "project_type",
    "project_code",
    "client_project_reference",
    "project_manager",
    "site_supervisor",
    "consultant",
    "contractor",
    "budget",
    "currency",
    "expected_installations",
    "states",
    "cities",
    "priority",
    "objectives",
    "supervisors",
    "managers",
    "agencies",
    "working_days",
    "milestones",
    "time_zone",
    "workspace_id",
    "product_key"
  ]) {
    assert.doesNotMatch(payload, new RegExp(`\\b${invalid}:`));
  }
});

test("projects: unsupported metadata and finance fields cannot leak into public.projects writes", () => {
  const coreService = readFileSync(new URL("../lib/core/projects/service.ts", import.meta.url), "utf8");
  const builder = coreService.match(/export function buildCoreProjectInsertPayload[\s\S]*?\n\}/)?.[0] ?? "";
  for (const unsupported of [
    "budget",
    "currency",
    "business_unit_id",
    "portfolio_id",
    "project_name",
    "campaign_name",
    "project_type",
    "project_code",
    "client_project_reference",
    "project_manager",
    "site_supervisor",
    "consultant",
    "contractor"
  ]) {
    assert.doesNotMatch(builder, new RegExp(`\\b${unsupported}\\b`));
  }
  assert.match(builder, /planned_completion: text\(input\.plannedCompletion\) \|\| null/);
  assert.match(builder, /actual_completion: text\(input\.actualCompletion\) \|\| null/);
  assert.match(coreService, /console\.info\("\[core-project-write\]", \{ insertKeys: Object\.keys\(payload\) \}\)/);
});

test("projects: Core insert builder maps UI aliases to runtime projects columns", () => {
  const coreService = readFileSync(new URL("../lib/core/projects/service.ts", import.meta.url), "utf8");
  const builder = coreService.match(/export function buildCoreProjectInsertPayload[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(builder, /name: text\(input\.projectName\)/);
  assert.match(builder, /campaign: text\(input\.campaignName\) \|\| null/);
  assert.match(builder, /brand: text\(input\.brand\) \|\| text\(input\.brandName\) \|\| null/);
  assert.match(builder, /brand_id: text\(input\.brandId\) \|\| null/);
  assert.doesNotMatch(builder, /projectName[\s\S]*project_name/);
  assert.doesNotMatch(builder, /campaignName[\s\S]*campaign_name/);
});

test("projects: Core insert keys are guarded by the runtime projects allowlist", () => {
  const coreService = readFileSync(new URL("../lib/core/projects/service.ts", import.meta.url), "utf8");
  const insertColumns = [...coreService.matchAll(/"([a-z_]+)"/g)]
    .map((match) => match[1])
    .filter((key) => [
      "client_id",
      "name",
      "brand",
      "brand_id",
      "campaign",
      "target_quantity",
      "status",
      "regions_covered",
      "assigned_installers",
      "primary_target_region",
      "primary_target_state",
      "start_date",
      "end_date",
      "planned_completion",
      "actual_completion",
    ].includes(key));
  const allowed = new Set(insertColumns);
  const builder = coreService.match(/export function buildCoreProjectInsertPayload[\s\S]*?\n\}/)?.[0] ?? "";
  const keys = [...builder.matchAll(/\n\s+([a-z_]+):/g)].map((match) => match[1]);
  assert.ok(keys.length > 0);
  for (const key of keys) {
    assert.ok(allowed.has(key), `${key} must be in CORE_PROJECT_INSERT_COLUMNS`);
  }
});

test("projects: PGRST diagnostics preserve Supabase object error fields", () => {
  const route = readFileSync(new URL("../app/api/workspace/projects/route.ts", import.meta.url), "utf8");
  assert.match(route, /function diagnosticFor/);
  for (const field of ["message", "code", "details", "hint", "status", "statusCode"]) {
    assert.match(route, new RegExp(`${field}:`));
  }
  assert.match(route, /console\.error\("\[workspace-projects\]", scope, diagnosticFor\(error\)\)/);
  assert.doesNotMatch(route, /message: error instanceof Error \? error\.message : String\(error\)/);
});

test("projects: status engine supports required Customer Workspace statuses", () => {
  const service = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");
  assert.match(service, /CUSTOMER_PROJECT_STATUSES = \["Planning", "Active", "On Hold", "Completed", "Archived", "Cancelled"\]/);
  assert.match(service, /projectStatus/);
  assert.match(service, /Planning/);
  assert.match(service, /On Hold/);
  assert.match(service, /archived_at/);
});

test("projects: launch readiness prevents launch when required inputs are missing", () => {
  const service = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../app/workspace/admin/projects/[id]/page.tsx", import.meta.url), "utf8");
  const actions = readFileSync(new URL("../components/workspace/ProjectActionsPanel.tsx", import.meta.url), "utf8");
  for (const label of [
    "Project configured",
    "Deployment Directory Ready",
    "Campaign metadata added",
    "Installer assignments available",
    "Geography defined",
    "Deployment target defined",
    "Timeline completed",
  ]) {
    assert.match(service, new RegExp(label));
  }
  assert.doesNotMatch(service, /Deployment locations available/);
  assert.match(service, /from\("workspace_field_assignments"\)/);
  assert.match(service, /assignedResourceCount: assignedResources \?\? 0/);
  assert.match(service, /Launch is available when the project has the required operational data/);
  assert.doesNotMatch(detail, /Status & Readiness/);
  assert.doesNotMatch(detail, /Needs attention/);
  assert.match(actions, /aria-disabled/);
  assert.match(actions, /Launch is available when the project has the required operational data/);
});

test("projects: draft creation validation is lighter than launch readiness", () => {
  const wizard = readFileSync(new URL("../components/workspace/ProjectCreateWizard.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");
  assert.match(wizard, /const missingFields = useMemo/);
  assert.match(wizard, /Project Name/);
  assert.match(wizard, /Target Quantity/);
  assert.doesNotMatch(wizard.match(/const missingFields = useMemo\(\(\) => \{[\s\S]*?\}, \[[\s\S]*?\]\);/)?.[0] ?? "", /Deployment Coverage|Schedule|Deployment Directory|Field Resources/);
  assert.doesNotMatch(wizard, /Continue setup from Project Details/);
  assert.match(wizard, /No agency assigned/);
  assert.match(wizard, /No lead installer assigned/);
  assert.match(service, /if \(!projectName\)/);
  assert.match(service, /if \(targetQuantity <= 0\)/);
  assert.doesNotMatch(service.match(/export async function createCustomerProject[\s\S]*?const supabase = createAdminSupabase/)?.[0] ?? "", /directoryRecords|hasInstallers|startDate && endDate/);
});

test("projects: create flow verifies canonical tenant row and does not block on optional setup writes", () => {
  const service = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");
  const coreService = readFileSync(new URL("../lib/core/projects/service.ts", import.meta.url), "utf8");
  const createBlock = service.match(/export async function createCustomerProject[\s\S]*?return summarizeProject/)?.[0] ?? "";
  assert.match(createBlock, /createCoreProject/);
  assert.match(createBlock, /const \{ data: persistedProject, error: persistedProjectError \} = await supabase/);
  assert.match(createBlock, /\.eq\("id", project\.id\)[\s\S]*\.eq\("client_id", resolvedWorkspace\.clientId\)[\s\S]*\.is\("archived_at", null\)[\s\S]*\.single\(\)/);
  assert.match(service, /return summarizeProject\(normalizeProjectRecord\(persistedProject\) as Project, resolvedWorkspace, 0\)/);
  assert.match(coreService, /Promise\.allSettled/);
  assert.match(coreService, /Optional project setup skipped/);
  assert.doesNotMatch(coreService.match(/project_targets"\)\.insert\(\{[\s\S]*?\}\)/)?.[0] ?? "", /agency_name/);
});

test("projects: create page has one primary Create Project title", () => {
  const page = readFileSync(new URL("../app/workspace/admin/projects/new/page.tsx", import.meta.url), "utf8");
  const wizard = readFileSync(new URL("../components/workspace/ProjectCreateWizard.tsx", import.meta.url), "utf8");
  assert.match(page, /<h2 className="mt-2 text-2xl font-bold text-slate-950">Create Project<\/h2>/);
  assert.match(page, /Create the canonical project and its initial campaign information for this workspace\./);
  assert.equal((page.match(/Create Project/g) ?? []).length, 1);
  assert.doesNotMatch(wizard, /: "Create Project"/);
  assert.doesNotMatch(wizard, /Project setup/);
  assert.match(wizard, /"Create"\)/);
});

test("projects: review and post-create journey are operational setup focused", () => {
  const wizard = readFileSync(new URL("../components/workspace/ProjectCreateWizard.tsx", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../app/workspace/admin/projects/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(wizard, /Project Summary/);
  assert.match(wizard, /sm:grid-cols-2 lg:grid-cols-5/);
  for (const label of ["Project Name", "Campaign", "Brand", "Status", "Target Quantity"]) {
    assert.match(wizard, new RegExp(label));
  }
  const summaryBlock = wizard.match(/Project Summary[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.doesNotMatch(summaryBlock, /Client Company|Directory|Region|State/);
  assert.match(wizard, /router\.push\("\/workspace\/admin\/campaigns"\)/);
  assert.match(wizard, /The project now appears below\./);
  assert.doesNotMatch(detail, /nextProjectAction/);
  assert.doesNotMatch(detail, /Recommended action/);
  assert.doesNotMatch(detail, /Upload Deployment Directory/);
  assert.doesNotMatch(detail, /Generate \/ Confirm Deployment Locations/);
  assert.doesNotMatch(detail, /Assign Field Resources/);
  assert.doesNotMatch(detail, /Configure Schedule/);
});

test("projects: Directory is standalone and not implemented inside Project creation", () => {
  const wizard = readFileSync(new URL("../components/workspace/ProjectCreateWizard.tsx", import.meta.url), "utf8");
  const directoryPage = readFileSync(new URL("../app/workspace/admin/upload-directory/page.tsx", import.meta.url), "utf8");
  const directoryClient = readFileSync(new URL("../components/workspace/DirectoryImportClient.tsx", import.meta.url), "utf8");
  assert.match(directoryPage, /DirectoryImportClient/);
  assert.match(directoryPage, /getWorkspaceDirectoryDashboard/);
  assert.match(directoryClient, /Upload CSV \/ Excel/);
  assert.doesNotMatch(wizard, /DirectoryImportClient|getWorkspaceDirectoryDashboard|Upload CSV \/ Excel|Download Template/);
});

test("projects: workspace create form does not store free-text field resources", () => {
  const wizard = readFileSync(new URL("../components/workspace/ProjectCreateWizard.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");
  assert.doesNotMatch(wizard, /function plannedResourceCount/);
  assert.match(wizard, /No agency assigned/);
  assert.match(wizard, /No lead installer assigned/);
  assert.match(wizard, /agencies: \[\]/);
  assert.match(wizard, /installers: \[\]/);
  assert.match(service, /function assignedResourceEntries/);
  assert.match(service, /if \(entries\.length === 1 && \/\^\\d\+\$\/\.test\(entries\[0\]\)\) return \[\]/);
  assert.match(service, /passed: Number\(input\.assignedResourceCount \?\? 0\) > 0/);
  assert.doesNotMatch(service, /hasInstallers/);
});

test("projects: workspace deployment type is not persisted to public.projects", () => {
  const service = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");
  const coreService = readFileSync(new URL("../lib/core/projects/service.ts", import.meta.url), "utf8");
  const builder = coreService.match(/export function buildCoreProjectInsertPayload[\s\S]*?\n\}/)?.[0] ?? "";
  assert.doesNotMatch(builder, /project_type|projectType/);
  assert.doesNotMatch(service, /projectType: coreProjectType\(input\.deploymentType\)/);
  assert.doesNotMatch(service, /function coreProjectType/);
  assert.match(service, /deploymentType: project\.project_type \|\| "Retail Deployment"/);
});

test("projects: campaign readiness uses Core project campaign metadata", () => {
  const service = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");
  assert.match(service, /hasCampaign: Boolean\(text\(project\.campaign_name\)\)/);
  assert.match(service, /hasCampaign: Boolean\(text\(summarized\.campaign_name\)\)/);
  assert.doesNotMatch(service, /campaignProjectIds\.has\(summarized\.id\)/);
  assert.doesNotMatch(service, /campaignCount[\s\S]*eq\("project_id", projectId\)/);
});

test("projects: details page exposes simplified overview and shared module links", () => {
  const detail = readFileSync(new URL("../app/workspace/admin/projects/[id]/page.tsx", import.meta.url), "utf8");
  for (const metric of ["Project Status", "Progress", "Expected Deployments", "Completed", "Pending", "Rejected", "GPS Verified", "States", "Recent Activity", "Project Health"]) {
    assert.match(detail, new RegExp(metric));
  }
  for (const section of ["Project Overview", "Coverage & Directory", "Resources", "Recent Activity", "Open Shared Modules", "Configuration"]) {
    assert.match(detail, new RegExp(section));
  }
  for (const sharedModule of ["View Reports", "View Submissions", "View Analytics", "View Deployment Map"]) {
    assert.match(detail, new RegExp(sharedModule));
  }
  assert.doesNotMatch(detail, /const tabs = \[/);
  assert.doesNotMatch(detail, /label="Coverage"/);
});

test("projects: customer actions are exposed through tenant-scoped API", () => {
  const actions = readFileSync(new URL("../components/workspace/ProjectActionsPanel.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/workspace/projects/route.ts", import.meta.url), "utf8");
  for (const action of ["Edit", "Pause", "Resume", "Archive", "Duplicate", "Export", "Launch", "Close", "Delete Draft"]) {
    assert.match(actions, new RegExp(action));
  }
  assert.match(actions, /fetch\("\/api\/workspace\/projects"/);
  assert.match(route, /updateCustomerProjectStatus/);
});

test("projects: workspace progress updates derive from project count", () => {
  const resolver = readFileSync(new URL("../lib/workspace/customerAdmin.ts", import.meta.url), "utf8");
  const foundation = readFileSync(new URL("../lib/workspace/customerAdminFoundation.ts", import.meta.url), "utf8");
  assert.match(resolver, /projectCount/);
  assert.match(foundation, /projectCount > 0/);
  assert.match(foundation, /Create First Project/);
});

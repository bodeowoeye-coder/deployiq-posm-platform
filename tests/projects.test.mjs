import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
    "Primary Target Region",
    "Primary Target State",
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
  assert.match(form, /readOnly aria-readonly="true"/);
  assert.match(form, /const projectStatuses = \["Planning", "Active", "On Hold", "Completed"\] as const/);
  assert.match(form, /value=\{form\.status\}/);
  assert.match(form, /status: form\.status/);
  assert.match(form, /Save Changes/);
  assert.match(form, /Cancel/);
  assert.match(form, /fetch\(isEdit \? `\/api\/workspace\/projects\/\$\{project\?\.id\}`/);
  assert.match(form, /router\.push\(isEdit \? "\/workspace\/admin\/campaigns"/);
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
  assert.match(form, /const fallbackState = project\.primary_target_state \?\? project\.regions_covered\?\.\[0\] \?\? ""/);
  assert.match(form, /const fallbackRegion = project\.primary_target_region \?\? \(fallbackState \? getRegionForState\(fallbackState\) : ""\)/);
  assert.match(form, /targetRegion: fallbackRegion/);
  assert.match(form, /targetState: fallbackState/);
  assert.match(form, /status: statusFor\(project\.status\)/);
  assert.match(service, /const submittedStates = textArray\(input\.states\)/);
  assert.match(service, /const submittedRegions = textArray\(input\.regions\)/);
  assert.match(service, /const states = submittedStates\.length > 0 \? submittedStates : existing\.project\.regions_covered \?\? \[\]/);
  assert.match(service, /const targetState = submittedStates\[0\] \?\? existing\.project\.primary_target_state \?\? null/);
  assert.match(service, /const targetRegion = submittedRegions\[0\] \?\? existing\.project\.primary_target_region \?\? null/);
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

test("projects: review edit shows tenant-scoped assignment names read-only", () => {
  const form = readFileSync(new URL("../components/workspace/ProjectCreateWizard.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");
  const editPage = readFileSync(new URL("../app/workspace/admin/projects/[id]/edit/page.tsx", import.meta.url), "utf8");
  assert.match(service, /\.from\("workspace_field_assignments"\)/);
  assert.match(service, /\.eq\("client_id", resolvedWorkspace\.clientId\)/);
  assert.match(service, /\.eq\("workspace_id", workspace\.clientId\)/);
  assert.match(service, /\.eq\("project_id", projectId\)/);
  assert.match(service, /\.from\("agencies"\)\.select\("id,agency_name"\)/);
  assert.match(service, /\.from\("installers"\)\.select\("id,installer_name"\)/);
  assert.match(editPage, /resources=\{result\.resources\}/);
  assert.match(form, /resources\?\.agencyName/);
  assert.match(form, /resources\?\.leadInstallerName/);
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
  assert.match(page, /<h2 className="mt-2 text-2xl font-bold text-slate-950">CREATE PROJECT<\/h2>/);
  assert.match(page, /Create the canonical project and its initial campaign information for this workspace\./);
  assert.equal((page.match(/CREATE PROJECT/g) ?? []).length, 1);
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
  assert.match(wizard, /router\.push\(isEdit \? "\/workspace\/admin\/campaigns" : "\/workspace\/admin\/projects"\)/);
  assert.match(wizard, /Returning to Projects\./);
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

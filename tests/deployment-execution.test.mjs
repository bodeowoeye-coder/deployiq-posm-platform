import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = () => readFileSync(new URL("../lib/workspace/deploymentExecution.ts", import.meta.url), "utf8");
const migration = () => readFileSync(new URL("../supabase/migrations/20260806050000_add_workspace_deployment_execution.sql", import.meta.url), "utf8");
const installerHome = () => readFileSync(new URL("../components/workspace/InstallerWorkspaceClient.tsx", import.meta.url), "utf8");
const executionClient = () => readFileSync(new URL("../components/workspace/DeploymentExecutionClient.tsx", import.meta.url), "utf8");
const coreSubmissionService = () => readFileSync(new URL("../lib/core/submissionService.ts", import.meta.url), "utf8");

test("deployment execution: reuses canonical submissions and field assignment models", () => {
  const sql = migration();
  const source = service();
  assert.match(sql, /alter table public\.submissions add column if not exists campaign_id/);
  assert.match(sql, /alter table public\.submissions add column if not exists field_assignment_id/);
  assert.match(source, /from\("submissions"\)/);
  assert.match(source, /from\("workspace_field_assignments"\)/);
  assert.match(source, /buildCoreSubmissionPayload/);
  assert.match(source, /persistCoreSubmission/);
  assert.doesNotMatch(sql, /create table if not exists public\.deployment_submissions|create table if not exists public\.workspace_submissions/);
});

test("deployment execution: assignment retrieval is installer-visible and tenant scoped", () => {
  const source = service();
  assert.match(source, /resolveExecutionContext/);
  assert.match(source, /\.eq\("client_id", context\.clientId\)/);
  assert.match(source, /\.eq\("installer_id", context\.installerId\)/);
  assert.match(source, /No deployments have been assigned yet\./);
});

test("deployment execution: browser cannot override tenant or installer scope", () => {
  const api = readFileSync(new URL("../app/api/workspace/installer/assignments/route.ts", import.meta.url), "utf8");
  const submit = readFileSync(new URL("../app/api/workspace/installer/assignments/[id]/submit/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(api + submit, /clientId|workspaceId|tenantId|installerId|campaignId/);
  assert.match(service(), /clientId: detail\.context\.clientId/);
  assert.match(service(), /installer_id: detail\.context\.installerId/);
});

test("deployment execution: installer workspace exposes required assignment KPIs and columns", () => {
  const ui = installerHome();
  for (const label of ["Assigned Today", "Pending", "Completed", "Rejected", "Awaiting Approval", "GPS Issues"]) {
    assert.match(ui, new RegExp(label));
  }
  for (const heading of ["Campaign", "Project", "Outlet", "Address", "State", "Priority", "Due Date", "Status", "Actions"]) {
    assert.match(ui, new RegExp(heading));
  }
});

test("deployment execution: assignment detail shows execution requirements", () => {
  const page = readFileSync(new URL("../app/workspace/installer/assignments/[id]/page.tsx", import.meta.url), "utf8");
  for (const label of ["Campaign", "Project", "Outlet", "Address", "Coordinates", "Target", "Instructions", "Photos Required", "Approval Requirements", "Previous Submissions", "Map"]) {
    assert.match(page + service(), new RegExp(label));
  }
  assert.match(page, /Start Deployment|DeploymentExecutionClient/);
});

test("deployment execution: execution flow covers arrival evidence validation and submit", () => {
  const ui = executionClient();
  for (const label of ["Arrival", "Evidence Capture", "Validation", "Submit", "Success"]) {
    assert.match(ui, new RegExp(label));
  }
  assert.match(ui, /Before Photo/);
  assert.match(ui, /After Photo/);
  assert.match(ui, /Submit for Approval/);
});

test("deployment execution: offline queue stores and syncs submissions", () => {
  const ui = executionClient();
  const syncRoute = readFileSync(new URL("../app/api/workspace/installer/sync/route.ts", import.meta.url), "utf8");
  const drafts = readFileSync(new URL("../lib/installerDrafts.ts", import.meta.url), "utf8");
  assert.match(ui, /queueSubmission/);
  assert.match(ui, /readQueuedSubmissions/);
  assert.match(ui, /buildQueuedSubmissionFormData/);
  assert.match(drafts, /submissionEndpoint/);
  assert.match(drafts, /fieldAssignmentId/);
  assert.match(ui, /legacyWorkspaceQueueKey/);
  assert.match(ui, /Saved offline\. This deployment will sync automatically when internet returns\./);
  assert.match(ui, /window\.addEventListener\("online", syncQueue\)/);
  assert.match(syncRoute, /submitDeploymentEvidence/);
});

test("deployment execution: GPS status and distance are calculated", () => {
  const source = service();
  assert.match(coreSubmissionService(), /distanceMetersBetween/);
  assert.match(source, /distanceMetersBetween/);
  assert.match(source, /gpsStatusFor/);
  assert.match(source, /Verified/);
  assert.match(source, /Approximate/);
  assert.match(source, /Unavailable/);
  assert.match(source, /gps_distance_meters/);
});

test("deployment execution: evidence payload links photos notes and metadata", () => {
  const source = service();
  const ui = executionClient();
  assert.match(source, /beforePhotoUrl/);
  assert.match(source, /afterPhotoUrl/);
  assert.match(source, /additionalPhotoUrls/);
  assert.match(source, /evidence_payload/);
  assert.match(ui, /compressImage/);
  assert.match(source, /Before and after photo evidence is required\./);
});

test("deployment execution: submissions link campaign project location installer agency workspace and customer", () => {
  const source = service() + coreSubmissionService();
  for (const field of ["client_id", "workspace_id", "campaign_id", "campaign_location_id", "field_assignment_id", "project_id", "agency_id", "installer_id", "selected_outlet_id"]) {
    assert.match(source, new RegExp(`${field}:`));
  }
});

test("deployment execution: approval rejection and correction workflow are supported", () => {
  const source = service();
  const core = coreSubmissionService();
  const route = readFileSync(new URL("../app/api/workspace/deployment-submissions/[id]/review/route.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../components/workspace/WorkspaceSubmissionsClient.tsx", import.meta.url), "utf8");
  assert.match(source, /reviewDeploymentSubmission/);
  assert.match(source, /applySubmissionWorkflowTransition/);
  assert.match(source, /submissions\.review/);
  assert.match(core, /action === "approve"/);
  assert.match(core, /action === "reject"/);
  assert.match(core, /action === "request_correction"/);
  assert.match(core, /updates\.approval_comments = text\(input\.approvalComments\) \|\| null/);
  assert.match(source, /Correction Requested/);
  assert.match(route, /reviewDeploymentSubmission/);
  assert.match(client, /action: review\.action/);
  assert.match(client, /rejectionReason/);
  assert.match(client, /correctionNotes/);
  assert.doesNotMatch(client, /from\("submissions"\)|\.update\(/);
});

test("deployment execution: workspace submissions loader uses runtime-safe columns and preserves KPI integrity", () => {
  const source = service();
  const page = readFileSync(new URL("../app/workspace/admin/submissions/page.tsx", import.meta.url), "utf8");
  const loader = source.match(/export async function getWorkspaceDeploymentSubmissions\([^)]*\)[\s\S]*?\n\}/)?.[0] ?? "";
  assert.doesNotMatch(loader, /selected_outlet_state/);
  assert.match(loader, /resolved_state,installer_state,state_region/);
  assert.match(loader, /\.eq\("client_id", workspace\.clientId\)/);
  assert.doesNotMatch(loader, /\.eq\("workspace_id", workspace\.clientId\)/);
  assert.match(loader, /Historical Core submissions can be tenant-scoped by client_id before workspace_id existed/);
  assert.match(loader, /\.is\("archived_at", null\)/);
  assert.match(loader, /\.order\("submitted_at", \{ ascending: false \}\)/);
  assert.match(loader, /queryStatus: "error" as const/);
  assert.match(loader, /queryStatus: "success" as const/);
  assert.match(loader, /isEmpty: submissions\.length === 0/);
  assert.match(source, /text\(row\.status\) === "Approved"/);
  assert.match(source, /\["Pending", "Flagged"\]\.includes\(text\(row\.status\)\)/);
  assert.match(source, /text\(row\.status\) === "Rejected" \|\| text\(row\.status\) === "Correction Requested"/);
  assert.match(page, /WorkspaceSubmissionsClient/);
  assert.match(readFileSync(new URL("../components/workspace/WorkspaceSubmissionsClient.tsx", import.meta.url), "utf8"), /hasQueryFailure \? "Unavailable"/);
});

test("deployment execution: supervisor and customer admin visibility are distinct", () => {
  const source = service();
  const supervisor = readFileSync(new URL("../app/workspace/installer/supervisor/page.tsx", import.meta.url), "utf8");
  const submissions = readFileSync(new URL("../app/workspace/admin/submissions/page.tsx", import.meta.url), "utf8");
  assert.match(source, /Supervisor access is required\./);
  assert.match(supervisor, /Assigned Installers/);
  assert.match(supervisor, /Outstanding Assignments/);
  assert.match(submissions, /WorkspaceSubmissionsClient/);
});

test("deployment execution: home dashboard map and search include execution data", () => {
  const homeService = readFileSync(new URL("../lib/workspace/customerAdmin.ts", import.meta.url), "utf8");
  const homePage = readFileSync(new URL("../app/workspace/admin/page.tsx", import.meta.url), "utf8");
  const mapPage = readFileSync(new URL("../app/workspace/admin/map/page.tsx", import.meta.url), "utf8");
  const search = readFileSync(new URL("../app/api/workspace/search/route.ts", import.meta.url), "utf8");
  for (const label of ["Today's deployments lookup", "Pending approvals lookup", "Rejected today lookup", "Installers active lookup", "Campaigns running lookup"]) {
    assert.match(homeService, new RegExp(label));
  }
  assert.match(homePage, /Deployment activity/);
  assert.match(mapPage, /GPS Exceptions/);
  assert.match(search, /group: "Assignments"/);
  assert.match(search, /group: "Submissions"/);
});

test("deployment execution: performance safeguards avoid full workspace refreshes", () => {
  const source = service() + installerHome() + executionClient();
  assert.match(source, /\[deployment-performance\]/);
  assert.doesNotMatch(source, /resolveCustomerWorkspaceHomeContext|WorkspaceLoadingOverlay|Opening workspace\.\.\.|router\.refresh\(/);
});

test("deployment execution: Retail and Workspace submissions share Core service", () => {
  const retailRoute = readFileSync(new URL("../app/api/submissions/route.ts", import.meta.url), "utf8");
  const workspaceSubmitRoute = readFileSync(new URL("../app/api/workspace/installer/assignments/[id]/submit/route.ts", import.meta.url), "utf8");
  const core = coreSubmissionService();
  assert.match(retailRoute, /insertCoreSubmission/);
  assert.match(retailRoute, /runSubmissionOcrAndBrandReview/);
  assert.match(retailRoute, /applySubmissionWorkflowTransition/);
  assert.match(workspaceSubmitRoute, /submitDeploymentEvidence/);
  assert.match(service(), /runSubmissionOcrAndBrandReview/);
  assert.match(service(), /buildCoreSubmissionPayload/);
  assert.match(core, /uploadSubmissionEvidence/);
});

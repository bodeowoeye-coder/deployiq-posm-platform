import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = () => readFileSync(new URL("../app/workspace/admin/reports/page.tsx", import.meta.url), "utf8");
const client = () => readFileSync(new URL("../components/workspace/WorkspaceReportsClient.tsx", import.meta.url), "utf8");
const analytics = () => readFileSync(new URL("../lib/workspace/analytics.ts", import.meta.url), "utf8");
const excel = () => readFileSync(new URL("../app/api/client/exports/excel/route.ts", import.meta.url), "utf8");
const pdf = () => readFileSync(new URL("../app/api/client/exports/pdf/route.ts", import.meta.url), "utf8");

test("workspace reports use the tenant-scoped canonical loader", () => {
  assert.match(page(), /getWorkspaceAnalytics/);
  assert.match(page(), /WorkspaceReportsClient/);
  assert.match(analytics(), /resolveCustomerWorkspaceContext/);
  assert.match(analytics(), /\.eq\("client_id", workspace\.clientId\)/);
  assert.doesNotMatch(page() + client(), /client_id|workspace_id|tenant_id/);
});

test("workspace reports reuse existing client PDF and Excel export routes", () => {
  assert.match(client(), /\/api\/client\/exports\/\$\{format\}/);
  assert.match(excel(), /requireClientUser/);
  assert.match(excel(), /loadClientSubmissionScope/);
  assert.match(pdf(), /requireClientUser/);
  assert.match(pdf(), /loadClientSubmissionScope/);
  assert.match(excel(), /statusFilter/);
  assert.match(pdf(), /statusFilter/);
  assert.match(pdf(), /isMissingDeploymentProgressTable/);
  assert.match(pdf(), /compatibleDeploymentProgress/);
});

test("workspace reports preserve evidence, status, GPS, and zero-data behavior", () => {
  const source = client();
  for (const label of ["Project", "Campaign", "Brand", "Outlet", "Installer", "Status", "GPS", "Submitted", "Export Project PDF", "Export Combined PDF", "Export Project Excel", "Export Combined Excel"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /No deployment reports yet/);
  assert.match(source, /Reports will become available after deployment evidence is submitted/);
  assert.match(source, /disabled=\{!hasRows\}/);
  assert.match(source, /Expected \/ target/);
  assert.match(source, /hasValidGps/);
});

test("workspace report filters include the established reporting dimensions", () => {
  const source = client();
  for (const filter of ["Project", "Campaign", "Brand", "State \/ region", "Installer", "Status", "GPS status", "Date from", "Date to"]) {
    assert.match(source, new RegExp(filter));
  }
  assert.match(source, /projectId/);
  assert.match(source, /gpsFilter/);
  assert.match(source, /startDate/);
  assert.match(source, /endDate/);
  assert.doesNotMatch(source, /Project \/ campaign/);
  assert.doesNotMatch(source, /\n\s*if \(filters\.campaign\) params\.set\("campaign", filters\.campaign\);\n\s*<Filter/);
  assert.match(source, /Report Scope: All Projects/);
  assert.match(source, /Report Scope/);
  assert.match(source, /All Projects - Combined Report/);
  assert.match(source, /selectedProject/);
  assert.match(source, /!selectedProject/);
  assert.match(source, /aria-label="Selected project report"/);
  assert.match(source, /Project Report/);
  assert.match(source, /Combined workspace project performance/);
  assert.match(source, /Selected project performance/);
  assert.match(source, /campaignOptions/);
  assert.match(source, /brandOptions/);
  assert.match(source, /regionOptions/);
  assert.match(source, /stateOptions/);
});

test("combined exports preserve project hierarchy and project/campaign evidence identity", () => {
  assert.match(excel(), /book_append_sheet\(workbook, summarySheet, "Summary"\)/);
  assert.match(excel(), /book_append_sheet\(workbook, projectSummarySheet, "Project Summary"\)/);
  assert.match(excel(), /"Project Name"/);
  assert.match(excel(), /"Campaign Name"/);
  assert.match(pdf(), /Project Performance Breakdown/);
  assert.match(pdf(), /Combined Workspace Project Performance/);
  assert.match(pdf(), /Campaign:/);
  assert.match(excel(), /includedProjects/);
  assert.match(pdf(), /includedProjects/);
});

test("report exports change labels and query scope with the selected project", () => {
  const source = client();
  assert.match(source, /Export Project PDF/);
  assert.match(source, /Export Combined PDF/);
  assert.match(source, /Export Project Excel/);
  assert.match(source, /Export Combined Excel/);
  assert.match(source, /params\.set\("projectId", filters\.projectId\)/);
  assert.match(source, /campaignOptions/);
});

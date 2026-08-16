import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = () => readFileSync(new URL("../app/workspace/admin/alerts/page.tsx", import.meta.url), "utf8");
const client = () => readFileSync(new URL("../components/workspace/WorkspaceAlertsClient.tsx", import.meta.url), "utf8");
const service = () => readFileSync(new URL("../lib/workspace/alerts.ts", import.meta.url), "utf8");
const operations = () => readFileSync(new URL("../lib/operations.ts", import.meta.url), "utf8");
const analyticsCore = () => readFileSync(new URL("../lib/workspace/analyticsCore.ts", import.meta.url), "utf8");
const dashboard = () => readFileSync(new URL("../app/workspace/admin/page.tsx", import.meta.url), "utf8");

test("workspace alerts use one tenant-scoped service for page and dashboard", () => {
  assert.match(page(), /getWorkspaceAlertsDashboard/);
  assert.match(page(), /WorkspaceAlertsClient/);
  assert.match(service(), /resolveCustomerWorkspaceContext/);
  assert.match(service(), /\.eq\("client_id", workspace\.clientId\)/);
  assert.match(dashboard(), /getWorkspaceAlertsDashboard/);
  assert.match(dashboard(), /alerts\.alerts/);
  assert.doesNotMatch(page() + client(), /client_id|workspace_id|tenant_id/);
});

test("alerts reuse Core operational rules and supported exception fields", () => {
  const source = service();
  assert.match(source, /getOperationalAlerts/);
  assert.match(source, /getProjectOperations/);
  for (const rule of ["submission_review", "submission_correction", "gps_exception", "duplicate_exception"]) {
    assert.match(source, new RegExp(rule));
  }
  assert.match(operations(), /overdue_deployment|low_completion|rejected_deployment/);
  assert.match(source, /hasValidGps/);
  assert.match(source, /duplicate_status/);
  assert.match(analyticsCore(), /PGRST205/);
});

test("alerts preserve empty state and existing module actions", () => {
  const source = client();
  assert.match(source, /No active alerts\./);
  assert.match(source, /Project and submission risks for this workspace will appear here\./);
  assert.match(source, /Review Submission/);
  assert.match(source, /View Project/);
  assert.match(source, /All alerts/);
  assert.match(source, /Alert type/);
  assert.match(source, /Status/);
});

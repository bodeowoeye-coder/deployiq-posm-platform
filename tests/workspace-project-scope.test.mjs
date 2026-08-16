import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shell = () => readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");
const scope = () => readFileSync(new URL("../lib/workspace/projectScope.ts", import.meta.url), "utf8");
const dashboard = () => readFileSync(new URL("../app/workspace/admin/page.tsx", import.meta.url), "utf8");
const analytics = () => readFileSync(new URL("../app/workspace/admin/analytics/page.tsx", import.meta.url), "utf8");
const map = () => readFileSync(new URL("../app/workspace/admin/map/page.tsx", import.meta.url), "utf8");
const submissions = () => readFileSync(new URL("../app/workspace/admin/submissions/page.tsx", import.meta.url), "utf8");
const alerts = () => readFileSync(new URL("../app/workspace/admin/alerts/page.tsx", import.meta.url), "utf8");
const reports = () => readFileSync(new URL("../app/workspace/admin/reports/page.tsx", import.meta.url), "utf8");
const notifications = () => readFileSync(new URL("../app/workspace/admin/notifications/page.tsx", import.meta.url), "utf8");
const installers = () => readFileSync(new URL("../app/workspace/admin/installers/page.tsx", import.meta.url), "utf8");

test("project scope is canonical, tenant-scoped, and excludes legacy placeholders", () => {
  const source = scope();
  assert.match(source, /\.eq\("client_id", workspace\.clientId\)/);
  assert.match(source, /isLegacyProvisioningPlaceholderProject/);
  assert.match(source, /requestedProjectId/);
  assert.match(source, /projectScopeQuery/);
});

test("operational navigation preserves project scope while administration stays separate", () => {
  const source = shell();
  assert.match(source, /Project Scope/);
  assert.match(source, /<BrandMark \/>[\s\S]*?Project Scope[\s\S]*?<nav/);
  assert.match(source, /All Projects/);
  assert.match(source, /operationalNavigation\.has\(item\.href\)/);
  assert.match(source, /projectId=/);
  assert.match(source, /CUSTOMER_ADMIN_ACCOUNT_SETTINGS_NAV_ITEMS/);
});

test("project-dependent routes consume the same projectId query scope", () => {
  for (const source of [dashboard(), analytics(), map(), submissions(), alerts(), reports(), notifications(), installers()]) {
    assert.match(source, /searchParams/);
    assert.match(source, /projectId/);
  }
});

test("project scope remains separate from tenant authorization", () => {
  assert.doesNotMatch(scope(), /client_id.*searchParams|workspace_id.*searchParams/);
  assert.match(scope(), /workspace\.clientId/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const siteService = readFileSync(new URL("../lib/build/sites/service.ts", import.meta.url), "utf8");
const workPackageService = readFileSync(new URL("../lib/build/workPackages/service.ts", import.meta.url), "utf8");
const templateService = readFileSync(new URL("../lib/build/templates/service.ts", import.meta.url), "utf8");
const siteRoute = readFileSync(new URL("../app/api/build/sites/route.ts", import.meta.url), "utf8");
const workPackageRoute = readFileSync(new URL("../app/api/build/work-packages/route.ts", import.meta.url), "utf8");
const management = readFileSync(new URL("../components/workspace/BuildProjectManagement.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../components/workspace/BuildProjectShell.tsx", import.meta.url), "utf8");
const overview = readFileSync(new URL("../lib/build/projects/workspaceOverview.ts", import.meta.url), "utf8");
const workspaceShell = readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");

test("S3A-4 Site list remains canonical tenant and project scoped", () => {
  assert.match(siteService, /from\("build_sites"\)[\s\S]*\.eq\("project_id", access\.project\.id\)[\s\S]*\.eq\("client_id", access\.project\.client_id\)/);
  assert.match(overview, /from\("build_sites"\)[\s\S]*\.eq\("client_id", project\.client_id\)[\s\S]*\.eq\("project_id", project\.id\)/);
});

test("S3A-4 Site writes require canonical Build authority and active customer-admin membership", () => {
  assert.match(siteService, /resolveCanonicalBuildProject\(\{[\s\S]*requiredPermission: "projects:read"/);
  assert.match(siteService, /hasCustomerAdminMembership\(authContext\.user_id, project\.client_id\)/);
  assert.match(siteService, /authContext\.client_id === project\.client_id/);
});

test("S3A-4 Site ancestry and cross-tenant mutation remain fail closed", () => {
  assert.match(siteService, /validateProjectSiteOwnership\(\{[\s\S]*projectId: project\.id,[\s\S]*siteId,[\s\S]*clientId: project\.client_id/);
  assert.match(siteService, /\.eq\("id", input\.id\)[\s\S]*\.eq\("project_id", access\.project\.id\)[\s\S]*\.eq\("client_id", access\.project\.client_id\)/);
  assert.doesNotMatch(siteRoute, /body\.clientId/);
});

test("S3A-4 Site lifecycle is soft archive and protects active Work Packages", () => {
  assert.match(siteService, /from\("build_work_packages"\)[\s\S]*\.eq\("site_id", params\.siteId\)[\s\S]*\.is\("archived_at", null\)/);
  assert.match(siteService, /Archive the Site's active Work Packages/);
  assert.match(siteService, /archived_at: new Date\(\)\.toISOString\(\), status: "archived"/);
  assert.doesNotMatch(siteService, /\.delete\(/);
});

test("S3A-4 Work Package reads and writes preserve full Site ancestry", () => {
  assert.match(workPackageService, /validateProjectSiteOwnership\(\{[\s\S]*projectId: project\.id,[\s\S]*siteId,[\s\S]*clientId: project\.client_id/);
  assert.match(workPackageService, /validateWorkPackageOwnership\(\{[\s\S]*projectId: project\.id,[\s\S]*siteId: site\.id,[\s\S]*workPackageId,[\s\S]*clientId: project\.client_id/);
  assert.match(workPackageService, /allowCustomerAdminWrite: true/);
  assert.doesNotMatch(workPackageRoute, /body\.clientId/);
});

test("S3A-4 customer management does not unlock Core Admin template authoring", () => {
  const authoringCalls = [...templateService.matchAll(/assertWorkPackageAccess\(\{[\s\S]*?canWrite: true[\s\S]*?\}\);/g)].map((match) => match[0]);
  assert.ok(authoringCalls.length >= 4);
  assert.equal(authoringCalls.filter((call) => /allowCustomerAdminWrite: true/.test(call)).length, 1);
  assert.match(templateService, /export async function assignTemplateToWorkPackage[\s\S]*allowCustomerAdminWrite: true/);
});

test("S3A-4 template assignment admits only active tenant or global templates", () => {
  assert.match(workPackageService, /from\("build_work_package_templates"\)[\s\S]*\.eq\("status", "active"\)[\s\S]*\.is\("archived_at", null\)[\s\S]*\.or\(`client_id\.eq\.\$\{clientId\},is_global\.eq\.true`\)/);
  assert.match(workPackageService, /Operational Template is not active or visible to this tenant/);
  assert.match(workPackageService, /template_id: templateId/);
  assert.match(workPackageService, /updates\.template_id = await eligibleTemplateId/);
});

test("S3A-4 UI exposes management forms without trusting tenant identifiers", () => {
  assert.match(management, /Create Site/);
  assert.match(management, /Create Work Package/);
  assert.match(management, /Operational Template/);
  assert.match(management, /Parent Site/);
  assert.match(management, /Edit Site/);
  assert.match(management, /Save Work Package/);
  assert.doesNotMatch(management, /clientId|client_id|workspaceId|tenantId/);
});

test("S3A-4 hierarchy is presented with names and codes, not opaque IDs", () => {
  assert.match(management, /site\.name[^\n]*site\.siteCode/);
  assert.match(management, /workPackage\.templateName/);
  assert.match(management, /workPackage\.code/);
});

test("S3A-4 overview remains live from canonical Build rows", () => {
  assert.match(overview, /sites: sites\.length/);
  assert.match(overview, /workPackages: workPackages\.length/);
  assert.doesNotMatch(overview, /Lekki Commercial Development|Ground Floor Construction|Commercial Building Works/);
});

test("S3A-4 operational navigation has a clear accessible active treatment", () => {
  assert.match(shell, /Build operational navigation/);
  assert.match(shell, /aria-current=\{active \? "page"/);
  assert.match(shell, /border-orange-600 bg-orange-50 text-orange-900/);
  assert.match(shell, /Build project breadcrumb/);
});

test("S3A-4 preserves shared User Management and introduces no legacy client route", () => {
  assert.match(workspaceShell, /workspace\.accountNavigation\.map/);
  const sources = [siteService, workPackageService, siteRoute, workPackageRoute, management, shell, overview].join("\n");
  assert.doesNotMatch(sources, /["'`]\/client(?:\/|["'`])/);
});

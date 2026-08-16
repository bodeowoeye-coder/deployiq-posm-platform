import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = () => readFileSync(new URL("../app/workspace/admin/projects/new/page.tsx", import.meta.url), "utf8");
const wizard = () => readFileSync(new URL("../components/workspace/ProjectCreateWizard.tsx", import.meta.url), "utf8");
const projects = () => readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");

test("create project stays in the Project workflow after create and refreshes the same page", () => {
  const source = wizard();
  assert.match(source, /router\.refresh\(\)/);
  assert.match(source, /The project now appears below\./);
  assert.doesNotMatch(source, /router\.push\(isEdit \? "\/workspace\/admin\/campaigns" : "\/workspace\/admin\/projects"\)/);
  assert.match(source, /if \(isEdit\)/);
  assert.match(source, /router\.push\("\/workspace\/admin\/campaigns"\)/);
});

test("create project page renders the canonical tenant project list and actions", () => {
  const source = page();
  assert.match(source, /<h2 className="mt-2 text-2xl font-bold text-slate-950">Create Project<\/h2>/);
  assert.doesNotMatch(source, /CREATE PROJECT/);
  assert.match(source, /Projects in this Workspace/);
  assert.match(source, /dashboard\.projects/);
  assert.match(source, /dashboard\.filteredProjects\.map/);
  assert.match(source, /\/workspace\/admin\/projects\/\$\{project\.id\}/);
  assert.match(source, /\/workspace\/admin\/projects\/\$\{project\.id\}\/edit/);
  assert.match(source, /campaign_name/);
  assert.match(source, /Target/);
});

test("create project list reuses the existing tenant-scoped project dashboard loader", () => {
  assert.match(page(), /getCustomerProjectDashboard/);
  assert.match(projects(), /\.eq\("client_id", resolvedWorkspace\.clientId\)/);
  assert.match(projects(), /\.is\("archived_at", null\)/);
});

test("operational Workspace surfaces exclude the legacy placeholder without deleting it", () => {
  const projects = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");
  const analytics = readFileSync(new URL("../lib/workspace/analytics.ts", import.meta.url), "utf8");
  const alerts = readFileSync(new URL("../lib/workspace/alerts.ts", import.meta.url), "utf8");
  const pdf = readFileSync(new URL("../app/api/client/exports/pdf/route.ts", import.meta.url), "utf8");
  const excel = readFileSync(new URL("../app/api/client/exports/excel/route.ts", import.meta.url), "utf8");
  const search = readFileSync(new URL("../app/api/workspace/search/route.ts", import.meta.url), "utf8");
  for (const source of [projects, analytics, alerts, pdf, excel, search]) assert.match(source, /isLegacyProvisioningPlaceholderProject/);
  const provisioning = readFileSync(new URL("../lib/acquisition/provisioning/retailWorkspace.ts", import.meta.url), "utf8");
  assert.match(provisioning, /const starterProjectId = null/);
});

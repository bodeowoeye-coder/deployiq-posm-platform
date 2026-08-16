import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sidebar = () => readFileSync(new URL("../components/DashboardSidebar.tsx", import.meta.url), "utf8");
const shell = () => readFileSync(new URL("../components/admin/CoreAdminShell.tsx", import.meta.url), "utf8");
const selector = () => readFileSync(new URL("../app/admin/customer-360/page.tsx", import.meta.url), "utf8");
const workspaces = () => readFileSync(new URL("../app/admin/workspaces/page.tsx", import.meta.url), "utf8");
const customer360 = () => readFileSync(new URL("../app/admin/customers/[clientId]/page.tsx", import.meta.url), "utf8");
const adminPage = () => readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
const globals = () => readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const workspaceShell = () => readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");

function adminItems() {
  return sidebar().split("const clientItems")[0];
}

test("1. Core Admin sidebar contains the five platform modules in order", () => {
  const items = adminItems();
  const order = ["Dashboard", "Customer Management", "Customer 360", "Workspaces", "Commercial & Pricing"];
  const positions = order.map((label) => items.indexOf(`label: "${label}"`));
  positions.forEach((position, index) => assert.ok(position > -1, `missing nav item: ${order[index]}`));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "navigation order must match the platform hierarchy");
  assert.match(items, /href: "\/admin\/customer-360", routeNavigation: true/);
  assert.match(items, /href: "\/admin\/workspaces", routeNavigation: true/);
});

test("2. Old operational modules are not restored to Core Admin navigation", () => {
  const items = adminItems();
  for (const removed of ["Deployment Reports", "Submissions", "Deployment Map", "Analytics", "Alerts", "Installers"]) {
    assert.doesNotMatch(items, new RegExp(`label: "${removed}"`), `${removed} must stay out of Core Admin navigation`);
  }
});

test("3-4. Customer 360 nav opens a selector that links to the canonical route", () => {
  const source = selector();
  assert.match(source, /await requireRole\(\["admin"\], "\/admin\/customer-360"\)/);
  assert.match(source, /Select a customer to view their complete DeployIQ relationship\./);
  assert.match(source, /href=\{`\/admin\/customers\/\$\{customer\.clientId\}`\}/);
  assert.match(source, /View Customer 360/);
  // Selector only: it must not reimplement Customer 360.
  assert.doesNotMatch(source, /getPlatformCustomer360|const TABS/);
  assert.match(source, /import \{ listPlatformCustomers \} from "@\/lib\/admin\/customerControl"/);
});

test("5. Customer Management to Customer 360 still works and Customer 360 tabs are intact", () => {
  const customers = readFileSync(new URL("../app/admin/customers/page.tsx", import.meta.url), "utf8");
  assert.match(customers, /href=\{`\/admin\/customers\/\$\{customer\.clientId\}`\}/);
  assert.match(customer360(), /const TABS = \["overview", "workspace", "projects", "users", "operations", "commercial", "provisioning", "audit"\] as const/);
});

test("6-7. Workspaces uses canonical data and preserves client_id on drill-down", () => {
  const source = workspaces();
  assert.match(source, /import \{ listPlatformCustomers \} from "@\/lib\/admin\/customerControl"/);
  assert.match(source, /dashboard\.customers\.filter\(\(customer\) => Boolean\(customer\.workspaceSlug\)\)/);
  assert.match(source, /href=\{`\/admin\/customers\/\$\{workspace\.clientId\}`\}/);
  // No second workspace or customer model.
  assert.doesNotMatch(source, /\.from\(|createAdminSupabase/);
});

test("8-9. Open Workspace reuses the audited Support Mode flow only", () => {
  const source = workspaces();
  const support = readFileSync(new URL("../lib/admin/supportAccess.ts", import.meta.url), "utf8");
  assert.match(source, /import \{ OpenWorkspaceSupportAccess \} from "@\/components\/admin\/OpenWorkspaceSupportAccess"/);
  assert.match(source, /<OpenWorkspaceSupportAccess[\s\S]{0,220}clientId=\{workspace\.clientId\}/);
  // No parallel support-session implementation and no direct workspace link.
  assert.doesNotMatch(source, /workspace_support_sessions|\/workspace\/admin/);
  assert.equal((support.match(/\.from\("workspace_support_sessions"\)\s*\.insert\(/g) ?? []).length, 1);
});

test("10. These flows never redirect a platform admin to onboarding", () => {
  const source = `${selector()}\n${workspaces()}\n${adminPage()}`;
  assert.doesNotMatch(source, /\/onboarding|\/workspace\/activation/);
  const resolver = readFileSync(new URL("../lib/workspace/customerAdmin.ts", import.meta.url), "utf8");
  assert.match(resolver, /if \(authContext\.role\.role === "admin" && !supportSession\) \{[\s\S]{0,320}throw new CustomerWorkspaceRedirect\("\/admin\/customers"\)/);
});

test("12. /admin remains the Platform Dashboard", () => {
  assert.match(adminPage(), /Platform Dashboard/);
  assert.match(adminPage(), /getPlatformDashboard/);
  assert.doesNotMatch(adminPage(), /AdminRoutePage/);
});

test("13. Core Admin navigation uses the harmonised light-grey treatment", () => {
  const source = sidebar();
  // Shared surface class driven by the same tokens as the Customer Workspace sidebar.
  assert.match(globals(), /\.deployiq-nav-surface \{\s*background: var\(--cw-sidebar\);\s*border-color: var\(--cw-border\);/);
  assert.match(source, /deployiq-nav-surface/);
  assert.doesNotMatch(source, /bg-\[#07122a\]/);
  assert.doesNotMatch(source, /border-slate-800/);
  // Active and hover states match the workspace navigation treatment.
  assert.match(source, /bg-white text-orange-700 shadow-sm ring-1 ring-orange-200/);
  assert.match(source, /text-slate-700 hover:bg-white\/80 hover:text-slate-950/);
  assert.match(source, /min-h-10 px-3/);
});

test("14. Core Admin branding remains DeployIQ + CORE ADMIN without the tagline", () => {
  const source = shell();
  assert.match(source, /<BrandMark compact \/>/);
  assert.match(source, /Core Admin/);
  assert.doesNotMatch(source, /Field Deployment Intelligence Platform/);
});

test("15. Customer Workspace navigation is unchanged", () => {
  const source = workspaceShell();
  // The workspace keeps its own token-driven sidebar class; nothing was rewritten there.
  assert.match(source, /className="customer-workspace-sidebar border-r px-5 py-5 text-slate-950/);
  assert.match(globals(), /\.customer-workspace-sidebar \{\s*background: var\(--cw-sidebar\);/);
});

test("navigation offers multiple routes to one canonical Customer 360", () => {
  // Three entry points, one destination.
  const customers = readFileSync(new URL("../app/admin/customers/page.tsx", import.meta.url), "utf8");
  for (const source of [customers, selector(), workspaces()]) {
    assert.match(source, /\/admin\/customers\/\$\{/);
  }
  // Only one Customer 360 implementation exists.
  assert.match(customer360(), /getPlatformCustomer360/);
  assert.doesNotMatch(selector(), /getPlatformCustomer360/);
  assert.doesNotMatch(workspaces(), /getPlatformCustomer360/);
});

test("every shell-compatible Core Admin module renders the shared chrome", () => {
  const layout = readFileSync(new URL("../app/admin/customers/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /<CoreAdminShell>\{children\}<\/CoreAdminShell>/);
  assert.match(adminPage(), /<CoreAdminShell activeView="dashboard">/);
  assert.match(selector(), /<CoreAdminShell activeView="customer-360">/);
  assert.match(workspaces(), /<CoreAdminShell activeView="workspaces">/);

  // Pricing Studio owns its own full-page chrome, so it is deliberately excluded and documented.
  const pricingRoute = readFileSync(new URL("../app/admin/commercial/pricing/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(pricingRoute, /import \{ CoreAdminShell \}/);
  assert.doesNotMatch(pricingRoute, /<CoreAdminShell/);
  assert.match(pricingRoute, /intentionally not wrapped in\n\/\/ CoreAdminShell/);
  // Its breadcrumb points back to the repositioned platform landing page.
  const pricingStudio = readFileSync(new URL("../components/PricingStudio.tsx", import.meta.url), "utf8");
  assert.match(pricingStudio, /Platform Dashboard/);
  assert.doesNotMatch(pricingStudio, />Admin Dashboard</);
});

test("support access is reachable only through the single audited component", () => {
  // Customer 360 and Workspaces are the two entry points; both use the same component.
  assert.match(customer360(), /<OpenWorkspaceSupportAccess/);
  assert.match(workspaces(), /<OpenWorkspaceSupportAccess/);
  const component = readFileSync(new URL("../components/admin/OpenWorkspaceSupportAccess.tsx", import.meta.url), "utf8");
  assert.match(component, /fetch\("\/api\/admin\/support-sessions"/);
  assert.match(component, /Start Support Session/);
  // No other surface may start a session directly.
  for (const file of ["../app/admin/page.tsx", "../app/admin/customers/page.tsx", "../app/admin/customer-360/page.tsx"]) {
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), "utf8"), /support-sessions/);
  }
});

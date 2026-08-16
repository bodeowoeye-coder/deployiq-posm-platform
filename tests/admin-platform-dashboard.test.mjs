import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = () => readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
const service = () => readFileSync(new URL("../lib/admin/platformDashboard.ts", import.meta.url), "utf8");
const control = () => readFileSync(new URL("../lib/admin/customerControl.ts", import.meta.url), "utf8");
const sidebar = () => readFileSync(new URL("../components/DashboardSidebar.tsx", import.meta.url), "utf8");
const shell = () => readFileSync(new URL("../components/admin/CoreAdminShell.tsx", import.meta.url), "utf8");

test("1-2. /admin remains platform-admin protected", () => {
  assert.match(page(), /await requireRole\(\["admin"\], "\/admin"\)/);
  assert.doesNotMatch(page(), /requireRole\(\["client"\]|requireRole\(\["admin", "client"\]/);
  // Platform visibility is global by design, never tenant-scoped.
  assert.doesNotMatch(`${page()}\n${service()}`, /resolveCustomerWorkspaceContext/);
});

test("3-10. Every KPI reuses the canonical Customer Management calculation", () => {
  const source = service();
  // One implementation only: the dashboard consumes listPlatformCustomers rather than recomputing.
  assert.match(source, /import \{ listPlatformCustomers \} from "@\/lib\/admin\/customerControl"/);
  assert.match(source, /kpis: platform\.kpis/);
  assert.doesNotMatch(source, /label: "Total Customers"|label: "Active Workspaces"|label: "Provisioning Failed"/);

  const controlSource = control();
  for (const label of ["Total Customers", "Active Workspaces", "Provisioning Pending", "Provisioning Failed", "Active Projects", "Active Users", "Customers With Alerts", "Legacy / Unknown"]) {
    assert.ok(controlSource.includes(`label: "${label}"`), `canonical KPI missing: ${label}`);
  }
  // Canonical sources for each metric.
  assert.match(controlSource, /supabase\.from\("clients"\)\.select\("id,name,status,created_at"\)/);
  assert.match(controlSource, /\.from\("workspace_settings"\)\.select\(/);
  assert.match(controlSource, /\.from\("provisioning_jobs"\)\.select\(/);
  assert.match(controlSource, /\.from\("projects"\)\.select\("client_id,status,target_quantity"\)/);
  assert.match(controlSource, /\.from\("workspace_memberships"\)\.select\(/);
  assert.match(controlSource, /\.from\("notification_events"\)\.select\("client_id"\)/);
});

test("10. Legacy / Unknown matches the Customer Management definition", () => {
  assert.match(control(), /return "Legacy \/ Unknown";/);
  assert.match(service(), /customer\.source === "Legacy \/ Unknown"/);
});

test("11. Recent Provisioning Activity reuses the existing canonical source", () => {
  assert.match(service(), /recentProvisioning: platform\.recentProvisioning/);
  assert.match(control(), /recentProvisioning: jobRows\.slice\(0, 8\)/);
  // The dashboard does not query provisioning jobs again.
  assert.doesNotMatch(service(), /\.from\("provisioning_jobs"\)/);
});

test("12. No N+1 customer query pattern is introduced", () => {
  const source = service();
  // A single parallel batch: canonical customers, projects, audit.
  assert.match(source, /const \[platform, \{ data: projects \}, \{ data: activity \}\] = await Promise\.all\(\[/);
  assert.doesNotMatch(source, /for \([\s\S]{0,120}\) \{[\s\S]{0,200}await supabase/);
  assert.match(source, /\.limit\(200\)/);
  assert.match(source, /\.limit\(12\)/);
  // Column-scoped selects only.
  assert.doesNotMatch(source, /\.select\("\*"\)/);
});

test("13-15. Dashboard links preserve customer context into Customer 360", () => {
  const source = page();
  assert.match(source, /`\/admin\/customers\/\$\{item\.clientId\}\?tab=provisioning`/);
  assert.match(source, /`\/admin\/customers\/\$\{job\.clientId\}\?tab=provisioning`/);
  assert.match(source, /`\/admin\/customers\/\$\{project\.clientId\}\?tab=projects`/);
  assert.match(source, /`\/admin\/customers\/\$\{event\.clientId\}\?tab=audit`/);
  assert.match(source, /href="\/admin\/customers"/);
  // No routing into removed global operational pages.
  assert.doesNotMatch(source, /href="\/admin\/reports"|href="\/admin\/submissions"|href="\/admin\/projects"/);
});

test("KPI cards are only clickable when a real destination exists", () => {
  const source = page();
  assert.match(source, /if \(!href\) return <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">\{body\}<\/div>;/);
  assert.match(source, /const KPI_DESTINATIONS: Record<string, string \| undefined>/);
  assert.match(source, /"Total Customers": "\/admin\/customers"/);
  assert.match(source, /"Provisioning Failed": "\/admin\/customers\?provisioningStatus=Failed"/);
});

test("16. Legacy operational components and routes are retained", () => {
  const operations = readFileSync(new URL("../app/admin/operations/page.tsx", import.meta.url), "utf8");
  assert.match(operations, /AdminRoutePage/);
  assert.match(operations, /initialView="dashboard"/);
  // The legacy dashboard, its route helper and the operational routes all still exist.
  for (const file of ["../components/AdminDashboard.tsx", "../app/admin/AdminRoutePage.tsx", "../app/admin/reports/page.tsx", "../app/admin/submissions/page.tsx"]) {
    assert.ok(readFileSync(new URL(file, import.meta.url), "utf8").length > 0, `${file} must be retained`);
  }
});

test("17-18. Core Admin navigation and branding stay repositioned", () => {
  const source = sidebar();
  const adminItems = source.split("const clientItems")[0];
  for (const removed of ["Deployment Reports", "Submissions", "Deployment Map", "Analytics", "Alerts", "Installers"]) {
    assert.doesNotMatch(adminItems, new RegExp(`label: "${removed}"`), `${removed} must stay out of Core Admin navigation`);
  }
  assert.match(source, /\{ view: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "\/admin", routeNavigation: true \}/);
  assert.match(source, /label: "Customer Management"/);
  assert.match(source, /label: "Commercial & Pricing"/);
  // No empty placeholder modules.
  for (const placeholder of ["Provisioning & Workspaces", "Platform Users", "System Health", "Audit & Activity", "Platform Settings"]) {
    assert.doesNotMatch(adminItems, new RegExp(`label: "${placeholder}"`), `${placeholder} must not be an empty placeholder`);
  }
  assert.match(shell(), /<BrandMark compact \/>/);
});

test("dashboard uses meaningful empty states and no fabricated data", () => {
  const source = page();
  for (const empty of ["No provisioning jobs require attention.", "No recent provisioning activity.", "No active projects.", "No recent platform activity."]) {
    assert.ok(source.includes(empty), `missing empty state: ${empty}`);
  }
  // No invented health score or risk rating.
  assert.doesNotMatch(source, /healthScore|riskRating|aiRisk/i);
  // Activity labels are mapped from real audit action types only.
  assert.match(service(), /const ACTIVITY_LABELS: Record<string, string>/);
  assert.match(service(), /\.from\("audit_logs"\)/);
});

test("platform dashboard streams behind a skeleton and does not load operational datasets", () => {
  const source = page();
  assert.match(source, /<Suspense fallback=\{<DashboardSkeleton \/>\}>/);
  assert.match(source, /aria-busy="true"/);
  // The heavy legacy loads stay in AdminRoutePage, not here.
  assert.doesNotMatch(`${source}\n${service()}`, /from\("submissions"\)|from\("deployment_progress"\)|from\("project_targets"\)|from\("submission_status_history"\)/);
});

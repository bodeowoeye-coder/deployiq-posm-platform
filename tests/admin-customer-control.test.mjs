import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const listPage = () => readFileSync(new URL("../app/admin/customers/page.tsx", import.meta.url), "utf8");
const detailPage = () => readFileSync(new URL("../app/admin/customers/[clientId]/page.tsx", import.meta.url), "utf8");
const control = () => readFileSync(new URL("../lib/admin/customerControl.ts", import.meta.url), "utf8");
const customer360 = () => readFileSync(new URL("../lib/admin/customer360.ts", import.meta.url), "utf8");
const sidebar = () => readFileSync(new URL("../components/DashboardSidebar.tsx", import.meta.url), "utf8");
const filters = () => readFileSync(new URL("../components/admin/CustomerManagementFilters.tsx", import.meta.url), "utf8");

test("1. Core Admin Customer Management route is platform-admin protected", () => {
  assert.match(listPage(), /await requireRole\(\["admin"\], "\/admin\/customers"\)/);
  assert.match(detailPage(), /await requireRole\(\["admin"\], `\/admin\/customers\/\$\{params\.clientId\}`\)/);
});

test("2. Customer users cannot access it", () => {
  const auth = readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8");
  // requireRole redirects any non-admin role away from the requested admin path.
  assert.match(auth, /if \(!allowedRoles\.includes\(context\.role\.role\)\) \{\s*redirect\(defaultRouteForRole\(context\.role\.role\)\)/);
  assert.doesNotMatch(listPage(), /requireRole\(\["admin", "client"\]|requireRole\(\["client"\]/);
  assert.doesNotMatch(detailPage(), /requireRole\(\["admin", "client"\]|requireRole\(\["client"\]/);
});

test("3. Provisioned customer appears once — no duplicate customer model", () => {
  const source = control();
  // The list is driven by one row per clients record; every other table is joined by client_id.
  assert.match(source, /supabase\.from\("clients"\)\.select\("id,name,status,created_at"\)/);
  assert.match(source, /const customers: PlatformCustomerSummary\[\] = clientRows\.map\(\(client\) =>/);
  assert.match(source, /new Map\(\(\(settings \?\? \[\]\) as Row\[\]\)\.map\(\(row\) => \[text\(row\.client_id\), row\]\)\)/);
  // No parallel customer/workspace/provisioning table is created.
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(customer360(), /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test("4. Organisation and workspace identities are distinct", () => {
  const source = customer360();
  assert.match(source, /organisation: \{/);
  assert.match(source, /workspace: \{/);
  assert.match(source, /contactPerson: text\(profile\?\.contact_person\)/);
  assert.match(source, /displayName: text\(workspace\?\.workspace_display_name\)/);
  // The detail page renders them as separate sections and never merges the identities.
  assert.match(detailPage(), /<Card title="Organisation"/);
  assert.match(detailPage(), /<Card title="Workspace"/);
  assert.match(detailPage(), /Distinct from the workspace and from the primary administrator/);
});

test("5. Customer 360 resolves the correct workspace", () => {
  const source = customer360();
  assert.match(source, /\.from\("workspace_settings"\)\.select\("\*"\)\.eq\("client_id", clientId\)\.maybeSingle\(\)/);
});

test("6. Primary administrator comes from canonical workspace membership", () => {
  const source = customer360();
  assert.match(source, /people\.find\(\(person\) => person\.roleKey === "workspace_owner"\)/);
  assert.match(source, /people\.find\(\(person\) => person\.roleKey === "customer_admin"\)/);
  assert.match(source, /\.from\("workspace_memberships"\)\.select\("user_id,role_key,status,created_at"\)\.eq\("client_id", clientId\)/);
});

test("7. Projects belong only to the selected customer", () => {
  assert.match(customer360(), /\.from\("projects"\)[\s\S]{0,400}\.eq\("client_id", clientId\)\.is\("archived_at", null\)/);
});

test("8. Users belong only to the selected customer", () => {
  const source = customer360();
  assert.match(source, /\.from\("workspace_memberships"\)[\s\S]{0,120}\.eq\("client_id", clientId\)/);
  // Agencies and installers referenced by projects are also tenant scoped.
  assert.match(source, /\.from\("agencies"\)\.select\("id,agency_name"\)\.eq\("client_id", clientId\)/);
  assert.match(source, /\.from\("installers"\)\.select\("id,installer_name"\)\.eq\("client_id", clientId\)/);
});

test("9. Operational KPIs reuse existing canonical calculations", () => {
  const source = customer360();
  assert.match(source, /outstanding: Math\.max\(expected - actualCount, 0\)/);
  assert.match(source, /completionPercent: expected === 0 \? 0 : Math\.round\(\(actualCount \/ expected\) \* 100\)/);
  // Project geography reuses the canonical geography helpers rather than a new derivation.
  assert.match(source, /deriveProjectRegions\(\{/);
  assert.match(source, /normalizeStates\(/);
});

test("10. Provisioning data matches the existing job and draft records", () => {
  const source = customer360();
  assert.match(source, /\.from\("provisioning_jobs"\)\.select\("\*"\)\.eq\("acquisition_draft_id", draftId\)/);
  assert.match(source, /\.from\("onboarding_drafts"\)[\s\S]{0,160}\.eq\("id", draftId\)/);
  assert.match(source, /\.from\("provisioning_events"\)[\s\S]{0,200}\.eq\("provisioning_job_id", text\(provisioningJob\.id\)\)/);
  // The commercial bridge is product_entitlements.acquisition_draft_id, not a new column.
  assert.match(source, /const draftId = text\(entitlement\?\.acquisition_draft_id\)/);
});

test("11. Cross-customer IDs cannot leak data", () => {
  const source = customer360();
  // Every per-customer query is scoped by the requested clientId.
  const scopedQueries = source.match(/\.eq\("client_id", clientId\)/g) ?? [];
  assert.ok(scopedQueries.length >= 8, `expected client-scoped queries, found ${scopedQueries.length}`);
  assert.match(source, /\.from\("clients"\)[\s\S]{0,160}\.eq\("id", clientId\)/);
  assert.match(source, /if \(!client\) return null;/);
});

test("12. Legacy/manual customer does not crash the page", () => {
  const source = control();
  // A client with no workspace, entitlement, draft or job still produces a row.
  assert.match(source, /if \(!settings\) return "Not provisioned";/);
  assert.match(source, /if \(!draft\) return "Not available";/);
  assert.match(source, /return "Legacy \/ Unknown";/);
  assert.match(customer360(), /exists: Boolean\(workspace\)/);
  assert.match(detailPage(), /Workspace has not been provisioned for this customer\./);
});

test("13. Customer with zero projects renders safely", () => {
  assert.match(detailPage(), /No projects configured\./);
  assert.match(customer360(), /const projectRows = \(projects \?\? \[\]\) as Row\[\]/);
});

test("14. Customer with pending provisioning renders safely", () => {
  assert.match(detailPage(), /Provisioning record not available\./);
  assert.match(detailPage(), /No workspace users yet\./);
  assert.match(control(), /if \(status === "queued"\) return "Pending";/);
});

test("15. Existing Core Admin Clients functionality does not regress", () => {
  const dashboard = readFileSync(new URL("../components/AdminDashboard.tsx", import.meta.url), "utf8");
  const clientsRoute = readFileSync(new URL("../app/api/clients/route.ts", import.meta.url), "utf8");
  // The existing client management panel and API remain intact.
  assert.match(dashboard, /ClientManagementPanel/);
  assert.match(clientsRoute, /await requireAdmin\(\)/);
  // The sidebar evolves the existing clients entry rather than adding a duplicate section.
  assert.match(sidebar(), /\{ view: "clients", label: "Customer Management", icon: UsersRound, href: "\/admin\/customers", routeNavigation: true \}/);
  assert.equal((sidebar().match(/label: "Customer Management"/g) ?? []).length, 1);
  assert.doesNotMatch(sidebar(), /label: "Clients"/);
});

test("16-19. Customer control does not touch workspace, project, user or provisioning write paths", () => {
  const source = `${control()}\n${customer360()}\n${listPage()}\n${detailPage()}`;
  // Referencing these in a comment is fine; calling them is not.
  assert.doesNotMatch(source, /resolveCustomerWorkspaceContext\(/);
  assert.doesNotMatch(source, /inviteWorkspaceUser\(|updateWorkspaceMemberRole\(|acceptWorkspaceInvitations\(/);
  assert.doesNotMatch(source, /createCustomerProject\(|updateCustomerProjectDetails\(/);
  assert.doesNotMatch(source, /startProvisioning\(|retryProvisioning\(/);
});

test("20. Customer 360 links keep the selected customer context", () => {
  const page = detailPage();
  // Drill-downs stay inside Customer 360 rather than jumping to unscoped Core Admin routes.
  assert.match(page, /function tabHref\(clientId: string, tab: Tab\)/);
  assert.match(page, /tab === "overview" \? `\/admin\/customers\/\$\{clientId\}` : `\/admin\/customers\/\$\{clientId\}\?tab=\$\{tab\}`/);
  for (const tab of ["projects", "users", "operations", "provisioning", "commercial"]) {
    assert.ok(page.includes(`tabHref(clientId, "${tab}")`), `missing scoped link for ${tab}`);
  }
  assert.match(page, /href="\/admin\/customers"/);
  // The unscoped Core Admin routes are no longer linked from Customer 360.
  assert.doesNotMatch(page, /href="\/admin\/projects"/);
  assert.doesNotMatch(page, /href="\/admin\/reports"/);
  assert.doesNotMatch(page, /href="\/admin\/submissions"/);
  // Impersonation is explicitly not implemented: no control, only a stated exclusion.
  assert.doesNotMatch(page, /href=\{?["'`][^"'`]*impersonat/i);
  assert.doesNotMatch(page, /onClick=[\s\S]{0,60}impersonat/i);
  assert.match(page, /Impersonation, destructive delete, billing override and subscription cancellation are not available\./);
});

test("21. Open Workspace never routes a platform admin into acquisition/onboarding", () => {
  const control = readFileSync(new URL("../lib/admin/customerControl.ts", import.meta.url), "utf8");
  const page = detailPage();
  const workspaceContext = readFileSync(new URL("../lib/workspace/customerAdmin.ts", import.meta.url), "utf8");

  // Root cause guard: /workspace/admin resolves its tenant from the session, so a platform admin
  // without an authorised support session is returned to Core Admin rather than the acquisition journey.
  assert.match(workspaceContext, /if \(authContext\.role\.role === "admin" && !supportSession\) \{[\s\S]{0,320}throw new CustomerWorkspaceRedirect\("\/admin\/customers"\)/);
  assert.match(workspaceContext, /if \(!supportSession && \(authContext\.role\.role !== "client"[\s\S]{0,400}throw new CustomerWorkspaceRedirect\("\/onboarding"\)/);
  assert.doesNotMatch(control, /buildAdminWorkspaceUrl/);
  assert.doesNotMatch(page, /\/onboarding|\/workspace\/activation/);

  // Only the routable public hostname is offered, and only when wildcard routing is confirmed.
  assert.match(control, /import \{ verifyWorkspaceDestination \} from "@\/lib\/acquisition\/provisioning\/workspaceDestination"/);
  assert.match(control, /if \(readiness\.redirectAllowed\) \{[\s\S]{0,200}external: true/);
  assert.match(control, /href: null,\s*external: false,\s*reason: "Workspace hostname routing is not enabled in this environment\./);
  assert.doesNotMatch(control, /`\$\{slug\}\.\$\{base\}`|`\$\{[a-zA-Z]+\}\.deployiq\.ng`/);
  assert.doesNotMatch(control, /DEPLOYIQ_WORKSPACE_DOMAIN/);

  // Open Workspace now goes through the audited support-access flow.
  assert.match(page, /<OpenWorkspaceSupportAccess/);
  assert.match(page, /provisioned=\{workspace\.exists\}/);
  assert.match(page, /Opening the workspace starts a recorded DeployIQ support session\./);
});

test("22. Production destination is only used when wildcard routing is confirmed", () => {
  const destination = readFileSync(new URL("../lib/acquisition/provisioning/workspaceDestination.ts", import.meta.url), "utf8");
  assert.match(destination, /const wildcardRoutingConfirmed = isEnabled\(process\.env\.DEPLOYIQ_WORKSPACE_WILDCARD_ROUTING_ENABLED\)/);
  assert.match(destination, /redirectAllowed: deploymentReady/);
  assert.match(destination, /export function buildAdminWorkspaceUrl\(slug: string\) \{\s*return `\/workspace\/admin\?workspace=\$\{encodeURIComponent\(slug\)\}`;/);
});

test("23. Core Admin shell persists across Customer Management and Customer 360", () => {
  const layout = readFileSync(new URL("../app/admin/customers/layout.tsx", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../components/admin/CoreAdminShell.tsx", import.meta.url), "utf8");
  assert.match(layout, /export default function CustomerManagementLayout/);
  assert.match(layout, /<CoreAdminShell>\{children\}<\/CoreAdminShell>/);
  assert.match(shell, /<DashboardSidebar audience="admin" activeView=\{activeView\} \/>/);
  assert.match(shell, /activeView = "clients"/);
  assert.match(layout, /<CoreAdminShell>\{children\}<\/CoreAdminShell>/);
  // The list and detail pages no longer own the page chrome.
  assert.doesNotMatch(listPage(), /min-h-screen bg-slate-50/);
  assert.doesNotMatch(detailPage(), /min-h-screen bg-slate-50/);
  // View-only sidebar items stay navigable without a view handler.
  assert.match(sidebar(), /if \(!onSelectView && audience === "admin"\)/);
});

test("24. Customer 360 is organised into the required sections", () => {
  const page = detailPage();
  assert.match(page, /const TABS = \["overview", "workspace", "projects", "users", "operations", "commercial", "provisioning", "audit"\] as const/);
  assert.match(page, /aria-label="Customer 360 sections"/);
  assert.match(page, /aria-current=\{tab === item \? "page" : undefined\}/);
  // Overview surfaces identity, workspace, product/plan, counts, performance and statuses.
  for (const label of ["Workspace Status", "Activation", "Product", "Plan", "Commercial Status", "Provisioning Status", "Projects", "Active Members", "Pending Invitations"]) {
    assert.ok(page.includes(`<Info label="${label}">`), `overview missing ${label}`);
  }
  assert.match(page, /<Card title="Deployment Performance"/);
  assert.match(page, /<Info label="Active Alerts">/);
  // An unknown tab falls back to overview rather than rendering nothing.
  assert.match(page, /TABS\.includes\(requestedTab\) \? requestedTab : "overview"/);
});

test("25. Legacy customers are preserved, never modified", () => {
  const control = readFileSync(new URL("../lib/admin/customerControl.ts", import.meta.url), "utf8");
  const customer360Source = readFileSync(new URL("../lib/admin/customer360.ts", import.meta.url), "utf8");
  assert.match(control, /return "Legacy \/ Unknown";/);
  // Still read-only: no write of any kind against the customer records.
  assert.doesNotMatch(`${control}\n${customer360Source}`, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test("26. Sidebar route modules navigate on click instead of only rewriting the URL", () => {
  const source = sidebar();
  // The history.pushState view shortcut must not swallow navigation to real routes.
  assert.match(source, /routeNavigation\?: boolean;/);
  assert.match(source, /if \(routeNavigation\) \{\s*setOpen\(false\);\s*return;\s*\}/);
  assert.match(source, /\{ view: "clients", label: "Customer Management", icon: UsersRound, href: "\/admin\/customers", routeNavigation: true \}/);
  assert.match(source, /href: "\/admin\/commercial\/pricing", routeNavigation: true/);
  // The pushState shortcut still exists for the dashboard host that owns in-page views.
  assert.match(source, /window\.history\.pushState\(null, "", href\)/);
});

test("27. Core Admin navigation is repositioned as the platform control plane", () => {
  const source = sidebar();
  for (const removed of ["Deployment Reports", "Submissions", "Deployment Map", "Analytics", "Alerts", "Installers"]) {
    assert.doesNotMatch(source.split("const clientItems")[0], new RegExp(`label: "${removed}"`), `${removed} must not remain a global Core Admin module`);
  }
  assert.match(source, /label: "Dashboard"/);
  assert.match(source, /label: "Customer Management"/);
  assert.match(source, /label: "Commercial & Pricing"/);
  // Underlying views/routes are retained, only global navigation changed.
  const dashboard = readFileSync(new URL("../components/AdminDashboard.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /activeView === "submissions"|activeView === "reports"/);
  assert.match(source, /Their views and routes are\n\/\/ retained inside AdminDashboard/);
  const reportsRoute = readFileSync(new URL("../app/admin/reports/page.tsx", import.meta.url), "utf8");
  assert.match(reportsRoute, /AdminRoutePage/);
});

test("28. Core Admin branding drops the platform tagline", () => {
  const shell = readFileSync(new URL("../components/admin/CoreAdminShell.tsx", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../components/AdminDashboard.tsx", import.meta.url), "utf8");
  const brand = readFileSync(new URL("../components/BrandMark.tsx", import.meta.url), "utf8");
  assert.match(shell, /<BrandMark compact \/>/);
  assert.match(dashboard, /<BrandMark compact \/>/);
  // The tagline is still available to non-admin surfaces.
  assert.match(brand, /\{!compact \? \([\s\S]{0,320}Field Deployment Intelligence Platform/);
});

test("29. Platform health metrics come from canonical data", () => {
  const control = readFileSync(new URL("../lib/admin/customerControl.ts", import.meta.url), "utf8");
  const page = listPage();
  for (const label of ["Total Customers", "Active Workspaces", "Provisioning Pending", "Provisioning Failed", "Active Projects", "Active Users", "Customers With Alerts"]) {
    assert.ok(control.includes(`label: "${label}"`), `missing platform metric ${label}`);
  }
  assert.match(control, /recentProvisioning: jobRows\.slice\(0, 8\)/);
  assert.match(control, /\.from\("notification_events"\)\.select\("client_id"\)/);
  assert.match(page, /Recent Provisioning Activity/);
  assert.match(page, /No provisioning activity recorded\./);
});

test("customer list search and filters cover the required fields", () => {
  const source = control();
  assert.match(source, /customer\.organisation,\s*customer\.clientId,\s*customer\.workspaceUrl,\s*customer\.workspaceSlug,\s*customer\.primaryAdministrator,\s*customer\.primaryAdministratorEmail,/);
  assert.match(source, /if \(product && customer\.productKey !== product\) return false;/);
  assert.match(source, /if \(plan && customer\.plan !== plan\) return false;/);
  assert.match(source, /if \(workspaceStatus && customer\.workspaceStatus !== workspaceStatus\) return false;/);
  assert.match(source, /if \(provisioningStatus && customer\.provisioningStatus !== provisioningStatus\) return false;/);
  assert.match(filters(), /placeholder="Organisation, customer ID, workspace URL or administrator email"/);
});

test("customer list avoids N+1 lookups and streams heavy sections", () => {
  const source = control();
  // One parallel batch for the whole list, then in-memory joins.
  assert.match(source, /\] = await Promise\.all\(\[[\s\S]{0,1400}supabase\.from\("onboarding_drafts"\)/);
  assert.match(source, /function countBy\(rows: Row\[\], key: string\)/);
  assert.doesNotMatch(source, /for \(const client of clientRows\)[\s\S]{0,200}await /);
  // Operational health is a separate, streamed payload.
  assert.match(customer360(), /export async function getPlatformCustomerOperations/);
  assert.match(detailPage(), /<Suspense fallback=\{<PanelSkeleton \/>\}>/);
  assert.match(detailPage(), /aria-busy="true"/);
});

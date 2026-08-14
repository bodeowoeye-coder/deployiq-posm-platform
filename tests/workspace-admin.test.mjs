import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  CUSTOMER_ADMIN_NAVIGATION,
  assertCustomerTenantAccess,
} from "../lib/workspace/customerAdminModel.ts";
import {
  CUSTOMER_ADMIN_ACCOUNT_SETTINGS_NAV_ITEMS,
  CUSTOMER_ADMIN_MODULE_AUDIT,
  CUSTOMER_ADMIN_NAV_ITEMS,
  CUSTOMER_ADMIN_RECENT_ACTIVITY,
  derivePrimaryWorkspaceAction,
  deriveWorkspaceSetupSteps,
  directoryLabelForProduct,
  workspaceHealth,
  workspaceSetupProgress,
} from "../lib/workspace/customerAdminFoundation.ts";

test("workspace admin: route is tenant-aware and uses the customer resolver", () => {
  const page = readFileSync(new URL("../app/workspace/admin/page.tsx", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../app/workspace/admin/layout.tsx", import.meta.url), "utf8");
  assert.match(page, /resolveCustomerWorkspaceContext/);
  assert.match(page, /resolveCustomerWorkspaceHomeContext/);
  assert.match(layout, /requireCustomerWorkspace/);
  assert.match(layout, /CustomerWorkspaceShell/);
  assert.doesNotMatch(page, /ClientDashboard/);
  assert.doesNotMatch(page, /DeploymentProgress/);
});

test("workspace admin: first-login homepage contains the setup checklist", () => {
  const page = readFileSync(new URL("../app/workspace/admin/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Welcome to DeployIQ Retail/);
  assert.match(page, /Your workspace has been successfully activated/);
  assert.match(page, /Workspace setup progress/);
  assert.match(page, /primaryAction\.primaryCta/);
  assert.match(page, /workspace\.setupSteps\.map/);
  const steps = deriveWorkspaceSetupSteps({
    directoryUploaded: false,
    projectCount: 0,
    membershipCount: 1,
    approvalWorkflowConfigured: false,
    campaignCount: 0,
    deploymentStarted: false,
  }, "retail");
  assert.equal(steps[0].label, "Upload Outlet Directory");
  assert.equal(steps[0].status, "In Progress");
  assert.equal(steps[1].label, "Create First Project");
  assert.equal(steps[2].label, "Invite Team Members");
  assert.equal(steps[3].label, "Configure Approval Workflow");
  assert.equal(steps[4].label, "Review Campaign Metadata");
  assert.equal(steps[5].label, "Launch First Deployment");
});

test("workspace admin: homepage includes workspace information", () => {
  const page = readFileSync(new URL("../app/workspace/admin/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Organisation/);
  assert.match(page, /Workspace URL/);
  assert.match(page, /Product/);
  assert.match(page, /Plan/);
  assert.match(page, /Primary administrator/);
  assert.match(page, /Activation status/);
});

test("workspace admin: tenant navigation includes Phase 1 modules", () => {
  assert.deepEqual(CUSTOMER_ADMIN_NAVIGATION, [
    "Home / Dashboard",
    "Deployment Reports",
    "Submissions",
    "Deployment Map",
    "Analytics",
    "Alerts",
    "Installers",
    "Notifications",
  ]);
  assert.equal(CUSTOMER_ADMIN_NAV_ITEMS.find((item) => item.label === "Deployment Reports")?.href, "/workspace/admin/reports");
  assert.equal(CUSTOMER_ADMIN_NAV_ITEMS.find((item) => item.label === "Submissions")?.href, "/workspace/admin/submissions");
  assert.equal(CUSTOMER_ADMIN_NAV_ITEMS.find((item) => item.label === "Alerts")?.href, "/workspace/admin/alerts");
  assert.equal(CUSTOMER_ADMIN_NAV_ITEMS.find((item) => item.label === "Installers")?.href, "/workspace/admin/installers");
  assert.equal(CUSTOMER_ADMIN_NAV_ITEMS.find((item) => item.label === "Analytics")?.status, "available");
  assert.equal(CUSTOMER_ADMIN_NAV_ITEMS.find((item) => item.label === "Clients"), undefined);
  assert.equal(CUSTOMER_ADMIN_NAV_ITEMS.find((item) => item.label === "Commercial Pricing"), undefined);
});

test("workspace admin: configuration lives under Account Settings", () => {
  assert.deepEqual(CUSTOMER_ADMIN_ACCOUNT_SETTINGS_NAV_ITEMS.map((item) => item.label), [
    "Profile",
    "Create Project",
    "Campaign Management",
    "Approval Workflow",
    "Outlet Directory",
    "User Management",
    "Agencies",
    "Workspace Settings",
    "Billing & Plan",
    "Audit Logs",
  ]);
  assert.equal(CUSTOMER_ADMIN_ACCOUNT_SETTINGS_NAV_ITEMS.find((item) => item.label === "Approval Workflow")?.href, "/workspace/admin/approval-workflow");
  assert.equal(CUSTOMER_ADMIN_ACCOUNT_SETTINGS_NAV_ITEMS.find((item) => item.label === "Outlet Directory")?.href, "/workspace/admin/upload-directory");
  assert.equal(CUSTOMER_ADMIN_ACCOUNT_SETTINGS_NAV_ITEMS.find((item) => item.label === "User Management")?.href, "/workspace/admin/team");
  assert.equal(CUSTOMER_ADMIN_ACCOUNT_SETTINGS_NAV_ITEMS.find((item) => item.label === "Workspace Settings")?.href, "/workspace/admin/workspace-settings");
});

test("workspace admin: settings and sign out actions remain globally available", () => {
  const shell = readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");
  const settingsClient = readFileSync(new URL("../components/workspace/WorkspaceSettingsClient.tsx", import.meta.url), "utf8");
  const signOut = readFileSync(new URL("../components/SignOutButton.tsx", import.meta.url), "utf8");
  assert.match(shell, /Account Settings/);
  assert.match(shell, /CUSTOMER_ADMIN_ACCOUNT_SETTINGS_NAV_ITEMS\.map/);
  assert.match(settingsClient, /Account & Security/);
  assert.match(settingsClient, /workspace-settings\/security/);
  assert.match(shell, /href=\{item\.href\}/);
  assert.doesNotMatch(shell, /Account & Security/);
  assert.doesNotMatch(shell, /href="\/login\/create-password/);
  assert.match(shell, /SignOutButton/);
  assert.match(signOut, /Sign out/);
});

test("workspace admin: no misleading operational KPI copy appears on first login", () => {
  const page = readFileSync(new URL("../app/workspace/admin/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /Total submissions|Deployment progress|Completion rate|Approved submissions/i);
  assert.match(page, /Workspace health/);
  assert.equal(CUSTOMER_ADMIN_RECENT_ACTIVITY.includes("No deployments received yet"), true);
});

test("workspace admin: customer_admin cannot access another tenant", () => {
  const context = { role: "customer_admin", clientId: "tenant-a" };
  assert.equal(assertCustomerTenantAccess(context, "tenant-a"), true);
  assert.throws(() => assertCustomerTenantAccess(context, "tenant-b"), /another tenant/);
});

test("workspace admin: browser-supplied client or workspace id cannot override scope", () => {
  const resolver = readFileSync(new URL("../lib/workspace/customerAdmin.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/workspace/admin/page.tsx", import.meta.url), "utf8");
  assert.match(resolver, /authContext\.role\.client_id/);
  assert.doesNotMatch(page, /searchParams/);
});

test("workspace admin: client viewer is not upgraded automatically", () => {
  const resolver = readFileSync(new URL("../lib/workspace/customerAdmin.ts", import.meta.url), "utf8");
  assert.match(resolver, /roleKey === "client_viewer"/);
  assert.match(resolver, /CustomerWorkspaceRedirect\("\/client"\)/);
  assert.doesNotMatch(resolver, /roleKey === "client_viewer".*return "customer_admin"/);
});

test("workspace admin: safe development backfill is opt-in and ownership based", () => {
  const script = readFileSync(new URL("../scripts/backfill-customer-admin-workspace-roles.mjs", import.meta.url), "utf8");
  assert.match(script, /DEPLOYIQ_ENABLE_CUSTOMER_ADMIN_BACKFILL/);
  assert.match(script, /Refusing to run customer-admin backfill in production/);
  assert.match(script, /draft\.authenticated_user_id !== userId/);
  assert.match(script, /role_key: "customer_admin"/);
  assert.match(script, /onConflict: "client_id,user_id"/);
});

test("workspace admin: shared admin component audit is documented in page strategy", () => {
  const projectAudit = CUSTOMER_ADMIN_MODULE_AUDIT.find((item) => item.module === "Projects");
  const reportsAudit = CUSTOMER_ADMIN_MODULE_AUDIT.find((item) => item.module === "Reports");
  const locationsAudit = CUSTOMER_ADMIN_MODULE_AUDIT.find((item) => item.module === "Deployment Locations");
  assert.equal(projectAudit?.existingComponent, "ProjectDashboardShell");
  assert.equal(reportsAudit?.classification, "reuse_immediately");
  assert.equal(locationsAudit?.service, "lib/deploymentLocationsImport.ts");
  assert.equal(locationsAudit?.classification, "reuse_immediately");
  assert.match(locationsAudit?.tenantIsolationPoint ?? "", /deployment_locations\.client_id\/workspace_id/);
});

test("workspace admin: setup progress and primary CTA adapt to tenant state", () => {
  const initial = deriveWorkspaceSetupSteps({
    directoryUploaded: false,
    projectCount: 0,
    membershipCount: 1,
    approvalWorkflowConfigured: false,
    campaignCount: 0,
    deploymentStarted: false,
  }, "retail");
  assert.equal(derivePrimaryWorkspaceAction(initial).primaryCta, "Upload Your Directory");
  assert.deepEqual(workspaceSetupProgress(initial), { completed: 0, total: 6, percent: 0 });

  const afterDirectory = deriveWorkspaceSetupSteps({
    directoryUploaded: true,
    projectCount: 0,
    membershipCount: 1,
    approvalWorkflowConfigured: false,
    campaignCount: 0,
    deploymentStarted: false,
  }, "retail");
  assert.equal(derivePrimaryWorkspaceAction(afterDirectory).primaryCta, "Create Your First Project");
  assert.equal(workspaceSetupProgress(afterDirectory).percent, 17);
});

test("workspace admin: not-started recommended milestones render neutrally", () => {
  const page = readFileSync(new URL("../app/workspace/admin/page.tsx", import.meta.url), "utf8");
  const steps = deriveWorkspaceSetupSteps({
    directoryUploaded: true,
    projectCount: 1,
    membershipCount: 2,
    approvalWorkflowConfigured: false,
    campaignCount: 0,
    deploymentStarted: false,
  }, "retail");
  const approval = steps.find((step) => step.key === "configure_workflow");
  assert.equal(approval?.label, "Configure Approval Workflow");
  assert.equal(approval?.status, "In Progress");
  assert.equal(approval?.href, "/workspace/admin/approval-workflow");
  assert.match(page, /displayMilestoneStatus\(item\.status\)/);
  assert.match(page, /statusClass\(milestoneStatus\)/);
  assert.match(page, /item\.key === primaryAction\.key && item\.status !== "Completed"/);
  assert.match(page, /Recommended/);
  assert.match(page, /status === "Completed" \? "Completed" : "Not Started"/);
  assert.doesNotMatch(page, /statusClass\(item\.status\)/);
  assert.doesNotMatch(page, /focus-within|:active|selectedMilestone|activeMilestone/);
});

test("workspace admin: workspace health uses setup state instead of fake KPIs", () => {
  const health = workspaceHealth({
    directoryUploaded: true,
    projectCount: 1,
    membershipCount: 2,
    approvalWorkflowConfigured: false,
    campaignCount: 0,
    deploymentStarted: false,
  });
  assert.deepEqual(health.map((item) => item.label), [
    "Workspace Activated",
    "Workspace Secured",
    "Directory Uploaded",
    "Project Created",
    "Team Invited",
    "Campaign Created",
    "Deployment Started",
  ]);
  assert.equal(health.find((item) => item.label === "Directory Uploaded")?.state, "Completed");
  assert.equal(health.find((item) => item.label === "Campaign Created")?.state, "Not Started");
});

test("workspace admin: directory labels support future product directories", () => {
  assert.equal(directoryLabelForProduct("retail"), "Outlet Directory");
  assert.equal(directoryLabelForProduct("fleet"), "Vehicle Directory");
  assert.equal(directoryLabelForProduct("build"), "Property / Site Directory");
  assert.equal(directoryLabelForProduct("healthcare"), "Facility Directory");
});

test("workspace admin: upload directory route reuses shared importer and writes only through tenant-safe APIs", () => {
  const page = readFileSync(new URL("../app/workspace/admin/upload-directory/page.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("../components/workspace/DirectoryImportClient.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/workspace/directoryImport.ts", import.meta.url), "utf8");
  assert.match(page, /getWorkspaceDirectoryDashboard/);
  assert.match(service, /resolveCustomerWorkspaceContext/);
  assert.match(service, /previewDeploymentLocationImport/);
  assert.match(service, /commit_workspace_directory_import/);
  assert.match(service, /eq\("client_id", workspace\.clientId\)/);
  assert.doesNotMatch(page, /BrandMark/);
  assert.doesNotMatch(page, /Workspace navigation/);
  assert.match(client, /Upload CSV \/ Excel/);
  assert.match(client, /Download Template/);
  assert.match(client, /aria-label=\{`Download \$\{directoryLabel\} template`\}/);
  assert.doesNotMatch(page, /href="\/api\/workspace\/directory\/template"/);
  assert.match(client, /Validation/);
  assert.match(client, /Duplicate Detection/);
  assert.match(client, /Commit Import/);
  assert.match(client, /Discard Import/);
  assert.match(client, /Start New Import/);
  assert.match(client, /Discard this import\?/);
  assert.match(client, /Import completed successfully/);
  assert.match(client, /Import History/);
  assert.match(client, /Rollback in Phase 3/);
  assert.doesNotMatch(page, /\.from\("deployment_locations"\)\.insert/);
  assert.doesNotMatch(page, /searchParams/);
});

test("workspace admin: valid Customer Admin can open Submissions without false access denial", () => {
  const page = readFileSync(new URL("../app/workspace/admin/submissions/page.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("../components/workspace/WorkspaceSubmissionsClient.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/workspace/deploymentExecution.ts", import.meta.url), "utf8");
  const reporting = readFileSync(new URL("../lib/reporting.ts", import.meta.url), "utf8");
  assert.match(page, /getWorkspaceDeploymentSubmissions/);
  assert.match(service, /async function resolveCustomerAdminContext\(\) \{\s*return await resolveCustomerWorkspaceContext\(\);\s*\}/);
  assert.doesNotMatch(service.match(/async function resolveCustomerAdminContext\(\)[\s\S]*?\n\}/)?.[0] ?? "", /Customer workspace access is required|status:\s*401/);
  assert.doesNotMatch(service, /selected_outlet_state/);
  assert.match(service, /resolved_state,installer_state,state_region/);
  assert.match(reporting, /const state = item\.installer_state \|\| "Unknown"/);
  assert.match(service, /location_state: text\(row\.resolved_state\) \|\| text\(row\.installer_state\) \|\| text\(row\.state_region\) \|\| null/);
  assert.match(service, /\.eq\("client_id", workspace\.clientId\)/);
  assert.doesNotMatch(service.match(/export async function getWorkspaceDeploymentSubmissions\(\)[\s\S]*?limit\(500\);/)?.[0] ?? "", /\.eq\("workspace_id", workspace\.clientId\)/);
  assert.match(service, /Historical Core submissions can be tenant-scoped by client_id before workspace_id existed/);
  assert.match(service, /\.is\("archived_at", null\)/);
  assert.match(service, /\.order\("submitted_at", \{ ascending: false \}\)/);
  assert.match(service, /queryStatus: "error" as const/);
  assert.match(service, /queryStatus: "success" as const/);
  assert.match(service, /isEmpty: submissions\.length === 0/);
  for (const field of ["code", "message", "details", "hint"]) {
    assert.match(service, new RegExp(`${field}:`));
  }
  assert.match(page, /WorkspaceSubmissionsClient/);
  assert.match(client, /hasQueryFailure/);
  assert.match(client, /Unavailable/);
  assert.match(client, /location_state/);
  assert.match(client, /STATUS_FILTERS/);
  assert.match(client, /SUBMISSION_REJECTION_REASONS/);
  assert.doesNotMatch(client, /type="hidden"/);
  assert.doesNotMatch(client, /Please correct and resubmit this deployment/);
});

test("workspace admin: Approval Workflow configuration persists to workspace settings without new schema", () => {
  const page = readFileSync(new URL("../app/workspace/admin/approval-workflow/page.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("../components/workspace/ApprovalWorkflowClient.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/workspace/approvalWorkflow.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/workspace/approval-workflow/route.ts", import.meta.url), "utf8");
  assert.match(page, /APPROVAL WORKFLOW/);
  assert.match(page, /Configure how deployment submissions are reviewed, corrected and approved within this workspace\./);
  assert.match(route, /getApprovalWorkflowDashboard/);
  assert.match(route, /saveApprovalWorkflow/);
  assert.match(service, /dashboard_config/);
  assert.match(service, /approvalWorkflow/);
  assert.match(service, /workspace_onboarding_checklist_items/);
  assert.match(service, /item_key", "configure_approval_workflow"/);
  assert.match(service, /settings\.manage/);
  assert.match(service, /submissions\.review/);
  assert.match(service, /role\.appRole !== "installer"/);
  assert.doesNotMatch(service, /create table|alter table|migration/i);
  assert.match(client, /Customer Review/);
  assert.match(client, /Automatic Approval/);
  assert.match(client, /Save Configuration/);
});

test("workspace admin: Alerts is tenant-scoped and available in main navigation", () => {
  const page = readFileSync(new URL("../app/workspace/admin/alerts/page.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/workspace/alerts.ts", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");
  assert.match(page, /getWorkspaceAlertsDashboard/);
  assert.match(page, /Alerts/);
  assert.match(service, /resolveCustomerWorkspaceContext/);
  assert.match(service, /\.from\("projects"\)[\s\S]*\.eq\("client_id", workspace\.clientId\)/);
  assert.match(service, /\.from\("submissions"\)[\s\S]*\.eq\("client_id", workspace\.clientId\)/);
  assert.match(service, /Overdue project|Low completion|Outstanding deployment risk|Project exception/);
  assert.match(shell, /Alerts: "Review tenant-scoped project and deployment exceptions\."/);
  assert.doesNotMatch(service, /from\("clients"\)|Commercial Pricing|Core Admin/);
});

test("workspace admin: team drawer shows read-only tenant-scoped field assignments", () => {
  const service = readFileSync(new URL("../lib/workspace/team.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../components/workspace/WorkspaceTeamClient.tsx", import.meta.url), "utf8");
  assert.match(service, /FIELD_ASSIGNMENT_ROLE_KEYS/);
  assert.match(service, /\.from\("workspace_field_assignments"\)/);
  assert.match(service, /\.eq\("client_id", workspace\.clientId\)/);
  assert.match(service, /\.eq\("workspace_id", workspace\.clientId\)/);
  assert.match(service, /\.from\("projects"\)[\s\S]*\.eq\("client_id", workspace\.clientId\)/);
  assert.match(service, /assignedProjectNames: assignmentSummary\.assignedProjectNames/);
  assert.match(service, /showsAssignedProjects: FIELD_ASSIGNMENT_ROLE_KEYS\.has\(role\.key\)/);
  assert.match(client, /Assigned Projects/);
  assert.match(client, /Assigned Regions/);
  assert.doesNotMatch(client, /Manage field assignments/);
  assert.doesNotMatch(client, /href="\/workspace\/admin\/installers"/);
  assert.doesNotMatch(client, /action: "assign_project"|assignedProjectIds|workspace_field_assignments/);
});

test("workspace admin: Platform Admin remains separate from Customer Admin", () => {
  const workspacePage = readFileSync(new URL("../app/workspace/admin/page.tsx", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");
  const platformPage = readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  assert.match(shell, /DeployIQ Admin Workspace/);
  assert.doesNotMatch(workspacePage, /requireRole\("admin"\)/);
  assert.match(platformPage, /AdminRoutePage/);
  assert.doesNotMatch(platformPage, /resolveCustomerWorkspaceContext/);
});

test("workspace admin: global shell contains persistent header navigation footer and breadcrumbs", () => {
  const shell = readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(shell, /DeployIQ Admin Workspace/);
  assert.match(shell, /Search workspace/);
  assert.doesNotMatch(shell, /Search \(Coming Soon\)|Global Search Coming Soon|disabled/);
  assert.match(shell, /customer-workspace-shell/);
  assert.match(shell, /customer-workspace-sidebar/);
  assert.match(css, /--cw-page: #f7f8fa/);
  assert.match(css, /--cw-sidebar: #e6ecf5/);
  assert.match(css, /\.customer-workspace-shell[\s\S]*var\(--cw-page\)/);
  assert.match(css, /\.customer-workspace-sidebar[\s\S]*var\(--cw-sidebar\)/);
  assert.match(shell, /import Link from "next\/link"/);
  assert.match(shell, /prefetch/);
  assert.doesNotMatch(shell, /bg-slate-950 px-5 py-5 text-white/);
  assert.doesNotMatch(shell, /transition focus:outline-none focus:ring-2 focus:ring-orange-300 focus:ring-offset-2/);
  assert.match(shell, /NotificationCenter enabled/);
  assert.match(shell, /Help/);
  assert.match(shell, /Settings/);
  assert.match(shell, /SignOutButton/);
  assert.match(shell, /aria-label="Workspace navigation"/);
  assert.match(shell, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(shell, /aria-label="Breadcrumb"/);
  assert.match(shell, /Workspace status:/);
  assert.match(shell, /Documentation/);
  assert.match(shell, /Support/);
});

test("workspace admin: shell keeps workspace identity compact in the header", () => {
  const shell = readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");
  const sidebar = shell.match(/<aside[\s\S]*?<\/aside>/)?.[0] ?? "";
  const header = shell.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
  assert.doesNotMatch(sidebar, /workspace\.workspaceName|workspace\.workspaceUrl|Customer Workspace/);
  assert.match(header, /aria-label="Workspace identity"/);
  assert.match(header, /workspace\.branding\.organisationDisplayName/);
  assert.match(header, /workspace\.branding\.workspaceInitials/);
  assert.match(header, /workspace\.customerId/);
  assert.match(header, /workspace\.productName/);
  assert.match(header, /workspace-identity-static/);
  assert.match(header, /Account Settings/);
  assert.match(header, /CUSTOMER_ADMIN_ACCOUNT_SETTINGS_NAV_ITEMS\.map/);
  assert.doesNotMatch(header, /<details|<summary|workspace-menu/);
  assert.doesNotMatch(header, /href="\/workspace\/admin\/profile"/);
  assert.doesNotMatch(header, /href="\/workspace\/admin\/workspace-settings\/security"/);
});

test("workspace admin: Settings opens Customer Workspace Settings, never Client Dashboard", () => {
  const shell = readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");
  const settingsPage = readFileSync(new URL("../app/workspace/admin/workspace-settings/page.tsx", import.meta.url), "utf8");
  const settingsClient = readFileSync(new URL("../components/workspace/WorkspaceSettingsClient.tsx", import.meta.url), "utf8");
  assert.match(shell, /Account Settings/);
  assert.match(shell, /CUSTOMER_ADMIN_ACCOUNT_SETTINGS_NAV_ITEMS\.map/);
  assert.equal(CUSTOMER_ADMIN_ACCOUNT_SETTINGS_NAV_ITEMS.find((item) => item.href === "/workspace/admin/workspace-settings")?.label, "Workspace Settings");
  assert.doesNotMatch(shell, /href="\/client"[^>]*Settings|href="\/workspace\/admin\/settings"/);
  assert.match(settingsPage, /WorkspaceSettingsClient/);
  assert.match(settingsPage, /resolveCustomerWorkspaceContext/);
  assert.match(settingsClient, /Workspace Settings/);
  assert.doesNotMatch(settingsPage + settingsClient, /Customer Workspace route|Settings are served inside|Configuration roadmap|Tenant scope locked/i);
  assert.doesNotMatch(settingsPage + settingsClient, /href="\/client"|href="\/admin"/);
});

test("workspace admin: customer display ID is stable and derived from the workspace account", () => {
  const resolver = readFileSync(new URL("../lib/workspace/customerAdmin.ts", import.meta.url), "utf8");
  assert.match(resolver, /export function customerDisplayId\(clientId: string\)/);
  assert.match(resolver, /DQ-CUST-/);
  assert.match(resolver, /customerId: customerDisplayId\(clientId\)/);
  assert.match(resolver, /workspace_branding/);
  assert.doesNotMatch(resolver, /Math\.random|crypto\.randomUUID\(\)/);
});

test("workspace admin: Workspace Settings exposes product-grade settings without unsafe custom code", () => {
  const settingsClient = readFileSync(new URL("../components/workspace/WorkspaceSettingsClient.tsx", import.meta.url), "utf8");
  for (const label of ["General", "Appearance", "Branding", "Account & Security", "Notifications", "Users & Permissions", "Billing & Plan", "Integrations"]) {
    assert.match(settingsClient, new RegExp(label.replace(/[&]/g, "\\$&")));
  }
  assert.match(settingsClient, /settingsSections/);
  assert.match(settingsClient, /workspace-settings\/general/);
  assert.match(settingsClient, /workspace-settings\/appearance/);
  assert.match(settingsClient, /workspace-settings\/branding/);
  assert.match(settingsClient, /workspace-settings\/security/);
  assert.match(settingsClient, /workspace-settings\/notifications/);
  assert.match(settingsClient, /workspace-settings\/access/);
  assert.match(settingsClient, /workspace-settings\/billing/);
  assert.match(settingsClient, /workspace-settings\/integrations/);
  assert.doesNotMatch(settingsClient, /const tabs =/);
  assert.doesNotMatch(settingsClient, /aria-label="Workspace settings sections"/);
  assert.match(settingsClient, /customerWorkspaceAppearanceKey/);
  assert.match(settingsClient, /deployiq:cw:appearance:\$\{userId\}/);
  assert.doesNotMatch(settingsClient, /deployiq\.workspace\.appearance/);
  assert.match(settingsClient, /themePreference/);
  assert.match(settingsClient, /fontSize/);
  assert.match(settingsClient, /density/);
  assert.match(settingsClient, /navigator\.clipboard\.writeText\(workspace\.customerId\)/);
  assert.match(settingsClient, /image\/png/);
  assert.match(settingsClient, /image\/jpeg/);
  assert.match(settingsClient, /image\/svg\+xml/);
  assert.match(settingsClient, /maxLogoSize = 1_000_000/);
  assert.match(settingsClient, /Reset signature unavailable/);
  assert.match(settingsClient, /roleLabel/);
  assert.match(settingsClient, /membershipLabel/);
  assert.match(settingsClient, /Full workspace administrator access/);
  assert.match(settingsClient, /Last successful sign-in" value="Not available"/);
  assert.doesNotMatch(settingsClient, /workspace permissions enabled|Shown when available from the authentication provider/);
  assert.doesNotMatch(settingsClient, /\/login\/create-password/);
  assert.doesNotMatch(settingsClient, /font upload|custom css|CSS injection/i);
});

test("workspace admin: profile route is authenticated and uses the shared workspace card system", () => {
  const profile = readFileSync(new URL("../app/workspace/admin/profile/page.tsx", import.meta.url), "utf8");
  const activation = readFileSync(new URL("../app/workspace/activation/page.tsx", import.meta.url), "utf8");
  assert.match(profile, /resolveCustomerWorkspaceContext/);
  assert.match(profile, /Workspace ID/);
  assert.match(profile, /Account Security/);
  assert.match(profile, /Change Password/);
  assert.match(profile, /workspace-card/);
  assert.match(profile, /workspace-subtle-card/);
  assert.match(profile, /workspace-settings-link-active/);
  assert.match(profile, /workspace-button-secondary/);
  assert.match(profile, /Customer Administrator/);
  assert.match(profile, /Last sign-in" value="Not available"/);
  assert.doesNotMatch(profile, /SignOutButton|customer_admin|Shown when available from the authentication provider/);
  assert.match(profile, /href="\/workspace\/admin\/workspace-settings\/security/);
  assert.doesNotMatch(profile, /\/login\/create-password/);
  assert.match(activation, /passwordChangeRequired/);
  assert.match(activation, /\/login\/create-password/);
});

test("workspace admin: header controls are ordered with Settings before identity and Sign Out last", () => {
  const shell = readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");
  const controls = shell.match(/<div className="flex flex-wrap items-center gap-2 xl:flex-nowrap xl:justify-end">[\s\S]*?<\/div>\n            <\/div>/)?.[0] ?? "";
  const searchIndex = controls.indexOf("Search workspace");
  const notificationsIndex = controls.indexOf("NotificationCenter enabled");
  const helpIndex = controls.indexOf('aria-label="Help"');
  const themeIndex = controls.indexOf("toggleQuickTheme");
  const settingsIndex = controls.indexOf('aria-label="Settings"');
  const accountSettingsIndex = controls.indexOf("Account Settings");
  const identityIndex = controls.indexOf('aria-label="Workspace identity"');
  const lastSignOutIndex = controls.lastIndexOf("SignOutButton");
  assert.ok(searchIndex >= 0);
  assert.ok(notificationsIndex > searchIndex);
  assert.ok(helpIndex > notificationsIndex);
  assert.ok(themeIndex > helpIndex);
  assert.ok(accountSettingsIndex > themeIndex);
  assert.equal(settingsIndex, -1);
  assert.ok(identityIndex > accountSettingsIndex);
  assert.ok(lastSignOutIndex > identityIndex);
  assert.doesNotMatch(controls, /aria-label="User profile"|aria-label="Settings menu"/);
});

test("workspace admin: shell exposes a persistent quick light dark toggle using appearance preferences", () => {
  const shell = readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");
  assert.match(shell, /Moon/);
  assert.match(shell, /Sun/);
  assert.match(shell, /const \[quickTheme, setQuickTheme\]/);
  assert.match(shell, /function resolveEffectiveTheme\(themePreference: string\)/);
  assert.match(shell, /function toggleQuickTheme\(\)/);
  assert.match(shell, /const nextTheme = quickTheme === "dark" \? "light" : "dark"/);
  assert.match(shell, /writeCustomerWorkspaceAppearance\(workspace\.userId, next\)/);
  assert.match(shell, /applyCustomerWorkspaceAppearance\(next\)/);
  assert.match(shell, /setQuickTheme\(resolveEffectiveTheme\(appearance\.themePreference\)\)/);
  assert.match(shell, /setQuickTheme\(resolveEffectiveTheme\(current\.themePreference\)\)/);
  assert.match(shell, /aria-label=\{quickTheme === "dark" \? "Switch to light mode" : "Switch to dark mode"\}/);
});

test("workspace admin: workspace identity is static and Sign Out remains far right", () => {
  const shell = readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");
  const header = shell.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
  const identity = header.match(/<div aria-label="Workspace identity"[\s\S]*?<\/div>/)?.[0] ?? "";
  assert.match(identity, /workspace-identity-static/);
  assert.match(identity, /workspace\.branding\.organisationDisplayName/);
  assert.match(identity, /workspace\.customerId/);
  assert.doesNotMatch(identity, /<details|<summary|ChevronDown|workspace-menu|href=/);
  assert.match(header, /Account Settings/);
  assert.doesNotMatch(header, /Account & Security|aria-label="User profile"|aria-label="Settings menu"/);
  assert.equal((header.match(/SignOutButton/g) ?? []).length, 1);
  assert.doesNotMatch(shell, /href="\/client"|href="\/admin"|href="\/login\/create-password/);
});

test("workspace admin: shared design tokens define coherent light and dark surfaces", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  for (const token of [
    "--cw-page",
    "--cw-sidebar",
    "--cw-header",
    "--cw-card",
    "--cw-subtle",
    "--cw-border",
    "--cw-text",
    "--cw-text-secondary",
    "--cw-text-muted",
    "--cw-accent",
    "--cw-success",
    "--cw-warning",
    "--cw-danger",
    "--cw-radius",
    "--cw-shadow",
    "--cw-spacing",
    "--cw-input-height",
    "--cw-button-height",
  ]) {
    assert.match(css, new RegExp(token));
  }
  assert.match(css, /--cw-page: #f7f8fa/);
  assert.match(css, /--cw-sidebar: #e6ecf5/);
  assert.match(css, /--cw-card: #ffffff/);
  assert.match(css, /html\[data-theme="dark"\][\s\S]*--cw-page: #111827/);
  assert.match(css, /html\[data-theme="dark"\][\s\S]*--cw-sidebar: #172033/);
  assert.match(css, /html\[data-theme="dark"\][\s\S]*--cw-card: #1b2433/);
  assert.match(css, /\.workspace-button-primary/);
  assert.match(css, /\.workspace-button-secondary/);
  assert.match(css, /\.workspace-button-tertiary/);
  assert.match(css, /\.workspace-alert-card/);
});

test("workspace admin: appearance theme applies consistently through shared shell", () => {
  const shell = readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");
  const settingsClient = readFileSync(new URL("../components/workspace/WorkspaceSettingsClient.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(shell, /useLayoutEffect/);
  assert.match(shell, /readCustomerWorkspaceAppearance\(workspace\.userId\)/);
  assert.match(shell, /applyCustomerWorkspaceAppearance/);
  assert.match(shell, /prefers-color-scheme: dark/);
  assert.match(settingsClient, /customerWorkspaceAppearanceKey\(userId: string\)/);
  assert.match(settingsClient, /deployiq:cw:appearance:\$\{userId\}/);
  assert.match(settingsClient, /localStorage\.getItem\(customerWorkspaceAppearanceKey\(userId\)\)/);
  assert.match(settingsClient, /localStorage\.setItem\(customerWorkspaceAppearanceKey\(userId\), JSON\.stringify\(preferences\)\)/);
  assert.doesNotMatch(settingsClient, /deployiq\.workspace\.appearance/);
  assert.match(settingsClient, /themePreference === "system"/);
  assert.match(settingsClient, /html\.dataset\.workspaceThemePreference = preferences\.themePreference/);
  assert.match(settingsClient, /applyCustomerWorkspaceAppearance/);
  assert.match(settingsClient, /media\.addEventListener\("change", onSystemThemeChange\)/);
  assert.match(css, /html\[data-theme="dark"\] \.customer-workspace-shell/);
  assert.match(css, /html\[data-theme="dark"\] \.customer-workspace-sidebar/);
  assert.match(css, /html\[data-theme="dark"\] \.customer-workspace-header/);
  assert.match(css, /html\[data-theme="dark"\] \.workspace-card/);
  assert.match(css, /html\[data-workspace-font-size="small"\][\s\S]*--cw-font-scale: 0\.92/);
  assert.match(css, /html\[data-workspace-font-size="large"\][\s\S]*--cw-font-scale: 1\.1/);
  assert.match(css, /\.customer-workspace-shell \.text-sm[\s\S]*calc\(0\.875rem \* var\(--cw-font-scale\)\)/);
  assert.match(css, /\.customer-workspace-shell \.text-2xl[\s\S]*calc\(1\.5rem \* var\(--cw-font-scale\)\)/);
  assert.match(css, /html\[data-workspace-density="compact"\][\s\S]*padding: 0\.875rem !important/);
});

test("workspace admin: search controls use one accessible non-persistent focus style", () => {
  const shell = readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");
  const teamClient = readFileSync(new URL("../components/workspace/WorkspaceTeamClient.tsx", import.meta.url), "utf8");
  const projectsPage = readFileSync(new URL("../app/workspace/admin/projects/page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(shell, /workspace-search-input w-56 pl-10/);
  assert.match(shell, /placeholder="Search workspace"/);
  assert.match(shell, /No workspace results found\./);
  assert.match(shell, /<Search className="pointer-events-none absolute left-3 top-3 h-4 w-4/);
  assert.match(teamClient, /workspace-search-input w-full pl-9 normal-case tracking-normal/);
  assert.match(projectsPage, /workspace-search-input normal-case tracking-normal/);
  assert.match(css, /\.workspace-search-input:focus:not\(:focus-visible\)[\s\S]*box-shadow: none/);
  assert.match(css, /\.workspace-search-input:focus-visible[\s\S]*--cw-accent/);
  assert.match(css, /\.workspace-search-results/);
});

test("workspace admin: customer-facing workspace screens do not expose internal diagnostics", () => {
  const visibleFiles = [
    "../components/workspace/CustomerWorkspaceShell.tsx",
    "../components/workspace/WorkspaceTeamClient.tsx",
    "../components/workspace/DirectoryImportClient.tsx",
    "../app/workspace/admin/error.tsx",
    "../app/workspace/admin/page.tsx",
    "../app/workspace/admin/upload-directory/page.tsx",
    "../app/workspace/admin/team/page.tsx",
    "../app/workspace/admin/projects/page.tsx",
    "../app/workspace/admin/workspace-settings/page.tsx",
  ];
  const visibleSource = visibleFiles
    .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
    .join("\n");
  assert.doesNotMatch(visibleSource, /tenant ID|resolver|schema|authenticated context|service role|Core engine|user context unresolved|workspace context could not be resolved|Customer workspace access is required|column .* does not exist/i);
});

test("workspace admin: Global Search resolves tenant scope server-side and returns workspace routes only", () => {
  const route = readFileSync(new URL("../app/api/workspace/search/route.ts", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");
  assert.match(route, /resolveSearchWorkspaceScope/);
  assert.match(route, /getCurrentAccessToken/);
  assert.match(route, /auth\.getUser\(accessToken\)/);
  assert.match(route, /\.eq\("client_id", workspace\.clientId\)/);
  assert.match(route, /workspace_memberships/);
  assert.match(route, /deployment_locations/);
  assert.match(route, /projects/);
  assert.match(route, /result\.href\.startsWith\("\/workspace\/admin"\)/);
  assert.doesNotMatch(route, /resolveCustomerWorkspaceContext|resolveCustomerWorkspaceHomeContext|setupProgress|workspaceHealth/);
  assert.doesNotMatch(route, /searchParams\.get\("clientId"\)|searchParams\.get\("workspaceId"\)|searchParams\.get\("tenantId"\)/);
  assert.doesNotMatch(route, /href:\s*safeHref\("\/client|href:\s*safeHref\("\/admin"/);
  assert.match(shell, /fetch\(`\/api\/workspace\/search\?q=\$\{encodeURIComponent\(query\)\}`/);
  assert.match(shell, /}, 275\)/);
  assert.doesNotMatch(shell, /clientId|workspaceId|tenantId/);
});

test("workspace admin: route performance diagnostics log each workspace load segment", () => {
  const resolver = readFileSync(new URL("../lib/workspace/customerAdmin.ts", import.meta.url), "utf8");
  const team = readFileSync(new URL("../lib/workspace/team.ts", import.meta.url), "utf8");
  const projects = readFileSync(new URL("../lib/workspace/projects.ts", import.meta.url), "utf8");
  const settings = readFileSync(new URL("../app/workspace/admin/workspace-settings/page.tsx", import.meta.url), "utf8");
  assert.match(resolver, /console\.info\("\[workspace-performance\]"/);
  for (const step of [
    "Authenticated session",
    "Membership lookup",
    "Organisation lookup",
    "Product entitlement lookup",
    "Workspace status lookup",
    "Optional metrics",
    "Required workspace context total",
    "Workspace home metrics total",
  ]) {
    assert.match(resolver, new RegExp(step));
  }
  assert.match(team, /step: "Team & Users dashboard query"/);
  assert.match(team, /console\.info\("\[invite-performance\]"/);
  for (const step of [
    "Workspace duplicate check",
    "Role lookup",
    "Generate invitation link",
    "Membership persistence",
    "Audit scheduled",
    "Email delivery",
    "Total",
  ]) {
    assert.match(team, new RegExp(step));
  }
  assert.match(projects, /step: "Projects page query"/);
  assert.match(settings, /step: "Settings page query"/);
});

test("workspace admin: required context is cached directly and optional home metrics are split out", () => {
  const resolver = readFileSync(new URL("../lib/workspace/customerAdmin.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/workspace/admin/page.tsx", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../app/workspace/admin/layout.tsx", import.meta.url), "utf8");
  assert.match(resolver, /export const resolveCustomerWorkspaceContext = cache\(loadCustomerWorkspaceContextOnce\)/);
  assert.match(resolver, /export const resolveCustomerWorkspaceHomeContext = cache\(loadCustomerWorkspaceHomeContext\)/);
  assert.match(resolver, /const workspace = await resolveCustomerWorkspaceContext\(\)/);
  assert.match(resolver, /step: "Required workspace context total"/);
  assert.match(resolver, /step: "Workspace home metrics total"/);
  assert.match(resolver, /const \[\s*\{ data: membership \},[\s\S]*\] = await Promise\.all\(\[/);
  assert.match(resolver, /select\("workspace_display_name,workspace_slug,product_key,product_name,commercial_model,status"\)/);
  assert.match(resolver, /select\("product_key,commercial_model"\)/);
  assert.doesNotMatch(resolver, /select\([^)]*(workspace_name|workspace_status|plan_name|pricing_template_name)/);
  assert.doesNotMatch(resolver, /settings\?\.workspace_name|settings\?\.workspace_status|entitlement\?\.plan_name|entitlement\?\.pricing_template_name/);
  assert.match(page, /<Suspense fallback=\{<WorkspaceHomeMetricsSkeleton \/>}/);
  assert.match(page, /async function WorkspaceHomeMetrics\(\)/);
  assert.match(page, /workspace = await resolveCustomerWorkspaceContext\(\)/);
  assert.match(page, /resolveCustomerWorkspaceHomeContext/);
  assert.match(layout, /requireCustomerWorkspace/);
  assert.doesNotMatch(layout, /resolveCustomerWorkspaceHomeContext/);
  assert.doesNotMatch(resolver, /async function loadCustomerWorkspaceContext\(\)[\s\S]*getCurrentUserContext\(\)[\s\S]*loadCustomerWorkspaceContextOnce\(\)/);
});

test("workspace admin: required workspace lookup matches the Retail foundation schema", () => {
  const resolver = readFileSync(new URL("../lib/workspace/customerAdmin.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/20260805000000_add_retail_workspace_reference_foundation.sql", import.meta.url), "utf8");
  const settingsColumns = [
    "workspace_display_name",
    "workspace_slug",
    "product_key",
    "product_name",
    "commercial_model",
    "status",
  ];
  const entitlementColumns = ["product_key", "commercial_model"];
  for (const column of settingsColumns) {
    assert.match(migration, new RegExp(`${column} `));
  }
  for (const column of entitlementColumns) {
    assert.match(migration, new RegExp(`${column} `));
  }
  assert.match(resolver, /const workspaceName = text\(settings\?\.workspace_display_name\) \|\| organisationName/);
  assert.match(resolver, /const organisationName = text\(organisation\?\.name\) \|\| authContext\.client\.name/);
  assert.doesNotMatch(migration, /workspace_name text|workspace_status text|plan_name text|pricing_template_name text/);
  assert.doesNotMatch(resolver, /settings\?\.workspace_name|settings\?\.workspace_status|entitlement\?\.product_name|entitlement\?\.plan_name|entitlement\?\.pricing_template_name/);
});

test("workspace admin: no shell navigation item leaks to Client Dashboard or Platform Admin", () => {
  const shell = readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");
  const foundation = readFileSync(new URL("../lib/workspace/customerAdminFoundation.ts", import.meta.url), "utf8");
  const shellHrefs = Array.from(shell.matchAll(/href="([^"]+)"/g)).map((match) => match[1]);
  const navHrefs = Array.from(foundation.matchAll(/href: "([^"]+)"/g)).map((match) => match[1]);
  const customerWorkspaceLinks = [...shellHrefs, ...navHrefs].filter((href) => href.startsWith("/workspace/admin"));
  assert.ok(customerWorkspaceLinks.length > 0);
  for (const href of customerWorkspaceLinks) {
    assert.match(href, /^\/workspace\/admin(?:\/|$)/);
    assert.notEqual(href, "/client");
    assert.notEqual(href, "/admin");
  }
  assert.doesNotMatch(shell, /href="\/client"|href="\/admin"/);
  for (const item of CUSTOMER_ADMIN_NAV_ITEMS) {
    assert.match(item.href, /^\/workspace\/admin(?:\/|$)/);
  }
  for (const item of CUSTOMER_ADMIN_ACCOUNT_SETTINGS_NAV_ITEMS) {
    assert.match(item.href, /^\/workspace\/admin(?:\/|$)/);
  }
});

test("workspace admin: every static shell navigation route has a Customer Workspace page", () => {
  const pageRoutes = new Set([
    "/workspace/admin",
    "/workspace/admin/projects",
    "/workspace/admin/projects/new",
    "/workspace/admin/upload-directory",
    "/workspace/admin/workspace-settings",
    "/workspace/admin/workspace-settings/general",
    "/workspace/admin/workspace-settings/appearance",
    "/workspace/admin/workspace-settings/branding",
    "/workspace/admin/workspace-settings/security",
    "/workspace/admin/workspace-settings/notifications",
    "/workspace/admin/workspace-settings/access",
    "/workspace/admin/workspace-settings/billing",
    "/workspace/admin/workspace-settings/integrations",
    "/workspace/admin/workspace-settings/audit-logs",
    "/workspace/admin/profile",
    "/workspace/admin/approval-workflow",
    "/workspace/admin/campaigns",
    "/workspace/admin/submissions",
    "/workspace/admin/team",
    "/workspace/admin/agencies",
    "/workspace/admin/installers",
    "/workspace/admin/reports",
    "/workspace/admin/map",
    "/workspace/admin/analytics",
    "/workspace/admin/alerts",
    "/workspace/admin/notifications",
    "/workspace/admin/billing",
    "/workspace/admin/help",
    "/workspace/admin/support",
    "/workspace/admin/support/onboarding",
  ]);
  for (const item of CUSTOMER_ADMIN_NAV_ITEMS) {
    assert.equal(pageRoutes.has(item.href), true, `${item.href} should resolve inside Customer Workspace`);
  }
  for (const item of CUSTOMER_ADMIN_ACCOUNT_SETTINGS_NAV_ITEMS) {
    assert.equal(pageRoutes.has(item.href), true, `${item.href} should resolve inside Customer Workspace`);
  }
  assert.equal(pageRoutes.has("/workspace/admin/settings"), false);
});

test("workspace admin: navigation persistence uses pathname and shared navigation context", () => {
  const shell = readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");
  const resolver = readFileSync(new URL("../lib/workspace/customerAdmin.ts", import.meta.url), "utf8");
  assert.match(shell, /usePathname/);
  assert.match(shell, /currentNavItem\(pathname, workspace\.navigation\)/);
  assert.match(shell, /normalized === item\.href \|\| normalized\.startsWith/);
  assert.match(resolver, /navigation: CUSTOMER_ADMIN_NAV_ITEMS/);
});

test("workspace admin: shared guard checks membership active workspace and archived state", () => {
  const resolver = readFileSync(new URL("../lib/workspace/customerAdmin.ts", import.meta.url), "utf8");
  assert.match(resolver, /export async function requireCustomerWorkspace/);
  assert.match(resolver, /\.eq\("status", "active"\)/);
  assert.match(resolver, /role !== "customer_admin"/);
  assert.match(resolver, /workspaceStatus === "archived"/);
  assert.match(resolver, /activationStatus !== "Active"/);
});

test("workspace admin: route guards preserve Customer Admin context for workspace settings", () => {
  const layout = readFileSync(new URL("../app/workspace/admin/layout.tsx", import.meta.url), "utf8");
  const settingsPage = readFileSync(new URL("../app/workspace/admin/workspace-settings/page.tsx", import.meta.url), "utf8");
  const destinations = readFileSync(new URL("../lib/authDestinations.ts", import.meta.url), "utf8");
  const auth = readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8");
  assert.match(layout, /requireCustomerWorkspace/);
  assert.match(settingsPage, /resolveCustomerWorkspaceContext/);
  assert.match(destinations, /const isCustomerAdmin = await hasCustomerAdminMembership\(input\.userId, input\.clientId\)/);
  assert.match(destinations, /return isCustomerAdmin \? "\/workspace\/admin" : "\/client"/);
  assert.match(auth, /normalized === "\/workspace\/admin" \|\| normalized\.startsWith\("\/workspace\/admin\/"\)/);
});

test("workspace admin: context diagnostics identify the exact failing lookup", () => {
  const resolver = readFileSync(new URL("../lib/workspace/customerAdmin.ts", import.meta.url), "utf8");
  const auth = readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8");
  assert.match(resolver, /CustomerWorkspaceTransientError/);
  assert.match(resolver, /workspaceDiagnosticLog/);
  assert.match(resolver, /console\[level\]\("\[workspace-context\]"/);
  assert.match(auth, /resolveCurrentUserContext/);
  assert.match(auth, /authContextDiagnostic/);
  assert.match(auth, /step: "Authenticated user"/);
  assert.match(auth, /step: "Authoritative auth user"/);
  assert.match(auth, /step: "Application role lookup"/);
  assert.match(auth, /step: "Application user context"/);
  for (const step of [
    "Authenticated session",
    "Membership lookup",
    "Workspace lookup",
    "Organisation lookup",
    "Product entitlement lookup",
    "Branding lookup",
    "Workspace status lookup",
    "Project count lookup",
    "Membership count lookup",
    "Submission count lookup",
    "Directory count lookup",
    "Onboarding checklist lookup",
    "Checklist items lookup",
  ]) {
    assert.match(resolver, new RegExp(step));
  }
  assert.match(resolver, /Result: input\.result/);
  assert.match(resolver, /User: context\.userId/);
  assert.match(resolver, /Email: context\.email/);
  assert.match(resolver, /SessionRole: context\.sessionRole/);
  assert.match(resolver, /ClientId: context\.clientId/);
  assert.match(resolver, /Missing workspace_branding record/);
  assert.match(resolver, /NO ROWS/);
  assert.match(resolver, /Optional lookup unavailable/);
  assert.match(resolver, /details\?\.step && process\.env\.NODE_ENV === "development"/);
  assert.doesNotMatch(resolver, /Workspace context could not be resolved after retry/);
  assert.doesNotMatch(resolver, /if \(membershipError\) \{\s*throw new Error\("Could not resolve workspace membership\."\)/);
});

test("workspace admin: optional operational metrics cannot crash workspace context", () => {
  const resolver = readFileSync(new URL("../lib/workspace/customerAdmin.ts", import.meta.url), "utf8");
  assert.match(resolver, /optionalWorkspaceLookup/);
  assert.match(resolver, /Promise\.all\(\[/);
  for (const step of [
    "Branding lookup",
    "Project count lookup",
    "Membership count lookup",
    "Submission count lookup",
    "Directory count lookup",
    "Onboarding checklist lookup",
    "Checklist items lookup",
  ]) {
    assert.match(resolver, new RegExp(`optionalWorkspaceLookup[\\s\\S]*${step}`));
  }
  assert.match(resolver, /result: "Optional lookup unavailable"/);
  assert.match(resolver, /return fallback/);
  assert.match(resolver, /countValue\(projectCountResult\.count\)/);
  assert.match(resolver, /countValue\(membershipCountResult\.count\)/);
  assert.match(resolver, /countValue\(submissionCountResult\.count\)/);
  assert.match(resolver, /countValue\(directoryRecordCountResult\.count\)/);
  assert.match(resolver, /step: "Optional metrics block"/);
});

test("workspace admin: campaign setup milestone follows Core project campaign metadata", () => {
  const resolver = readFileSync(new URL("../lib/workspace/customerAdmin.ts", import.meta.url), "utf8");
  const foundation = readFileSync(new URL("../lib/workspace/customerAdminFoundation.ts", import.meta.url), "utf8");
  assert.match(resolver, /Campaign count lookup/);
  assert.match(resolver, /from\("projects"\)\.select\("id", \{ count: "exact", head: true \}\)\.eq\("client_id", workspace\.clientId\)\.not\("campaign", "is", null\)/);
  assert.match(resolver, /campaignCount: countValue\(campaignCountResult\.count\)/);
  assert.match(foundation, /const campaignDone = metrics\.campaignCount > 0/);
  assert.match(foundation, /Review Campaign Metadata/);
  assert.doesNotMatch(resolver, /projectCampaignName/);
});

test("workspace admin: Campaign Management is available from Account Settings and stays inside Customer Workspace", () => {
  const shell = readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");
  const list = readFileSync(new URL("../app/workspace/admin/campaigns/page.tsx", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../app/workspace/admin/campaigns/[id]/page.tsx", import.meta.url), "utf8");
  assert.equal(CUSTOMER_ADMIN_NAV_ITEMS.find((item) => item.label === "Campaigns"), undefined);
  assert.equal(CUSTOMER_ADMIN_ACCOUNT_SETTINGS_NAV_ITEMS.find((item) => item.label === "Campaign Management")?.href, "/workspace/admin/campaigns");
  assert.match(shell, /Campaign Management/);
  assert.match(list + detail, /\/workspace\/admin\/campaigns/);
  assert.doesNotMatch(list + detail, /href="\/client|router\.push\("\/client|redirect\("\/client/);
  assert.doesNotMatch(list + detail, /href="\/admin|router\.push\("\/admin|redirect\("\/admin/);
});

test("workspace admin: campaign pages use shared shell and no route-wide opening overlay", () => {
  const layout = readFileSync(new URL("../app/workspace/admin/layout.tsx", import.meta.url), "utf8");
  const list = readFileSync(new URL("../app/workspace/admin/campaigns/page.tsx", import.meta.url), "utf8");
  const newPage = readFileSync(new URL("../app/workspace/admin/campaigns/new/page.tsx", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../app/workspace/admin/campaigns/[id]/page.tsx", import.meta.url), "utf8");
  const editPage = readFileSync(new URL("../app/workspace/admin/projects/[id]/edit/page.tsx", import.meta.url), "utf8");
  assert.match(layout, /CustomerWorkspaceShell/);
  assert.doesNotMatch(newPage, /CampaignCreateWizard/);
  assert.match(newPage, /redirect\("\/workspace\/admin\/projects\/new"\)/);
  assert.match(detail, /redirect\(`\/workspace\/admin\/projects\/\$\{result\.campaign\.project_id\}`\)/);
  assert.match(list, /\/workspace\/admin\/projects\/\$\{campaign\.project_id\}\/edit/);
  assert.match(list, /Review \/ Edit/);
  assert.match(editPage, /ProjectEditForm/);
  assert.doesNotMatch(editPage, /organisationName|workspaceName|clientCompanyName/);
  assert.doesNotMatch(detail, /CampaignActionsPanel|CampaignLocationsClient|const tabs = \[/);
  assert.doesNotMatch(list + newPage + detail, /Opening workspace\.\.\.|WorkspaceLoadingOverlay|setLoading\(true\)/);
});

test("workspace admin: campaign performance path avoids full home optional metrics", () => {
  const service = readFileSync(new URL("../lib/workspace/campaigns.ts", import.meta.url), "utf8");
  assert.match(service, /campaignPerformanceLog/);
  assert.match(service, /\[campaign-performance\]/);
  assert.match(service, /step: "Campaign list"/);
  assert.match(service, /step: "Context"/);
  assert.match(service, /step: "Validation"/);
  assert.match(service, /step: "Campaign persistence"/);
  assert.doesNotMatch(service, /resolveCustomerWorkspaceHomeContext|getCustomerWorkspaceHome|Optional metrics/);
});

test("workspace admin: campaign progress does not invent counts from project campaign text", () => {
  const service = readFileSync(new URL("../lib/workspace/campaigns.ts", import.meta.url), "utf8");
  assert.match(service, /actualDeployments = metrics\.actualDeployments \?\? 0/);
  assert.match(service, /project\?\.campaign_name/);
  assert.doesNotMatch(service, /\.from\("submissions"\)[\s\S]*campaign_name/);
});

test("workspace admin: campaign foundation creates canonical tenant-scoped campaign records", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260806020000_add_customer_workspace_campaigns.sql", import.meta.url), "utf8");
  for (const column of [
    "client_id uuid not null",
    "project_id uuid not null",
    "campaign_name text not null",
    "brand_name text not null",
    "deployment_type text not null",
    "states text[]",
    "regions text[]",
    "cities text[]",
    "start_date date not null",
    "end_date date not null",
    "target_quantity integer not null",
    "deployment_location_ids uuid[]",
    "campaign_manager_user_id uuid",
    "status text not null default 'draft'",
  ]) {
    assert.match(migration, new RegExp(column.replace(/[()[\]]/g, "\\$&")));
  }
  assert.match(migration, /workspace_campaigns_date_order_check check \(end_date >= start_date\)/);
  assert.match(migration, /workspace_campaigns_client_status_idx/);
});

test("workspace admin: campaign service resolves tenant scope server-side only", () => {
  const service = readFileSync(new URL("../lib/workspace/campaigns.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/workspace/campaigns/route.ts", import.meta.url), "utf8");
  const detailRoute = readFileSync(new URL("../app/api/workspace/campaigns/[id]/route.ts", import.meta.url), "utf8");
  assert.match(service, /resolveCustomerWorkspaceContext/);
  assert.match(service, /\.eq\("client_id", resolvedWorkspace\.clientId\)/);
  assert.match(service, /client_id: resolvedWorkspace\.clientId/);
  assert.match(service, /created_by: resolvedWorkspace\.userId/);
  assert.doesNotMatch(route + detailRoute, /clientId|workspaceId|organisationId|tenantId/);
  assert.doesNotMatch(service.match(/export type CreateWorkspaceCampaignInput = \{[\s\S]*?\};/)?.[0] ?? "", /clientId|workspaceId|organisationId|tenantId/);
});

test("workspace admin: campaign creation rejects cross-workspace projects", () => {
  const service = readFileSync(new URL("../lib/workspace/campaigns.ts", import.meta.url), "utf8");
  assert.match(service, /assertProjectBelongsToWorkspace/);
  assert.match(service, /\.eq\("id", projectId\)/);
  assert.match(service, /\.eq\("client_id", workspaceContext\.clientId\)/);
  assert.match(service, /Select a project from this workspace\./);
});

test("workspace admin: cross-workspace campaign IDs cannot be opened or mutated", () => {
  const service = readFileSync(new URL("../lib/workspace/campaigns.ts", import.meta.url), "utf8");
  assert.match(service, /\.eq\("id", campaignId\)[\s\S]*\.eq\("client_id", resolvedWorkspace\.clientId\)[\s\S]*\.maybeSingle\(\)/);
  assert.match(service, /\.from\("projects"\)[\s\S]*\.update\(updates\)[\s\S]*\.eq\("id", existing\.campaign\.project_id\)[\s\S]*\.eq\("client_id", resolvedWorkspace\.clientId\)/);
  assert.doesNotMatch(service, /\.delete\(\)[\s\S]*\.eq\("id", input\.campaignId\)/);
});

test("workspace admin: campaign creation route uses Core Project setup instead of a duplicate wizard", () => {
  const newPage = readFileSync(new URL("../app/workspace/admin/campaigns/new/page.tsx", import.meta.url), "utf8");
  assert.match(newPage, /redirect\("\/workspace\/admin\/projects\/new"\)/);
  assert.doesNotMatch(newPage, /CampaignCreateWizard|Review & Create|Campaign Details/);
  assert.doesNotMatch(newPage, /DeployIQ manages campaign identity as part of a Project|View Projects|Create campaigns through Projects/);
});

test("workspace admin: campaign dates and draft flexibility are enforced", () => {
  const service = readFileSync(new URL("../lib/workspace/campaigns.ts", import.meta.url), "utf8");
  assert.match(service, /End date cannot be before start date\./);
  assert.match(service, /status: "draft"/);
  assert.doesNotMatch(service, /if \(!input\.deploymentLocationIds|Deployment locations.*required/);
  assert.doesNotMatch(service, /Team.*required|campaignManagerUserId.*required/);
});

test("workspace admin: Campaign Management does not expose duplicate lifecycle actions", () => {
  const service = readFileSync(new URL("../lib/workspace/campaigns.ts", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../app/workspace/admin/campaigns/[id]/page.tsx", import.meta.url), "utf8");
  const list = readFileSync(new URL("../app/workspace/admin/campaigns/page.tsx", import.meta.url), "utf8");
  for (const label of ["Project selected", "Campaign dates valid", "Deployment target defined", "Geography defined"]) {
    assert.match(service, new RegExp(label));
  }
  for (const label of ["Deployment locations assigned", "Team assignment available", "Approval workflow configured"]) {
    assert.match(service, new RegExp(label));
  }
  assert.match(service, /category === "Required before launch"/);
  assert.match(service, /Complete the required readiness items before activating this campaign\./);
  assert.match(detail, /redirect\(`\/workspace\/admin\/projects\/\$\{result\.campaign\.project_id\}`\)/);
  assert.doesNotMatch(detail + list, /Campaign Readiness|Launch \/ Activate|Close \/ Complete|Delete Draft|CampaignActionsPanel|aria-disabled|fetch\(`\/api\/workspace\/campaigns/);
  assert.match(list, /\/workspace\/admin\/projects\/\$\{campaign\.project_id\}/);
});

test("workspace admin: required access lookups still block when missing or failed", () => {
  const resolver = readFileSync(new URL("../lib/workspace/customerAdmin.ts", import.meta.url), "utf8");
  assert.match(resolver, /"Membership lookup"[\s\S]*missingResult: "NO ROWS"/);
  assert.match(resolver, /if \(role !== "customer_admin"\) \{[\s\S]*CustomerWorkspaceRedirect\("\/client"\)/);
  assert.match(resolver, /"Workspace lookup"[\s\S]*required: true/);
  assert.match(resolver, /"Organisation lookup"[\s\S]*required: true/);
  assert.match(resolver, /"Product entitlement lookup"[\s\S]*required: true/);
  assert.match(resolver, /Workspace status evaluation/);
  assert.match(resolver, /CustomerWorkspaceRedirect\("\/workspace\/activation"\)/);
});

test("workspace admin: authenticated non-expiry user-context failure is transient not access denied", () => {
  const resolver = readFileSync(new URL("../lib/workspace/customerAdmin.ts", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../app/workspace/admin/layout.tsx", import.meta.url), "utf8");
  assert.match(resolver, /const authResolution = await resolveCurrentUserContext\(\)/);
  assert.match(resolver, /authResolution\.status === "missing_session"[\s\S]*getCurrentRefreshToken/);
  assert.match(resolver, /refreshToken \? sessionRefreshRedirectForWorkspace\(returnTo\) : loginRedirectForWorkspace\(returnTo\)/);
  assert.match(resolver, /authResolution\.status === "expired_session"[\s\S]*sessionRefreshRedirectForWorkspace\(returnTo\)/);
  assert.match(resolver, /authResolution\.status === "failed"[\s\S]*CustomerWorkspaceTransientError/);
  assert.match(layout, /error instanceof CustomerWorkspaceTransientError/);
  assert.match(layout, /We're having trouble loading your workspace\./);
  assert.doesNotMatch(layout, /Your account does not currently have access to this workspace\./);
});

test("workspace admin: expired session uses auth refresh or login returnTo, not transient workspace failure", () => {
  const resolver = readFileSync(new URL("../lib/workspace/customerAdmin.ts", import.meta.url), "utf8");
  const refreshRoute = readFileSync(new URL("../app/api/auth/session/refresh/route.ts", import.meta.url), "utf8");
  const expiredIndex = resolver.indexOf('authResolution.status === "expired_session"');
  const failedIndex = resolver.indexOf('authResolution.status === "failed"');
  assert.ok(expiredIndex > -1);
  assert.ok(failedIndex > -1);
  assert.ok(expiredIndex < failedIndex);
  assert.match(resolver, /sessionRefreshRedirectForWorkspace\(returnTo\)/);
  assert.match(resolver, /loginRedirectForWorkspace\(returnTo\)/);
  assert.match(resolver, /getCurrentRefreshToken/);
  assert.doesNotMatch(resolver.slice(expiredIndex, failedIndex), /CustomerWorkspaceTransientError|Authenticated session is still resolving/);
  assert.match(refreshRoute, /clearDeployIqAuthCookies\(response, request\)/);
  assert.match(refreshRoute, /NextResponse\.redirect\(loginRedirect\(request, requestedReturnTo\), \{ status: 303 \}\)/);
  assert.doesNotMatch(refreshRoute, /"\/client"|"\/admin"|"\/onboarding"/);
});

test("workspace admin: context cache no longer wraps the whole resolver retry", () => {
  const resolver = readFileSync(new URL("../lib/workspace/customerAdmin.ts", import.meta.url), "utf8");
  const cacheIndex = resolver.indexOf("export const resolveCustomerWorkspaceContext = cache(loadCustomerWorkspaceContextOnce)");
  const coreIndex = resolver.indexOf("async function loadCustomerWorkspaceContextOnce()");
  assert.ok(coreIndex > -1);
  assert.ok(cacheIndex > coreIndex);
  assert.doesNotMatch(resolver, /return withWorkspaceRetry\(\s*"context-resolution"/);
  assert.doesNotMatch(resolver, /cache\(async \(\) => null|resolveCustomerWorkspaceContext[\s\S]*return null/);
});

test("workspace admin: error state uses customer-safe copy and route-wide loading is retired", () => {
  const errorPage = readFileSync(new URL("../app/workspace/admin/error.tsx", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../app/workspace/admin/layout.tsx", import.meta.url), "utf8");
  const loginPage = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
  assert.match(errorPage, /We couldn't open this workspace\./);
  assert.match(errorPage, /Your account does not currently have access to this workspace\./);
  assert.match(errorPage, /We're having trouble opening your workspace\./);
  assert.match(layout, /We're having trouble loading your workspace\./);
  assert.match(errorPage, /Please try again\. Your account and workspace have not been changed\./);
  assert.match(errorPage, /Try Again/);
  assert.equal(existsSync(new URL("../app/workspace/admin/loading.tsx", import.meta.url)), false);
  assert.match(loginPage, /Opening workspace\.\.\./);
  assert.match(errorPage, /border-t-\[var\(--accent\)\]/);
  assert.match(errorPage, /motion-safe:animate-spin/);
  assert.doesNotMatch(errorPage, /Customer workspace access is required|loads your dashboard|access token|refresh token|cookie/i);
});

test("workspace admin: opening overlay is owned by login transition only", () => {
  const loginPage = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../app/workspace/admin/layout.tsx", import.meta.url), "utf8");
  const loadingPage = existsSync(new URL("../app/workspace/admin/loading.tsx", import.meta.url))
    ? readFileSync(new URL("../app/workspace/admin/loading.tsx", import.meta.url), "utf8")
    : "";
  assert.match(loginPage, /hasCompletedInitialWorkspaceLoad/);
  assert.match(loginPage, /logWorkspaceOverlay\(overlayVisible \? "SHOW" : "HIDE"/);
  assert.match(loginPage, /console\.info\("\[workspace-overlay\]"/);
  assert.match(loginPage, /pathname: window\.location\.pathname/);
  assert.match(loginPage, /hasCompletedInitialWorkspaceLoad \|\| !isRedirecting/);
  assert.doesNotMatch(shell + layout + loadingPage, /Opening workspace\.\.\.|WorkspaceLoadingOverlay|setLoading\(true\)|setIsRedirecting\(true\)/);
});

test("workspace admin: session expiry page returns home without entering client dashboard", () => {
  const page = readFileSync(new URL("../app/workspace/session-expired/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Your session has expired\./);
  assert.match(page, /Please sign in again\./);
  assert.match(page, /Sign In Again/);
  assert.match(page, /Return Home/);
  assert.match(page, /href="\/"/);
  assert.doesNotMatch(page, /\/client/);
});

test("workspace admin: Projects module is mounted inside shared Customer Workspace shell", () => {
  const listPage = readFileSync(new URL("../app/workspace/admin/projects/page.tsx", import.meta.url), "utf8");
  const newPage = readFileSync(new URL("../app/workspace/admin/projects/new/page.tsx", import.meta.url), "utf8");
  const detailPage = readFileSync(new URL("../app/workspace/admin/projects/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(listPage, /getCustomerProjectDashboard/);
  assert.match(newPage, /ProjectCreateWizard/);
  assert.match(detailPage, /getCustomerProject/);
  assert.doesNotMatch(listPage, /BrandMark|Workspace navigation/);
  assert.doesNotMatch(newPage, /BrandMark|Workspace navigation/);
  assert.doesNotMatch(detailPage, /BrandMark|Workspace navigation/);
});

test("workspace admin: Team & Users module replaces placeholder with tenant dashboard", () => {
  const page = readFileSync(new URL("../app/workspace/admin/team/page.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("../components/workspace/WorkspaceTeamClient.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/workspace/team.ts", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");
  assert.match(page, /getWorkspaceTeamDashboard/);
  assert.match(page, /WorkspaceTeamClient/);
  assert.doesNotMatch(page, /WorkspaceModulePlaceholder/);
  for (const label of ["Workspace Members", "Pending Invitations", "Available Licences", "Active Sessions", "Primary Administrator", "Recently Joined Users"]) {
    assert.match(client, new RegExp(label));
  }
  assert.match(service, /resolveCustomerWorkspaceContext/);
  assert.match(service, /\.eq\("client_id", workspace\.clientId\)/);
  assert.match(shell, /"User Management": "Manage workspace members, roles and assignments\."/);
});

test("workspace admin: Team directory supports search filters sorting pagination and profile drawer", () => {
  const client = readFileSync(new URL("../components/workspace/WorkspaceTeamClient.tsx", import.meta.url), "utf8");
  for (const column of ["Avatar", "Full Name", "Email", "Role", "Status", "Last Active", "Joined / Invited", "Actions"]) {
    assert.match(client, new RegExp(column));
  }
  assert.match(client, /setQuery/);
  assert.match(client, /roleFilter/);
  assert.match(client, /statusFilter/);
  assert.match(client, /setSort/);
  assert.match(client, /pageSize = 8/);
  assert.match(client, /ProfileDrawer/);
  assert.match(client, /Recent Activity/);
  assert.match(client, /Edit Role/);
  assert.match(client, /Disable User/);
  assert.match(client, /Reset Password/);
  assert.match(client, /Remove User/);
  assert.match(client, /Not joined yet/);
});

test("workspace admin: invitation flow exposes send link resend copy and cancellation actions", () => {
  const client = readFileSync(new URL("../components/workspace/WorkspaceTeamClient.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/workspace/team/route.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/workspace/team.ts", import.meta.url), "utf8");
  assert.match(client, /Invite User/);
  assert.match(client, /Send Invitation/);
  assert.match(client, /Generate invitation link/);
  assert.match(client, /Copy link/);
  assert.match(client, /Resend invitation/);
  assert.match(client, /Cancel/);
  assert.match(route, /inviteWorkspaceUser/);
  assert.match(route, /resendWorkspaceInvitation/);
  assert.match(route, /DELETE/);
  assert.match(service, /generateInvitationLink/);
  assert.match(service, /type: "invite"/);
  assert.match(service, /type: "magiclink"/);
  assert.match(service, /This person already belongs to this workspace/);
  assert.match(service, /An invitation is already pending for this email/);
  assert.match(service, /invitation_cancelled/);
});

test("workspace admin: invitation creation does not require customer-facing global identity precheck", () => {
  const service = readFileSync(new URL("../lib/workspace/team.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../components/workspace/WorkspaceTeamClient.tsx", import.meta.url), "utf8");
  const inviteFunction = service.match(/export async function inviteWorkspaceUser\([\s\S]*?\n}\n\nasync function activeAdminCount/)?.[0] ?? "";
  assert.match(service, /checkWorkspaceInvitationDuplicateByEmail/);
  assert.match(inviteFunction, /checkWorkspaceInvitationDuplicateByEmail\(workspace\.clientId, email\)/);
  assert.doesNotMatch(inviteFunction, /resolveWorkspaceInvitationIdentity|loadAuthUsersByEmail|acknowledgeExistingIdentity|nameMismatch/);
  assert.doesNotMatch(client, /onBlur=\{checkIdentity\}|Existing DeployIQ account|Use Existing Account|New DeployIQ user|global-profile|acknowledgeExistingIdentity|existingAccountNeedsConfirmation/);
  assert.match(client, /Name<input value=\{name\}/);
  assert.match(client, /Email<input type="email" value=\{email\}/);
  assert.match(client, /Role/);
});

test("workspace admin: invitation duplicate matching is exact and scoped to this workspace", () => {
  const service = readFileSync(new URL("../lib/workspace/team.ts", import.meta.url), "utf8");
  assert.match(service, /function normalizeEmail\(value: unknown\)[\s\S]*return text\(value\)\.toLowerCase\(\)/);
  assert.match(service, /\.eq\("client_id", clientId\)/);
  assert.match(service, /\.in\("status", \["active", "invited"\]\)/);
  assert.match(service, /profileByUserId\.get\(text\(membership\.user_id\)\) === normalizedEmail/);
  assert.match(service, /duplicate\.state === "already_member"/);
  assert.match(service, /duplicate\.state === "pending_invitation"/);
  assert.doesNotMatch(service, /LIKE '%@|ilike\("email", `%|split\("@"\)\[1\]|endsWith\(.*normalizedEmail|includes\(normalizedEmail\)/);
});

test("workspace admin: failed invitations cannot create ghost rows or fake audit events", () => {
  const service = readFileSync(new URL("../lib/workspace/team.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../components/workspace/WorkspaceTeamClient.tsx", import.meta.url), "utf8");
  const linkIndex = service.indexOf("const generated = await generateInvitationLink");
  const membershipIndex = service.indexOf(".from(\"workspace_memberships\").insert");
  const auditIndex = service.indexOf("void writeAuditLog({", membershipIndex);
  assert.ok(linkIndex > -1);
  assert.ok(membershipIndex > linkIndex, "membership must be inserted only after secure link generation succeeds");
  assert.ok(auditIndex > membershipIndex, "audit must be scheduled only after membership persistence succeeds");
  assert.doesNotMatch(service, /\.from\("workspace_memberships"\)\.upsert\([\s\S]*status: "invited"/);
  assert.match(client, /onInvitationCreated\?\.\(body\)/);
  assert.match(client, /if \(!result\.member \|\| !result\.invitation\) return/);
  assert.match(client, /No team administration activity yet/);
  assert.doesNotMatch(client, /empty-invite|empty-role|empty-permission|empty-password|empty-disabled|empty-removed/);
});

test("workspace admin: Send Invitation reports actual email delivery capability", () => {
  const service = readFileSync(new URL("../lib/workspace/team.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../components/workspace/WorkspaceTeamClient.tsx", import.meta.url), "utf8");
  assert.match(service, /deliveryStatus = input\.sendEmail === false \? "link_created" : "delivery_not_configured"/);
  assert.match(service, /Invitation created\. Email delivery is not configured\. Copy the invitation link to share it manually\./);
  assert.match(client, /Creating invitation\.\.\./);
  assert.match(client, /Invitation created\. Email delivery is not configured\. Copy the invitation link to share it manually\./);
  assert.match(client, /Copy link/);
});

test("workspace admin: invitation actions give immediate feedback and avoid duplicate refresh work", () => {
  const client = readFileSync(new URL("../components/workspace/WorkspaceTeamClient.tsx", import.meta.url), "utf8");
  for (const state of ["idle", "creating_link", "link_ready", "sending", "invited", "error"]) {
    assert.match(client, new RegExp(`"${state}"`));
  }
  assert.doesNotMatch(client, /"checking_identity"|"existing_identity"|"new_identity"/);
  assert.match(client, /setActionState\(sendEmail \? "sending" : "creating_link"\)/);
  assert.match(client, /Generating\.\.\./);
  assert.match(client, /Creating invitation\.\.\./);
  assert.match(client, /if \(sendEmail && link\)/);
  assert.match(client, /navigator\.clipboard\.writeText\(link\)/);
  assert.match(client, /setCopied\(true\)/);
  assert.match(client, /copied \? "Copied" : "Copy link"/);
  const copyFunction = client.match(/function copyInvitationLink\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.doesNotMatch(copyFunction, /fetch|apiRequest|router\.refresh/);
  assert.doesNotMatch(client, /router\.refresh\(\)/);
});

test("workspace admin: licence allowance is explicit and not hardcoded from a placeholder plan", () => {
  const service = readFileSync(new URL("../lib/workspace/team.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../components/workspace/WorkspaceTeamClient.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(service, /const licenceLimit = 25|licenceLimit -/);
  assert.match(service, /seatAllowance: number \| null/);
  assert.match(service, /allowanceSource: "not_configured"/);
  assert.match(service, /activeUsersCounted/);
  assert.match(service, /pendingInvitationsCounted/);
  assert.match(service, /disabledUsersCounted/);
  assert.match(service, /pendingInvitationsReserveSeats: true/);
  assert.match(service, /availableLicences: seatAllowance === null \? "Not configured"/);
  assert.match(client, /Available Licences/);
});

test("workspace admin: Team PATCH is instrumented and returns local mutation state", () => {
  const route = readFileSync(new URL("../app/api/workspace/team/route.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/workspace/team.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../components/workspace/WorkspaceTeamClient.tsx", import.meta.url), "utf8");
  assert.match(route, /teamPerformanceLog/);
  assert.match(route, /step: "Request parse"/);
  assert.match(route, /step: "PATCH total"/);
  assert.match(service, /console\.info\("\[team-performance\]"/);
  for (const step of [
    "session \\+ workspace-access",
    "role-lookup",
    "permission-read",
    "delete-delta",
    "insert-delta",
    "audit",
    "TOTAL",
  ]) {
    assert.match(service, new RegExp(step));
  }
  assert.match(service, /operation: "permission-save"/);
  assert.match(service, /permissionsToDelete/);
  assert.match(service, /permissionsToInsert/);
  assert.match(service, /void writeAuditLog/);
  assert.doesNotMatch(service, /\.from\("workspace_role_permissions"\)\.delete\(\)\.eq\("role_id", roleId\);\s*if \(permissions\.length > 0\)/);
  assert.match(service, /return \{ ok: true, success: true, permissions: nextPermissions \}/);
  assert.match(client, /onPermissionsSaved\?\.\(roleKey, \[\.\.\.selected\]\)/);
});

test("workspace admin: Team mutations do not reload the full dashboard after save", () => {
  const client = readFileSync(new URL("../components/workspace/WorkspaceTeamClient.tsx", import.meta.url), "utf8");
  const saveFunction = client.match(/async function savePermissions\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.match(saveFunction, /setSaveState\("saving"\)/);
  assert.match(saveFunction, /updatePermissions\("\/api\/workspace\/team"/);
  assert.match(saveFunction, /setSavedSelected\(\[\.\.\.selected\]\)/);
  assert.doesNotMatch(saveFunction, /reloadTeam|getWorkspaceTeamDashboard|router\.refresh|fetch\("\/api\/workspace\/team"\)/);
});

test("workspace admin: customer-facing roles and permission matrix hide technical role names", () => {
  const service = readFileSync(new URL("../lib/workspace/team.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../components/workspace/WorkspaceTeamClient.tsx", import.meta.url), "utf8");
  for (const label of ["Primary Administrator", "Administrator", "Project Manager", "Supervisor", "Field Coordinator", "Viewer"]) {
    assert.match(service, new RegExp(label));
  }
  for (const label of ["Projects", "Campaigns", "Submissions", "Deployment Locations", "Reports", "Analytics", "Users", "Billing", "Settings", "Notifications"]) {
    assert.match(service, new RegExp(label));
  }
  assert.match(client, /role="switch"/);
  assert.match(client, /Save Permissions/);
  assert.match(client, /Saving\.\.\./);
  assert.match(client, /Saved/);
  assert.match(client, /onPermissionsSaved\?\.\(roleKey, \[\.\.\.selected\]\)/);
  assert.match(service, /roleDefinitionsForWorkspace/);
  assert.match(service, /workspace_role_permissions/);
  assert.match(client, /savedSelected/);
  assert.match(client, /You have unsaved permission changes/);
  assert.match(client, /window\.confirm\("You have unsaved permission changes\. Discard them and switch roles\?"/);
  assert.doesNotMatch(client, /customer_admin|workspace_owner|service_role/);
});

test("workspace admin: Team management enforces admin restrictions and last-admin protection", () => {
  const service = readFileSync(new URL("../lib/workspace/team.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../components/workspace/WorkspaceTeamClient.tsx", import.meta.url), "utf8");
  assert.match(service, /assertCanManage/);
  assert.match(service, /workspace\.role !== "customer_admin"/);
  assert.match(service, /This account has read-only team access/);
  assert.match(service, /You cannot change your own administrator role/);
  assert.match(service, /You cannot remove yourself from the workspace/);
  assert.match(service, /You cannot remove the last administrator/);
  assert.match(service, /activeAdminCount/);
  assert.match(client, /read-only access to team administration/);
  assert.match(client, /aria-disabled=\{!dashboard\.canManageTeam\}/);
});

test("workspace admin: Team module writes only through tenant-scoped API", () => {
  const route = readFileSync(new URL("../app/api/workspace/team/route.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/workspace/team.ts", import.meta.url), "utf8");
  assert.match(route, /inviteWorkspaceUser/);
  assert.match(route, /updateWorkspaceMemberRole/);
  assert.match(route, /updateWorkspaceRolePermissions/);
  assert.match(route, /removeWorkspaceMember/);
  assert.match(service, /workspace_memberships/);
  assert.match(service, /workspace_role_permissions/);
  assert.match(service, /writeAuditLog/);
  assert.match(service, /newValue: \{ clientId: workspace\.clientId/);
  assert.doesNotMatch(service, /tenant\.list_all|platform_user_management|service_role_operations/);
});

test("workspace admin: Team module uses responsive Customer Workspace design system", () => {
  const client = readFileSync(new URL("../components/workspace/WorkspaceTeamClient.tsx", import.meta.url), "utf8");
  assert.match(client, /workspace-card/);
  assert.match(client, /workspace-button-primary/);
  assert.match(client, /workspace-button-secondary/);
  assert.match(client, /workspace-button-tertiary/);
  assert.match(client, /workspace-alert-card/);
  assert.match(client, /md:grid-cols/);
  assert.match(client, /xl:grid-cols/);
  assert.match(client, /overflow-x-auto/);
  assert.match(client, /role="dialog" aria-modal="true"/);
});

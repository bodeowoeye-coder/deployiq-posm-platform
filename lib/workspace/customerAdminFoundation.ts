export type ReuseClassification =
  | "reuse_immediately"
  | "reuse_after_tenant_refactor"
  | "platform_only"
  | "new_implementation_required";

export type CustomerAdminModuleAudit = {
  module: string;
  existingComponent: string;
  service: string;
  api: string;
  tenantIsolationPoint: string;
  coupling: string;
  classification: ReuseClassification;
  reuseStrategy: string;
};

export const CUSTOMER_ADMIN_MODULE_AUDIT: CustomerAdminModuleAudit[] = [
  {
    module: "Projects",
    existingComponent: "ProjectDashboardShell",
    service: "lib/projects.ts, lib/core/projectPortfolios.ts",
    api: "/api/projects",
    tenantIsolationPoint: "projects.client_id via accessControl.applyTenantProjectScope",
    coupling: "Platform Admin can create across tenants; Customer Admin must use authenticated client_id only.",
    classification: "reuse_after_tenant_refactor",
    reuseStrategy: "Add customer_admin presentation mode and remove tenant selectors/actions."
  },
  {
    module: "Campaigns",
    existingComponent: "ProjectDashboardShell campaign views",
    service: "lib/projects.ts",
    api: "/api/projects",
    tenantIsolationPoint: "projects.client_id",
    coupling: "Campaigns are currently represented by project campaign fields.",
    classification: "reuse_after_tenant_refactor",
    reuseStrategy: "Expose campaign creation through tenant-fixed project workflows."
  },
  {
    module: "Deployment Locations",
    existingComponent: "ClientDashboard location views",
    service: "lib/deploymentLocationsImport.ts",
    api: "/api/deployment-locations, /api/workspace/directory/*",
    tenantIsolationPoint: "deployment_locations.client_id/workspace_id resolved from authenticated workspace membership.",
    coupling: "Legacy platform rows may be global; Customer Admin writes are tenant-scoped through workspace directory APIs.",
    classification: "reuse_immediately",
    reuseStrategy: "Reuse parser, validation, duplicate detection and template generation; commit through tenant-scoped Core table metadata."
  },
  {
    module: "Submissions",
    existingComponent: "ClientDashboard submission tables",
    service: "lib/reporting.ts, lib/projects.ts",
    api: "/api/submissions",
    tenantIsolationPoint: "submissions.client_id",
    coupling: "Client viewer presentation is reporting-first.",
    classification: "reuse_after_tenant_refactor",
    reuseStrategy: "Reuse data services with customer_admin review actions enabled by workspace permissions."
  },
  {
    module: "Team & Users",
    existingComponent: "Platform Admin user management",
    service: "lib/userManagement.ts, lib/workspace/customerAdmin.ts",
    api: "/api/users",
    tenantIsolationPoint: "workspace_memberships.client_id and user_roles.client_id",
    coupling: "Platform user management includes cross-tenant and service-role actions.",
    classification: "reuse_after_tenant_refactor",
    reuseStrategy: "Extract shared invite/update logic and lock all operations to authenticated workspace."
  },
  {
    module: "Agencies",
    existingComponent: "Platform Admin agency views",
    service: "Core agency data model",
    api: "/api/agencies",
    tenantIsolationPoint: "Needs tenant assignment for Customer Admin operations.",
    coupling: "Agency table is currently global.",
    classification: "reuse_after_tenant_refactor",
    reuseStrategy: "Reuse agency model after adding tenant relationship or workspace assignment layer."
  },
  {
    module: "Installers",
    existingComponent: "Platform Admin installer views",
    service: "Core installer model",
    api: "/api/installers",
    tenantIsolationPoint: "assigned_project_ids plus future workspace installer assignments.",
    coupling: "Installer records are global operational resources.",
    classification: "reuse_after_tenant_refactor",
    reuseStrategy: "Reuse installer model with tenant-bound assignment and hidden platform status controls."
  },
  {
    module: "Reports",
    existingComponent: "ClientDashboard reports, admin reports",
    service: "lib/reporting.ts",
    api: "/api/client/exports/*, /api/exports/*",
    tenantIsolationPoint: "client_id/project access registry",
    coupling: "Admin exports can be cross-tenant.",
    classification: "reuse_immediately",
    reuseStrategy: "Use existing reporting services with Customer Admin tenant context and no cross-tenant filters."
  },
  {
    module: "Deployment Map",
    existingComponent: "DeploymentMap",
    service: "lib/geography.ts, submission/project data",
    api: "/api/submissions, /api/deployment-locations",
    tenantIsolationPoint: "submissions.client_id and project access",
    coupling: "Map data currently mixes viewer and admin concerns.",
    classification: "reuse_after_tenant_refactor",
    reuseStrategy: "Reuse map component with customer_admin controls and tenant-filtered source data."
  },
  {
    module: "Analytics",
    existingComponent: "ClientDashboard analytics panels",
    service: "lib/operations.ts, lib/reporting.ts",
    api: "/api/submissions, /api/projects",
    tenantIsolationPoint: "client_id/project access registry",
    coupling: "Client viewer copy is reporting-oriented.",
    classification: "reuse_immediately",
    reuseStrategy: "Reuse calculations and render Customer Admin operational empty states until data exists."
  },
  {
    module: "Notifications",
    existingComponent: "NotificationCenter",
    service: "lib/notifications.ts",
    api: "/api/notifications",
    tenantIsolationPoint: "notification_events.client_id",
    coupling: "Notification defaults are workspace-specific; event feed is core.",
    classification: "reuse_immediately",
    reuseStrategy: "Reuse event feed and notification defaults with workspace permission gates."
  },
  {
    module: "Workspace Settings",
    existingComponent: "New Customer Admin presentation",
    service: "workspace_settings, workspace_branding",
    api: "Future tenant settings API",
    tenantIsolationPoint: "workspace_settings.client_id",
    coupling: "Platform settings are not customer settings.",
    classification: "new_implementation_required",
    reuseStrategy: "Create tenant presentation backed by workspace foundation tables."
  },
  {
    module: "Billing & Plan",
    existingComponent: "Commercial checkout summaries",
    service: "lib/commercial/checkout, product_entitlements",
    api: "/api/acquisition/checkout/*",
    tenantIsolationPoint: "product_entitlements.client_id",
    coupling: "Payment operations and platform pricing admin must stay separate.",
    classification: "reuse_after_tenant_refactor",
    reuseStrategy: "Reuse commercial snapshots and entitlement records as read-only Customer Admin plan summary."
  }
];

export const CUSTOMER_ADMIN_NAV_ITEMS = [
  { label: "Home / Dashboard", href: "/workspace/admin", status: "active" },
  { label: "Deployment Reports", href: "/workspace/admin/reports", status: "available" },
  { label: "Submissions", href: "/workspace/admin/submissions", status: "available" },
  { label: "Deployment Map", href: "/workspace/admin/map", status: "available" },
  { label: "Analytics", href: "/workspace/admin/analytics", status: "available" },
  { label: "Alerts", href: "/workspace/admin/alerts", status: "available" },
  { label: "Installers", href: "/workspace/admin/installers", status: "available" },
  { label: "Notifications", href: "/workspace/admin/notifications", status: "available" },
] as const;

export const CUSTOMER_ADMIN_ACCOUNT_SETTINGS_NAV_ITEMS = [
  { label: "Profile", href: "/workspace/admin/profile", status: "available" },
  { label: "Create Project", href: "/workspace/admin/projects/new", status: "available" },
  { label: "Campaign Management", href: "/workspace/admin/campaigns", status: "available" },
  { label: "Approval Workflow", href: "/workspace/admin/approval-workflow", status: "available" },
  { label: "Outlet Directory", href: "/workspace/admin/upload-directory", status: "available" },
  { label: "User Management", href: "/workspace/admin/team", status: "available" },
  { label: "Agencies", href: "/workspace/admin/agencies", status: "available" },
  { label: "Workspace Settings", href: "/workspace/admin/workspace-settings", status: "available" },
  { label: "Billing & Plan", href: "/workspace/admin/billing", status: "planned" },
  { label: "Audit Logs", href: "/workspace/admin/workspace-settings/audit-logs", status: "planned" },
] as const;

export type WorkspaceSetupMetrics = {
  directoryUploaded: boolean;
  projectCount: number;
  membershipCount: number;
  approvalWorkflowConfigured: boolean;
  campaignCount: number;
  deploymentStarted: boolean;
  agencyCount?: number;
  installerCount?: number;
  availableInstallerCount?: number;
  busyInstallerCount?: number;
  campaignsReadyForDeployment?: number;
  todaysDeployments?: number;
  pendingApprovals?: number;
  rejectedToday?: number;
  installersActive?: number;
  campaignsRunning?: number;
};

export type WorkspaceSetupStep = {
  key: string;
  label: string;
  status: "Not Started" | "In Progress" | "Completed";
  primaryCta: string;
  href: string;
};

function status(done: boolean, active: boolean) {
  if (done) return "Completed";
  if (active) return "In Progress";
  return "Not Started";
}

export function directoryLabelForProduct(productKey: string) {
  if (productKey === "fleet") return "Vehicle Directory";
  if (productKey === "build") return "Property / Site Directory";
  if (productKey === "healthcare") return "Facility Directory";
  return "Outlet Directory";
}

export function deriveWorkspaceSetupSteps(metrics: WorkspaceSetupMetrics, productKey = "retail"): WorkspaceSetupStep[] {
  const directoryLabel = directoryLabelForProduct(productKey);
  const directoryDone = metrics.directoryUploaded;
  const projectDone = metrics.projectCount > 0;
  const teamDone = metrics.membershipCount > 1;
  const workflowDone = metrics.approvalWorkflowConfigured;
  const campaignDone = metrics.campaignCount > 0;
  const deploymentDone = metrics.deploymentStarted;

  return [
    { key: "upload_directory", label: `Upload ${directoryLabel}`, status: status(directoryDone, true), primaryCta: "Upload Your Directory", href: "/workspace/admin/upload-directory" },
    { key: "create_project", label: "Create First Project", status: status(projectDone, directoryDone), primaryCta: "Create Your First Project", href: "/workspace/admin/projects/new" },
    { key: "invite_team", label: "Invite Team Members", status: status(teamDone, projectDone), primaryCta: "Invite Your Team", href: "/workspace/admin/team" },
    { key: "configure_workflow", label: "Configure Approval Workflow", status: status(workflowDone, teamDone), primaryCta: "Configure Approval Workflow", href: "/workspace/admin/approval-workflow" },
    { key: "review_campaign", label: "Review Campaign Metadata", status: status(campaignDone, workflowDone), primaryCta: "Review Campaigns", href: "/workspace/admin/campaigns" },
    { key: "launch_deployment", label: "Launch First Deployment", status: status(deploymentDone, campaignDone), primaryCta: "Launch First Deployment", href: "/workspace/admin/projects" },
  ];
}

export function derivePrimaryWorkspaceAction(steps: WorkspaceSetupStep[]) {
  return steps.find((step) => step.status !== "Completed") ?? steps[steps.length - 1];
}

export function workspaceSetupProgress(steps: WorkspaceSetupStep[]) {
  const completed = steps.filter((step) => step.status === "Completed").length;
  return {
    completed,
    total: steps.length,
    percent: steps.length === 0 ? 0 : Math.round((completed / steps.length) * 100),
  };
}

export function workspaceHealth(metrics: WorkspaceSetupMetrics) {
  return [
    { label: "Workspace Activated", state: "Completed" },
    { label: "Workspace Secured", state: "Completed" },
    { label: "Directory Uploaded", state: metrics.directoryUploaded ? "Completed" : "Not Started" },
    { label: "Project Created", state: metrics.projectCount > 0 ? "Completed" : "Not Started" },
    { label: "Team Invited", state: metrics.membershipCount > 1 ? "Completed" : "Not Started" },
    { label: "Campaign Created", state: metrics.campaignCount > 0 ? "Completed" : "Not Started" },
    { label: "Deployment Started", state: metrics.deploymentStarted ? "Completed" : "Not Started" },
  ] as const;
}

export const CUSTOMER_ADMIN_QUICK_ACTIONS = [
  { label: "Create Project", href: "/workspace/admin/projects/new" },
  { label: "Upload Directory", href: "/workspace/admin/upload-directory" },
  { label: "Campaign Management", href: "/workspace/admin/campaigns" },
  { label: "Invite Team", href: "/workspace/admin/team" },
  { label: "User Management", href: "/workspace/admin/team" },
  { label: "Workspace Settings", href: "/workspace/admin/workspace-settings" },
] as const;

export const CUSTOMER_ADMIN_RECENT_ACTIVITY = [
  "Workspace created",
  "Administrator configured",
  "Subscription activated",
  "No deployments received yet",
] as const;

export const CUSTOMER_ADMIN_SUPPORT_LINKS = [
  { label: "Documentation", href: "/workspace/admin/help" },
  { label: "Book onboarding session", href: "/workspace/admin/support/onboarding" },
  { label: "Contact Support", href: "/workspace/admin/support" },
] as const;

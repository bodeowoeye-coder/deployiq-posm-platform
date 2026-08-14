import type { CustomerQuotation } from "@/lib/commercial/onboarding/quotation";

export const RETAIL_WORKSPACE_MANIFEST_VERSION = "2026.08.retail-reference-v1";

export type RetailCapability =
  | "fieldEvidence"
  | "clientVisibility"
  | "aiValidation"
  | "projectAnalytics"
  | "approvalWorkflow"
  | "offlineOperation";

export type RetailNavigationItem = {
  key: string;
  label: string;
  module: string;
  requiredPermissions: string[];
  core?: boolean;
  capability?: RetailCapability;
};

export type RetailRoleDefinition = {
  key: string;
  label: string;
  description: string;
  appRole: "admin" | "client" | "installer";
  permissions: string[];
};

export type RetailWorkspaceManifest = {
  identity: {
    productKey: "retail";
    productName: "DeployIQ Retail";
    productFamily: "retail_operations";
    manifestKey: "retail_workspace_manifest";
    manifestVersion: string;
  };
  terminology: Record<string, string>;
  modules: Record<string, { label: string; core?: boolean; capability?: RetailCapability }>;
  navigation: RetailNavigationItem[];
  roles: RetailRoleDefinition[];
  statuses: Record<"project" | "submission" | "approval", Array<{ key: string; label: string; terminal?: boolean }>>;
  defaults: {
    timezone: string;
    currency: string;
    language: string;
    dateFormat: string;
    notificationSettings: Record<string, boolean>;
    evidenceRequirements: Record<string, boolean>;
    gpsSettings: Record<string, boolean | number>;
    approvalSettings: Record<string, boolean>;
    dashboard: {
      title: string;
      emptyStateMessage: string;
      primaryActions: string[];
      kpiState: "hidden_until_live_project" | "not_started";
    };
    branding: {
      productIdentity: string;
      logoPlaceholder: string;
      theme: string;
      accentColour: string;
    };
  };
  starterData: {
    project: null;
    checklist: Array<{ key: string; label: string; sequence: number }>;
    reports: Array<{ key: string; label: string; emptyState: string }>;
    notifications: Array<{ key: string; label: string; channel: "in_app"; enabled: boolean }>;
  };
};

const CORE_PERMISSIONS = [
  "workspace.settings.manage",
  "projects.manage",
  "campaigns.manage",
  "brands.manage",
  "deployment_locations.manage",
  "field_teams.manage",
  "submissions.review",
  "approvals.manage",
  "evidence.review",
  "maps.view",
  "analytics.view",
  "reports.view",
  "notifications.manage",
  "users.manage",
  "roles.manage",
  "commercial.view",
];

export const retailWorkspaceManifest: RetailWorkspaceManifest = {
  identity: {
    productKey: "retail",
    productName: "DeployIQ Retail",
    productFamily: "retail_operations",
    manifestKey: "retail_workspace_manifest",
    manifestVersion: RETAIL_WORKSPACE_MANIFEST_VERSION,
  },
  terminology: {
    programme: "Programme",
    project: "Project",
    deploymentLocation: "Deployment Location",
    outlet: "Outlet",
    fieldTeam: "Field Team",
    fieldAgent: "Installer",
    submission: "Submission",
    evidence: "Evidence",
    approval: "Approval",
    campaign: "Campaign",
    brand: "Brand",
  },
  modules: {
    dashboard: { label: "Dashboard", core: true },
    projects: { label: "Projects", core: true },
    deploymentLocations: { label: "Deployment Locations", core: true },
    fieldTeams: { label: "Field Teams", core: true },
    submissions: { label: "Submissions", core: true },
    approvals: { label: "Approvals", capability: "approvalWorkflow" },
    evidence: { label: "Evidence", capability: "fieldEvidence" },
    maps: { label: "Map", capability: "fieldEvidence" },
    analytics: { label: "Analytics", capability: "projectAnalytics" },
    reports: { label: "Reports", core: true },
    notifications: { label: "Notifications", core: true },
    clientPortal: { label: "Client Portal", capability: "clientVisibility" },
    aiValidation: { label: "AI-assisted validation", capability: "aiValidation" },
    offlineOperation: { label: "Offline capture readiness", capability: "offlineOperation" },
    usersRoles: { label: "Users & Roles", core: true },
    workspaceSettings: { label: "Workspace Settings", core: true },
  },
  navigation: [
    { key: "dashboard", label: "Dashboard", module: "dashboard", requiredPermissions: ["projects:read"], core: true },
    { key: "projects", label: "Projects", module: "projects", requiredPermissions: ["projects:read"], core: true },
    { key: "deployment_locations", label: "Deployment Locations", module: "deploymentLocations", requiredPermissions: ["projects:read"], core: true },
    { key: "field_teams", label: "Field Teams", module: "fieldTeams", requiredPermissions: ["installers:read"], core: true },
    { key: "submissions", label: "Submissions", module: "submissions", requiredPermissions: ["submissions:read"], core: true },
    { key: "approvals", label: "Approvals", module: "approvals", requiredPermissions: ["submissions:read"], capability: "approvalWorkflow" },
    { key: "map", label: "Map", module: "maps", requiredPermissions: ["submissions:read"], capability: "fieldEvidence" },
    { key: "analytics", label: "Analytics", module: "analytics", requiredPermissions: ["exports:read"], capability: "projectAnalytics" },
    { key: "reports", label: "Reports", module: "reports", requiredPermissions: ["exports:read"], core: true },
    { key: "notifications", label: "Notifications", module: "notifications", requiredPermissions: ["notifications:read"], core: true },
    { key: "users_roles", label: "Users & Roles", module: "usersRoles", requiredPermissions: ["users:read"], core: true },
    { key: "workspace_settings", label: "Workspace Settings", module: "workspaceSettings", requiredPermissions: ["clients:read"], core: true },
  ],
  roles: [
    { key: "customer_admin", label: "Customer Admin", description: "Full administration inside this customer workspace with no cross-tenant access.", appRole: "client", permissions: CORE_PERMISSIONS },
    { key: "workspace_administrator", label: "Workspace Administrator", description: "Operational configuration, user, outlet and reporting management.", appRole: "client", permissions: CORE_PERMISSIONS.filter((p) => p !== "commercial.view").concat("commercial.view") },
    { key: "project_manager", label: "Project Manager", description: "Create and manage projects, teams, performance and reports.", appRole: "client", permissions: ["projects.manage", "campaigns.manage", "brands.manage", "deployment_locations.manage", "field_teams.manage", "analytics.view", "reports.view"] },
    { key: "field_supervisor", label: "Field Supervisor", description: "Review submissions, approve or reject evidence, and monitor teams.", appRole: "client", permissions: ["projects.view", "submissions.review", "approvals.manage", "evidence.review", "maps.view", "reports.view"] },
    { key: "installer_field_agent", label: "Installer / Field Agent", description: "Access assigned work and submit photo/GPS evidence.", appRole: "installer", permissions: ["projects.view", "submissions.create", "evidence.create", "maps.view"] },
    { key: "client_viewer", label: "Client Viewer", description: "Read-only dashboard, map, analytics and report access.", appRole: "client", permissions: ["projects.view", "submissions.view", "maps.view", "analytics.view", "reports.view", "notifications.view"] },
  ],
  statuses: {
    project: [
      { key: "draft", label: "Draft" },
      { key: "active", label: "Active" },
      { key: "on_hold", label: "On Hold" },
      { key: "completed", label: "Completed", terminal: true },
      { key: "archived", label: "Archived", terminal: true },
    ],
    submission: [
      { key: "draft", label: "Draft" },
      { key: "submitted", label: "Submitted" },
      { key: "pending_review", label: "Pending Review" },
      { key: "approved", label: "Approved", terminal: true },
      { key: "rejected", label: "Rejected", terminal: true },
      { key: "archived", label: "Archived", terminal: true },
    ],
    approval: [
      { key: "pending", label: "Pending Review" },
      { key: "approved", label: "Approved", terminal: true },
      { key: "rejected", label: "Rejected", terminal: true },
    ],
  },
  defaults: {
    timezone: "Africa/Lagos",
    currency: "NGN",
    language: "en-NG",
    dateFormat: "DD MMM YYYY",
    notificationSettings: { inApp: true, email: false },
    evidenceRequirements: { photoRequired: true, duplicatePrevention: true, outletMatchValidation: true },
    gpsSettings: { required: true, minAccuracyMeters: 50 },
    approvalSettings: { requireReview: true, rejectionReasonRequired: true, rejectionCommentOptional: true, excludeArchivedFromMetrics: true },
    dashboard: {
      title: "Your Retail workspace is ready.",
      emptyStateMessage: "Your Retail workspace is ready.",
      primaryActions: ["Create first project", "Import deployment locations", "Invite field team", "Configure workspace"],
      kpiState: "hidden_until_live_project",
    },
    branding: {
      productIdentity: "DeployIQ Retail",
      logoPlaceholder: "workspace_initials",
      theme: "deployiq_retail",
      accentColour: "#ea580c",
    },
  },
  starterData: {
    project: null,
    checklist: [
      "Complete organisation profile",
      "Upload workspace logo",
      "Invite your team",
      "Create your first project",
      "Import deployment locations",
      "Add or invite field workers",
      "Configure approval workflow",
      "Review evidence requirements",
      "Launch your first deployment",
      "View your first report",
    ].map((label, index) => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""), label, sequence: index + 1 })),
    reports: [
      ["retail_deployment_progress", "Retail deployment progress report"],
      ["evidence", "Evidence report"],
      ["gps_verification", "GPS verification report"],
      ["approval_status", "Approval status report"],
      ["state_location_summary", "State/location summary"],
      ["project_performance", "Project performance dashboard"],
      ["map_view", "Map view availability"],
    ].map(([key, label]) => ({ key, label, emptyState: "This report will populate once customer data exists." })),
    notifications: [
      ["workspace_created", "Workspace created"],
      ["team_invitation", "Team invitation"],
      ["project_created", "Project created"],
      ["field_assignment", "Field assignment"],
      ["submission_received", "Submission received"],
      ["submission_approved", "Submission approved"],
      ["submission_rejected", "Submission rejected"],
      ["programme_milestone", "Programme milestone"],
      ["report_ready", "Report ready"],
    ].map(([key, label]) => ({ key, label, channel: "in_app" as const, enabled: true })),
  },
};

export function getRetailWorkspaceManifest() {
  return retailWorkspaceManifest;
}

export function enabledRetailModulesForCapabilities(capabilities: string[] | null | undefined) {
  const selected = new Set((capabilities ?? []).filter(Boolean));
  return Object.entries(retailWorkspaceManifest.modules)
    .filter(([, module]) => module.core || (module.capability && selected.has(module.capability)))
    .map(([key]) => key);
}

export function retailNavigationForCapabilities(capabilities: string[] | null | undefined) {
  const selected = new Set((capabilities ?? []).filter(Boolean));
  return retailWorkspaceManifest.navigation.filter((item) => item.core || (item.capability && selected.has(item.capability)));
}

export function buildRetailEntitlement(input: {
  acquisitionDraftId: string;
  commercialReference: string;
  pricingTemplateId: string;
  quotation: CustomerQuotation;
  capabilities: string[];
}) {
  return {
    productKey: retailWorkspaceManifest.identity.productKey,
    status: "active",
    acquisitionDraftId: input.acquisitionDraftId,
    commercialReference: input.commercialReference,
    pricingTemplateId: input.pricingTemplateId,
    programmeQuantity: input.quotation.quantity,
    enabledCapabilities: input.capabilities,
    commercialModel: input.quotation.commercialModel ?? "one_time_programme",
  };
}

export function assertRetailWorkspaceAccess(userClientId: string | null | undefined, resourceClientId: string | null | undefined) {
  return Boolean(userClientId && resourceClientId && userClientId === resourceClientId);
}

import { getCanonicalProductCatalog } from "../../commercial/products/catalogue.ts";
import { getRetailWorkspaceManifest } from "./retailManifest.ts";

export type ProvisioningStage =
  | "queued"
  | "validating"
  | "reserving_workspace"
  | "creating_organisation"
  | "creating_workspace"
  | "configuring_product"
  | "creating_administrator"
  | "creating_permissions"
  | "seeding_workspace"
  | "running_post_checks"
  | "completed"
  | "failed";

export const PROVISIONING_STAGES: ProvisioningStage[] = [
  "queued",
  "validating",
  "reserving_workspace",
  "creating_organisation",
  "creating_workspace",
  "configuring_product",
  "creating_administrator",
  "creating_permissions",
  "seeding_workspace",
  "running_post_checks",
  "completed",
  "failed",
];

export type ProductProvisioningManifest = {
  productKey: string;
  manifestKey: string;
  manifestVersion?: string;
  provisioningStatus: "enabled" | "placeholder";
  isPlaceholder: boolean;
  productName?: string;
  productFamily?: string;
  enabledModules: string[];
  defaultNavigation: string[];
  roles: Array<{ key: string; label: string; permissions: string[] }>;
  starterDashboard: {
    title: string;
    widgets: string[];
  };
};

const BASE_ROLES: ProductProvisioningManifest["roles"] = [
  {
    key: "workspace_admin",
    label: "Workspace Administrator",
    permissions: ["workspace.manage", "users.manage", "projects.manage", "reports.view"],
  },
  {
    key: "field_manager",
    label: "Field Manager",
    permissions: ["projects.view", "submissions.review", "reports.view"],
  },
  {
    key: "field_user",
    label: "Field User",
    permissions: ["projects.view", "submissions.create"],
  },
];

const MANIFEST_OVERRIDES: Record<string, Omit<ProductProvisioningManifest, "productKey" | "manifestKey">> = {
  retail: {
    manifestVersion: getRetailWorkspaceManifest().identity.manifestVersion,
    provisioningStatus: "enabled",
    isPlaceholder: false,
    productName: getRetailWorkspaceManifest().identity.productName,
    productFamily: getRetailWorkspaceManifest().identity.productFamily,
    enabledModules: Object.keys(getRetailWorkspaceManifest().modules),
    defaultNavigation: getRetailWorkspaceManifest().navigation.map((item) => item.label),
    roles: getRetailWorkspaceManifest().roles.map((role) => ({
      key: role.key,
      label: role.label,
      permissions: role.permissions,
    })),
    starterDashboard: {
      title: getRetailWorkspaceManifest().defaults.dashboard.title,
      widgets: getRetailWorkspaceManifest().defaults.dashboard.primaryActions,
    },
  },
  build: {
    provisioningStatus: "placeholder",
    isPlaceholder: true,
    enabledModules: ["build_sites", "work_packages", "activities", "quality_assurance", "reports"],
    defaultNavigation: ["Dashboard", "Sites", "Work Packages", "Reports", "Account"],
    roles: BASE_ROLES,
    starterDashboard: {
      title: "Build operations dashboard",
      widgets: ["site_progress", "work_package_status", "quality_actions"],
    },
  },
  location_audit: {
    provisioningStatus: "placeholder",
    isPlaceholder: true,
    enabledModules: ["audit_locations", "submissions", "reports", "notifications"],
    defaultNavigation: ["Dashboard", "Audits", "Map", "Reports", "Account"],
    roles: BASE_ROLES,
    starterDashboard: {
      title: "Location audit dashboard",
      widgets: ["audit_completion", "evidence_quality", "exceptions"],
    },
  },
  assets_audit: {
    provisioningStatus: "placeholder",
    isPlaceholder: true,
    enabledModules: ["assets", "inspections", "submissions", "reports"],
    defaultNavigation: ["Dashboard", "Assets", "Inspections", "Reports", "Account"],
    roles: BASE_ROLES,
    starterDashboard: {
      title: "Asset verification dashboard",
      widgets: ["asset_status", "inspection_queue", "certification_progress"],
    },
  },
  fleet: {
    provisioningStatus: "placeholder",
    isPlaceholder: true,
    enabledModules: ["fleet", "vehicles", "inspections", "reports"],
    defaultNavigation: ["Dashboard", "Fleet", "Vehicles", "Reports", "Account"],
    roles: BASE_ROLES,
    starterDashboard: {
      title: "Fleet operations dashboard",
      widgets: ["vehicle_coverage", "inspection_status", "branding_progress"],
    },
  },
  field_operations: {
    provisioningStatus: "placeholder",
    isPlaceholder: true,
    enabledModules: ["projects", "sites", "field_tasks", "submissions", "reports"],
    defaultNavigation: ["Dashboard", "Projects", "Sites", "Tasks", "Reports", "Account"],
    roles: BASE_ROLES,
    starterDashboard: {
      title: "Field operations dashboard",
      widgets: ["task_progress", "site_coverage", "field_team_activity"],
    },
  },
};

export function getProductProvisioningManifest(productKey: string): ProductProvisioningManifest | null {
  const product = getCanonicalProductCatalog().find((item) => item.productKey === productKey);
  const override = MANIFEST_OVERRIDES[productKey];
  if (!product || !override) return null;
  return {
    productKey,
    manifestKey: product.provisioningManifestKey,
    ...override,
  };
}

export function productMatchesManifest(productKey: string, manifestKey: string | null | undefined): boolean {
  const manifest = getProductProvisioningManifest(productKey);
  return Boolean(manifest && manifest.manifestKey === manifestKey);
}

export function isProvisioningBlueprintEnabled(productKey: string): boolean {
  const manifest = getProductProvisioningManifest(productKey);
  return Boolean(manifest && manifest.provisioningStatus === "enabled" && !manifest.isPlaceholder);
}

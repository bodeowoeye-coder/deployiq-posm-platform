export type CustomerWorkspaceRole =
  | "platform_admin"
  | "customer_admin"
  | "client_viewer"
  | "workspace_manager"
  | "agency_manager"
  | "installer";

export const CUSTOMER_ADMIN_PERMISSIONS = [
  "workspace.read",
  "workspace.update",
  "project.create",
  "project.read",
  "project.update",
  "project.archive",
  "campaign.manage",
  "location.manage",
  "submission.read",
  "submission.review",
  "user.invite",
  "user.manage_within_workspace",
  "agency.manage",
  "installer.manage",
  "report.generate",
  "map.read",
  "analytics.read",
  "notification.manage",
  "workspace_settings.manage",
  "billing.read",
] as const;

export function hasWorkspaceSettingsPermission(permissions: string[] | null | undefined) {
  const values = Array.isArray(permissions) ? permissions : [];
  return values.includes("workspace_settings.manage") || values.includes("settings.manage");
}

export const CUSTOMER_ADMIN_DENIED_PERMISSIONS = [
  "tenant.list_all",
  "tenant.access_other",
  "platform_settings.manage",
  "platform_pricing.manage",
  "cross_tenant_reporting",
  "platform_user_management",
  "service_role_operations",
  "provisioning_admin_actions",
] as const;

export const CUSTOMER_ADMIN_NAVIGATION = CUSTOMER_ADMIN_NAV_ITEMS.map((item) => item.label);

export function assertCustomerTenantAccess(context: { role: CustomerWorkspaceRole; clientId: string }, requestedClientId: string | null | undefined) {
  const normalized = typeof requestedClientId === "string" ? requestedClientId.trim() : "";
  if (!normalized) return true;
  if (normalized !== context.clientId) {
    throw new Error("Customer admins cannot access another tenant.");
  }
  return true;
}

export function canListAllTenants(context: { role: CustomerWorkspaceRole }) {
  return context.role === "platform_admin";
}

export function isCustomerAdminRole(role: CustomerWorkspaceRole) {
  return role === "customer_admin";
}
import { CUSTOMER_ADMIN_NAV_ITEMS } from "./customerAdminFoundation.ts";

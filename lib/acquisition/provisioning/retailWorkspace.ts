import { createAdminSupabase } from "../../supabaseAdmin.ts";
import type { CustomerQuotation } from "../../commercial/onboarding/quotation.ts";
import {
  buildRetailEntitlement,
  enabledRetailModulesForCapabilities,
  getRetailWorkspaceManifest,
  retailNavigationForCapabilities,
} from "./retailManifest.ts";

type DbClient = ReturnType<typeof createAdminSupabase>;

export type RetailWorkspaceIdentityInput = {
  acquisitionDraftId: string;
  clientId: string;
  organisationName: string;
  workspaceName: string;
  workspaceSlug: string;
  country: string;
  timezone: string;
  currency: string;
  commercialReference: string;
  pricingTemplateId: string;
  quotation: CustomerQuotation;
  capabilities: string[];
};

export type RetailWorkspaceSeedResult = {
  entitlementId: string | null;
  settingsId: string | null;
  starterProjectId: string | null;
  checklistId: string | null;
  roleIds: string[];
  permissionCount: number;
  navigationCount: number;
  statusCount: number;
  reportCount: number;
  notificationCount: number;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "DR";
}

async function optionalUpsert<T extends Record<string, unknown>>(
  supabase: DbClient,
  table: string,
  payload: T | T[],
  options?: { onConflict?: string; select?: string }
) {
  if (Array.isArray(payload) && payload.length === 0) return [];
  const upsertPayload = payload as any;
  const query = options?.onConflict
    ? supabase.from(table).upsert(upsertPayload, { onConflict: options.onConflict })
    : supabase.from(table).upsert(upsertPayload);
  if (options?.select) {
    const { data, error } = await query.select(options.select);
    if (error) throw error;
    return (data ?? []) as unknown as Record<string, unknown>[];
  }
  const { error } = await query;
  if (error) throw error;
  return [];
}

function isMissingOptionalTable(error: unknown) {
  const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "";
  const message = typeof (error as { message?: unknown })?.message === "string" ? (error as { message: string }).message.toLowerCase() : "";
  return code === "42P01" || code === "42703" || code === "PGRST205" || message.includes("schema cache") || message.includes("could not find the table");
}

export async function provisionRetailWorkspaceReference(input: RetailWorkspaceIdentityInput): Promise<RetailWorkspaceSeedResult> {
  const supabase = createAdminSupabase();
  const manifest = getRetailWorkspaceManifest();
  const now = new Date().toISOString();
  const enabledModules = enabledRetailModulesForCapabilities(input.capabilities);
  const navigation = retailNavigationForCapabilities(input.capabilities);

  const [settings] = await optionalUpsert(supabase, "workspace_settings", {
    client_id: input.clientId,
    workspace_display_name: input.workspaceName || input.organisationName,
    workspace_slug: input.workspaceSlug,
    product_key: manifest.identity.productKey,
    product_name: manifest.identity.productName,
    provisioning_manifest_key: manifest.identity.manifestKey,
    manifest_version: manifest.identity.manifestVersion,
    country: input.country,
    timezone: input.timezone || manifest.defaults.timezone,
    currency: input.currency || manifest.defaults.currency,
    language: manifest.defaults.language,
    date_format: manifest.defaults.dateFormat,
    commercial_reference: input.commercialReference,
    pricing_template_id: input.pricingTemplateId,
    programme_quantity: input.quotation.quantity,
    selected_capabilities: input.capabilities,
    commercial_model: input.quotation.commercialModel ?? "one_time_programme",
    enabled_modules: enabledModules,
    terminology: manifest.terminology,
    dashboard_config: manifest.defaults.dashboard,
    status: "active",
    provisioned_at: now,
    updated_at: now,
  }, { onConflict: "client_id", select: "id" });

  const entitlementInput = buildRetailEntitlement({
    acquisitionDraftId: input.acquisitionDraftId,
    commercialReference: input.commercialReference,
    pricingTemplateId: input.pricingTemplateId,
    quotation: input.quotation,
    capabilities: input.capabilities,
  });
  const [entitlement] = await optionalUpsert(supabase, "product_entitlements", {
    client_id: input.clientId,
    product_key: entitlementInput.productKey,
    status: entitlementInput.status,
    acquisition_draft_id: entitlementInput.acquisitionDraftId,
    commercial_reference: entitlementInput.commercialReference,
    pricing_template_id: entitlementInput.pricingTemplateId,
    programme_quantity: entitlementInput.programmeQuantity,
    enabled_capabilities: entitlementInput.enabledCapabilities,
    activation_date: now,
    commercial_model: entitlementInput.commercialModel,
    updated_at: now,
  }, { onConflict: "client_id,product_key", select: "id" });

  const roleRows = await optionalUpsert(supabase, "workspace_roles", manifest.roles.map((role) => ({
    client_id: input.clientId,
    role_key: role.key,
    label: role.label,
    description: role.description,
    app_role: role.appRole,
    status: "active",
    updated_at: now,
  })), { onConflict: "client_id,role_key", select: "id,role_key" });

  const roleIdByKey = new Map(roleRows.map((row) => [String(row.role_key), String(row.id)]));
  const permissionRows = manifest.roles.flatMap((role) => {
    const roleId = roleIdByKey.get(role.key);
    return roleId ? role.permissions.map((permission) => ({ role_id: roleId, permission })) : [];
  });
  await optionalUpsert(supabase, "workspace_role_permissions", permissionRows, { onConflict: "role_id,permission" });

  await optionalUpsert(supabase, "workspace_navigation", navigation.map((item, index) => ({
    client_id: input.clientId,
    item_key: item.key,
    label: item.label,
    module_key: item.module,
    sequence: index + 1,
    required_permissions: item.requiredPermissions,
    capability: item.capability ?? null,
    visible: true,
    updated_at: now,
  })), { onConflict: "client_id,item_key" });

  await optionalUpsert(supabase, "workspace_statuses", Object.entries(manifest.statuses).flatMap(([category, statuses]) =>
    statuses.map((status, index) => ({
      client_id: input.clientId,
      category,
      status_key: status.key,
      label: status.label,
      sequence: index + 1,
      terminal: Boolean(status.terminal),
      active: true,
      updated_at: now,
    }))
  ), { onConflict: "client_id,category,status_key" });

  const starterProjectId = null;

  const [checklist] = await optionalUpsert(supabase, "workspace_onboarding_checklists", {
    client_id: input.clientId,
    manifest_key: manifest.identity.manifestKey,
    manifest_version: manifest.identity.manifestVersion,
    status: "not_started",
    updated_at: now,
  }, { onConflict: "client_id", select: "id" });

  const checklistId = text(checklist?.id);
  if (checklistId) {
    await optionalUpsert(supabase, "workspace_onboarding_checklist_items", manifest.starterData.checklist.map((item) => ({
      checklist_id: checklistId,
      item_key: item.key,
      label: item.label,
      sequence: item.sequence,
      completed: false,
      updated_at: now,
    })), { onConflict: "checklist_id,item_key" });
  }

  await optionalUpsert(supabase, "workspace_report_configs", manifest.starterData.reports.map((report) => ({
    client_id: input.clientId,
    report_key: report.key,
    label: report.label,
    empty_state: report.emptyState,
    enabled: true,
    generated: false,
    updated_at: now,
  })), { onConflict: "client_id,report_key" });

  await optionalUpsert(supabase, "workspace_notification_defaults", manifest.starterData.notifications.map((notification) => ({
    client_id: input.clientId,
    event_key: notification.key,
    label: notification.label,
    channel: notification.channel,
    enabled: notification.enabled,
    send_external_email: false,
    updated_at: now,
  })), { onConflict: "client_id,event_key" });

  await optionalUpsert(supabase, "workspace_branding", {
    client_id: input.clientId,
    product_identity: manifest.defaults.branding.productIdentity,
    organisation_display_name: input.organisationName,
    workspace_initials: initials(input.workspaceName || input.organisationName),
    logo_placeholder: manifest.defaults.branding.logoPlaceholder,
    theme: manifest.defaults.branding.theme,
    accent_colour: manifest.defaults.branding.accentColour,
    notification_display_name: `${input.organisationName} on ${manifest.identity.productName}`,
    updated_at: now,
  }, { onConflict: "client_id" });

  return {
    entitlementId: text(entitlement?.id) || null,
    settingsId: text(settings?.id) || null,
    starterProjectId,
    checklistId: checklistId || null,
    roleIds: [...roleIdByKey.values()],
    permissionCount: permissionRows.length,
    navigationCount: navigation.length,
    statusCount: Object.values(manifest.statuses).reduce((sum, statuses) => sum + statuses.length, 0),
    reportCount: manifest.starterData.reports.length,
    notificationCount: manifest.starterData.notifications.length,
  };
}

export function buildRetailHealthChecks(input: {
  organisationId: string | null;
  workspaceSlug: string | null;
  entitlementId: string | null;
  adminUserId: string | null;
  starterProjectId: string | null;
  checklistId: string | null;
  manifestVersion: string | null;
  productKey: string | null;
  workspaceBelongsToDraft: boolean;
  expectedWorkspaceExists: boolean;
  duplicateWorkspaceCount: number;
  crossTenantReferenceCount: number;
  ownerMembershipExists: boolean;
  entitlementVerified: boolean;
  destinationVerified: boolean;
  roleCount: number;
  permissionCount: number;
}) {
  const checks = {
    organisationExists: Boolean(input.organisationId),
    workspaceIdentityExists: Boolean(input.workspaceSlug),
    expectedWorkspaceExists: input.expectedWorkspaceExists,
    slugReserved: Boolean(input.workspaceSlug),
    productEntitlementActive: Boolean(input.entitlementId) && input.entitlementVerified,
    primaryAdministratorExists: Boolean(input.adminUserId),
    ownerMembershipExists: input.ownerMembershipExists,
    defaultRolesExist: input.roleCount >= getRetailWorkspaceManifest().roles.length,
    permissionsExist: input.permissionCount > 0,
    retailManifestVersionStored: input.manifestVersion === getRetailWorkspaceManifest().identity.manifestVersion,
    noStarterProjectSeeded: input.starterProjectId === null,
    onboardingChecklistExists: Boolean(input.checklistId),
    productKeyIsRetail: input.productKey === "retail",
    workspaceBelongsToAcquisitionDraft: input.workspaceBelongsToDraft,
    noDuplicateWorkspace: input.duplicateWorkspaceCount <= 1,
    noCrossTenantReferences: input.crossTenantReferenceCount === 0,
    workspaceDestinationVerified: input.destinationVerified,
  };
  return {
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

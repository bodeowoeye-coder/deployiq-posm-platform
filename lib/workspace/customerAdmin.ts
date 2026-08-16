import { cache } from "react";
import { headers } from "next/headers";
import { resolveActiveSupportSession } from "../admin/supportAccess.ts";
import { getCurrentAccessToken, getCurrentRefreshToken, resolveCurrentUserContext } from "../auth.ts";
import { createAdminSupabase } from "../supabaseAdmin.ts";
import type { Client } from "../types.ts";
import {
  CUSTOMER_ADMIN_PERMISSIONS,
  type CustomerWorkspaceRole,
} from "./customerAdminModel.ts";
import {
  CUSTOMER_ADMIN_NAV_ITEMS,
  derivePrimaryWorkspaceAction,
  deriveWorkspaceSetupSteps,
  workspaceHealth,
  workspaceSetupProgress,
  type WorkspaceSetupMetrics,
  type WorkspaceSetupStep,
} from "./customerAdminFoundation.ts";

export {
  CUSTOMER_ADMIN_DENIED_PERMISSIONS,
  CUSTOMER_ADMIN_NAVIGATION,
  CUSTOMER_ADMIN_PERMISSIONS,
  assertCustomerTenantAccess,
  canListAllTenants,
  isCustomerAdminRole,
} from "./customerAdminModel.ts";
export {
  CUSTOMER_ADMIN_ACCOUNT_SETTINGS_NAV_ITEMS,
  CUSTOMER_ADMIN_MODULE_AUDIT,
  CUSTOMER_ADMIN_NAV_ITEMS,
  CUSTOMER_ADMIN_QUICK_ACTIONS,
  CUSTOMER_ADMIN_RECENT_ACTIVITY,
  CUSTOMER_ADMIN_SUPPORT_LINKS,
  derivePrimaryWorkspaceAction,
  deriveWorkspaceSetupSteps,
  directoryLabelForProduct,
  workspaceHealth,
  workspaceSetupProgress,
} from "./customerAdminFoundation.ts";

export type CustomerWorkspaceContext = {
  userId: string;
  email: string | null;
  role: CustomerWorkspaceRole;
  clientId: string;
  client: Client;
  supportSession: { id: string; expiresAt: string; expiresInMinutes: number } | null;
  organisationName: string;
  workspaceName: string;
  workspaceSlug: string;
  workspaceUrl: string;
  customerId: string;
  branding: {
    organisationDisplayName: string;
    workspaceInitials: string;
    logoUrl: string | null;
    accentColour: string;
    theme: string;
  };
  productName: string;
  productKey: string;
  planName: string;
  activationStatus: string;
  membershipRoleKey: string;
  isPrimaryAdministrator: boolean;
  permissions: string[];
  navigation: typeof CUSTOMER_ADMIN_NAV_ITEMS;
  setupMetrics: WorkspaceSetupMetrics;
  setupSteps: WorkspaceSetupStep[];
  setupProgress: { completed: number; total: number; percent: number };
  primaryAction: WorkspaceSetupStep;
  health: ReturnType<typeof workspaceHealth>;
};

export class CustomerWorkspaceRedirect extends Error {
  redirectTo: string;

  constructor(redirectTo: string) {
    super(`Redirect to ${redirectTo}`);
    this.name = "CustomerWorkspaceRedirect";
    this.redirectTo = redirectTo;
  }
}

export class CustomerWorkspaceTransientError extends Error {
  retryable = true;
  cause: unknown;
  step: string | null;
  result: string | null;

  constructor(message: string, cause?: unknown, details?: { step?: string; result?: string }) {
    super(details?.step && process.env.NODE_ENV === "development" ? `${details.step}: ${details.result ?? message}` : message);
    this.name = "CustomerWorkspaceTransientError";
    this.cause = cause;
    this.step = details?.step ?? null;
    this.result = details?.result ?? null;
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeWorkspaceReturnTo(value: string | null | undefined) {
  const raw = text(value);
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/workspace/admin";
  try {
    const parsed = new URL(raw, "http://localhost");
    const destination = `${parsed.pathname}${parsed.search}`;
    return parsed.pathname === "/workspace/admin" || parsed.pathname.startsWith("/workspace/admin/")
      ? destination
      : "/workspace/admin";
  } catch {
    return "/workspace/admin";
  }
}

function requestedWorkspaceReturnTo() {
  return safeWorkspaceReturnTo(headers().get("x-deployiq-return-to"));
}

function loginRedirectForWorkspace(returnTo: string) {
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

function sessionRefreshRedirectForWorkspace(returnTo: string) {
  return `/api/auth/session/refresh?returnTo=${encodeURIComponent(returnTo)}`;
}

function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function timingMs(start: number) {
  return Math.round((nowMs() - start) * 10) / 10;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorSummary(error: unknown): { message: string; code: string | null; status: number | null } {
  if (!error || typeof error !== "object") return { message: "Unknown error", code: null, status: null };
  const record = error as Record<string, unknown>;
  return {
    message: typeof record.message === "string" ? record.message : "Unknown error",
    code: typeof record.code === "string" ? record.code : null,
    status: typeof record.status === "number" ? record.status : null,
  };
}

type WorkspaceDiagnosticContext = {
  route: string;
  userId: string | null;
  email: string | null;
  sessionRole: string | null;
  clientId: string | null;
  totalStartedAt?: number | null;
};

export function workspacePerformanceLog(input: {
  route: string;
  step: string;
  elapsedMs: number;
  totalElapsedMs?: number | null;
}) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[workspace-performance]", {
    route: input.route,
    step: input.step,
    elapsedMs: input.elapsedMs,
    totalElapsedMs: input.totalElapsedMs ?? input.elapsedMs,
  });
}

function workspaceDiagnosticLog(
  level: "info" | "warn" | "error",
  context: WorkspaceDiagnosticContext,
  input: {
    step: string;
    result: string;
    rowCount?: number | null;
    elapsedMs?: number | null;
    error?: unknown;
    details?: Record<string, unknown>;
  },
) {
  const payload = {
    Step: input.step,
    User: context.userId,
    Email: context.email,
    SessionRole: context.sessionRole,
    ClientId: context.clientId,
    Route: context.route,
    Result: input.result,
    RowCount: input.rowCount ?? null,
    ElapsedMs: input.elapsedMs ?? null,
    Error: input.error ? errorSummary(input.error) : null,
    ...(input.details ?? {}),
  };
  console[level]("[workspace-context]", payload);
}

async function workspaceLookup<T>(
  context: WorkspaceDiagnosticContext,
  step: string,
  lookup: () => PromiseLike<{ data: T | null; error?: unknown; count?: number | null }>,
  options: { missingResult?: string; required?: boolean } = {},
) {
  const startedAt = nowMs();
  try {
    const result = await lookup();
    if (result.error) {
      const summary = errorSummary(result.error);
      workspaceDiagnosticLog("error", context, {
        step,
        result: summary.message || "Lookup failed",
        error: result.error,
        elapsedMs: timingMs(startedAt),
      });
      throw new CustomerWorkspaceTransientError(
        "Workspace context lookup failed.",
        result.error,
        { step, result: summary.message || "Lookup failed" },
      );
    }
    const hasCount = typeof result.count === "number";
    const hasRows = hasCount || (Array.isArray(result.data) ? result.data.length > 0 : Boolean(result.data));
    if (!hasRows) {
      const missingResult = options.missingResult ?? "NO ROWS";
      workspaceDiagnosticLog(options.required ? "warn" : "info", context, {
        step,
        result: missingResult,
        rowCount: Array.isArray(result.data) ? result.data.length : 0,
        elapsedMs: timingMs(startedAt),
      });
      if (options.required) {
        throw new CustomerWorkspaceTransientError(
          "Workspace context lookup returned no rows.",
          null,
          { step, result: missingResult },
        );
      }
    } else {
      workspaceDiagnosticLog("info", context, {
        step,
        result: "OK",
        rowCount: hasCount ? result.count ?? 0 : Array.isArray(result.data) ? result.data.length : 1,
        elapsedMs: timingMs(startedAt),
      });
    }
    workspacePerformanceLog({
      route: context.route,
      step,
      elapsedMs: timingMs(startedAt),
      totalElapsedMs: context.totalStartedAt ? timingMs(context.totalStartedAt) : null,
    });
    return result;
  } catch (error) {
    if (error instanceof CustomerWorkspaceTransientError) throw error;
    workspaceDiagnosticLog("error", context, {
      step,
      result: error instanceof Error ? error.message : "Lookup threw",
      error,
      elapsedMs: timingMs(startedAt),
    });
    throw new CustomerWorkspaceTransientError(
      "Workspace context lookup threw.",
      error,
      { step, result: error instanceof Error ? error.message : "Lookup threw" },
    );
  }
}

async function optionalWorkspaceLookup<T>(
  context: WorkspaceDiagnosticContext,
  step: string,
  lookup: () => PromiseLike<{ data: T | null; error?: unknown; count?: number | null }>,
  fallback: { data: T | null; count?: number | null },
  options: { missingResult?: string } = {},
) {
  const startedAt = nowMs();
  try {
    const result = await lookup();
    if (result.error) {
      workspaceDiagnosticLog("warn", context, {
        step,
        result: "Optional lookup unavailable",
        error: result.error,
        elapsedMs: timingMs(startedAt),
      });
      return fallback;
    }

    const hasCount = typeof result.count === "number";
    const hasRows = hasCount || (Array.isArray(result.data) ? result.data.length > 0 : Boolean(result.data));
    workspaceDiagnosticLog("info", context, {
      step,
      result: hasRows ? "OK" : options.missingResult ?? "NO ROWS",
      rowCount: hasCount ? result.count ?? 0 : Array.isArray(result.data) ? result.data.length : hasRows ? 1 : 0,
      elapsedMs: timingMs(startedAt),
    });
    workspacePerformanceLog({
      route: context.route,
      step,
      elapsedMs: timingMs(startedAt),
      totalElapsedMs: context.totalStartedAt ? timingMs(context.totalStartedAt) : null,
    });
    return result;
  } catch (error) {
    workspaceDiagnosticLog("warn", context, {
      step,
      result: "Optional lookup unavailable",
      error,
      elapsedMs: timingMs(startedAt),
    });
    return fallback;
  }
}

function logAuthContext(context: WorkspaceDiagnosticContext, result: string) {
  workspaceDiagnosticLog("info", context, {
    step: "Authenticated session",
    result,
  });
}

function isTransientError(error: unknown) {
  const summary = errorSummary(error);
  const message = summary.message.toLowerCase();
  return (
    summary.status === null ||
    summary.status >= 500 ||
    message.includes("fetch") ||
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("connection") ||
    message.includes("terminated")
  );
}

async function withWorkspaceRetry<T>(
  label: string,
  context: { route: string; userId?: string | null; clientId?: string | null },
  action: (attempt: number) => Promise<T>,
) {
  const delays = [120, 360];
  const startedAt = nowMs();
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= delays.length + 1; attempt += 1) {
    const attemptStart = nowMs();
    try {
      const result = await action(attempt);
      console.info("[customer-workspace-context]", {
        route: context.route,
        stage: label,
        attempt,
        userId: context.userId ?? null,
        clientId: context.clientId ?? null,
        result: "resolved",
        elapsedMs: timingMs(attemptStart),
        totalMs: timingMs(startedAt),
      });
      return result;
    } catch (error) {
      lastError = error;
      console.warn("[customer-workspace-context]", {
        route: context.route,
        stage: label,
        attempt,
        userId: context.userId ?? null,
        clientId: context.clientId ?? null,
        result: "transient_failure",
        error: errorSummary(error),
        elapsedMs: timingMs(attemptStart),
      });
      if (!isTransientError(error) || attempt > delays.length) break;
      await sleep(delays[attempt - 1]);
    }
  }

  const summary = errorSummary(lastError);
  throw new CustomerWorkspaceTransientError(
    "Workspace context lookup failed after retry.",
    lastError,
    { step: label, result: summary.message },
  );
}

function slugFromName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "workspace";
}

function roleFromMembership(roleKey: string): CustomerWorkspaceRole | null {
  if (roleKey === "customer_admin" || roleKey === "workspace_owner") return "customer_admin";
  if (roleKey === "workspace_manager" || roleKey === "workspace_administrator" || roleKey === "project_manager") return "workspace_manager";
  if (roleKey === "agency_manager") return "agency_manager";
  if (roleKey === "installer_field_agent") return "installer";
  if (roleKey === "client_viewer") return "client_viewer";
  return null;
}

function countValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function customerDisplayId(clientId: string) {
  let hash = 0;
  for (const char of clientId) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `DQ-CUST-${String(hash % 1_000_000).padStart(6, "0")}`;
}

function checklistCompleted(items: Array<Record<string, unknown>>, patterns: RegExp[]) {
  return items.some((item) => {
    if (item.completed !== true) return false;
    const label = text(item.label).toLowerCase();
    const key = text(item.item_key).toLowerCase();
    return patterns.some((pattern) => pattern.test(label) || pattern.test(key));
  });
}

function defaultSetupMetrics(): WorkspaceSetupMetrics {
  return {
    directoryUploaded: false,
    projectCount: 0,
    membershipCount: 0,
    approvalWorkflowConfigured: false,
    campaignCount: 0,
    deploymentStarted: false,
  };
}

function applySetupMetrics(context: CustomerWorkspaceContext, setupMetrics: WorkspaceSetupMetrics, branding?: Record<string, unknown> | null): CustomerWorkspaceContext {
  const setupSteps = deriveWorkspaceSetupSteps(setupMetrics, context.productKey);
  return {
    ...context,
    branding: branding ? {
      organisationDisplayName: text(branding.organisation_display_name) || context.branding.organisationDisplayName,
      workspaceInitials: text(branding.workspace_initials) || context.branding.workspaceInitials,
      logoUrl: text(branding.logo_url) || context.branding.logoUrl,
      accentColour: text(branding.accent_colour) || context.branding.accentColour,
      theme: text(branding.theme) || context.branding.theme,
    } : context.branding,
    setupMetrics,
    setupSteps,
    setupProgress: workspaceSetupProgress(setupSteps),
    primaryAction: derivePrimaryWorkspaceAction(setupSteps),
    health: workspaceHealth(setupMetrics),
  };
}

export async function hasCustomerAdminMembership(userId: string, clientId: string) {
  return withWorkspaceRetry("membership-check", { route: "auth-destination", userId, clientId }, async () => {
    const { data, error } = await createAdminSupabase()
      .from("workspace_memberships")
      .select("role_key,status")
      .eq("user_id", userId)
      .eq("client_id", clientId)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    return roleFromMembership(text(data?.role_key)) === "customer_admin";
  });
}

async function loadCustomerWorkspaceContextOnce(): Promise<CustomerWorkspaceContext> {
  const totalStartedAt = nowMs();
  const authStartedAt = nowMs();
  const returnTo = requestedWorkspaceReturnTo();
  const authResolution = await resolveCurrentUserContext();
  const diagnosticAuthContext = authResolution.context;
  const unresolvedContext: WorkspaceDiagnosticContext = {
    route: "/workspace/admin",
    userId: diagnosticAuthContext?.user.id ?? null,
    email: diagnosticAuthContext?.user.email ?? null,
    sessionRole: diagnosticAuthContext?.role.role ?? null,
    clientId: diagnosticAuthContext?.role.client_id ?? null,
    totalStartedAt,
  };
  if (authResolution.status === "expired_session") {
    workspaceDiagnosticLog("info", unresolvedContext, {
      step: authResolution.step,
      result: authResolution.result,
      elapsedMs: timingMs(authStartedAt),
    });
    throw new CustomerWorkspaceRedirect(sessionRefreshRedirectForWorkspace(returnTo));
  }
  if (authResolution.status === "missing_session") {
    const accessToken = await getCurrentAccessToken();
    const refreshToken = await getCurrentRefreshToken();
    logAuthContext(unresolvedContext, accessToken ? "Session token present but user context unresolved" : "Missing authenticated session");
    throw new CustomerWorkspaceRedirect(refreshToken ? sessionRefreshRedirectForWorkspace(returnTo) : loginRedirectForWorkspace(returnTo));
  }
  if (authResolution.status === "failed") {
    const diagnosticContext: WorkspaceDiagnosticContext = {
      route: "/workspace/admin",
      userId: authResolution.userId ?? null,
      email: authResolution.email ?? null,
      sessionRole: authResolution.role ?? null,
      clientId: authResolution.clientId ?? null,
      totalStartedAt,
    };
    workspaceDiagnosticLog("warn", diagnosticContext, {
      step: authResolution.step,
      result: authResolution.result,
      elapsedMs: timingMs(authStartedAt),
    });
    if (authResolution.step === "Authenticated user" && /expired/i.test(authResolution.result)) {
      throw new CustomerWorkspaceRedirect(sessionRefreshRedirectForWorkspace(returnTo));
    }
    throw new CustomerWorkspaceTransientError(
      "Authenticated session is still resolving.",
      null,
      { step: authResolution.step, result: authResolution.result },
    );
  }
  const authContext = authResolution.context;
  logAuthContext(unresolvedContext, "OK");
  workspacePerformanceLog({
    route: unresolvedContext.route,
    step: "Authenticated session",
    elapsedMs: timingMs(authStartedAt),
    totalElapsedMs: timingMs(totalStartedAt),
  });

  // A DeployIQ platform administrator may resolve one customer tenant, but only when an active,
  // unexpired support session bound to their own user id authorises that exact client.
  const supportSession = authContext.role.role === "admin" ? await resolveActiveSupportSession() : null;
  if (authContext.role.role === "admin" && !supportSession) {
    workspaceDiagnosticLog("warn", unresolvedContext, {
      step: "Session role validation",
      result: "Platform admin without an active support session",
    });
    throw new CustomerWorkspaceRedirect("/admin/customers");
  }

  if (!supportSession && (authContext.role.role !== "client" || !authContext.role.client_id || !authContext.client)) {
    workspaceDiagnosticLog("warn", unresolvedContext, {
      step: "Session role validation",
      result: "Not a Customer Workspace session",
      details: {
        HasClient: Boolean(authContext.client),
      },
    });
    throw new CustomerWorkspaceRedirect("/onboarding");
  }

  const supabase = createAdminSupabase();
  const clientId = supportSession ? supportSession.clientId : authContext.role.client_id!;
  const diagnosticContext: WorkspaceDiagnosticContext = {
    route: "/workspace/admin",
    userId: authContext.user.id,
    email: authContext.user.email ?? null,
    sessionRole: authContext.role.role,
    clientId,
    totalStartedAt,
  };

  const [
    { data: membership },
    { data: settings },
    { data: organisation },
    { data: entitlement },
    { data: statuses },
  ] = await Promise.all([
    workspaceLookup<Record<string, unknown>>(diagnosticContext, "Membership lookup", () =>
      supabase
        .from("workspace_memberships")
        .select("role_key,status")
        .eq("client_id", clientId)
        .eq("user_id", authContext.user.id)
        .eq("status", "active")
        .maybeSingle(),
      { missingResult: "NO ROWS" },
    ),
    workspaceLookup<Record<string, unknown>>(diagnosticContext, "Workspace lookup", () =>
      supabase
        .from("workspace_settings")
        .select("workspace_display_name,workspace_slug,product_key,product_name,commercial_model,status")
        .eq("client_id", clientId)
        .maybeSingle(),
      { missingResult: "Missing workspace_settings record", required: true },
    ),
    workspaceLookup<Record<string, unknown>>(diagnosticContext, "Organisation lookup", () =>
      supabase.from("clients").select("id,name").eq("id", clientId).maybeSingle(),
      { missingResult: "Missing clients organisation record", required: true },
    ),
    workspaceLookup<Record<string, unknown>>(diagnosticContext, "Product entitlement lookup", () =>
      supabase.from("product_entitlements").select("product_key,commercial_model").eq("client_id", clientId).eq("status", "active").maybeSingle(),
      { missingResult: "Missing active product_entitlements record", required: true },
    ),
    workspaceLookup<Array<Record<string, unknown>>>(diagnosticContext, "Workspace status lookup", () =>
      supabase.from("workspace_statuses").select("status_key").eq("client_id", clientId).limit(1),
      { missingResult: "NO ROWS" },
    ),
  ]);

  const membershipRoleKey = text(membership?.role_key);
  const role = supportSession ? "customer_admin" : roleFromMembership(membershipRoleKey);
  workspaceDiagnosticLog("info", diagnosticContext, {
    step: "Membership role evaluation",
    result: role === "customer_admin" ? "AUTHORIZED" : "UNAUTHORIZED",
    details: {
      MembershipRoleKey: membershipRoleKey || null,
      MembershipStatus: text(membership?.status) || null,
      SupportSession: supportSession ? supportSession.id : null,
    },
  });
  if (role !== "customer_admin") {
    throw new CustomerWorkspaceRedirect("/client");
  }

  const organisationName = text(organisation?.name) || text(authContext.client?.name);
  // In support mode the tenant record comes from the canonical clients row, not the admin's session.
  const clientRecord: Client = authContext.client ?? {
    id: clientId,
    name: organisationName,
    can_review: false,
    status: text(organisation?.status) === "Inactive" ? "Inactive" : "Active",
    created_at: text(organisation?.created_at) || new Date().toISOString(),
  } as Client;
  const workspaceSlug = text(settings?.workspace_slug) || slugFromName(organisationName);
  const workspaceName = text(settings?.workspace_display_name) || organisationName;
  const workspaceStatus = text(settings?.status).toLowerCase();
  if (workspaceStatus === "archived") {
    workspaceDiagnosticLog("warn", diagnosticContext, {
      step: "Workspace status evaluation",
      result: "Workspace archived",
    });
    throw new CustomerWorkspaceRedirect("/");
  }
  const productKey = text(settings?.product_key) || text(entitlement?.product_key) || "retail";
  const productName = text(settings?.product_name) || "DeployIQ Retail";
  const planName = text(settings?.commercial_model) || text(entitlement?.commercial_model) || "Retail activation plan";
  const activationStatus = statuses && statuses.length > 0 ? "Active" : "Setup in progress";
  if (activationStatus !== "Active") {
    workspaceDiagnosticLog("warn", diagnosticContext, {
      step: "Workspace status evaluation",
      result: "NO ACTIVE STATUS RECORDS",
    });
    throw new CustomerWorkspaceRedirect("/workspace/activation");
  }

  const setupMetrics = defaultSetupMetrics();
  const setupSteps = deriveWorkspaceSetupSteps(setupMetrics, productKey);
  const primaryAction = derivePrimaryWorkspaceAction(setupSteps);
  const setupProgress = workspaceSetupProgress(setupSteps);
  workspacePerformanceLog({
    route: diagnosticContext.route,
    step: "Required workspace context total",
    elapsedMs: timingMs(totalStartedAt),
    totalElapsedMs: timingMs(totalStartedAt),
  });

  return {
    userId: authContext.user.id,
    email: authContext.user.email ?? null,
    role,
    clientId,
    client: clientRecord,
    supportSession: supportSession
      ? { id: supportSession.id, expiresAt: supportSession.expiresAt, expiresInMinutes: supportSession.expiresInMinutes }
      : null,
    organisationName,
    workspaceName,
    workspaceSlug,
    workspaceUrl: `https://${workspaceSlug}.deployiq.ng`,
    customerId: customerDisplayId(clientId),
    branding: {
      organisationDisplayName: organisationName,
      workspaceInitials: slugFromName(organisationName).slice(0, 2).toUpperCase(),
      logoUrl: null,
      accentColour: "#ea580c",
      theme: "deployiq_retail",
    },
    productName,
    productKey,
    planName,
    activationStatus,
    membershipRoleKey,
    isPrimaryAdministrator: role === "customer_admin",
    permissions: [...CUSTOMER_ADMIN_PERMISSIONS],
    navigation: CUSTOMER_ADMIN_NAV_ITEMS,
    setupMetrics,
    setupSteps,
    setupProgress,
    primaryAction,
    health: workspaceHealth(setupMetrics),
  };
}

async function loadCustomerWorkspaceHomeContext(): Promise<CustomerWorkspaceContext> {
  const workspace = await resolveCustomerWorkspaceContext();
  const totalStartedAt = nowMs();
  const supabase = createAdminSupabase();
  const diagnosticContext: WorkspaceDiagnosticContext = {
    route: "/workspace/admin",
    userId: workspace.userId,
    email: workspace.email,
    sessionRole: "client",
    clientId: workspace.clientId,
    totalStartedAt,
  };
  const optionalMetricsStart = nowMs();
  const [
    brandingResult,
    projectCountResult,
    campaignCountResult,
    membershipCountResult,
    submissionCountResult,
    directoryRecordCountResult,
    agencyCountResult,
    installerCountResult,
    busyInstallerCountResult,
    readyCampaignCountResult,
    todaysDeploymentsResult,
    pendingApprovalsResult,
    rejectedTodayResult,
    activeInstallersResult,
    runningCampaignsResult,
    checklistResult,
  ] = await Promise.all([
    optionalWorkspaceLookup<Record<string, unknown>>(diagnosticContext, "Branding lookup", () =>
      supabase.from("workspace_branding").select("organisation_display_name,workspace_initials,logo_url,accent_colour,theme").eq("client_id", workspace.clientId).maybeSingle(),
      { data: null },
      { missingResult: "Missing workspace_branding record" },
    ),
    optionalWorkspaceLookup<Array<Record<string, unknown>>>(diagnosticContext, "Project count lookup", () =>
      supabase.from("projects").select("id", { count: "exact", head: true }).eq("client_id", workspace.clientId).is("archived_at", null),
      { data: [], count: 0 },
    ),
    optionalWorkspaceLookup<Array<Record<string, unknown>>>(diagnosticContext, "Campaign count lookup", () =>
      supabase.from("projects").select("id", { count: "exact", head: true }).eq("client_id", workspace.clientId).not("campaign", "is", null).is("archived_at", null),
      { data: [], count: 0 },
    ),
    optionalWorkspaceLookup<Array<Record<string, unknown>>>(diagnosticContext, "Membership count lookup", () =>
      supabase.from("workspace_memberships").select("id", { count: "exact", head: true }).eq("client_id", workspace.clientId).in("status", ["active", "invited"]),
      { data: [], count: 0 },
    ),
    optionalWorkspaceLookup<Array<Record<string, unknown>>>(diagnosticContext, "Submission count lookup", () =>
      supabase.from("submissions").select("id", { count: "exact", head: true }).eq("client_id", workspace.clientId),
      { data: [], count: 0 },
    ),
    optionalWorkspaceLookup<Array<Record<string, unknown>>>(diagnosticContext, "Directory count lookup", () =>
      supabase.from("deployment_locations").select("id", { count: "exact", head: true }).eq("client_id", workspace.clientId),
      { data: [], count: 0 },
    ),
    optionalWorkspaceLookup<Array<Record<string, unknown>>>(diagnosticContext, "Agency count lookup", () =>
      supabase.from("agencies").select("id", { count: "exact", head: true }).eq("client_id", workspace.clientId),
      { data: [], count: 0 },
    ),
    optionalWorkspaceLookup<Array<Record<string, unknown>>>(diagnosticContext, "Installer count lookup", () =>
      supabase.from("installers").select("id", { count: "exact", head: true }).eq("client_id", workspace.clientId),
      { data: [], count: 0 },
    ),
    optionalWorkspaceLookup<Array<Record<string, unknown>>>(diagnosticContext, "Busy installer count lookup", () =>
      supabase.from("workspace_field_assignments").select("installer_id", { count: "exact", head: true }).eq("client_id", workspace.clientId).in("assignment_status", ["assigned", "ready", "in_progress"]).not("installer_id", "is", null).is("removed_at", null),
      { data: [], count: 0 },
    ),
    optionalWorkspaceLookup<Array<Record<string, unknown>>>(diagnosticContext, "Campaigns ready for deployment lookup", () =>
      supabase.from("workspace_campaigns").select("id", { count: "exact", head: true }).eq("client_id", workspace.clientId).in("status", ["scheduled", "active"]),
      { data: [], count: 0 },
    ),
    optionalWorkspaceLookup<Array<Record<string, unknown>>>(diagnosticContext, "Today's deployments lookup", () =>
      supabase.from("submissions").select("id", { count: "exact", head: true }).eq("client_id", workspace.clientId).gte("submitted_at", new Date().toISOString().slice(0, 10)),
      { data: [], count: 0 },
    ),
    optionalWorkspaceLookup<Array<Record<string, unknown>>>(diagnosticContext, "Pending approvals lookup", () =>
      supabase.from("submissions").select("id", { count: "exact", head: true }).eq("client_id", workspace.clientId).in("status", ["Pending", "Flagged"]),
      { data: [], count: 0 },
    ),
    optionalWorkspaceLookup<Array<Record<string, unknown>>>(diagnosticContext, "Rejected today lookup", () =>
      supabase.from("submissions").select("id", { count: "exact", head: true }).eq("client_id", workspace.clientId).in("status", ["Rejected", "Correction Requested"]).gte("submitted_at", new Date().toISOString().slice(0, 10)),
      { data: [], count: 0 },
    ),
    optionalWorkspaceLookup<Array<Record<string, unknown>>>(diagnosticContext, "Installers active lookup", () =>
      supabase.from("installers").select("id", { count: "exact", head: true }).eq("client_id", workspace.clientId).in("availability_status", ["available", "busy"]),
      { data: [], count: 0 },
    ),
    optionalWorkspaceLookup<Array<Record<string, unknown>>>(diagnosticContext, "Campaigns running lookup", () =>
      supabase.from("workspace_campaigns").select("id", { count: "exact", head: true }).eq("client_id", workspace.clientId).eq("status", "active"),
      { data: [], count: 0 },
    ),
    optionalWorkspaceLookup<Record<string, unknown>>(diagnosticContext, "Onboarding checklist lookup", () =>
      supabase.from("workspace_onboarding_checklists").select("id,status").eq("client_id", workspace.clientId).maybeSingle(),
      { data: null },
      { missingResult: "Missing workspace_onboarding_checklists record" },
    ),
  ]);
  workspaceDiagnosticLog("info", diagnosticContext, {
    step: "Optional metrics block",
    result: "Completed",
    elapsedMs: timingMs(optionalMetricsStart),
  });
  workspacePerformanceLog({
    route: diagnosticContext.route,
    step: "Optional metrics",
    elapsedMs: timingMs(optionalMetricsStart),
    totalElapsedMs: timingMs(totalStartedAt),
  });

  const checklistId = text(checklistResult.data?.id);
  const { data: checklistItems } = checklistId
    ? await optionalWorkspaceLookup<Array<Record<string, unknown>>>(diagnosticContext, "Checklist items lookup", () =>
      supabase
        .from("workspace_onboarding_checklist_items")
        .select("item_key,label,completed")
        .eq("checklist_id", checklistId)
        .order("sequence", { ascending: true }),
      { data: [] },
      { missingResult: "NO ROWS" },
    )
    : { data: [] };
  const completedItems = (checklistItems ?? []) as Array<Record<string, unknown>>;
  const setupMetrics: WorkspaceSetupMetrics = {
    directoryUploaded: countValue(directoryRecordCountResult.count) > 0 || checklistCompleted(completedItems, [/directory/, /location/, /outlet/, /import/]),
    projectCount: countValue(projectCountResult.count),
    membershipCount: countValue(membershipCountResult.count),
    approvalWorkflowConfigured: checklistCompleted(completedItems, [/approval/, /workflow/]),
    campaignCount: countValue(campaignCountResult.count),
    deploymentStarted: countValue(submissionCountResult.count) > 0 || checklistCompleted(completedItems, [/deployment/, /launch/]),
    agencyCount: countValue(agencyCountResult.count),
    installerCount: countValue(installerCountResult.count),
    availableInstallerCount: Math.max(0, countValue(installerCountResult.count) - countValue(busyInstallerCountResult.count)),
    busyInstallerCount: countValue(busyInstallerCountResult.count),
    campaignsReadyForDeployment: countValue(readyCampaignCountResult.count),
    todaysDeployments: countValue(todaysDeploymentsResult.count),
    pendingApprovals: countValue(pendingApprovalsResult.count),
    rejectedToday: countValue(rejectedTodayResult.count),
    installersActive: countValue(activeInstallersResult.count),
    campaignsRunning: countValue(runningCampaignsResult.count),
  };

  const homeContext = applySetupMetrics(workspace, setupMetrics, brandingResult.data);
  workspacePerformanceLog({
    route: diagnosticContext.route,
    step: "Workspace home metrics total",
    elapsedMs: timingMs(totalStartedAt),
    totalElapsedMs: timingMs(totalStartedAt),
  });
  return homeContext;
}

export const resolveCustomerWorkspaceContext = cache(loadCustomerWorkspaceContextOnce);
export const resolveCustomerWorkspaceHomeContext = cache(loadCustomerWorkspaceHomeContext);

export async function requireCustomerWorkspace() {
  return resolveCustomerWorkspaceContext();
}

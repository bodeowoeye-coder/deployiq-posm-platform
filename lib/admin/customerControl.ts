import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { verifyWorkspaceDestination } from "@/lib/acquisition/provisioning/workspaceDestination";

// Core Admin global customer control plane.
// Every value below is read from an existing canonical source:
//   organisation        -> clients + client_profiles
//   workspace           -> workspace_settings
//   product / plan      -> workspace_settings + product_entitlements
//   commercial journey  -> onboarding_drafts (via product_entitlements.acquisition_draft_id)
//   provisioning        -> provisioning_jobs + provisioning_events
//   people              -> workspace_memberships + user_profiles
//   projects            -> projects
// No new customer, workspace, provisioning, user or project model is introduced here.

type Row = Record<string, unknown>;

export const UNAVAILABLE = "Not available";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function elapsedMs(startedAt: number) {
  return Math.round((nowMs() - startedAt) * 10) / 10;
}

function customerControlLog(payload: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[customer-control-performance]", payload);
}

export type CommercialStatus = "Draft" | "Awaiting Payment" | "Paid" | "Not available";
export type ProvisioningStatus = "Pending" | "Running" | "Completed" | "Failed" | "Not available";
export type WorkspaceStatus = "Active" | "Suspended" | "Archived" | "Inactive" | "Not provisioned";
export type ActivationStatus = "Completed" | "Pending" | "Not available";
export type CustomerSource = "Self-service commercial journey" | "Assisted provisioning" | "Legacy / Unknown";

export type PlatformCustomerSummary = {
  clientId: string;
  organisation: string;
  organisationStatus: string;
  createdAt: string | null;
  productKey: string | null;
  productName: string | null;
  plan: string | null;
  workspaceStatus: WorkspaceStatus;
  workspaceSlug: string | null;
  workspaceUrl: string | null;
  primaryAdministrator: string | null;
  primaryAdministratorEmail: string | null;
  projectCount: number;
  userCount: number;
  pendingInvitationCount: number;
  completionPercent: number | null;
  provisioningStatus: ProvisioningStatus;
  commercialStatus: CommercialStatus;
  activationStatus: ActivationStatus;
  activatedAt: string | null;
  source: CustomerSource;
};

function workspaceStatusFrom(settings: Row | undefined, client: Row): WorkspaceStatus {
  const settingsStatus = text(settings?.status).toLowerCase();
  if (settingsStatus === "active") return "Active";
  if (settingsStatus === "suspended") return "Suspended";
  if (settingsStatus === "archived") return "Archived";
  if (!settings) return "Not provisioned";
  return text(client.status) === "Active" ? "Active" : "Inactive";
}

function provisioningStatusFrom(job: Row | undefined): ProvisioningStatus {
  const status = text(job?.status).toLowerCase();
  if (status === "queued") return "Pending";
  if (status === "running") return "Running";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  return "Not available";
}

function commercialStatusFrom(draft: Row | undefined): CommercialStatus {
  if (!draft) return "Not available";
  const status = text(draft.status).toLowerCase();
  if (status === "completed" || status === "provisioned" || status === "paid") return "Paid";
  if (status === "awaiting_payment" || status === "payment_pending" || status === "checkout") return "Awaiting Payment";
  return "Draft";
}

function sourceFrom(job: Row | undefined, settings: Row | undefined): CustomerSource {
  if (job) return "Self-service commercial journey";
  if (settings) return "Assisted provisioning";
  return "Legacy / Unknown";
}

export type WorkspaceDestination = {
  hostname: string | null;
  href: string | null;
  external: boolean;
  reason: string | null;
};

// The customer workspace routes resolve their tenant from the signed-in session
// (resolveCustomerWorkspaceContext requires role "client" plus an active membership) and ignore any
// workspace query parameter. A platform admin therefore cannot be routed into /workspace/admin —
// that path redirects non-client roles to /onboarding. So the in-app link is only offered when the
// public workspace hostname is routable; otherwise Customer 360 stays the oversight surface.
export function resolveWorkspaceDestination(slug: string | null | undefined): WorkspaceDestination {
  const workspaceSlug = text(slug);
  if (!workspaceSlug) {
    return { hostname: null, href: null, external: false, reason: "Workspace has not been provisioned for this customer." };
  }
  const readiness = verifyWorkspaceDestination(workspaceSlug);
  if (readiness.redirectAllowed) {
    return { hostname: readiness.hostname, href: readiness.workspaceUrl, external: true, reason: null };
  }
  return {
    hostname: readiness.hostname,
    href: null,
    external: false,
    reason: "Workspace hostname routing is not enabled in this environment. Use the Customer 360 tabs for oversight, or sign in through the customer workspace directly.",
  };
}

function workspaceUrlFor(slug: string) {
  if (!slug) return null;
  return verifyWorkspaceDestination(slug).hostname;
}

function countBy(rows: Row[], key: string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = text(row[key]);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export type PlatformCustomerFilters = {
  search?: string | null;
  product?: string | null;
  plan?: string | null;
  workspaceStatus?: string | null;
  provisioningStatus?: string | null;
  activationStatus?: string | null;
};

// One parallel batch of column-scoped queries, then joined in memory.
// Deliberately avoids per-customer (N+1) lookups for projects, users and provisioning.
export async function listPlatformCustomers(filters: PlatformCustomerFilters = {}) {
  const startedAt = nowMs();
  const supabase = createAdminSupabase();

  const [
    { data: clients, error: clientsError },
    { data: profiles },
    { data: settings },
    { data: entitlements },
    { data: memberships },
    { data: projects },
    { data: jobs },
    { data: drafts },
    { data: alerts },
  ] = await Promise.all([
    supabase.from("clients").select("id,name,status,created_at").order("name", { ascending: true }),
    supabase.from("client_profiles").select("client_id,contact_person,email,phone"),
    supabase.from("workspace_settings").select("client_id,workspace_slug,workspace_display_name,product_key,product_name,commercial_model,commercial_reference,status,provisioned_at,enabled_modules,manifest_version"),
    supabase.from("product_entitlements").select("client_id,product_key,status,commercial_model,commercial_reference,acquisition_draft_id,activation_date,programme_quantity"),
    supabase.from("workspace_memberships").select("client_id,user_id,role_key,status"),
    supabase.from("projects").select("client_id,status,target_quantity").is("archived_at", null),
    supabase.from("provisioning_jobs").select("id,acquisition_draft_id,commercial_reference,workspace_slug,status,current_stage,progress_percent,attempt_count,started_at,completed_at,failed_at,failure_code,failure_message,updated_at").order("updated_at", { ascending: false }),
    supabase.from("onboarding_drafts").select("id,status,current_step,selected_product,email,completed_at,created_at"),
    supabase.from("notification_events").select("client_id"),
  ]);
  if (clientsError) throw clientsError;
  customerControlLog({ step: "Customer list lookups", elapsedMs: elapsedMs(startedAt) });

  const joinStartedAt = nowMs();
  const clientRows = (clients ?? []) as Row[];
  const profileByClient = new Map(((profiles ?? []) as Row[]).map((row) => [text(row.client_id), row]));
  const settingsByClient = new Map(((settings ?? []) as Row[]).map((row) => [text(row.client_id), row]));
  const entitlementByClient = new Map(((entitlements ?? []) as Row[]).map((row) => [text(row.client_id), row]));
  const draftById = new Map(((drafts ?? []) as Row[]).map((row) => [text(row.id), row]));

  const jobRows = (jobs ?? []) as Row[];
  const jobByDraft = new Map(jobRows.map((row) => [text(row.acquisition_draft_id), row]));
  const jobBySlug = new Map(jobRows.map((row) => [text(row.workspace_slug), row]));
  const jobByReference = new Map(jobRows.map((row) => [text(row.commercial_reference), row]));

  const membershipRows = (memberships ?? []) as Row[];
  const projectRows = (projects ?? []) as Row[];
  const projectCounts = countBy(projectRows, "client_id");
  const activeMemberCounts = countBy(membershipRows.filter((row) => text(row.status) === "active"), "client_id");
  const invitedCounts = countBy(membershipRows.filter((row) => text(row.status) === "invited"), "client_id");

  const adminUserIdByClient = new Map<string, string>();
  for (const row of membershipRows) {
    const roleKey = text(row.role_key);
    if (roleKey !== "customer_admin" && roleKey !== "workspace_owner") continue;
    const clientId = text(row.client_id);
    if (!adminUserIdByClient.has(clientId)) adminUserIdByClient.set(clientId, text(row.user_id));
  }

  const adminUserIds = [...new Set(adminUserIdByClient.values())].filter(Boolean);
  const { data: adminProfiles } = adminUserIds.length > 0
    ? await supabase.schema("public").from("user_profiles").select("user_id,full_name,email").in("user_id", adminUserIds)
    : { data: [] };
  const adminProfileById = new Map(((adminProfiles ?? []) as Row[]).map((row) => [text(row.user_id), row]));

  const customers: PlatformCustomerSummary[] = clientRows.map((client) => {
    const clientId = text(client.id);
    const workspace = settingsByClient.get(clientId);
    const entitlement = entitlementByClient.get(clientId);
    const draftId = text(entitlement?.acquisition_draft_id);
    const draft = draftId ? draftById.get(draftId) : undefined;
    const job = (draftId ? jobByDraft.get(draftId) : undefined)
      ?? jobBySlug.get(text(workspace?.workspace_slug))
      ?? jobByReference.get(text(workspace?.commercial_reference));
    const adminUserId = adminUserIdByClient.get(clientId) ?? "";
    const adminProfile = adminUserId ? adminProfileById.get(adminUserId) : undefined;
    const slug = text(workspace?.workspace_slug);
    const provisionedAt = text(workspace?.provisioned_at) || null;

    return {
      clientId,
      organisation: text(client.name),
      organisationStatus: text(client.status),
      createdAt: text(client.created_at) || null,
      productKey: text(workspace?.product_key) || text(entitlement?.product_key) || null,
      productName: text(workspace?.product_name) || null,
      plan: text(workspace?.commercial_model) || text(entitlement?.commercial_model) || null,
      workspaceStatus: workspaceStatusFrom(workspace, client),
      workspaceSlug: slug || null,
      workspaceUrl: workspaceUrlFor(slug),
      primaryAdministrator: text(adminProfile?.full_name) || null,
      primaryAdministratorEmail: text(adminProfile?.email) || null,
      projectCount: projectCounts.get(clientId) ?? 0,
      userCount: activeMemberCounts.get(clientId) ?? 0,
      pendingInvitationCount: invitedCounts.get(clientId) ?? 0,
      completionPercent: null,
      provisioningStatus: provisioningStatusFrom(job),
      commercialStatus: commercialStatusFrom(draft),
      activationStatus: provisionedAt ? "Completed" : workspace ? "Pending" : "Not available",
      activatedAt: provisionedAt ?? (text(entitlement?.activation_date) || null),
      source: sourceFrom(job, workspace),
    };
  });

  const filtered = filterPlatformCustomers(customers, filters);
  customerControlLog({ step: "Customer list join", elapsedMs: elapsedMs(joinStartedAt), totalElapsedMs: elapsedMs(startedAt), customers: customers.length });

  const customersWithAlerts = new Set(((alerts ?? []) as Row[]).map((row) => text(row.client_id)).filter(Boolean)).size;
  const activeProjects = projectRows.filter((row) => text(row.status) === "Active").length;
  const clientNameById = new Map(clientRows.map((row) => [text(row.id), text(row.name)]));
  const slugToClient = new Map(
    [...settingsByClient.entries()].map(([clientId, row]) => [text(row.workspace_slug), clientId]),
  );

  return {
    customers,
    filteredCustomers: filtered,
    facets: {
      products: [...new Set(customers.map((item) => item.productKey).filter(Boolean))].sort() as string[],
      plans: [...new Set(customers.map((item) => item.plan).filter(Boolean))].sort() as string[],
      workspaceStatuses: [...new Set(customers.map((item) => item.workspaceStatus))].sort(),
      provisioningStatuses: [...new Set(customers.map((item) => item.provisioningStatus))].sort(),
    },
    // Platform-wide governance health, not a customer deployment dashboard.
    kpis: [
      { label: "Total Customers", value: customers.length },
      { label: "Active Workspaces", value: customers.filter((item) => item.workspaceStatus === "Active").length },
      { label: "Provisioning Pending", value: customers.filter((item) => item.provisioningStatus === "Pending" || item.provisioningStatus === "Running").length },
      { label: "Provisioning Failed", value: customers.filter((item) => item.provisioningStatus === "Failed").length },
      { label: "Active Projects", value: activeProjects },
      { label: "Active Users", value: [...activeMemberCounts.values()].reduce((total, count) => total + count, 0) },
      { label: "Customers With Alerts", value: customersWithAlerts },
      { label: "Legacy / Unknown", value: customers.filter((item) => item.source === "Legacy / Unknown").length },
    ],
    recentProvisioning: jobRows.slice(0, 8).map((row) => {
      const jobClientId = slugToClient.get(text(row.workspace_slug)) ?? "";
      return {
        jobId: text(row.id),
        clientId: jobClientId || null,
        organisation: clientNameById.get(jobClientId) ?? text(row.workspace_slug) ?? UNAVAILABLE,
        product: text(settingsByClient.get(jobClientId)?.product_name) || text(settingsByClient.get(jobClientId)?.product_key) || UNAVAILABLE,
        status: text(row.status),
        stage: text(row.current_stage),
        updatedAt: text(row.updated_at) || null,
      };
    }),
  };
}

export function filterPlatformCustomers(customers: PlatformCustomerSummary[], filters: PlatformCustomerFilters) {
  const search = text(filters.search).toLowerCase();
  const product = text(filters.product);
  const plan = text(filters.plan);
  const workspaceStatus = text(filters.workspaceStatus);
  const provisioningStatus = text(filters.provisioningStatus);
  const activationStatus = text(filters.activationStatus);

  return customers.filter((customer) => {
    if (search) {
      const haystack = [
        customer.organisation,
        customer.clientId,
        customer.workspaceUrl,
        customer.workspaceSlug,
        customer.primaryAdministrator,
        customer.primaryAdministratorEmail,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (product && customer.productKey !== product) return false;
    if (plan && customer.plan !== plan) return false;
    if (workspaceStatus && customer.workspaceStatus !== workspaceStatus) return false;
    if (provisioningStatus && customer.provisioningStatus !== provisioningStatus) return false;
    if (activationStatus && customer.activationStatus !== activationStatus) return false;
    return true;
  });
}

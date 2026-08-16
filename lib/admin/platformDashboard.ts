import { listPlatformCustomers } from "@/lib/admin/customerControl";
import { createAdminSupabase } from "@/lib/supabaseAdmin";

// Platform-owner dashboard data. Every KPI is reused from the canonical Customer Management
// implementation; this module only adds the estate rollup, project summary and activity feed.
type Row = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

const ACTIVITY_LABELS: Record<string, string> = {
  user_created: "User created",
  user_invited: "User invited",
  invitation_accepted: "Invitation accepted",
  invitation_accepted_test_mode: "Invitation accepted (test mode)",
  invitation_link_generated: "Invitation link generated",
  invitation_cancelled: "Invitation cancelled",
  user_removed: "User removed",
  role_changed: "Role changed",
  assignments_changed: "Resource assignments changed",
  permissions_changed: "Permissions changed",
  support_session_started: "Support session started",
  support_session_ended: "Support session ended",
  support_session_expired: "Support session expired",
};

export type PlatformDashboard = Awaited<ReturnType<typeof getPlatformDashboard>>;

export async function getPlatformDashboard() {
  const supabase = createAdminSupabase();

  // The customer estate and every KPI come from the single canonical customer control query.
  const [platform, { data: projects }, { data: activity }] = await Promise.all([
    listPlatformCustomers(),
    supabase
      .from("projects")
      .select("id,name,client_id,status,target_quantity,created_at")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("audit_logs")
      .select("action_type,created_at,new_value")
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const customerById = new Map(platform.customers.map((customer) => [customer.clientId, customer]));
  const projectRows = (projects ?? []) as Row[];

  const estate = {
    total: platform.customers.length,
    provisioned: platform.customers.filter((customer) => Boolean(customer.workspaceSlug)).length,
    active: platform.customers.filter((customer) => customer.workspaceStatus === "Active").length,
    pendingActivation: platform.customers.filter((customer) => customer.activationStatus === "Pending").length,
    legacy: platform.customers.filter((customer) => customer.source === "Legacy / Unknown").length,
  };

  const provisioningAttention = platform.customers
    .filter((customer) => customer.provisioningStatus === "Failed" || customer.provisioningStatus === "Pending" || customer.provisioningStatus === "Running")
    .map((customer) => ({
      clientId: customer.clientId,
      organisation: customer.organisation,
      product: customer.productName ?? customer.productKey,
      status: customer.provisioningStatus,
    }));

  const projectSummary = {
    active: projectRows.filter((row) => text(row.status) === "Active").length,
    planning: projectRows.filter((row) => text(row.status) === "Planning").length,
    onHold: projectRows.filter((row) => text(row.status) === "On Hold").length,
    completed: projectRows.filter((row) => text(row.status) === "Completed").length,
  };

  const activeProjects = projectRows
    .filter((row) => text(row.status) === "Active")
    .slice(0, 8)
    .map((row) => {
      const clientId = text(row.client_id);
      return {
        id: text(row.id),
        projectName: text(row.name),
        clientId,
        organisation: customerById.get(clientId)?.organisation ?? "Unknown customer",
        status: text(row.status),
        targetQuantity: Number(row.target_quantity ?? 0),
        updatedAt: text(row.created_at) || null,
      };
    });

  const users = {
    active: platform.customers.reduce((total, customer) => total + customer.userCount, 0),
    pendingInvitations: platform.customers.reduce((total, customer) => total + customer.pendingInvitationCount, 0),
  };

  // Only audit rows that can be attributed to a customer are shown, so the feed stays truthful.
  const platformActivity = ((activity ?? []) as Row[])
    .map((row) => {
      const clientId = text((row.new_value as Row | null)?.clientId);
      return {
        actionType: text(row.action_type),
        label: ACTIVITY_LABELS[text(row.action_type)] ?? text(row.action_type).replace(/_/g, " "),
        clientId: clientId || null,
        organisation: clientId ? customerById.get(clientId)?.organisation ?? null : null,
        createdAt: text(row.created_at) || null,
      };
    })
    .slice(0, 10);

  return {
    kpis: platform.kpis,
    estate,
    provisioningAttention,
    recentProvisioning: platform.recentProvisioning,
    projectSummary,
    activeProjects,
    users,
    customersWithAlerts: platform.kpis.find((kpi) => kpi.label === "Customers With Alerts")?.value ?? 0,
    platformActivity,
  };
}

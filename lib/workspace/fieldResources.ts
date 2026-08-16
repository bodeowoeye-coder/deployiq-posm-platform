import { notificationsEnabled } from "@/lib/notifications";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import {
  resolveCustomerWorkspaceContext,
  type CustomerWorkspaceContext,
} from "@/lib/workspace/customerAdmin";

export const AGENCY_STATUSES = ["Active", "Suspended", "Archived", "Inactive"] as const;
export const INSTALLER_STATUSES = ["available", "busy", "on_leave", "inactive", "archived"] as const;

export type AgencyStatus = (typeof AGENCY_STATUSES)[number];
export type InstallerStatus = (typeof INSTALLER_STATUSES)[number];

export type AgencyFilters = {
  search?: string | null;
  status?: string | null;
  state?: string | null;
  sort?: string | null;
};

export type InstallerFilters = {
  projectId?: string | null;
  search?: string | null;
  agency?: string | null;
  status?: string | null;
  state?: string | null;
  sort?: string | null;
  page?: number | null;
};

export type FieldAssignmentInput = {
  campaignId?: string | null;
  campaignLocationIds?: string[] | null;
  deploymentLocationIds?: string[] | null;
  agencyId?: string | null;
  installerId?: string | null;
  assignmentType?: "agency" | "installer" | "supervisor" | "coordinator" | "team" | null;
  targetQuantity?: number | string | null;
  notes?: string | null;
};

export type AgencyInput = {
  id?: string | null;
  agencyName?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  officeAddress?: string | null;
  statesCovered?: string[] | string | null;
  regionsCovered?: string[] | string | null;
  citiesCovered?: string[] | string | null;
  status?: string | null;
  notes?: string | null;
};

export type InstallerInput = {
  id?: string | null;
  installerName?: string | null;
  phone?: string | null;
  email?: string | null;
  agencyId?: string | null;
  state?: string | null;
  region?: string | null;
  city?: string | null;
  skills?: string[] | string | null;
  vehicle?: string | null;
  team?: string | null;
  notes?: string | null;
  status?: string | null;
  profilePhotoUrl?: string | null;
};

type Row = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function textArray(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
  const raw = text(value);
  return raw ? raw.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function elapsedMs(startedAt: number) {
  return Math.round((nowMs() - startedAt) * 10) / 10;
}

export function fieldResourcePerformanceLog(input: { route: string; step: string; elapsedMs: number; totalElapsedMs?: number | null }) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[field-resource-performance]", {
    route: input.route,
    step: input.step,
    elapsedMs: input.elapsedMs,
    totalElapsedMs: input.totalElapsedMs ?? input.elapsedMs,
  });
}

async function workspace() {
  return await resolveCustomerWorkspaceContext();
}

function diagnosticFor(error: unknown) {
  if (!error || typeof error !== "object") return { message: String(error) };
  const record = error as Record<string, unknown>;
  return {
    message: error instanceof Error ? error.message : text(record.message) || "Unknown error",
    code: text(record.code) || undefined,
    details: text(record.details) || undefined,
  };
}

function agencyStatus(value: unknown): AgencyStatus {
  const raw = text(value);
  return AGENCY_STATUSES.includes(raw as AgencyStatus) ? raw as AgencyStatus : "Active";
}

function installerStatus(value: unknown): InstallerStatus {
  const raw = text(value).toLowerCase().replace(/\s+/g, "_");
  return INSTALLER_STATUSES.includes(raw as InstallerStatus) ? raw as InstallerStatus : "available";
}

function normalizeAgency(row: Row, metrics: { assignedCampaigns?: number; assignedInstallers?: number } = {}) {
  return {
    id: text(row.id),
    clientId: text(row.client_id),
    workspaceId: text(row.workspace_id),
    agencyName: text(row.agency_name),
    contactPerson: text(row.contact_person) || null,
    phone: text(row.phone) || null,
    email: text(row.email) || null,
    officeAddress: text(row.office_address) || null,
    statesCovered: textArray(row.states_covered),
    regionsCovered: textArray(row.regions_covered ?? row.assigned_regions),
    citiesCovered: textArray(row.cities_covered),
    status: agencyStatus(row.status),
    notes: text(row.notes) || null,
    assignedCampaigns: metrics.assignedCampaigns ?? 0,
    assignedInstallers: metrics.assignedInstallers ?? 0,
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

type InstallerMembershipStatus = "active" | "invited" | "inactive" | "none";

// User Management is the authoritative source of installer identity: an installer is only
// operationally assignable once its invitation has been accepted (membership is active).
function installerEligibility(userId: string | null, storedStatus: string, membershipStatus?: InstallerMembershipStatus) {
  if (!userId) {
    return { assignable: false, reason: "Legacy record created outside User Management. Re-invite this installer from User Management to make them assignable." };
  }
  if (membershipStatus === "invited") {
    return { assignable: false, reason: "Invitation pending. This installer becomes assignable once the invitation is accepted." };
  }
  if (membershipStatus !== "active") {
    return { assignable: false, reason: "No active workspace membership in this tenant." };
  }
  if (storedStatus === "archived" || storedStatus === "inactive") {
    return { assignable: false, reason: `Installer is ${storedStatus}.` };
  }
  return { assignable: true, reason: "Active workspace member." };
}

async function installerMembershipStatuses(clientId: string, userIds: string[]) {
  const statuses = new Map<string, InstallerMembershipStatus>();
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueUserIds.length === 0) return statuses;
  const { data, error } = await createAdminSupabase()
    .from("workspace_memberships")
    .select("user_id,status")
    .eq("client_id", clientId)
    .in("user_id", uniqueUserIds);
  if (error) {
    console.warn("[field-resource-performance]", { step: "Installer membership lookup failed", diagnostic: diagnosticFor(error) });
    return statuses;
  }
  for (const row of (data ?? []) as Row[]) {
    const status = text(row.status);
    statuses.set(text(row.user_id), status === "active" || status === "invited" || status === "inactive" ? status : "none");
  }
  return statuses;
}

function normalizeInstaller(row: Row, metrics: { campaigns?: number; assignedProjects?: string[]; assignedLocations?: number; completed?: number; remaining?: number; approvalPercent?: number; gpsPercent?: number; averageCompletionHours?: number } = {}, membershipStatus?: InstallerMembershipStatus) {
  const activeWork = (metrics.assignedLocations ?? 0) - (metrics.completed ?? 0);
  const storedStatus = installerStatus(row.availability_status ?? row.access_status ?? row.status);
  const status = storedStatus === "available" && activeWork > 0 ? "busy" : storedStatus;
  const eligibility = installerEligibility(text(row.user_id) || null, storedStatus, membershipStatus);
  return {
    id: text(row.id),
    clientId: text(row.client_id),
    workspaceId: text(row.workspace_id),
    userId: text(row.user_id) || null,
    installerName: text(row.installer_name),
    phone: text(row.phone) || null,
    email: text(row.email) || null,
    agencyId: text(row.agency_id) || null,
    agencyName: text((row.agencies as Row | undefined)?.agency_name) || null,
    state: text(row.state) || textArray(row.assigned_states)[0] || null,
    region: text(row.region) || textArray(row.assigned_regions)[0] || null,
    city: text(row.city) || null,
    skills: textArray(row.skills),
    vehicle: text(row.vehicle) || null,
    team: text(row.team) || null,
    notes: text(row.notes) || null,
    profilePhotoUrl: text(row.profile_photo_url) || null,
    status,
    membershipStatus: membershipStatus ?? "none",
    assignable: eligibility.assignable,
    eligibilityReason: eligibility.reason,
    origin: text(row.user_id) ? "user_management" : "legacy_direct_record",
    campaigns: metrics.campaigns ?? 0,
    assignedProjects: metrics.assignedProjects ?? [],
    assignedLocations: metrics.assignedLocations ?? 0,
    completed: metrics.completed ?? 0,
    remaining: Math.max(0, metrics.remaining ?? activeWork),
    approvalPercent: metrics.approvalPercent ?? 0,
    gpsPercent: metrics.gpsPercent ?? 0,
    averageCompletionHours: metrics.averageCompletionHours ?? 0,
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

type AgencyRecord = ReturnType<typeof normalizeAgency>;
type InstallerRecord = ReturnType<typeof normalizeInstaller>;

function filterAgencies(rows: AgencyRecord[], filters: AgencyFilters) {
  const search = text(filters.search).toLowerCase();
  const status = text(filters.status).toLowerCase();
  const state = text(filters.state).toLowerCase();
  return rows.filter((row) => {
    const haystack = [row.agencyName, row.phone, row.email, row.statesCovered.join(" "), row.regionsCovered.join(" ")].join(" ").toLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (status && row.status.toLowerCase() !== status) return false;
    if (state && !row.statesCovered.some((item) => item.toLowerCase() === state)) return false;
    return true;
  });
}

function filterInstallers(rows: InstallerRecord[], filters: InstallerFilters) {
  const search = text(filters.search).toLowerCase();
  const status = text(filters.status).toLowerCase();
  const state = text(filters.state).toLowerCase();
  const agency = text(filters.agency);
  return rows.filter((row) => {
    const haystack = [row.installerName, row.agencyName, row.phone, row.email, row.state].join(" ").toLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (status && row.status.toLowerCase() !== status) return false;
    if (state && text(row.state).toLowerCase() !== state) return false;
    if (agency && row.agencyId !== agency) return false;
    return true;
  });
}

async function notifyFieldResourceEvent(input: { clientId: string; projectId?: string | null; title: string; message: string; status: string }) {
  if (!notificationsEnabled()) return;
  await createAdminSupabase().from("notification_events").insert({
    client_id: input.clientId,
    project_id: input.projectId || null,
    title: input.title,
    message: input.message,
    status: input.status,
  });
}

async function assignmentMetrics(workspaceContext: CustomerWorkspaceContext, projectId?: string | null) {
  let query = createAdminSupabase()
    .from("workspace_field_assignments")
    .select("campaign_id,project_id,agency_id,installer_id,deployment_location_id,assignment_status")
    .eq("client_id", workspaceContext.clientId)
    .eq("workspace_id", workspaceContext.clientId)
    .is("removed_at", null);
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query.limit(5000);
  if (error) {
    console.warn("[field-resource-performance]", { step: "Optional assignment metrics skipped", diagnostic: diagnosticFor(error) });
    return { agencyCampaigns: new Map<string, Set<string>>(), installerCampaigns: new Map<string, Set<string>>(), installerProjects: new Map<string, Set<string>>(), installerLocations: new Map<string, Set<string>>(), installerCompleted: new Map<string, number>() };
  }
  const agencyCampaigns = new Map<string, Set<string>>();
  const installerCampaigns = new Map<string, Set<string>>();
  const installerProjects = new Map<string, Set<string>>();
  const installerLocations = new Map<string, Set<string>>();
  const installerCompleted = new Map<string, number>();
  for (const row of (data ?? []) as Row[]) {
    const agencyId = text(row.agency_id);
    const installerId = text(row.installer_id);
    const campaignId = text(row.campaign_id);
    const projectId = text(row.project_id);
    const locationId = text(row.deployment_location_id);
    if (agencyId) {
      if (!agencyCampaigns.has(agencyId)) agencyCampaigns.set(agencyId, new Set());
      agencyCampaigns.get(agencyId)?.add(campaignId);
    }
    if (installerId) {
      if (!installerCampaigns.has(installerId)) installerCampaigns.set(installerId, new Set());
      if (!installerProjects.has(installerId)) installerProjects.set(installerId, new Set());
      if (!installerLocations.has(installerId)) installerLocations.set(installerId, new Set());
      installerCampaigns.get(installerId)?.add(campaignId);
      if (projectId) installerProjects.get(installerId)?.add(projectId);
      if (locationId) installerLocations.get(installerId)?.add(locationId);
      if (text(row.assignment_status) === "completed") installerCompleted.set(installerId, (installerCompleted.get(installerId) ?? 0) + 1);
    }
  }
  return { agencyCampaigns, installerCampaigns, installerProjects, installerLocations, installerCompleted };
}

export async function getAgencyDashboard(filters: AgencyFilters = {}) {
  const totalStartedAt = nowMs();
  const resolvedWorkspace = await workspace();
  fieldResourcePerformanceLog({ route: "/workspace/admin/agencies", step: "Context", elapsedMs: elapsedMs(totalStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  const supabase = createAdminSupabase();
  const lookupStartedAt = nowMs();
  const [{ data, error }, { data: installers }, metrics] = await Promise.all([
    supabase.from("agencies").select("*").eq("client_id", resolvedWorkspace.clientId).eq("workspace_id", resolvedWorkspace.clientId).order("agency_name", { ascending: true }),
    supabase.from("installers").select("id,agency_id").eq("client_id", resolvedWorkspace.clientId).eq("workspace_id", resolvedWorkspace.clientId),
    assignmentMetrics(resolvedWorkspace),
  ]);
  fieldResourcePerformanceLog({ route: "/workspace/admin/agencies", step: "Agency lookup", elapsedMs: elapsedMs(lookupStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  if (error) throw error;
  const installerCounts = new Map<string, number>();
  for (const row of (installers ?? []) as Row[]) {
    const agencyId = text(row.agency_id);
    if (agencyId) installerCounts.set(agencyId, (installerCounts.get(agencyId) ?? 0) + 1);
  }
  const agencies = ((data ?? []) as Row[]).map((row) => normalizeAgency(row, {
    assignedCampaigns: metrics.agencyCampaigns.get(text(row.id))?.size ?? 0,
    assignedInstallers: installerCounts.get(text(row.id)) ?? 0,
  }));
  const filteredAgencies = filterAgencies(agencies, filters).sort((a, b) => {
    if (text(filters.sort) === "status") return a.status.localeCompare(b.status) || a.agencyName.localeCompare(b.agencyName);
    return a.agencyName.localeCompare(b.agencyName);
  });
  return {
    workspace: resolvedWorkspace,
    agencies,
    filteredAgencies,
    kpis: [
      { label: "Total Agencies", value: agencies.length },
      { label: "Active", value: agencies.filter((item) => item.status === "Active").length },
      { label: "Suspended", value: agencies.filter((item) => item.status === "Suspended").length },
      { label: "Archived", value: agencies.filter((item) => item.status === "Archived").length },
      { label: "Assigned Campaigns", value: Array.from(metrics.agencyCampaigns.values()).reduce((total, set) => total + set.size, 0) },
      { label: "Assigned Installers", value: installers?.length ?? 0 },
    ],
    filters: {
      search: text(filters.search),
      status: text(filters.status),
      state: text(filters.state),
      sort: text(filters.sort) || "name",
    },
  };
}

export async function getInstallerDashboard(filters: InstallerFilters = {}) {
  const totalStartedAt = nowMs();
  const resolvedWorkspace = await workspace();
  fieldResourcePerformanceLog({ route: "/workspace/admin/installers", step: "Context", elapsedMs: elapsedMs(totalStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  const supabase = createAdminSupabase();
  const lookupStartedAt = nowMs();
  const [{ data, error }, agencyResult, metrics] = await Promise.all([
    supabase.from("installers").select("*,agencies(id,agency_name)").eq("client_id", resolvedWorkspace.clientId).eq("workspace_id", resolvedWorkspace.clientId).order("installer_name", { ascending: true }),
    supabase.from("agencies").select("id,agency_name,status").eq("client_id", resolvedWorkspace.clientId).eq("workspace_id", resolvedWorkspace.clientId).neq("status", "Archived").order("agency_name", { ascending: true }),
    assignmentMetrics(resolvedWorkspace, filters.projectId),
  ]);
  fieldResourcePerformanceLog({ route: "/workspace/admin/installers", step: "Installer lookup", elapsedMs: elapsedMs(lookupStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  if (error) throw error;
  if (agencyResult.error) console.warn("[field-resource-performance]", { step: "Optional agency filter lookup skipped", diagnostic: diagnosticFor(agencyResult.error) });
  const projectIds = [...new Set(Array.from(metrics.installerProjects.values()).flatMap((projectSet) => [...projectSet]))];
  const projectNameById = new Map<string, string>();
  if (projectIds.length > 0) {
    const { data: projects, error: projectsError } = await supabase
      .from("projects")
      .select("id,name,campaign")
      .eq("client_id", resolvedWorkspace.clientId)
      .in("id", projectIds);
    if (projectsError) console.warn("[field-resource-performance]", { step: "Optional installer project names skipped", diagnostic: diagnosticFor(projectsError) });
    for (const row of (projects ?? []) as Row[]) {
      const projectId = text(row.id);
      if (projectId) projectNameById.set(projectId, text(row.name) || text(row.campaign) || projectId);
    }
  }
  const installerRows = (data ?? []) as Row[];
  const membershipStatuses = await installerMembershipStatuses(resolvedWorkspace.clientId, installerRows.map((row) => text(row.user_id)));
  const installers = installerRows.map((row) => {
    const installerId = text(row.id);
    const assigned = metrics.installerLocations.get(installerId)?.size ?? 0;
    const completed = metrics.installerCompleted.get(installerId) ?? 0;
    const assignedProjects = [...(metrics.installerProjects.get(installerId) ?? new Set<string>())].map((projectId) => projectNameById.get(projectId) ?? projectId);
    return normalizeInstaller(row, {
      campaigns: metrics.installerCampaigns.get(installerId)?.size ?? 0,
      assignedProjects,
      assignedLocations: assigned,
      completed,
      remaining: Math.max(0, assigned - completed),
    }, membershipStatuses.get(text(row.user_id)) ?? "none");
  });
  const sorted = filterInstallers(installers, filters).sort((a, b) => {
    const sort = text(filters.sort);
    if (sort === "status") return a.status.localeCompare(b.status) || a.installerName.localeCompare(b.installerName);
    if (sort === "state") return text(a.state).localeCompare(text(b.state)) || a.installerName.localeCompare(b.installerName);
    return a.installerName.localeCompare(b.installerName);
  });
  const pageSize = 25;
  const page = Math.max(1, numberValue(filters.page, 1));
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  return {
    workspace: resolvedWorkspace,
    installers,
    filteredInstallers: sorted.slice((page - 1) * pageSize, page * pageSize),
    agencies: (agencyResult.data ?? []).map((row) => ({ id: text((row as Row).id), agencyName: text((row as Row).agency_name), status: text((row as Row).status) })),
    pagination: { page, pageSize, total: sorted.length, pages },
    kpis: [
      { label: "Total Installers", value: installers.length },
      { label: "Assignable", value: installers.filter((item) => item.assignable).length },
      { label: "Invitation Pending", value: installers.filter((item) => item.membershipStatus === "invited").length },
      { label: "Available", value: installers.filter((item) => item.status === "available").length },
      { label: "Busy", value: installers.filter((item) => item.status === "busy").length },
      { label: "Inactive", value: installers.filter((item) => item.status === "inactive").length },
      { label: "Archived", value: installers.filter((item) => item.status === "archived").length },
      { label: "Current Assignments", value: installers.reduce((total, item) => total + item.assignedLocations, 0) },
    ],
    filters: {
      search: text(filters.search),
      agency: text(filters.agency),
      status: text(filters.status),
      state: text(filters.state),
      sort: text(filters.sort) || "name",
    },
  };
}

export type AssignableInstaller = {
  id: string;
  installerName: string;
  status: string;
  agencyId: string | null;
  agencyName: string | null;
  retainedAssignment: boolean;
};

// Create/Edit Project must only offer active, tenant-scoped installers. Installer ids already
// persisted on a project are retained so editing a project never silently drops an assignment.
export async function getAssignableInstallers(retainInstallerIds: Array<string | null | undefined> = []): Promise<AssignableInstaller[]> {
  const resolvedWorkspace = await workspace();
  const retained = new Set(retainInstallerIds.map((value) => text(value)).filter(Boolean));
  const { data, error } = await createAdminSupabase()
    .from("installers")
    .select("id,installer_name,user_id,availability_status,access_status,status,agency_id,agencies(id,agency_name)")
    .eq("client_id", resolvedWorkspace.clientId)
    .eq("workspace_id", resolvedWorkspace.clientId)
    .order("installer_name", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  const membershipStatuses = await installerMembershipStatuses(resolvedWorkspace.clientId, rows.map((row) => text(row.user_id)));
  return rows
    .map((row) => {
      const storedStatus = installerStatus(row.availability_status ?? row.access_status ?? row.status);
      const eligibility = installerEligibility(text(row.user_id) || null, storedStatus, membershipStatuses.get(text(row.user_id)) ?? "none");
      return {
        id: text(row.id),
        installerName: text(row.installer_name),
        status: storedStatus,
        agencyId: text(row.agency_id) || null,
        agencyName: text((row.agencies as Row | undefined)?.agency_name) || null,
        assignable: eligibility.assignable,
        retainedAssignment: !eligibility.assignable && retained.has(text(row.id)),
      };
    })
    .filter((installer) => installer.assignable || installer.retainedAssignment)
    .map(({ assignable: _assignable, ...installer }) => installer);
}

// Single source of truth for "may this installer be assigned in this tenant right now".
export async function assertInstallerAssignable(clientId: string, installerId: string) {
  const { data, error } = await createAdminSupabase()
    .from("installers")
    .select("id,user_id,availability_status,access_status,status")
    .eq("id", installerId)
    .eq("client_id", clientId)
    .eq("workspace_id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Select an eligible installer from this workspace."), { status: 400 });
  const membershipStatuses = await installerMembershipStatuses(clientId, [text(data.user_id)]);
  const eligibility = installerEligibility(
    text(data.user_id) || null,
    installerStatus(data.availability_status ?? data.access_status ?? data.status),
    membershipStatuses.get(text(data.user_id)) ?? "none",
  );
  if (!eligibility.assignable) throw Object.assign(new Error(eligibility.reason), { status: 409 });
}

async function validateAgency(agencyId: string, workspaceContext: CustomerWorkspaceContext) {
  if (!agencyId) return null;
  const { data, error } = await createAdminSupabase()
    .from("agencies")
    .select("id,agency_name")
    .eq("id", agencyId)
    .eq("client_id", workspaceContext.clientId)
    .eq("workspace_id", workspaceContext.clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Select an agency from this workspace."), { status: 400 });
  return data as Row;
}

export async function createAgency(input: AgencyInput) {
  const totalStartedAt = nowMs();
  const resolvedWorkspace = await workspace();
  const agencyName = text(input.agencyName);
  if (!agencyName) throw Object.assign(new Error("Agency name is required."), { status: 400 });
  const payload = {
    client_id: resolvedWorkspace.clientId,
    workspace_id: resolvedWorkspace.clientId,
    agency_name: agencyName,
    contact_person: text(input.contactPerson) || null,
    phone: text(input.phone) || null,
    email: text(input.email) || null,
    office_address: text(input.officeAddress) || null,
    states_covered: textArray(input.statesCovered),
    regions_covered: textArray(input.regionsCovered),
    cities_covered: textArray(input.citiesCovered),
    status: agencyStatus(input.status),
    notes: text(input.notes) || null,
  };
  const startedAt = nowMs();
  const { data, error } = await createAdminSupabase().from("agencies").insert(payload).select("*").single();
  fieldResourcePerformanceLog({ route: "/api/workspace/agencies", step: "Persistence", elapsedMs: elapsedMs(startedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  if (error) throw error;
  void notifyFieldResourceEvent({
    clientId: resolvedWorkspace.clientId,
    title: "Agency Created",
    message: `${agencyName} has been added to your workspace.`,
    status: "agency_created",
  }).catch((error) => console.warn("[field-resource-performance]", { step: "Audit scheduling", result: "failed", error: error instanceof Error ? error.message : "Unknown error" }));
  return { agency: normalizeAgency(data as Row) };
}

export async function updateAgency(input: AgencyInput & { action?: string | null }) {
  const resolvedWorkspace = await workspace();
  const id = text(input.id);
  if (!id) throw Object.assign(new Error("Agency is required."), { status: 400 });
  const action = text(input.action);
  const updates: Row = { updated_at: new Date().toISOString() };
  if (action === "archive") {
    updates.status = "Archived";
    updates.archived_at = new Date().toISOString();
  } else if (action === "suspend") {
    updates.status = "Suspended";
    updates.suspended_at = new Date().toISOString();
  } else if (action === "restore") {
    updates.status = "Active";
    updates.archived_at = null;
    updates.suspended_at = null;
  } else {
    updates.agency_name = text(input.agencyName) || undefined;
    updates.contact_person = text(input.contactPerson) || null;
    updates.phone = text(input.phone) || null;
    updates.email = text(input.email) || null;
    updates.office_address = text(input.officeAddress) || null;
    updates.states_covered = textArray(input.statesCovered);
    updates.regions_covered = textArray(input.regionsCovered);
    updates.cities_covered = textArray(input.citiesCovered);
    updates.status = agencyStatus(input.status);
    updates.notes = text(input.notes) || null;
  }
  const { data, error } = await createAdminSupabase()
    .from("agencies")
    .update(updates)
    .eq("id", id)
    .eq("client_id", resolvedWorkspace.clientId)
    .select("*")
    .single();
  if (error) throw error;
  return { agency: normalizeAgency(data as Row) };
}

export const INSTALLER_CREATION_MOVED_MESSAGE = "Installers are created in Account Settings → User Management. Invite the installer there; they become assignable once the invitation is accepted.";

function rejectDirectInstallerCreation(): never {
  throw Object.assign(new Error(INSTALLER_CREATION_MOVED_MESSAGE), { status: 405 });
}

export async function createInstaller(_input: InstallerInput) {
  rejectDirectInstallerCreation();
}

export async function provisionInstallerForWorkspaceMember(input: {
  clientId: string;
  userId: string;
  installerName: string;
  email: string;
  phone?: string | null;
}) {
  const supabase = createAdminSupabase();
  const { data: existing, error: lookupError } = await supabase
    .from("installers")
    .select("id")
    .eq("client_id", input.clientId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  const payload = {
    client_id: input.clientId,
    workspace_id: input.clientId,
    user_id: input.userId,
    installer_name: text(input.installerName),
    email: text(input.email) || null,
    phone: text(input.phone) || null,
    availability_status: "available",
    access_status: "Active",
    status: "Active",
  };
  const { error } = existing?.id
    ? await supabase.from("installers").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", existing.id)
    : await supabase.from("installers").insert(payload);
  if (error) throw error;
}

export async function updateInstaller(input: InstallerInput & { action?: string | null }) {
  const resolvedWorkspace = await workspace();
  const id = text(input.id);
  if (!id) throw Object.assign(new Error("Installer is required."), { status: 400 });
  const action = text(input.action);
  const status = action === "archive" ? "archived" : action === "deactivate" ? "inactive" : action === "restore" ? "available" : installerStatus(input.status);
  const agencyId = text(input.agencyId);
  await validateAgency(agencyId, resolvedWorkspace);
  const updates: Row = { updated_at: new Date().toISOString() };
  if (action) {
    updates.availability_status = status;
    updates.access_status = status === "inactive" || status === "archived" ? "Inactive" : "Active";
    updates.status = status === "archived" || status === "inactive" ? "Inactive" : "Active";
    updates.archived_at = status === "archived" ? new Date().toISOString() : null;
    updates.deactivated_at = status === "inactive" ? new Date().toISOString() : null;
  } else {
    updates.installer_name = text(input.installerName) || undefined;
    updates.phone = text(input.phone) || undefined;
    updates.email = text(input.email) || null;
    updates.agency_id = agencyId || null;
    updates.state = text(input.state) || null;
    updates.region = text(input.region) || null;
    updates.city = text(input.city) || null;
    updates.assigned_states = text(input.state) ? [text(input.state)] : [];
    updates.assigned_regions = text(input.region) ? [text(input.region)] : [];
    updates.skills = textArray(input.skills);
    updates.vehicle = text(input.vehicle) || null;
    updates.team = text(input.team) || null;
    updates.notes = text(input.notes) || null;
    updates.profile_photo_url = text(input.profilePhotoUrl) || null;
    updates.availability_status = status;
  }
  const { data, error } = await createAdminSupabase()
    .from("installers")
    .update(updates)
    .eq("id", id)
    .eq("client_id", resolvedWorkspace.clientId)
    .eq("workspace_id", resolvedWorkspace.clientId)
    .select("*,agencies(id,agency_name)")
    .single();
  if (error) throw error;
  return { installer: normalizeInstaller(data as Row) };
}

export async function getInstallerProfile(installerId: string) {
  const totalStartedAt = nowMs();
  const resolvedWorkspace = await workspace();
  const supabase = createAdminSupabase();
  const [{ data, error }, { data: assignments }] = await Promise.all([
    supabase.from("installers").select("*,agencies(id,agency_name)").eq("id", installerId).eq("client_id", resolvedWorkspace.clientId).eq("workspace_id", resolvedWorkspace.clientId).maybeSingle(),
    supabase.from("workspace_field_assignments").select("id,campaign_id,project_id,deployment_location_id,assignment_status,assigned_at").eq("installer_id", installerId).eq("client_id", resolvedWorkspace.clientId).eq("workspace_id", resolvedWorkspace.clientId).is("removed_at", null).limit(100),
  ]);
  fieldResourcePerformanceLog({ route: "/workspace/admin/installers/[id]", step: "Installer lookup", elapsedMs: elapsedMs(totalStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  if (error) throw error;
  if (!data) return null;
  const installerName = text((data as Row).installer_name);
  const [{ data: canonicalSubmissions }, { data: legacySubmissions }] = await Promise.all([
    supabase
      .from("submissions")
      .select("id,status,gps_verified,gps_status,gps_latitude,gps_longitude,submitted_at,approved_at,installer_id,installer_name")
      .eq("client_id", resolvedWorkspace.clientId)
      .eq("installer_id", installerId)
      .limit(500),
    installerName
      ? supabase
          .from("submissions")
          .select("id,status,gps_verified,gps_status,gps_latitude,gps_longitude,submitted_at,approved_at,installer_id,installer_name")
          .eq("client_id", resolvedWorkspace.clientId)
          .is("installer_id", null)
          .eq("installer_name", installerName)
          .limit(500)
      : Promise.resolve({ data: [] }),
  ]);
  const seenSubmissionIds = new Set<string>();
  const submissions = ([...(canonicalSubmissions ?? []), ...(legacySubmissions ?? [])] as Row[]).filter((row) => {
    const id = text(row.id);
    if (!id || seenSubmissionIds.has(id)) return false;
    seenSubmissionIds.add(id);
    return true;
  });
  const completed = ((assignments ?? []) as Row[]).filter((row) => text(row.assignment_status) === "completed").length;
  const projectIds = [...new Set(((assignments ?? []) as Row[]).map((row) => text(row.project_id)).filter(Boolean))];
  const projectNameById = new Map<string, string>();
  if (projectIds.length > 0) {
    const { data: projects, error: projectsError } = await supabase
      .from("projects")
      .select("id,name,campaign")
      .eq("client_id", resolvedWorkspace.clientId)
      .in("id", projectIds);
    if (projectsError) console.warn("[field-resource-performance]", { step: "Optional installer profile project names skipped", diagnostic: diagnosticFor(projectsError) });
    for (const row of (projects ?? []) as Row[]) {
      const projectId = text(row.id);
      if (projectId) projectNameById.set(projectId, text(row.name) || text(row.campaign) || projectId);
    }
  }
  const approved = submissions.filter((row) => text(row.status).toLowerCase() === "approved").length;
  const rejected = submissions.filter((row) => ["rejected", "correction requested"].includes(text(row.status).toLowerCase())).length;
  const gps = submissions.filter((row) => row.gps_verified === true || text(row.gps_status) === "Verified" || (row.gps_latitude && row.gps_longitude)).length;
  const totalSubmissions = submissions.length;
  return {
    workspace: resolvedWorkspace,
    installer: normalizeInstaller(data as Row, {
      campaigns: new Set(((assignments ?? []) as Row[]).map((row) => text(row.campaign_id))).size,
      assignedLocations: (assignments ?? []).length,
      completed,
      remaining: Math.max(0, (assignments ?? []).length - completed),
      approvalPercent: totalSubmissions ? Math.round((approved / totalSubmissions) * 100) : 0,
      gpsPercent: totalSubmissions ? Math.round((gps / totalSubmissions) * 100) : 0,
      assignedProjects: projectIds.map((projectId) => projectNameById.get(projectId) ?? projectId),
    }),
    assignments: (assignments ?? []) as Row[],
    performance: {
      totalSubmissions,
      approved,
      pending: Math.max(0, totalSubmissions - approved - rejected),
      rejected,
      approvalPercent: totalSubmissions ? Math.round((approved / totalSubmissions) * 100) : 0,
      gpsPercent: totalSubmissions ? Math.round((gps / totalSubmissions) * 100) : 0,
      averageCompletionHours: 0,
    },
  };
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/^"|"$/g, "").trim());
}

export function installerCsvTemplate() {
  return "installer_name,phone,email,agency,state,region,city,skills,vehicle,team,notes\n";
}

export function previewInstallerImport(csv: string, existing: Array<{ phone: string | null; email: string | null; installerName: string }>) {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) return { rows: [], valid: 0, errors: 1, duplicates: 0, errorReport: "Add at least one installer row." };
  const headers = parseCsvLine(lines[0]).map((item) => item.toLowerCase().replace(/\s+/g, "_"));
  const required = ["installer_name", "phone"];
  const missing = required.filter((key) => !headers.includes(key));
  if (missing.length > 0) return { rows: [], valid: 0, errors: missing.length, duplicates: 0, errorReport: `Missing columns: ${missing.join(", ")}` };
  const existingPhones = new Set(existing.map((item) => text(item.phone).toLowerCase()).filter(Boolean));
  const existingEmails = new Set(existing.map((item) => text(item.email).toLowerCase()).filter(Boolean));
  const seenPhones = new Set<string>();
  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const record = Object.fromEntries(headers.map((header, cellIndex) => [header, values[cellIndex] ?? ""]));
    const phone = text(record.phone);
    const email = text(record.email).toLowerCase();
    const errors: string[] = [];
    const duplicates: string[] = [];
    if (!text(record.installer_name)) errors.push("Installer name is required.");
    if (!phone) errors.push("Phone is required.");
    if (phone && (existingPhones.has(phone.toLowerCase()) || seenPhones.has(phone.toLowerCase()))) duplicates.push("Duplicate phone.");
    if (email && existingEmails.has(email)) duplicates.push("Duplicate email.");
    if (phone) seenPhones.add(phone.toLowerCase());
    return { rowNumber: index + 2, record, errors, duplicates, ready: errors.length === 0 && duplicates.length === 0 };
  });
  const errors = rows.reduce((total, row) => total + row.errors.length, 0);
  const duplicates = rows.reduce((total, row) => total + row.duplicates.length, 0);
  return {
    rows,
    valid: rows.filter((row) => row.ready).length,
    errors,
    duplicates,
    errorReport: rows.flatMap((row) => [...row.errors, ...row.duplicates].map((message) => `Row ${row.rowNumber}: ${message}`)).join("\n"),
  };
}

export async function previewWorkspaceInstallerImport(csv: string) {
  const resolvedWorkspace = await workspace();
  const { data } = await createAdminSupabase().from("installers").select("installer_name,phone,email").eq("client_id", resolvedWorkspace.clientId).eq("workspace_id", resolvedWorkspace.clientId).limit(5000);
  return previewInstallerImport(csv, ((data ?? []) as Row[]).map((row) => ({ installerName: text(row.installer_name), phone: text(row.phone), email: text(row.email) })));
}

export async function commitWorkspaceInstallerImport(csv: string) {
  // Preview stays available so an existing CSV can still be validated before re-inviting in User Management.
  const preview = await previewWorkspaceInstallerImport(csv);
  throw Object.assign(new Error(INSTALLER_CREATION_MOVED_MESSAGE), { status: 405, preview });
}

async function validateCampaign(campaignId: string, workspaceContext: CustomerWorkspaceContext) {
  const { data, error } = await createAdminSupabase()
    .from("workspace_campaigns")
    .select("id,client_id,project_id,campaign_name,status")
    .eq("id", campaignId)
    .eq("client_id", workspaceContext.clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Campaign not found."), { status: 404 });
  return data as Row;
}

export async function assignFieldResources(input: FieldAssignmentInput) {
  const totalStartedAt = nowMs();
  const resolvedWorkspace = await workspace();
  fieldResourcePerformanceLog({ route: "/api/workspace/field-assignments", step: "Context", elapsedMs: elapsedMs(totalStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  const campaign = await validateCampaign(text(input.campaignId), resolvedWorkspace);
  const agency = await validateAgency(text(input.agencyId), resolvedWorkspace);
  const installerId = text(input.installerId);
  if (installerId) {
    const { data, error } = await createAdminSupabase().from("installers").select("id,user_id,availability_status,access_status,status").eq("id", installerId).eq("client_id", resolvedWorkspace.clientId).eq("workspace_id", resolvedWorkspace.clientId).maybeSingle();
    if (error) throw error;
    if (!data) throw Object.assign(new Error("Select an installer from this workspace."), { status: 400 });
    const membershipStatuses = await installerMembershipStatuses(resolvedWorkspace.clientId, [text(data.user_id)]);
    const eligibility = installerEligibility(text(data.user_id) || null, installerStatus(data.availability_status ?? data.access_status ?? data.status), membershipStatuses.get(text(data.user_id)) ?? "none");
    if (!eligibility.assignable) throw Object.assign(new Error(eligibility.reason), { status: 409 });
  }
  if (!agency && !installerId) throw Object.assign(new Error("Select an agency or installer to assign."), { status: 400 });
  const campaignLocationIds = Array.from(new Set(textArray(input.campaignLocationIds)));
  const deploymentLocationIds = Array.from(new Set(textArray(input.deploymentLocationIds)));
  let locationRows: Row[] = [];
  if (campaignLocationIds.length > 0) {
    const { data, error } = await createAdminSupabase()
      .from("workspace_campaign_locations")
      .select("id,campaign_id,project_id,deployment_location_id")
      .in("id", campaignLocationIds)
      .eq("client_id", resolvedWorkspace.clientId)
      .eq("workspace_id", resolvedWorkspace.clientId)
      .eq("campaign_id", text(campaign.id));
    if (error) throw error;
    if ((data ?? []).length !== campaignLocationIds.length) throw Object.assign(new Error("Select campaign locations from this workspace."), { status: 400 });
    locationRows = (data ?? []) as Row[];
  } else if (deploymentLocationIds.length > 0) {
    const { data, error } = await createAdminSupabase()
      .from("workspace_campaign_locations")
      .select("id,campaign_id,project_id,deployment_location_id")
      .in("deployment_location_id", deploymentLocationIds)
      .eq("client_id", resolvedWorkspace.clientId)
      .eq("workspace_id", resolvedWorkspace.clientId)
      .eq("campaign_id", text(campaign.id));
    if (error) throw error;
    if ((data ?? []).length !== deploymentLocationIds.length) throw Object.assign(new Error("Select assigned campaign locations from this workspace."), { status: 400 });
    locationRows = (data ?? []) as Row[];
  }
  const targetQuantity = Math.max(1, numberValue(input.targetQuantity, 1));
  const assignmentType = text(input.assignmentType) || (installerId ? "installer" : "agency");
  const rows = (locationRows.length > 0 ? locationRows : [null]).map((location) => ({
    client_id: resolvedWorkspace.clientId,
    workspace_id: resolvedWorkspace.clientId,
    product_key: resolvedWorkspace.productKey,
    campaign_id: text(campaign.id),
    project_id: text(campaign.project_id),
    campaign_location_id: location ? text(location.id) : null,
    deployment_location_id: location ? text(location.deployment_location_id) : null,
    agency_id: text(input.agencyId) || null,
    installer_id: installerId || null,
    assignment_type: assignmentType,
    assignment_status: "assigned",
    target_quantity: targetQuantity,
    assigned_by: resolvedWorkspace.userId,
    notes: text(input.notes) || null,
  }));
  const persistenceStartedAt = nowMs();
  const { data, error } = await createAdminSupabase()
    .from("workspace_field_assignments")
    .upsert(rows, { onConflict: installerId ? "campaign_id,deployment_location_id,installer_id" : "campaign_id,agency_id" })
    .select("id");
  fieldResourcePerformanceLog({ route: "/api/workspace/field-assignments", step: "Assignment", elapsedMs: elapsedMs(persistenceStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  if (error) throw error;
  void notifyFieldResourceEvent({
    clientId: resolvedWorkspace.clientId,
    projectId: text(campaign.project_id),
    title: "Installer Assigned",
    message: "Field resources have been assigned to the campaign.",
    status: "installer_assigned",
  }).catch((error) => console.warn("[field-resource-performance]", { step: "Audit scheduling", result: "failed", error: error instanceof Error ? error.message : "Unknown error" }));
  fieldResourcePerformanceLog({ route: "/api/workspace/field-assignments", step: "Total", elapsedMs: elapsedMs(totalStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  return { assigned: data?.length ?? rows.length };
}

export async function removeFieldAssignment(input: { assignmentId?: string | null; reason?: string | null }) {
  const resolvedWorkspace = await workspace();
  const assignmentId = text(input.assignmentId);
  if (!assignmentId) throw Object.assign(new Error("Assignment is required."), { status: 400 });
  const { error } = await createAdminSupabase()
    .from("workspace_field_assignments")
    .update({
      assignment_status: "removed",
      removed_at: new Date().toISOString(),
      removal_reason: text(input.reason) || "Removed by workspace administrator",
      updated_at: new Date().toISOString(),
    })
    .eq("id", assignmentId)
    .eq("client_id", resolvedWorkspace.clientId);
  if (error) throw error;
  return { removed: true };
}

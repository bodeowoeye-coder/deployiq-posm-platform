import { createCoreProject, updateCoreProject } from "@/lib/core/projects/service";
import { deriveProjectRegions, normalizeRegions, normalizeStates } from "@/lib/geography";
import { assertInstallerAssignable } from "@/lib/workspace/fieldResources";
import { notificationsEnabled } from "@/lib/notifications";
import { isLegacyProvisioningPlaceholderProject, normalizeProjectRecord, normalizeProjectRecords } from "@/lib/projects";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type { Project } from "@/lib/types";
import {
  CustomerWorkspaceRedirect,
  resolveCustomerWorkspaceContext,
  workspacePerformanceLog,
  type CustomerWorkspaceContext,
} from "@/lib/workspace/customerAdmin";

type Row = Record<string, unknown>;

export const CUSTOMER_PROJECT_STATUSES = ["Planning", "Active", "On Hold", "Completed", "Archived", "Cancelled"] as const;
export type CustomerProjectStatus = (typeof CUSTOMER_PROJECT_STATUSES)[number];

export type CustomerProjectSummary = Project & {
  customerStatus: CustomerProjectStatus;
  productName: string;
  deploymentType: string;
  stateCount: number;
  progressPercent: number;
  updatedAt: string | null;
  readiness: ProjectReadiness;
};

export type ProjectReadiness = {
  ready: boolean;
  checks: Array<{ key: string; label: string; passed: boolean }>;
};

export type ProjectDashboardFilters = {
  search?: string | null;
  status?: string | null;
  product?: string | null;
  state?: string | null;
  deploymentType?: string | null;
  sort?: string | null;
  page?: number | null;
};

export type ProjectDashboard = {
  workspace: CustomerWorkspaceContext;
  projects: CustomerProjectSummary[];
  filteredProjects: CustomerProjectSummary[];
  kpis: Array<{ label: string; value: number }>;
  filters: Required<ProjectDashboardFilters> & { page: number };
  pagination: { page: number; pageSize: number; total: number; pages: number };
  directory: { totalRecords: number; statesCovered: number; duplicateCount: number; lastImport: string | null };
};

export type CustomerProjectResources = {
  agencyId?: string | null;
  installerId?: string | null;
  agencyName: string | null;
  leadInstallerName: string | null;
};

export type CreateCustomerProjectInput = {
  projectName: string;
  description?: string | null;
  product?: string | null;
  brandName?: string | null;
  campaignName?: string | null;
  deploymentType?: string | null;
  expectedDeploymentQuantity?: number | string | null;
  priority?: string | null;
  status?: string | null;
  objectives?: string | null;
  states?: string[] | null;
  regions?: string[] | null;
  cities?: string[] | null;
  startDate?: string | null;
  expectedEndDate?: string | null;
  milestones?: string | null;
  timeZone?: string | null;
  workingDays?: string[] | null;
  agencies?: string[] | null;
  installers?: string[] | null;
  supervisors?: string[] | null;
  managers?: string[] | null;
  agencyId?: string | null;
  installerId?: string | null;
  directoryBatchId?: string | null;
};

export type UpdateCustomerProjectInput = CreateCustomerProjectInput & {
  projectId: string;
};

// Project-level Assigned Agency and Lead Installer live on projects itself.
// workspace_field_assignments stays campaign-scoped and is deliberately not written here.
async function persistProjectConfiguration(supabase: ReturnType<typeof createAdminSupabase>, workspace: CustomerWorkspaceContext, projectId: string, input: { agencyId?: string | null; installerId?: string | null; regions: string[] }) {
  const { error } = await supabase
    .from("projects")
    .update({
      agency_id: text(input.agencyId) || null,
      lead_installer_id: text(input.installerId) || null,
      project_regions: input.regions,
    })
    .eq("id", projectId)
    .eq("client_id", workspace.clientId);
  if (error) throw error;
}

// A manipulated request must not be able to attach another workspace's agency or installer,
// and only an active accepted workspace member may be the Lead Installer.
async function assertProjectResourcesOwned(supabase: ReturnType<typeof createAdminSupabase>, workspace: CustomerWorkspaceContext, input: { agencyId?: string | null; installerId?: string | null }) {
  const agencyId = text(input.agencyId);
  if (agencyId) {
    const { data: agency } = await supabase.from("agencies").select("id").eq("id", agencyId).eq("client_id", workspace.clientId).eq("workspace_id", workspace.clientId).maybeSingle();
    if (!agency) throw Object.assign(new Error("Select an agency from this workspace."), { status: 400 });
  }
  const installerId = text(input.installerId);
  if (installerId) await assertInstallerAssignable(workspace.clientId, installerId);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function elapsedMs(startedAt: number) {
  return Math.round((nowMs() - startedAt) * 10) / 10;
}

function textArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => text(item)).filter(Boolean)
    : text(value)
      ? text(value).split(",").map((item) => item.trim()).filter(Boolean)
      : [];
}

function positiveNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
}

function assignedResourceEntries(value: unknown) {
  const entries = textArray(value);
  if (entries.length === 1 && /^\d+$/.test(entries[0])) return [];
  return entries;
}

function dateText(value: unknown) {
  const candidate = text(value);
  return candidate || null;
}

function projectWriteStatus(value: unknown) {
  const status = text(value);
  return ["Planning", "Active", "On Hold", "Completed"].includes(status) ? status : "Planning";
}

function diagnosticFor(error: unknown) {
  if (!error || typeof error !== "object") return { message: String(error) };
  const record = error as Record<string, unknown>;
  return {
    message: error instanceof Error ? error.message : text(record.message) || "Unknown error",
    code: text(record.code) || undefined,
    details: text(record.details) || undefined,
    hint: text(record.hint) || undefined,
    status: typeof record.status === "number" ? record.status : undefined,
  };
}

function projectStatus(project: Project): CustomerProjectStatus {
  if (project.archived_at) return "Archived";
  const raw = text(project.status).toLowerCase();
  if (raw === "active" || raw === "in progress") return "Active";
  if (raw === "completed") return "Completed";
  if (raw === "cancelled") return "Cancelled";
  if (raw === "on hold" || raw === "paused" || raw === "delayed") return "On Hold";
  return "Planning";
}

function projectProgress(project: Project, status: CustomerProjectStatus) {
  if (status === "Completed") return 100;
  if (status === "Active") return 45;
  if (status === "On Hold") return 35;
  return 0;
}

function projectReadiness(input: {
  project: Project;
  directoryRecords: number;
  assignedResourceCount?: number;
  hasCampaign: boolean;
  hasGeography: boolean;
}) {
  const checks = [
    { key: "project", label: "Project configured", passed: Boolean(text(input.project.project_name)) },
    { key: "directory", label: "Deployment Directory Ready", passed: input.directoryRecords > 0 },
    { key: "campaign", label: "Campaign metadata added", passed: input.hasCampaign },
    { key: "installers", label: "Installer assignments available", passed: Number(input.assignedResourceCount ?? 0) > 0 },
    { key: "geography", label: "Geography defined", passed: input.hasGeography },
    { key: "quantity", label: "Deployment target defined", passed: Number(input.project.target_quantity ?? 0) > 0 },
    { key: "timeline", label: "Timeline completed", passed: Boolean(input.project.start_date && input.project.end_date) },
  ];
  return { ready: checks.every((check) => check.passed), checks };
}

function summarizeProject(project: Project, workspace: CustomerWorkspaceContext, directoryRecords: number): CustomerProjectSummary {
  const customerStatus = projectStatus(project);
  const states = Array.isArray(project.regions_covered) ? project.regions_covered : [];
  const readiness = projectReadiness({
    project,
    directoryRecords,
    hasCampaign: Boolean(text(project.campaign_name)),
    hasGeography: states.length > 0 || Boolean(project.primary_target_state),
  });
  return {
    ...project,
    customerStatus,
    productName: workspace.productName,
    deploymentType: project.project_type || "Retail Deployment",
    stateCount: states.length,
    progressPercent: projectProgress(project, customerStatus),
    updatedAt: text((project as Record<string, unknown>).updated_at) || project.created_at || null,
    readiness,
  };
}

async function workspace() {
  try {
    return await resolveCustomerWorkspaceContext();
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) {
      throw Object.assign(new Error("Customer workspace access is required."), { status: 401 });
    }
    throw error;
  }
}

function filterProjects(projects: CustomerProjectSummary[], filters: ProjectDashboardFilters) {
  const search = text(filters.search).toLowerCase();
  const status = text(filters.status);
  const product = text(filters.product).toLowerCase();
  const state = text(filters.state).toLowerCase();
  const deploymentType = text(filters.deploymentType).toLowerCase();
  return projects.filter((project) => {
    const haystack = [
      project.project_name,
      project.campaign_name,
      project.customerStatus,
      project.productName,
      project.deploymentType,
      project.regions_covered?.join(" "),
    ].join(" ").toLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (status && project.customerStatus !== status) return false;
    if (product && project.productName.toLowerCase() !== product) return false;
    if (state && !(project.regions_covered ?? []).some((item) => item.toLowerCase() === state)) return false;
    if (deploymentType && project.deploymentType.toLowerCase() !== deploymentType) return false;
    return true;
  });
}

function sortProjects(projects: CustomerProjectSummary[], sort: string | null | undefined) {
  const rows = [...projects];
  const key = text(sort) || "updated";
  rows.sort((a, b) => {
    if (key === "name") return a.project_name.localeCompare(b.project_name);
    if (key === "status") return a.customerStatus.localeCompare(b.customerStatus);
    if (key === "created") return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
    return String(b.updatedAt ?? b.created_at ?? "").localeCompare(String(a.updatedAt ?? a.created_at ?? ""));
  });
  return rows;
}

export async function getCustomerProjectDashboard(filters: ProjectDashboardFilters = {}): Promise<ProjectDashboard> {
  const totalStartedAt = nowMs();
  const resolvedWorkspace = await workspace();
  const supabase = createAdminSupabase();
  const queryStartedAt = nowMs();
  const [{ data: projectRows, error: projectError }, { count: directoryCount }, { data: directoryStates }, { data: batches }] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("client_id", resolvedWorkspace.clientId)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("deployment_locations")
      .select("id", { count: "exact", head: true })
      .eq("client_id", resolvedWorkspace.clientId)
      .eq("product_key", resolvedWorkspace.productKey),
    supabase
      .from("deployment_locations")
      .select("state")
      .eq("client_id", resolvedWorkspace.clientId)
      .eq("product_key", resolvedWorkspace.productKey),
    supabase
      .from("workspace_directory_import_batches")
      .select("duplicate_count,imported_at")
      .eq("client_id", resolvedWorkspace.clientId)
      .eq("product_key", resolvedWorkspace.productKey)
      .order("imported_at", { ascending: false })
      .limit(10),
  ]);
  workspacePerformanceLog({
    route: "/workspace/admin/projects",
    step: "Projects page query",
    elapsedMs: elapsedMs(queryStartedAt),
    totalElapsedMs: elapsedMs(totalStartedAt),
  });
  if (projectError) throw projectError;

  const projects = normalizeProjectRecords(projectRows ?? []).filter((project) => !isLegacyProvisioningPlaceholderProject(project)).map((project) => {
    const summarized = summarizeProject(project as Project, resolvedWorkspace, directoryCount ?? 0);
    return {
      ...summarized,
      readiness: projectReadiness({
        project: summarized,
        directoryRecords: directoryCount ?? 0,
        hasCampaign: Boolean(text(summarized.campaign_name)),
        hasGeography: summarized.stateCount > 0 || Boolean(summarized.primary_target_state),
      }),
    };
  });
  const sorted = sortProjects(filterProjects(projects, filters), filters.sort);
  const pageSize = 10;
  const page = Math.max(1, Number(filters.page ?? 1) || 1);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const filteredProjects = sorted.slice((page - 1) * pageSize, page * pageSize);
  const kpi = (label: string, predicate: (project: CustomerProjectSummary) => boolean) => ({
    label,
    value: projects.filter(predicate).length,
  });
  const upcomingLaunches = projects.filter((project) => project.customerStatus === "Planning").length;
  const coveredStates = new Set((directoryStates ?? []).map((row) => text((row as { state?: unknown }).state)).filter(Boolean));
  const duplicateCount = (batches ?? []).reduce((total, row) => total + positiveNumber((row as { duplicate_count?: unknown }).duplicate_count), 0);

  const dashboard = {
    workspace: resolvedWorkspace,
    projects,
    filteredProjects,
    kpis: [
      { label: "Total Projects", value: projects.length },
      kpi("Active Projects", (project) => project.customerStatus === "Active"),
      kpi("Completed Projects", (project) => project.customerStatus === "Completed"),
      kpi("Planning Projects", (project) => project.customerStatus === "Planning"),
      kpi("On Hold Projects", (project) => project.customerStatus === "On Hold"),
      kpi("Archived Projects", (project) => project.customerStatus === "Archived"),
      { label: "Upcoming Launches", value: upcomingLaunches },
    ],
    filters: {
      search: text(filters.search),
      status: text(filters.status),
      product: text(filters.product),
      state: text(filters.state),
      deploymentType: text(filters.deploymentType),
      sort: text(filters.sort) || "updated",
      page,
    },
    pagination: { page, pageSize, total: sorted.length, pages },
    directory: {
      totalRecords: directoryCount ?? 0,
      statesCovered: coveredStates.size,
      duplicateCount,
      lastImport: text((batches?.[0] as { imported_at?: unknown } | undefined)?.imported_at) || null,
    },
  };
  workspacePerformanceLog({
    route: "/workspace/admin/projects",
    step: "Projects dashboard total",
    elapsedMs: elapsedMs(totalStartedAt),
    totalElapsedMs: elapsedMs(totalStartedAt),
  });
  return dashboard;
}

function firstText(values: unknown[]) {
  return values.map((value) => text(value)).find(Boolean) ?? null;
}

// Resources read from the canonical project-level columns, resolved through tenant-scoped lookups.
async function getCustomerProjectResources(supabase: ReturnType<typeof createAdminSupabase>, workspace: CustomerWorkspaceContext, project: Row): Promise<CustomerProjectResources> {
  const agencyId = text(project.agency_id) || null;
  const installerId = text(project.lead_installer_id) || null;
  if (!agencyId && !installerId) return { agencyId: null, installerId: null, agencyName: null, leadInstallerName: null };

  const [{ data: agency, error: agencyError }, { data: installer, error: installerError }] = await Promise.all([
    agencyId
      ? supabase.from("agencies").select("id,agency_name").eq("client_id", workspace.clientId).eq("id", agencyId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    installerId
      ? supabase.from("installers").select("id,installer_name").eq("client_id", workspace.clientId).eq("id", installerId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (agencyError) console.warn("[workspace-projects]", "Agency name lookup skipped", diagnosticFor(agencyError));
  if (installerError) console.warn("[workspace-projects]", "Installer name lookup skipped", diagnosticFor(installerError));

  return {
    agencyId,
    installerId,
    agencyName: text((agency as Row | null)?.agency_name) || null,
    leadInstallerName: text((installer as Row | null)?.installer_name) || null,
  };
}

export async function getCustomerProject(projectId: string) {
  const resolvedWorkspace = await workspace();
  const supabase = createAdminSupabase();
  const [{ data: project, error }, { count: campaignAssignedLocations }, { count: assignedResources }, { count: directoryCount }, { data: directoryStates }, { data: batches }, { count: completed }, { count: pending }, { count: rejected }, { count: gpsVerified }] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .eq("client_id", resolvedWorkspace.clientId)
      .is("archived_at", null)
      .maybeSingle(),
    supabase
      .from("workspace_campaign_locations")
      .select("id", { count: "exact", head: true })
      .eq("client_id", resolvedWorkspace.clientId)
      .eq("project_id", projectId)
      .neq("assignment_status", "excluded"),
    supabase
      .from("workspace_field_assignments")
      .select("id", { count: "exact", head: true })
      .eq("client_id", resolvedWorkspace.clientId)
      .eq("project_id", projectId)
      .is("removed_at", null),
    supabase
      .from("deployment_locations")
      .select("id", { count: "exact", head: true })
      .eq("client_id", resolvedWorkspace.clientId)
      .eq("product_key", resolvedWorkspace.productKey),
    supabase
      .from("deployment_locations")
      .select("state")
      .eq("client_id", resolvedWorkspace.clientId)
      .eq("product_key", resolvedWorkspace.productKey),
    supabase
      .from("workspace_directory_import_batches")
      .select("records_imported,duplicate_count,error_count,warning_count,status,imported_at")
      .eq("client_id", resolvedWorkspace.clientId)
      .eq("product_key", resolvedWorkspace.productKey)
      .order("imported_at", { ascending: false })
      .limit(5),
    supabase.from("submissions").select("id", { count: "exact", head: true }).eq("client_id", resolvedWorkspace.clientId).eq("project_id", projectId).eq("status", "Approved"),
    supabase.from("submissions").select("id", { count: "exact", head: true }).eq("client_id", resolvedWorkspace.clientId).eq("project_id", projectId).eq("status", "Pending"),
    supabase.from("submissions").select("id", { count: "exact", head: true }).eq("client_id", resolvedWorkspace.clientId).eq("project_id", projectId).eq("status", "Rejected"),
    supabase.from("submissions").select("id", { count: "exact", head: true }).eq("client_id", resolvedWorkspace.clientId).eq("project_id", projectId).not("gps_latitude", "is", null),
  ]);
  if (error) throw error;
  if (!project) return null;
  const resources = await getCustomerProjectResources(supabase, resolvedWorkspace, project as Row);
  const projectRecord = normalizeProjectRecord(project) as Project;
  const baseSummary = summarizeProject(projectRecord, resolvedWorkspace, directoryCount ?? 0);
  const normalized = {
    ...baseSummary,
    readiness: projectReadiness({
      project: projectRecord,
      directoryRecords: directoryCount ?? 0,
      assignedResourceCount: assignedResources ?? 0,
      hasCampaign: Boolean(text(projectRecord.campaign_name)),
      hasGeography: (projectRecord.regions_covered ?? []).length > 0 || Boolean(projectRecord.primary_target_state),
    }),
  };
  const latestBatch = (batches?.[0] as Record<string, unknown> | undefined) ?? null;
  const directoryStateCount = new Set((directoryStates ?? []).map((row) => text((row as { state?: unknown }).state)).filter(Boolean)).size;
  return {
    workspace: resolvedWorkspace,
    project: normalized,
    resources,
    overview: {
      expectedDeployments: Number(normalized.target_quantity ?? 0),
      completed: completed ?? 0,
      pending: pending ?? 0,
      rejected: rejected ?? 0,
      gpsVerified: gpsVerified ?? 0,
      states: normalizeStates(normalized.regions_covered ?? []),
      regions: deriveProjectRegions({
        states: normalized.regions_covered ?? [],
        storedRegions: [
          ...(Array.isArray((project as Row).project_regions) ? ((project as Row).project_regions as string[]) : []),
          text((normalized as Record<string, unknown>).primary_target_region),
        ],
      }),
      cities: text((normalized as Record<string, unknown>).contractor).split(",").map((item) => item.trim()).filter(Boolean),
      lgas: [],
        health: normalized.customerStatus === "On Hold" ? "On hold" : normalized.customerStatus === "Completed" ? "Completed" : normalized.customerStatus === "Active" ? "Active" : "Planning",
      directory: {
        importedRecords: directoryCount ?? 0,
        assignedAcrossCampaigns: campaignAssignedLocations ?? 0,
        unassignedEligible: Math.max(0, (directoryCount ?? 0) - (campaignAssignedLocations ?? 0)),
        duplicateRecords: positiveNumber(latestBatch?.duplicate_count),
        validationStatus: text(latestBatch?.status) || ((directoryCount ?? 0) > 0 ? "Ready" : "Not started"),
        importDate: text(latestBatch?.imported_at) || null,
        statesCovered: directoryStateCount,
        recentUploads: (batches ?? []).map((batch) => ({
          importedAt: text((batch as Record<string, unknown>).imported_at),
          recordsImported: positiveNumber((batch as Record<string, unknown>).records_imported),
          duplicateCount: positiveNumber((batch as Record<string, unknown>).duplicate_count),
          status: text((batch as Record<string, unknown>).status) || "completed",
        })),
      },
    },
  };
}

async function notifyProjectEvent(input: {
  clientId: string;
  projectId: string;
  title: string;
  message: string;
  status: string;
}) {
  if (!notificationsEnabled()) return;
  await createAdminSupabase().from("notification_events").insert({
    client_id: input.clientId,
    project_id: input.projectId,
    title: input.title,
    message: input.message,
    status: input.status,
  });
}

export async function createCustomerProject(input: CreateCustomerProjectInput) {
  const resolvedWorkspace = await workspace();
  const projectName = text(input.projectName);
  const targetQuantity = positiveNumber(input.expectedDeploymentQuantity);
  if (!projectName) throw Object.assign(new Error("Project name is required."), { status: 400 });
  if (targetQuantity <= 0) throw Object.assign(new Error("Expected deployment quantity is required."), { status: 400 });

  const states = normalizeStates(textArray(input.states));
  const regions = deriveProjectRegions({ states, storedRegions: normalizeRegions(textArray(input.regions)) });
  const installers = [
    ...assignedResourceEntries(input.installers),
    ...assignedResourceEntries(input.supervisors),
    ...assignedResourceEntries(input.managers),
  ];
  const startDate = dateText(input.startDate);
  const endDate = dateText(input.expectedEndDate);
  const rawData = {
    description: text(input.description) || null,
    product: text(input.product) || resolvedWorkspace.productKey,
    priority: text(input.priority) || "Normal",
    objectives: text(input.objectives) || null,
    regions: textArray(input.regions),
    cities: textArray(input.cities),
    milestones: text(input.milestones) || null,
    timeZone: text(input.timeZone) || "Africa/Lagos",
    workingDays: textArray(input.workingDays),
    agencies: assignedResourceEntries(input.agencies),
    directoryBatchId: text(input.directoryBatchId) || null,
  };
  const supabase = createAdminSupabase();
  await assertProjectResourcesOwned(supabase, resolvedWorkspace, input);
  const project = await createCoreProject({
    supabase,
    actorUserId: resolvedWorkspace.userId,
    projectName,
    clientId: resolvedWorkspace.clientId,
    brandName: input.brandName,
    campaignName: input.campaignName,
    targetQuantity,
    status: projectWriteStatus(input.status),
    regionsCovered: states,
    assignedInstallers: installers,
    targetRegion: regions[0] ?? null,
    targetState: states[0] ?? null,
    targetInstaller: installers[0] ?? null,
    targetAgency: rawData.agencies[0] ?? null,
    startDate,
    endDate,
    plannedCompletion: endDate,
  });
  const { data: persistedProject, error: persistedProjectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project.id)
    .eq("client_id", resolvedWorkspace.clientId)
    .is("archived_at", null)
    .single();
  if (persistedProjectError) throw persistedProjectError;
  await persistProjectConfiguration(supabase, resolvedWorkspace, project.id, { agencyId: input.agencyId, installerId: input.installerId, regions });

  await Promise.all([
    notifyProjectEvent({
      clientId: resolvedWorkspace.clientId,
      projectId: project.id,
      title: "Project Created",
      message: `${projectName} has been created in ${resolvedWorkspace.workspaceName}.`,
      status: "project_created",
    }),
  ]);

  return summarizeProject(normalizeProjectRecord(persistedProject) as Project, resolvedWorkspace, 0);
}

export async function updateCustomerProjectDetails(input: UpdateCustomerProjectInput) {
  const resolvedWorkspace = await workspace();
  const projectId = text(input.projectId);
  const projectName = text(input.projectName);
  const targetQuantity = positiveNumber(input.expectedDeploymentQuantity);
  if (!projectId) throw Object.assign(new Error("Project id is required."), { status: 400 });
  if (!projectName) throw Object.assign(new Error("Project name is required."), { status: 400 });
  if (targetQuantity <= 0) throw Object.assign(new Error("Expected deployment quantity is required."), { status: 400 });

  const existing = await getCustomerProject(projectId);
  if (!existing) throw Object.assign(new Error("Project not found."), { status: 404 });

  const submittedStates = normalizeStates(textArray(input.states));
  const submittedRegions = normalizeRegions(textArray(input.regions));
  const states = submittedStates.length > 0 ? submittedStates : normalizeStates(existing.project.regions_covered ?? []);
  const regions = deriveProjectRegions({
    states,
    storedRegions: submittedRegions.length > 0 || submittedStates.length > 0
      ? submittedRegions
      : [...(existing.overview.regions ?? []), existing.project.primary_target_region],
  });
  const targetState = states[0] ?? null;
  const targetRegion = regions[0] ?? null;
  const startDate = dateText(input.startDate);
  const endDate = dateText(input.expectedEndDate);
  const supabase = createAdminSupabase();
  await assertProjectResourcesOwned(supabase, resolvedWorkspace, input);
  await updateCoreProject({
    supabase,
    id: projectId,
    projectName,
    clientId: resolvedWorkspace.clientId,
    brandName: input.brandName,
    campaignName: input.campaignName,
    targetQuantity,
    status: projectWriteStatus(input.status || existing.project.status),
    regionsCovered: states,
    assignedInstallers: existing.project.assigned_installers ?? [],
    targetRegion,
    targetState,
    startDate,
    endDate,
    plannedCompletion: endDate,
  });
  const { data: persistedProject, error: persistedProjectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("client_id", resolvedWorkspace.clientId)
    .single();
  if (persistedProjectError) throw persistedProjectError;
  await persistProjectConfiguration(supabase, resolvedWorkspace, projectId, { agencyId: input.agencyId, installerId: input.installerId, regions });

  await notifyProjectEvent({
    clientId: resolvedWorkspace.clientId,
    projectId,
    title: "Project Updated",
    message: `${projectName} project and campaign details were updated.`,
    status: "project_updated",
  });
  return summarizeProject(normalizeProjectRecord(persistedProject) as Project, resolvedWorkspace, 0);
}

export async function updateCustomerProjectStatus(input: { projectId: string; action: string }) {
  const resolvedWorkspace = await workspace();
  const action = text(input.action);
  const statusMap: Record<string, { status: string; archived?: boolean; title: string }> = {
    pause: { status: "On Hold", title: "Project Paused" },
    resume: { status: "Active", title: "Project Resumed" },
    launch: { status: "Active", title: "Project Launched" },
    close: { status: "Completed", title: "Project Completed" },
    archive: { status: "Completed", archived: true, title: "Project Archived" },
    delete_draft: { status: "Cancelled", archived: true, title: "Draft Deleted" },
  };
  const next = statusMap[action];
  if (!next) throw Object.assign(new Error("Unsupported project action."), { status: 400 });

  const existing = await getCustomerProject(input.projectId);
  if (!existing) throw Object.assign(new Error("Project not found."), { status: 404 });
  if (action === "launch" && !existing.project.readiness.ready) {
    throw Object.assign(new Error("Launch is available when the project has the required operational data."), {
      status: 422,
      readiness: existing.project.readiness,
    });
  }

  const updates: Record<string, unknown> = {
    status: next.status,
    archived_at: next.archived ? new Date().toISOString() : null,
  };
  const { data, error } = await createAdminSupabase()
    .from("projects")
    .update(updates)
    .eq("id", input.projectId)
    .eq("client_id", resolvedWorkspace.clientId)
    .select()
    .single();
  if (error) throw error;
  await notifyProjectEvent({
    clientId: resolvedWorkspace.clientId,
    projectId: input.projectId,
    title: next.title,
    message: `${existing.project.project_name} status changed to ${next.status}.`,
    status: action === "archive" ? "project_archived" : action === "close" ? "project_completed" : "project_updated",
  });
  return summarizeProject(normalizeProjectRecord(data) as Project, resolvedWorkspace, 0);
}

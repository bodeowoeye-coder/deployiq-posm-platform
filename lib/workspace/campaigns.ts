import { notificationsEnabled } from "@/lib/notifications";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type { Project, ProjectType } from "@/lib/types";
import {
  resolveCustomerWorkspaceContext,
  type CustomerWorkspaceContext,
} from "@/lib/workspace/customerAdmin";

export const CUSTOMER_CAMPAIGN_STATUSES = ["Draft", "Scheduled", "Active", "Paused", "Completed", "Archived"] as const;
export type CustomerCampaignStatus = (typeof CUSTOMER_CAMPAIGN_STATUSES)[number];

export const CUSTOMER_CAMPAIGN_DEPLOYMENT_TYPES = [
  "Retail Deployment",
  "Construction",
  "Real Estate",
  "Facility Management",
] as const;

export type CustomerCampaignRecord = {
  id: string;
  client_id: string;
  project_id: string;
  compatibility_campaign_id: string | null;
  campaign_name: string;
  project_name: string;
  brand_name: string;
  description: string | null;
  deployment_type: string;
  states: string[];
  regions: string[];
  cities: string[];
  start_date: string;
  end_date: string;
  launch_date: string | null;
  target_quantity: number;
  target_unit: string;
  state_targets: Record<string, unknown>;
  deployment_location_ids: string[];
  campaign_manager_user_id: string | null;
  agency_name: string | null;
  field_team_name: string | null;
  status: string;
  created_by: string | null;
  launched_at: string | null;
  archived_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  project?: Pick<Project, "id" | "project_name" | "campaign_name" | "start_date" | "end_date" | "regions_covered" | "target_quantity" | "primary_target_region" | "primary_target_state" | "assigned_installers" | "archived_at" | "status"> | null;
};

export type CustomerCampaignSummary = CustomerCampaignRecord & {
  customerStatus: CustomerCampaignStatus;
  projectName: string;
  progressPercent: number;
  actualDeployments: number;
  approved: number;
  pending: number;
  rejected: number;
  gpsVerified: number;
  outstanding: number;
  assignedResourceCount: number;
  readiness: CampaignReadiness;
};

export type CampaignReadinessCheck = {
  key: string;
  label: string;
  passed: boolean;
  category: "Required before launch" | "Recommended" | "Optional";
};

export type CampaignReadiness = {
  ready: boolean;
  checks: CampaignReadinessCheck[];
};

export type CampaignDashboardFilters = {
  search?: string | null;
  status?: string | null;
  project?: string | null;
  brand?: string | null;
  state?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  sort?: string | null;
};

export type CampaignCreateOptions = {
  workspace: CustomerWorkspaceContext;
  projects: Array<Pick<Project, "id" | "project_name" | "start_date" | "end_date" | "regions_covered" | "project_type" | "target_quantity">>;
  brands: string[];
  deploymentTypes: string[];
  managers: Array<{ id: string; name: string; email: string | null }>;
};

type LegacyCampaignAnchor = {
  id: string;
  project_id: string;
  campaign_name: string;
  brand_name: string;
  description: string | null;
  deployment_type: string;
  states: string[];
  regions: string[];
  cities: string[];
  start_date: string;
  end_date: string;
  launch_date: string | null;
  target_quantity: number;
  target_unit: string;
  state_targets: Record<string, unknown>;
  deployment_location_ids: string[];
  campaign_manager_user_id: string | null;
  agency_name: string | null;
  field_team_name: string | null;
  status: string;
  created_by: string | null;
  launched_at: string | null;
  archived_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateWorkspaceCampaignInput = {
  campaignName?: string | null;
  projectId?: string | null;
  brandName?: string | null;
  description?: string | null;
  deploymentType?: string | null;
  states?: string[] | string | null;
  regions?: string[] | string | null;
  cities?: string[] | string | null;
  startDate?: string | null;
  endDate?: string | null;
  launchDate?: string | null;
  targetQuantity?: number | string | null;
  targetUnit?: string | null;
  stateTargets?: Record<string, unknown> | null;
  deploymentLocationIds?: string[] | null;
  campaignManagerUserId?: string | null;
  agencyName?: string | null;
  fieldTeamName?: string | null;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function elapsedMs(startedAt: number) {
  return Math.round((nowMs() - startedAt) * 10) / 10;
}

export function campaignPerformanceLog(input: { route: string; step: string; elapsedMs: number; totalElapsedMs?: number | null }) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[campaign-performance]", {
    route: input.route,
    step: input.step,
    elapsedMs: input.elapsedMs,
    totalElapsedMs: input.totalElapsedMs ?? input.elapsedMs,
  });
}

function textArray(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
  const raw = text(value);
  return raw ? raw.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function normalizeCampaignProjectOption(row: Record<string, unknown>): CampaignCreateOptions["projects"][number] {
  const projectType = text(row.project_type);
  return {
    id: text(row.id),
    project_name: text(row.project_name) || "Untitled project",
    start_date: text(row.start_date) || null,
    end_date: text(row.end_date) || null,
    regions_covered: textArray(row.regions_covered),
    project_type: CUSTOMER_CAMPAIGN_DEPLOYMENT_TYPES.includes(projectType as ProjectType) ? projectType as ProjectType : "Retail Deployment",
    target_quantity: positiveInteger(row.target_quantity),
  };
}

function positiveInteger(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function dateValue(value: unknown) {
  const raw = text(value);
  return raw ? raw : null;
}

function campaignStatus(status: string): CustomerCampaignStatus {
  const raw = text(status).toLowerCase();
  if (raw === "scheduled") return "Scheduled";
  if (raw === "active") return "Active";
  if (raw === "paused") return "Paused";
  if (raw === "completed" || raw === "closed") return "Completed";
  if (raw === "archived") return "Archived";
  return "Draft";
}

function projectCampaignStatus(project: Project): CustomerCampaignStatus {
  if (project.archived_at) return "Archived";
  const raw = text(project.status).toLowerCase();
  if (raw === "active" || raw === "in progress") return "Active";
  if (raw === "on hold" || raw === "paused" || raw === "delayed") return "Paused";
  if (raw === "completed") return "Completed";
  if (raw === "not started" || raw === "planning") return "Draft";
  return campaignStatus(raw);
}

function progressFor(status: CustomerCampaignStatus, actualDeployments: number, targetQuantity: number) {
  if (status === "Completed") return 100;
  if (targetQuantity > 0 && actualDeployments > 0) return Math.min(100, Math.round((actualDeployments / targetQuantity) * 100));
  if (status === "Active") return 10;
  if (status === "Paused") return 10;
  return 0;
}

function campaignReadiness(campaign: CustomerCampaignRecord, metrics: { assignedLocationCount?: number; assignedResourceCount?: number } = {}): CampaignReadiness {
  const datesValid = Boolean(campaign.start_date && campaign.end_date && new Date(campaign.end_date) >= new Date(campaign.start_date));
  const geographyDefined = campaign.states.length > 0 || campaign.regions.length > 0 || campaign.cities.length > 0;
  const hasAssignedLocations = (metrics.assignedLocationCount ?? campaign.deployment_location_ids.length) > 0;
  const checks: CampaignReadinessCheck[] = [
    { key: "project", label: "Project selected", passed: Boolean(campaign.project_id), category: "Required before launch" },
    { key: "dates", label: "Campaign dates valid", passed: datesValid, category: "Required before launch" },
    { key: "target", label: "Deployment target defined", passed: campaign.target_quantity > 0, category: "Required before launch" },
    { key: "geography", label: "Geography defined", passed: geographyDefined, category: "Required before launch" },
    { key: "locations", label: "Deployment locations assigned", passed: hasAssignedLocations, category: "Required before launch" },
    { key: "team", label: "Team assignment available", passed: Boolean(campaign.campaign_manager_user_id || campaign.agency_name || campaign.field_team_name || (metrics.assignedResourceCount ?? 0) > 0), category: "Recommended" },
    { key: "workflow", label: "Approval workflow configured", passed: false, category: "Optional" },
  ];
  return {
    ready: checks.filter((check) => check.category === "Required before launch").every((check) => check.passed),
    checks,
  };
}

function legacyAnchor(row: Record<string, unknown>): LegacyCampaignAnchor {
  return {
    id: text(row.id),
    project_id: text(row.project_id),
    campaign_name: text(row.campaign_name),
    brand_name: text(row.brand_name),
    description: text(row.description) || null,
    deployment_type: text(row.deployment_type) || "Retail Deployment",
    states: textArray(row.states),
    regions: textArray(row.regions),
    cities: textArray(row.cities),
    start_date: text(row.start_date),
    end_date: text(row.end_date),
    launch_date: text(row.launch_date) || null,
    target_quantity: positiveInteger(row.target_quantity),
    target_unit: text(row.target_unit) || "deployments",
    state_targets: typeof row.state_targets === "object" && row.state_targets !== null ? row.state_targets as Record<string, unknown> : {},
    deployment_location_ids: textArray(row.deployment_location_ids),
    campaign_manager_user_id: text(row.campaign_manager_user_id) || null,
    agency_name: text(row.agency_name) || null,
    field_team_name: text(row.field_team_name) || null,
    status: text(row.status) || "draft",
    created_by: text(row.created_by) || null,
    launched_at: text(row.launched_at) || null,
    archived_at: text(row.archived_at) || null,
    closed_at: text(row.closed_at) || null,
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  };
}

function normalizeProjectCampaign(
  project: Project,
  legacy?: LegacyCampaignAnchor | null,
  metrics: { actualDeployments?: number; approved?: number; pending?: number; rejected?: number; gpsVerified?: number; assignedLocationCount?: number; assignedResourceCount?: number } = {},
): CustomerCampaignSummary {
  const campaignName = text(project.campaign_name) || legacy?.campaign_name || project.project_name;
  const states = textArray(project.regions_covered);
  const region = text(project.primary_target_region);
  const state = text(project.primary_target_state);
  const record: CustomerCampaignRecord = {
    id: legacy?.id || project.id,
    client_id: project.client_id,
    project_id: project.id,
    compatibility_campaign_id: legacy?.id || null,
    campaign_name: campaignName,
    project_name: project.project_name,
    brand_name: text((project as unknown as Record<string, unknown>).brand_name) || text((project as unknown as Record<string, unknown>).brand) || legacy?.brand_name || "Not set",
    description: legacy?.description ?? null,
    deployment_type: project.project_type || legacy?.deployment_type || "Retail Deployment",
    states: states.length > 0 ? states : state ? [state] : legacy?.states ?? [],
    regions: region ? [region] : legacy?.regions ?? [],
    cities: legacy?.cities ?? [],
    start_date: text(project.start_date) || legacy?.start_date || "",
    end_date: text(project.end_date) || legacy?.end_date || "",
    launch_date: legacy?.launch_date ?? null,
    target_quantity: positiveInteger(project.target_quantity) || legacy?.target_quantity || 0,
    target_unit: legacy?.target_unit || "deployments",
    state_targets: legacy?.state_targets ?? {},
    deployment_location_ids: legacy?.deployment_location_ids ?? [],
    campaign_manager_user_id: legacy?.campaign_manager_user_id ?? null,
    agency_name: legacy?.agency_name ?? null,
    field_team_name: textArray(project.assigned_installers).join(", ") || legacy?.field_team_name || null,
    status: project.status,
    created_by: legacy?.created_by ?? null,
    launched_at: legacy?.launched_at ?? null,
    archived_at: project.archived_at || legacy?.archived_at || null,
    closed_at: legacy?.closed_at ?? null,
    created_at: project.created_at,
    updated_at: legacy?.updated_at || project.created_at,
    project,
  };
  const customerStatus = projectCampaignStatus(project);
  const actualDeployments = metrics.actualDeployments ?? 0;
  const approved = metrics.approved ?? 0;
  const pending = metrics.pending ?? 0;
  const rejected = metrics.rejected ?? 0;
  const gpsVerified = metrics.gpsVerified ?? 0;
  return {
    ...record,
    customerStatus,
    projectName: project.project_name,
    progressPercent: progressFor(customerStatus, actualDeployments, record.target_quantity),
    actualDeployments,
    approved,
    pending,
    rejected,
    gpsVerified,
    outstanding: Math.max(0, record.target_quantity - actualDeployments),
    assignedResourceCount: metrics.assignedResourceCount ?? 0,
    readiness: campaignReadiness(record, { assignedLocationCount: metrics.assignedLocationCount, assignedResourceCount: metrics.assignedResourceCount }),
  };
}

function normalizeCampaign(row: Record<string, unknown>, metrics: { actualDeployments?: number; approved?: number; pending?: number; rejected?: number; gpsVerified?: number; assignedLocationCount?: number; assignedResourceCount?: number } = {}): CustomerCampaignSummary {
  const project = (row.projects ?? row.project ?? null) as CustomerCampaignRecord["project"];
  const projectTargetQuantity = positiveInteger(project?.target_quantity);
  const projectGeography = textArray(project?.regions_covered);
  const record: CustomerCampaignRecord = {
    id: text(row.id),
    client_id: text(row.client_id),
    project_id: text(row.project_id),
    compatibility_campaign_id: text(row.id) || null,
    campaign_name: text(project?.campaign_name) || text(row.campaign_name),
    project_name: text(project?.project_name) || "Not available",
    brand_name: text(row.brand_name),
    description: text(row.description) || null,
    deployment_type: text(row.deployment_type) || "Retail Deployment",
    states: projectGeography.length > 0 ? projectGeography : textArray(row.states),
    regions: projectGeography.length > 0 ? [] : textArray(row.regions),
    cities: textArray(row.cities),
    start_date: text(project?.start_date) || text(row.start_date),
    end_date: text(project?.end_date) || text(row.end_date),
    launch_date: text(row.launch_date) || null,
    target_quantity: projectTargetQuantity > 0 ? projectTargetQuantity : positiveInteger(row.target_quantity),
    target_unit: text(row.target_unit) || "deployments",
    state_targets: typeof row.state_targets === "object" && row.state_targets !== null ? row.state_targets as Record<string, unknown> : {},
    deployment_location_ids: textArray(row.deployment_location_ids),
    campaign_manager_user_id: text(row.campaign_manager_user_id) || null,
    agency_name: text(row.agency_name) || null,
    field_team_name: text(row.field_team_name) || null,
    status: text(row.status) || "draft",
    created_by: text(row.created_by) || null,
    launched_at: text(row.launched_at) || null,
    archived_at: text(row.archived_at) || null,
    closed_at: text(row.closed_at) || null,
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
    project,
  };
  const customerStatus = campaignStatus(record.status);
  const actualDeployments = metrics.actualDeployments ?? 0;
  const approved = metrics.approved ?? 0;
  const pending = metrics.pending ?? 0;
  const rejected = metrics.rejected ?? 0;
  const gpsVerified = metrics.gpsVerified ?? 0;
  return {
    ...record,
    customerStatus,
    projectName: text(project?.project_name) || "Not available",
    progressPercent: progressFor(customerStatus, actualDeployments, record.target_quantity),
    actualDeployments,
    approved,
    pending,
    rejected,
    gpsVerified,
    outstanding: Math.max(0, record.target_quantity - actualDeployments),
    assignedResourceCount: metrics.assignedResourceCount ?? 0,
    readiness: campaignReadiness(record, { assignedLocationCount: metrics.assignedLocationCount, assignedResourceCount: metrics.assignedResourceCount }),
  };
}

async function workspace(workspaceContext?: CustomerWorkspaceContext) {
  return workspaceContext ?? await resolveCustomerWorkspaceContext();
}

function filterCampaigns(campaigns: CustomerCampaignSummary[], filters: CampaignDashboardFilters) {
  const search = text(filters.search).toLowerCase();
  const status = text(filters.status);
  const project = text(filters.project).toLowerCase();
  const brand = text(filters.brand).toLowerCase();
  const state = text(filters.state).toLowerCase();
  const dateFrom = dateValue(filters.dateFrom);
  const dateTo = dateValue(filters.dateTo);
  return campaigns.filter((campaign) => {
    const haystack = [campaign.campaign_name, campaign.projectName, campaign.brand_name, campaign.deployment_type, campaign.customerStatus].join(" ").toLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (status && campaign.customerStatus !== status) return false;
    if (project && campaign.project_id !== project && !campaign.projectName.toLowerCase().includes(project)) return false;
    if (brand && !campaign.brand_name.toLowerCase().includes(brand)) return false;
    if (state && !campaign.states.some((item) => item.toLowerCase() === state)) return false;
    if (dateFrom && campaign.end_date < dateFrom) return false;
    if (dateTo && campaign.start_date > dateTo) return false;
    return true;
  });
}

function sortCampaigns(campaigns: CustomerCampaignSummary[], sort: string | null | undefined) {
  const rows = [...campaigns];
  const key = text(sort) || "updated";
  rows.sort((a, b) => {
    if (key === "name") return a.campaign_name.localeCompare(b.campaign_name);
    if (key === "status") return a.customerStatus.localeCompare(b.customerStatus);
    if (key === "start") return String(a.start_date).localeCompare(String(b.start_date));
    if (key === "end") return String(a.end_date).localeCompare(String(b.end_date));
    return String(b.updated_at ?? b.created_at ?? "").localeCompare(String(a.updated_at ?? a.created_at ?? ""));
  });
  return rows;
}

export async function getWorkspaceCampaignDashboard(filters: CampaignDashboardFilters = {}, workspaceContext?: CustomerWorkspaceContext) {
  const totalStartedAt = nowMs();
  const resolvedWorkspace = await workspace(workspaceContext);
  const supabase = createAdminSupabase();
  const listStartedAt = nowMs();
  const [{ data: projects, error }, { data: legacyRows, error: legacyError }] = await Promise.all([
    supabase
      .from("projects")
      .select("id,client_id,project_name:name,campaign_name:campaign,brand_name:brand,status,start_date,end_date,regions_covered,target_quantity,assigned_installers,primary_target_region,primary_target_state,archived_at,created_at")
      .eq("client_id", resolvedWorkspace.clientId)
      .order("created_at", { ascending: false }),
    supabase
      .from("workspace_campaigns")
      .select("id,client_id,project_id,campaign_name,brand_name,description,deployment_type,states,regions,cities,start_date,end_date,launch_date,target_quantity,target_unit,state_targets,deployment_location_ids,campaign_manager_user_id,agency_name,field_team_name,status,created_by,launched_at,archived_at,closed_at,created_at,updated_at")
      .eq("client_id", resolvedWorkspace.clientId)
      .order("updated_at", { ascending: false }),
  ]);
  campaignPerformanceLog({ route: "/workspace/admin/campaigns", step: "Campaign list", elapsedMs: elapsedMs(listStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  if (error) throw error;
  if (legacyError) console.warn("[campaign-performance]", { step: "Optional compatibility campaign lookup skipped", error: legacyError.message });
  const legacyByProjectId = new Map((legacyError ? [] : legacyRows ?? []).map((row) => {
    const anchor = legacyAnchor(row as Record<string, unknown>);
    return [anchor.project_id, anchor];
  }));
  const campaigns = (projects ?? []).map((project) => normalizeProjectCampaign(normalizeCampaignProjectRow(project as Record<string, unknown>), legacyByProjectId.get(text((project as Record<string, unknown>).id))));
  const filteredCampaigns = sortCampaigns(filterCampaigns(campaigns, filters), filters.sort);
  return {
    workspace: resolvedWorkspace,
    campaigns,
    filteredCampaigns,
    kpis: [],
    filters: {
      search: text(filters.search),
      status: text(filters.status),
      project: text(filters.project),
      brand: text(filters.brand),
      state: text(filters.state),
      dateFrom: text(filters.dateFrom),
      dateTo: text(filters.dateTo),
      sort: text(filters.sort) || "updated",
    },
  };
}

function normalizeCampaignProjectRow(row: Record<string, unknown>): Project {
  return {
    id: text(row.id),
    client_id: text(row.client_id),
    brand_id: text(row.brand_id) || null,
    project_name: text(row.project_name) || text(row.name) || "Untitled project",
    campaign_name: text(row.campaign_name) || text(row.campaign) || null,
    project_type: text(row.project_type) as ProjectType || "Retail Deployment",
    start_date: text(row.start_date) || null,
    end_date: text(row.end_date) || null,
    primary_target_region: text(row.primary_target_region) || null,
    primary_target_state: text(row.primary_target_state) || null,
    target_quantity: positiveInteger(row.target_quantity),
    status: (text(row.status) || "Planning") as Project["status"],
    regions_covered: textArray(row.regions_covered),
    assigned_installers: textArray(row.assigned_installers),
    archived_at: text(row.archived_at) || null,
    created_at: text(row.created_at),
    brand: text(row.brand_name) ? { id: text(row.brand_id), client_id: text(row.client_id), brand_name: text(row.brand_name), created_at: "" } : null,
    ...(text(row.brand_name) ? { brand_name: text(row.brand_name) } : {}),
  } as Project;
}

export async function ensureWorkspaceCampaignCompatibilityAnchor(campaign: CustomerCampaignSummary, workspaceContext?: CustomerWorkspaceContext) {
  if (campaign.compatibility_campaign_id) return campaign.compatibility_campaign_id;
  const resolvedWorkspace = await workspace(workspaceContext);
  if (!campaign.start_date || !campaign.end_date || campaign.target_quantity <= 0) {
    throw Object.assign(new Error("Complete project campaign dates and deployment target before assigning locations."), { status: 422 });
  }
  const supabase = createAdminSupabase();
  const { data: existing, error: existingError } = await supabase
    .from("workspace_campaigns")
    .select("id")
    .eq("client_id", resolvedWorkspace.clientId)
    .eq("project_id", campaign.project_id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return text((existing as Record<string, unknown>).id);
  const { data, error } = await supabase
    .from("workspace_campaigns")
    .insert({
      client_id: resolvedWorkspace.clientId,
      project_id: campaign.project_id,
      campaign_name: campaign.campaign_name,
      brand_name: campaign.brand_name || "Not set",
      description: null,
      deployment_type: campaign.deployment_type || "Retail Deployment",
      states: campaign.states,
      regions: campaign.regions,
      cities: campaign.cities,
      start_date: campaign.start_date,
      end_date: campaign.end_date,
      target_quantity: campaign.target_quantity,
      target_unit: campaign.target_unit || "deployments",
      state_targets: campaign.state_targets ?? {},
      deployment_location_ids: [],
      field_team_name: campaign.field_team_name,
      status: "draft",
      created_by: resolvedWorkspace.userId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return text((data as Record<string, unknown>).id);
}

export async function getCampaignCreateOptions(workspaceContext?: CustomerWorkspaceContext): Promise<CampaignCreateOptions> {
  const totalStartedAt = nowMs();
  const resolvedWorkspace = await workspace(workspaceContext);
  const supabase = createAdminSupabase();
  const startedAt = nowMs();
  const [{ data: projects, error: projectError }, { data: brands }] = await Promise.all([
    supabase
      .from("projects")
      .select("id,project_name:name,campaign_name:campaign,start_date,end_date,regions_covered,target_quantity")
      .eq("client_id", resolvedWorkspace.clientId)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("brands")
      .select("brand_name")
      .eq("client_id", resolvedWorkspace.clientId)
      .order("brand_name", { ascending: true }),
  ]);
  campaignPerformanceLog({ route: "/workspace/admin/campaigns/new", step: "Create options", elapsedMs: elapsedMs(startedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  if (projectError) throw projectError;
  const brandNames = Array.from(new Set((brands ?? []).map((brand) => text((brand as Record<string, unknown>).brand_name)).filter(Boolean)));
  return {
    workspace: resolvedWorkspace,
    projects: (projects ?? []).map((project) => normalizeCampaignProjectOption(project as Record<string, unknown>)),
    brands: brandNames,
    deploymentTypes: [...CUSTOMER_CAMPAIGN_DEPLOYMENT_TYPES],
    managers: [{ id: resolvedWorkspace.userId, name: resolvedWorkspace.email ?? "Workspace administrator", email: resolvedWorkspace.email }],
  };
}

async function assertProjectBelongsToWorkspace(projectId: string, workspaceContext: CustomerWorkspaceContext) {
  const { data, error } = await createAdminSupabase()
    .from("projects")
    .select("id,project_name:name,campaign_name:campaign,start_date,end_date,regions_covered,target_quantity")
    .eq("id", projectId)
    .eq("client_id", workspaceContext.clientId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Select a project from this workspace."), { status: 400 });
  return normalizeCampaignProjectOption(data as Record<string, unknown>);
}

function validateDates(startDate: string | null, endDate: string | null, project?: Pick<Project, "start_date" | "end_date"> | null) {
  if (!startDate) throw Object.assign(new Error("Start date is required."), { status: 400 });
  if (!endDate) throw Object.assign(new Error("End date is required."), { status: 400 });
  if (new Date(endDate) < new Date(startDate)) throw Object.assign(new Error("End date cannot be before start date."), { status: 400 });
  const warnings = [];
  if (project?.start_date && startDate < project.start_date) warnings.push("Campaign starts before the project start date.");
  if (project?.end_date && endDate > project.end_date) warnings.push("Campaign ends after the project end date.");
  return warnings;
}

async function notifyCampaignEvent(input: { clientId: string; projectId: string; campaignId: string; title: string; message: string; status: string }) {
  if (!notificationsEnabled()) return;
  await createAdminSupabase().from("notification_events").insert({
    client_id: input.clientId,
    project_id: input.projectId,
    title: input.title,
    message: input.message,
    status: input.status,
  });
}

export async function createWorkspaceCampaign(input: CreateWorkspaceCampaignInput, workspaceContext?: CustomerWorkspaceContext) {
  const totalStartedAt = nowMs();
  const resolvedWorkspace = await workspace(workspaceContext);
  const contextElapsed = elapsedMs(totalStartedAt);
  campaignPerformanceLog({ route: "/api/workspace/campaigns", step: "Context", elapsedMs: contextElapsed, totalElapsedMs: contextElapsed });

  const validationStartedAt = nowMs();
  const campaignName = text(input.campaignName);
  const projectId = text(input.projectId);
  const brandName = text(input.brandName);
  const deploymentType = text(input.deploymentType);
  const startDate = dateValue(input.startDate);
  const endDate = dateValue(input.endDate);
  const targetQuantity = positiveInteger(input.targetQuantity);
  if (!campaignName) throw Object.assign(new Error("Campaign name is required."), { status: 400 });
  if (!projectId) throw Object.assign(new Error("Project is required."), { status: 400 });
  if (!brandName) throw Object.assign(new Error("Brand is required."), { status: 400 });
  if (!deploymentType) throw Object.assign(new Error("Deployment type is required."), { status: 400 });
  if (targetQuantity <= 0) throw Object.assign(new Error("Expected deployments is required."), { status: 400 });
  const project = await assertProjectBelongsToWorkspace(projectId, resolvedWorkspace);
  const dateWarnings = validateDates(startDate, endDate, project);
  campaignPerformanceLog({ route: "/api/workspace/campaigns", step: "Validation", elapsedMs: elapsedMs(validationStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });

  const persistenceStartedAt = nowMs();
  const { data, error } = await createAdminSupabase()
    .from("workspace_campaigns")
    .insert({
      client_id: resolvedWorkspace.clientId,
      project_id: project.id,
      campaign_name: campaignName,
      brand_name: brandName,
      description: text(input.description) || null,
      deployment_type: deploymentType,
      states: textArray(input.states),
      regions: textArray(input.regions),
      cities: textArray(input.cities),
      start_date: startDate,
      end_date: endDate,
      launch_date: dateValue(input.launchDate),
      target_quantity: targetQuantity,
      target_unit: text(input.targetUnit) || "deployments",
      state_targets: input.stateTargets ?? {},
      deployment_location_ids: textArray(input.deploymentLocationIds),
      campaign_manager_user_id: text(input.campaignManagerUserId) || null,
      agency_name: text(input.agencyName) || null,
      field_team_name: text(input.fieldTeamName) || null,
      status: "draft",
      created_by: resolvedWorkspace.userId,
    })
    .select("id,client_id,project_id,campaign_name,brand_name,description,deployment_type,states,regions,cities,start_date,end_date,launch_date,target_quantity,target_unit,state_targets,deployment_location_ids,campaign_manager_user_id,agency_name,field_team_name,status,created_by,launched_at,archived_at,closed_at,created_at,updated_at")
    .single();
  if (error) throw error;
  campaignPerformanceLog({ route: "/api/workspace/campaigns", step: "Campaign persistence", elapsedMs: elapsedMs(persistenceStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });

  const auditStartedAt = nowMs();
  void notifyCampaignEvent({
    clientId: resolvedWorkspace.clientId,
    projectId: project.id,
    campaignId: data.id,
    title: "Campaign Created",
    message: `${campaignName} has been saved as a draft.`,
    status: "campaign_created",
  }).catch((error) => console.warn("[campaign-performance]", { step: "Audit", result: "failed", error: error instanceof Error ? error.message : "Unknown error" }));
  campaignPerformanceLog({ route: "/api/workspace/campaigns", step: "Audit", elapsedMs: elapsedMs(auditStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  campaignPerformanceLog({ route: "/api/workspace/campaigns", step: "Total", elapsedMs: elapsedMs(totalStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  return { campaign: normalizeCampaign({ ...data, projects: project as unknown as Record<string, unknown> }), warnings: dateWarnings };
}

export async function getWorkspaceCampaign(campaignId: string, workspaceContext?: CustomerWorkspaceContext) {
  const totalStartedAt = nowMs();
  const resolvedWorkspace = await workspace(workspaceContext);
  const supabase = createAdminSupabase();
  const queryStartedAt = nowMs();
  const [{ data: legacy, error: legacyError }, { data: project, error: projectError }] = await Promise.all([
    supabase
      .from("workspace_campaigns")
      .select("id,client_id,project_id,campaign_name,brand_name,description,deployment_type,states,regions,cities,start_date,end_date,launch_date,target_quantity,target_unit,state_targets,deployment_location_ids,campaign_manager_user_id,agency_name,field_team_name,status,created_by,launched_at,archived_at,closed_at,created_at,updated_at,projects!workspace_campaigns_project_client_fk(id,project_name:name,campaign_name:campaign,start_date,end_date,regions_covered,target_quantity)")
      .eq("id", campaignId)
      .eq("client_id", resolvedWorkspace.clientId)
      .maybeSingle(),
    supabase
      .from("projects")
      .select("id,client_id,project_name:name,campaign_name:campaign,brand_name:brand,status,start_date,end_date,regions_covered,target_quantity,assigned_installers,primary_target_region,primary_target_state,archived_at,created_at")
      .eq("id", campaignId)
      .eq("client_id", resolvedWorkspace.clientId)
      .maybeSingle(),
  ]);
  if (legacyError && !project) throw legacyError;
  if (legacyError) console.warn("[campaign-performance]", { step: "Optional compatibility campaign detail skipped", error: legacyError.message });
  if (projectError) throw projectError;
  const projectId = text((legacy as Record<string, unknown> | null)?.project_id) || text((project as Record<string, unknown> | null)?.id);
  const legacyAnchorRow = legacy ? legacyAnchor(legacy as Record<string, unknown>) : null;
  const projectRow = project
    ? normalizeCampaignProjectRow(project as Record<string, unknown>)
    : legacy
      ? normalizeCampaignProjectRow(((legacy as Record<string, unknown>).projects ?? {}) as Record<string, unknown>)
      : null;
  if (!projectRow) {
    campaignPerformanceLog({ route: "/workspace/admin/campaigns/[id]", step: "Campaign detail", elapsedMs: elapsedMs(queryStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
    return null;
  }
  const [{ count: assignedLocationCount }, { count: assignedResourceCount }] = await Promise.all([
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
  ]);
  campaignPerformanceLog({ route: "/workspace/admin/campaigns/[id]", step: "Campaign detail", elapsedMs: elapsedMs(queryStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  return {
    workspace: resolvedWorkspace,
    campaign: normalizeProjectCampaign(projectRow, legacyAnchorRow, { assignedLocationCount: assignedLocationCount ?? 0, assignedResourceCount: assignedResourceCount ?? 0 }),
  };
}

export async function updateWorkspaceCampaignStatus(input: { campaignId: string; action: string }, workspaceContext?: CustomerWorkspaceContext) {
  const resolvedWorkspace = await workspace(workspaceContext);
  const existing = await getWorkspaceCampaign(input.campaignId, resolvedWorkspace);
  if (!existing) throw Object.assign(new Error("Campaign not found."), { status: 404 });
  const action = text(input.action);
  const status = existing.campaign.customerStatus;
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {};
  if (action === "launch" && status === "Draft") {
    if (!existing.campaign.readiness.ready) {
      throw Object.assign(new Error("Complete the required readiness items before activating this campaign."), {
        status: 422,
        readiness: existing.campaign.readiness,
      });
    }
    updates.status = "Active";
  } else if (action === "pause" && status === "Active") {
    updates.status = "On Hold";
  } else if (action === "resume" && status === "Paused") {
    updates.status = "Active";
  } else if (action === "close" && (status === "Active" || status === "Paused")) {
    updates.status = "Completed";
  } else if (action === "archive" && (status === "Draft" || status === "Completed")) {
    updates.status = status === "Draft" ? "Cancelled" : "Completed";
    updates.archived_at = now;
  } else if (action === "delete_draft" && status === "Draft") {
    const { error } = await createAdminSupabase()
      .from("projects")
      .update({ status: "Cancelled", archived_at: now })
      .eq("id", existing.campaign.project_id)
      .eq("client_id", resolvedWorkspace.clientId);
    if (error) throw error;
    return { deleted: true };
  } else {
    throw Object.assign(new Error("This campaign action is not available for the current status."), { status: 400 });
  }
  const { data, error } = await createAdminSupabase()
    .from("projects")
    .update(updates)
    .eq("id", existing.campaign.project_id)
    .eq("client_id", resolvedWorkspace.clientId)
    .select("id,client_id,project_name:name,campaign_name:campaign,brand_name:brand,status,start_date,end_date,regions_covered,target_quantity,assigned_installers,primary_target_region,primary_target_state,archived_at,created_at")
    .single();
  if (error) throw error;
  return { campaign: normalizeProjectCampaign(normalizeCampaignProjectRow(data as Record<string, unknown>), existing.campaign.compatibility_campaign_id ? legacyAnchor(existing.campaign as unknown as Record<string, unknown>) : null, { actualDeployments: existing.campaign.actualDeployments, approved: existing.campaign.approved, pending: existing.campaign.pending, rejected: existing.campaign.rejected, gpsVerified: existing.campaign.gpsVerified }) };
}

import { createAdminSupabase } from "@/lib/supabaseAdmin";
import {
  resolveCustomerWorkspaceContext,
  type CustomerWorkspaceContext,
} from "@/lib/workspace/customerAdmin";
import { ensureWorkspaceCampaignCompatibilityAnchor, getWorkspaceCampaign } from "@/lib/workspace/campaigns";
import { notificationsEnabled } from "@/lib/notifications";

export const CAMPAIGN_LOCATION_STATUSES = ["assigned", "ready", "in_progress", "completed", "excluded"] as const;
export type CampaignLocationStatus = (typeof CAMPAIGN_LOCATION_STATUSES)[number];

export type CampaignLocationFilters = {
  search?: string | null;
  state?: string | null;
  region?: string | null;
  city?: string | null;
  status?: string | null;
  assigned?: "all" | "assigned" | "unassigned" | null;
  sort?: string | null;
  page?: number | null;
};

export type CampaignLocationRow = {
  assignmentId: string | null;
  locationId: string;
  campaignLocationId: string | null;
  outletName: string;
  outletCode: string | null;
  externalId: string | null;
  address: string | null;
  state: string | null;
  region: string | null;
  city: string | null;
  targetQuantity: number;
  assignmentStatus: CampaignLocationStatus | "unassigned";
  assignedAt: string | null;
  readiness: string;
  hasActivity: boolean;
  assignedAgencyId: string | null;
  assignedAgencyName: string | null;
  assignedInstallerId: string | null;
  assignedInstallerName: string | null;
  fieldAssignmentStatus: string | null;
};

type AssignmentRow = {
  id: string;
  client_id: string;
  workspace_id: string;
  product_key: string;
  campaign_id: string;
  project_id: string;
  deployment_location_id: string;
  target_quantity: number;
  assignment_status: string;
  assigned_at: string;
  exclusion_reason: string | null;
};

type FieldAssignmentRow = {
  id: string;
  campaign_location_id: string | null;
  deployment_location_id: string | null;
  agency_id: string | null;
  installer_id: string | null;
  assignment_status: string;
  agencies?: { agency_name?: string | null } | null;
  installers?: { installer_name?: string | null } | null;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

export function campaignLocationPerformanceLog(input: { route: string; step: string; elapsedMs: number; totalElapsedMs?: number | null }) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[campaign-location-performance]", {
    route: input.route,
    step: input.step,
    elapsedMs: input.elapsedMs,
    totalElapsedMs: input.totalElapsedMs ?? input.elapsedMs,
  });
}

async function notifyCampaignLocationEvent(input: { clientId: string; projectId: string; title: string; message: string; status: string }) {
  if (!notificationsEnabled()) return;
  await createAdminSupabase().from("notification_events").insert({
    client_id: input.clientId,
    project_id: input.projectId,
    title: input.title,
    message: input.message,
    status: input.status,
  });
}

async function workspace(workspaceContext?: CustomerWorkspaceContext) {
  return workspaceContext ?? await resolveCustomerWorkspaceContext();
}

async function campaignForWorkspace(campaignId: string, workspaceContext: CustomerWorkspaceContext) {
  const result = await getWorkspaceCampaign(campaignId, workspaceContext);
  if (!result || result.campaign.client_id !== workspaceContext.clientId) {
    throw Object.assign(new Error("Campaign not found."), { status: 404 });
  }
  return result.campaign;
}

function statusValue(value: unknown): CampaignLocationStatus {
  const raw = text(value) as CampaignLocationStatus;
  return CAMPAIGN_LOCATION_STATUSES.includes(raw) ? raw : "assigned";
}

function locationName(location: Record<string, unknown>) {
  return text(location.outlet_name) || text(location.location_name) || text(location.external_id) || text(location.outlet_code) || "Deployment location";
}

function locationRegion(location: Record<string, unknown>) {
  return text(location.region) || text(location.state_region) || null;
}

function locationCity(location: Record<string, unknown>) {
  return text(location.city) || text(location.lga) || null;
}

function rowReadiness(row: CampaignLocationRow) {
  if (row.assignmentStatus === "excluded") return "Excluded";
  const hasAddress = Boolean(row.address);
  const hasGeography = Boolean(row.state || row.city);
  if (hasAddress && hasGeography) return "Ready";
  return "Needs details";
}

function mergeLocation(location: Record<string, unknown>, assignment?: AssignmentRow | null, hasActivity = false, fieldAssignment?: FieldAssignmentRow | null): CampaignLocationRow {
  const row: CampaignLocationRow = {
    assignmentId: text(assignment?.id) || null,
    locationId: text(location.id),
    campaignLocationId: text(assignment?.id) || null,
    outletName: locationName(location),
    outletCode: text(location.outlet_code) || null,
    externalId: text(location.external_id) || null,
    address: text(location.address) || null,
    state: text(location.state) || null,
    region: locationRegion(location),
    city: locationCity(location),
    targetQuantity: numberValue(assignment?.target_quantity, assignment ? 1 : 0),
    assignmentStatus: assignment ? statusValue(assignment.assignment_status) : "unassigned",
    assignedAt: text(assignment?.assigned_at) || null,
    readiness: "Needs details",
    hasActivity,
    assignedAgencyId: text(fieldAssignment?.agency_id) || null,
    assignedAgencyName: text(fieldAssignment?.agencies?.agency_name) || null,
    assignedInstallerId: text(fieldAssignment?.installer_id) || null,
    assignedInstallerName: text(fieldAssignment?.installers?.installer_name) || null,
    fieldAssignmentStatus: text(fieldAssignment?.assignment_status) || null,
  };
  row.readiness = rowReadiness(row);
  return row;
}

function filterRows(rows: CampaignLocationRow[], filters: CampaignLocationFilters) {
  const search = text(filters.search).toLowerCase();
  const state = text(filters.state).toLowerCase();
  const region = text(filters.region).toLowerCase();
  const city = text(filters.city).toLowerCase();
  const status = text(filters.status);
  const assigned = filters.assigned ?? "all";
  return rows.filter((row) => {
    const haystack = [row.outletName, row.outletCode, row.externalId, row.address, row.state, row.region, row.city].join(" ").toLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (state && text(row.state).toLowerCase() !== state) return false;
    if (region && text(row.region).toLowerCase() !== region) return false;
    if (city && text(row.city).toLowerCase() !== city) return false;
    if (status && row.assignmentStatus !== status) return false;
    if (assigned === "assigned" && !row.assignmentId) return false;
    if (assigned === "unassigned" && row.assignmentId) return false;
    return true;
  });
}

function sortRows(rows: CampaignLocationRow[], sort: string | null | undefined) {
  const key = text(sort) || "name";
  return [...rows].sort((a, b) => {
    if (key === "state") return text(a.state).localeCompare(text(b.state)) || a.outletName.localeCompare(b.outletName);
    if (key === "status") return a.assignmentStatus.localeCompare(b.assignmentStatus);
    if (key === "assigned") return text(b.assignedAt).localeCompare(text(a.assignedAt));
    return a.outletName.localeCompare(b.outletName);
  });
}

export async function getCampaignLocationDashboard(campaignId: string, filters: CampaignLocationFilters = {}, workspaceContext?: CustomerWorkspaceContext) {
  const totalStartedAt = nowMs();
  const resolvedWorkspace = await workspace(workspaceContext);
  campaignLocationPerformanceLog({ route: "/workspace/admin/campaigns/[id]", step: "Context", elapsedMs: elapsedMs(totalStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  const campaignStartedAt = nowMs();
  const campaign = await campaignForWorkspace(campaignId, resolvedWorkspace);
  campaignLocationPerformanceLog({ route: "/workspace/admin/campaigns/[id]", step: "Campaign validation", elapsedMs: elapsedMs(campaignStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });

  const supabase = createAdminSupabase();
  const queryStartedAt = nowMs();
  const [{ data: locations, error: locationError }, { data: assignments, error: assignmentError }, { data: activityRows }, { data: agencies }, { data: installers }, { data: fieldAssignments, error: fieldAssignmentError }] = await Promise.all([
    supabase
      .from("deployment_locations")
      .select("id,state,outlet_name,location_name,address,outlet_code,external_id,region,state_region,city,lga")
      .eq("client_id", resolvedWorkspace.clientId)
      .eq("workspace_id", resolvedWorkspace.clientId)
      .eq("product_key", resolvedWorkspace.productKey)
      .order("state", { ascending: true })
      .order("outlet_name", { ascending: true })
      .limit(500),
    supabase
      .from("workspace_campaign_locations")
      .select("id,client_id,workspace_id,product_key,campaign_id,project_id,deployment_location_id,target_quantity,assignment_status,assigned_at,exclusion_reason")
      .eq("client_id", resolvedWorkspace.clientId)
      .eq("project_id", campaign.project_id),
    supabase
      .from("submissions")
      .select("selected_outlet_id")
      .eq("client_id", resolvedWorkspace.clientId)
      .eq("project_id", campaign.project_id)
      .not("selected_outlet_id", "is", null)
      .limit(500),
    supabase
      .from("agencies")
      .select("id,agency_name,status")
      .eq("client_id", resolvedWorkspace.clientId)
      .neq("status", "Archived")
      .order("agency_name", { ascending: true }),
    supabase
      .from("installers")
      .select("id,installer_name,agency_id,availability_status,state,region")
      .eq("client_id", resolvedWorkspace.clientId)
      .neq("availability_status", "archived")
      .order("installer_name", { ascending: true }),
    supabase
      .from("workspace_field_assignments")
      .select("id,campaign_location_id,deployment_location_id,agency_id,installer_id,assignment_status,agencies(agency_name),installers(installer_name)")
      .eq("client_id", resolvedWorkspace.clientId)
      .eq("project_id", campaign.project_id)
      .is("removed_at", null),
  ]);
  campaignLocationPerformanceLog({ route: "/workspace/admin/campaigns/[id]", step: "Eligible location query", elapsedMs: elapsedMs(queryStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  if (locationError) throw locationError;
  if (assignmentError) throw assignmentError;
  if (fieldAssignmentError) throw fieldAssignmentError;

  const assignmentByLocation = new Map((assignments ?? []).map((row) => [text((row as AssignmentRow).deployment_location_id), row as AssignmentRow]));
  const fieldAssignmentByLocation = new Map((fieldAssignments ?? []).map((row) => [text((row as FieldAssignmentRow).deployment_location_id), row as FieldAssignmentRow]));
  const activityLocationIds = new Set((activityRows ?? []).map((row) => text((row as Record<string, unknown>).selected_outlet_id)).filter(Boolean));
  const rows = (locations ?? []).map((location) => mergeLocation(location as Record<string, unknown>, assignmentByLocation.get(text((location as Record<string, unknown>).id)), activityLocationIds.has(text((location as Record<string, unknown>).id)), fieldAssignmentByLocation.get(text((location as Record<string, unknown>).id))));
  const assignedRows = rows.filter((row) => row.assignmentId && row.assignmentStatus !== "excluded");
  const excludedRows = rows.filter((row) => row.assignmentStatus === "excluded");
  const filteredRows = sortRows(filterRows(rows, filters), filters.sort);
  const pageSize = 25;
  const page = Math.max(1, numberValue(filters.page, 1));
  const pages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
  const assignedTarget = assignedRows.reduce((total, row) => total + row.targetQuantity, 0);

  return {
    workspace: resolvedWorkspace,
    campaign,
    locations: pagedRows,
    allEligibleCount: rows.length,
    pagination: { page, pageSize, total: filteredRows.length, pages },
    filters: {
      search: text(filters.search),
      state: text(filters.state),
      region: text(filters.region),
      city: text(filters.city),
      status: text(filters.status),
      assigned: filters.assigned ?? "all",
      sort: text(filters.sort) || "name",
    },
    summary: {
      assignedLocations: assignedRows.length,
      ready: assignedRows.filter((row) => row.readiness === "Ready").length,
      inProgress: rows.filter((row) => row.assignmentStatus === "in_progress").length,
      completed: rows.filter((row) => row.assignmentStatus === "completed").length,
      excluded: excludedRows.length,
      campaignTarget: campaign.target_quantity,
      assignedTarget,
      remainingCampaignTarget: Math.max(0, campaign.target_quantity - assignedTarget),
      targetWarning: assignedTarget < campaign.target_quantity
        ? "Campaign target is higher than the number of assigned locations."
        : assignedTarget > campaign.target_quantity
          ? "Assigned locations exceed the campaign target."
          : null,
      assignedAgencies: new Set((fieldAssignments ?? []).map((row) => text((row as FieldAssignmentRow).agency_id)).filter(Boolean)).size,
      assignedInstallers: new Set((fieldAssignments ?? []).map((row) => text((row as FieldAssignmentRow).installer_id)).filter(Boolean)).size,
    },
    fieldResources: {
      agencies: (agencies ?? []).map((row) => ({ id: text((row as Record<string, unknown>).id), agencyName: text((row as Record<string, unknown>).agency_name), status: text((row as Record<string, unknown>).status) })),
      installers: (installers ?? []).map((row) => ({ id: text((row as Record<string, unknown>).id), installerName: text((row as Record<string, unknown>).installer_name), agencyId: text((row as Record<string, unknown>).agency_id) || null, status: text((row as Record<string, unknown>).availability_status) || "available", state: text((row as Record<string, unknown>).state) || null, region: text((row as Record<string, unknown>).region) || null })),
    },
  };
}

async function validateLocationIds(locationIds: string[], workspaceContext: CustomerWorkspaceContext) {
  const ids = Array.from(new Set(locationIds.map(text).filter(Boolean)));
  if (ids.length === 0) return [];
  const { data, error } = await createAdminSupabase()
    .from("deployment_locations")
    .select("id")
    .in("id", ids)
    .eq("client_id", workspaceContext.clientId)
    .eq("workspace_id", workspaceContext.clientId)
    .eq("product_key", workspaceContext.productKey);
  if (error) throw error;
  const found = new Set((data ?? []).map((row) => text((row as Record<string, unknown>).id)));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) throw Object.assign(new Error("Select deployment locations from this workspace."), { status: 400 });
  return ids;
}

export async function assignCampaignLocations(input: { campaignId: string; locationIds?: string[]; assignAll?: boolean; targetQuantityPerLocation?: number | string | null }) {
  const totalStartedAt = nowMs();
  const resolvedWorkspace = await workspace();
  campaignLocationPerformanceLog({ route: "/api/workspace/campaigns/[id]/locations", step: "Context", elapsedMs: elapsedMs(totalStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  const campaignStartedAt = nowMs();
  const campaign = await campaignForWorkspace(input.campaignId, resolvedWorkspace);
  if (campaign.customerStatus !== "Draft") throw Object.assign(new Error("Locations can only be assigned while the campaign is in Draft."), { status: 400 });
  const assignmentCampaignId = await ensureWorkspaceCampaignCompatibilityAnchor(campaign, resolvedWorkspace);
  campaignLocationPerformanceLog({ route: "/api/workspace/campaigns/[id]/locations", step: "Campaign validation", elapsedMs: elapsedMs(campaignStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });

  const supabase = createAdminSupabase();
  let locationIds = input.locationIds ?? [];
  if (input.assignAll) {
    const queryStartedAt = nowMs();
    const { data, error } = await supabase
      .from("deployment_locations")
      .select("id")
      .eq("client_id", resolvedWorkspace.clientId)
      .eq("workspace_id", resolvedWorkspace.clientId)
      .eq("product_key", resolvedWorkspace.productKey)
      .limit(5000);
    if (error) throw error;
    locationIds = (data ?? []).map((row) => text((row as Record<string, unknown>).id));
    campaignLocationPerformanceLog({ route: "/api/workspace/campaigns/[id]/locations", step: "Eligible location query", elapsedMs: elapsedMs(queryStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  }
  const validIds = await validateLocationIds(locationIds, resolvedWorkspace);
  if (validIds.length === 0) throw Object.assign(new Error("Select at least one deployment location."), { status: 400 });

  const persistenceStartedAt = nowMs();
  const targetQuantity = Math.max(1, numberValue(input.targetQuantityPerLocation, 1));
  const rows = validIds.map((locationId) => ({
    client_id: resolvedWorkspace.clientId,
    workspace_id: resolvedWorkspace.clientId,
    product_key: resolvedWorkspace.productKey,
    campaign_id: assignmentCampaignId,
    project_id: campaign.project_id,
    deployment_location_id: locationId,
    target_quantity: targetQuantity,
    assignment_status: "assigned",
    assigned_by: resolvedWorkspace.userId,
  }));
  const { data, error } = await supabase
    .from("workspace_campaign_locations")
    .upsert(rows, { onConflict: "campaign_id,deployment_location_id" })
    .select("id");
  if (error) throw error;
  const { data: assignedRows } = await supabase
    .from("workspace_campaign_locations")
    .select("deployment_location_id")
    .eq("client_id", resolvedWorkspace.clientId)
    .eq("project_id", campaign.project_id)
    .neq("assignment_status", "excluded");
  await supabase
    .from("workspace_campaigns")
    .update({ deployment_location_ids: (assignedRows ?? []).map((row) => text((row as Record<string, unknown>).deployment_location_id)).filter(Boolean) })
    .eq("id", assignmentCampaignId)
    .eq("client_id", resolvedWorkspace.clientId);
  void notifyCampaignLocationEvent({
    clientId: resolvedWorkspace.clientId,
    projectId: campaign.project_id,
    title: "Locations Assigned",
    message: `${validIds.length} locations assigned to ${campaign.campaign_name}.`,
    status: "campaign_locations_assigned",
  }).catch((error) => console.warn("[campaign-location-performance]", { step: "Audit", result: "failed", error: error instanceof Error ? error.message : "Unknown error" }));
  campaignLocationPerformanceLog({ route: "/api/workspace/campaigns/[id]/locations", step: "Assignment persistence", elapsedMs: elapsedMs(persistenceStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  campaignLocationPerformanceLog({ route: "/api/workspace/campaigns/[id]/locations", step: "Total", elapsedMs: elapsedMs(totalStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  return { assigned: data?.length ?? validIds.length, locationIds: validIds };
}

export async function removeCampaignLocation(input: { campaignId: string; assignmentId?: string | null; locationId?: string | null; exclusionReason?: string | null }) {
  const totalStartedAt = nowMs();
  const resolvedWorkspace = await workspace();
  const campaign = await campaignForWorkspace(input.campaignId, resolvedWorkspace);
  if (campaign.customerStatus !== "Draft") throw Object.assign(new Error("Locations can only be changed while the campaign is in Draft."), { status: 400 });
  const locationId = text(input.locationId);
  const assignmentId = text(input.assignmentId);
  const { data: assignment, error: assignmentError } = await createAdminSupabase()
    .from("workspace_campaign_locations")
    .select("id,deployment_location_id")
    .eq("client_id", resolvedWorkspace.clientId)
    .eq("project_id", campaign.project_id)
    .or(`id.eq.${assignmentId},deployment_location_id.eq.${locationId}`)
    .maybeSingle();
  if (assignmentError) throw assignmentError;
  if (!assignment) throw Object.assign(new Error("Location assignment not found."), { status: 404 });

  const resolvedLocationId = text((assignment as Record<string, unknown>).deployment_location_id);
  const { count } = await createAdminSupabase()
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("client_id", resolvedWorkspace.clientId)
    .eq("project_id", campaign.project_id)
    .eq("selected_outlet_id", resolvedLocationId);

  const mutationStartedAt = nowMs();
  if ((count ?? 0) > 0) {
    const { error } = await createAdminSupabase()
      .from("workspace_campaign_locations")
      .update({
        assignment_status: "excluded",
        exclusion_reason: text(input.exclusionReason) || "Excluded by workspace administrator",
        updated_at: new Date().toISOString(),
      })
      .eq("id", text((assignment as Record<string, unknown>).id))
      .eq("client_id", resolvedWorkspace.clientId);
    if (error) throw error;
    void notifyCampaignLocationEvent({
      clientId: resolvedWorkspace.clientId,
      projectId: campaign.project_id,
      title: "Location Excluded",
      message: `A location was excluded from ${campaign.campaign_name}. Existing activity was preserved.`,
      status: "campaign_location_excluded",
    }).catch((error) => console.warn("[campaign-location-performance]", { step: "Audit", result: "failed", error: error instanceof Error ? error.message : "Unknown error" }));
    campaignLocationPerformanceLog({ route: "/api/workspace/campaigns/[id]/locations", step: "Removal/exclusion", elapsedMs: elapsedMs(mutationStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
    return { excluded: true };
  }

  const { error } = await createAdminSupabase()
    .from("workspace_campaign_locations")
    .delete()
    .eq("id", text((assignment as Record<string, unknown>).id))
    .eq("client_id", resolvedWorkspace.clientId);
  if (error) throw error;
  void notifyCampaignLocationEvent({
    clientId: resolvedWorkspace.clientId,
    projectId: campaign.project_id,
    title: "Location Removed",
    message: `A location assignment was removed from ${campaign.campaign_name}.`,
    status: "campaign_location_removed",
  }).catch((error) => console.warn("[campaign-location-performance]", { step: "Audit", result: "failed", error: error instanceof Error ? error.message : "Unknown error" }));
  campaignLocationPerformanceLog({ route: "/api/workspace/campaigns/[id]/locations", step: "Removal/exclusion", elapsedMs: elapsedMs(mutationStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  return { removed: true };
}

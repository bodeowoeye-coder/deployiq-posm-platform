import { getCurrentAccessToken } from "@/lib/auth";
import {
  applySubmissionWorkflowTransition,
  buildCoreSubmissionPayload,
  canonicalGpsStatus,
  distanceMetersBetween,
  getSubmissionStorageBucket,
  numberOrNull,
  persistCoreSubmission,
  runSubmissionOcrAndBrandReview,
  text,
  uploadSubmissionEvidence,
} from "@/lib/core/submissionService";
import { notificationsEnabled } from "@/lib/notifications";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { createUserSupabase } from "@/lib/supabaseUser";
import {
  resolveCustomerWorkspaceContext,
  type CustomerWorkspaceContext,
} from "@/lib/workspace/customerAdmin";
import {
  buildWorkspaceMapMetrics,
  filterWorkspaceMapRows,
  normalizeWorkspaceMapPoint,
  resolveLocationState,
  type WorkspaceMapPoint,
} from "@/lib/workspace/deploymentMap";

type Row = Record<string, unknown>;

export type DeploymentExecutionRole = "installer" | "supervisor" | "customer_admin";
export type GpsStatus = "Verified" | "Approximate" | "Unavailable";

export type DeploymentAssignment = {
  id: string;
  campaignId: string;
  projectId: string;
  campaignLocationId: string | null;
  deploymentLocationId: string | null;
  campaign: string;
  project: string;
  outlet: string;
  address: string | null;
  state: string | null;
  priority: string;
  dueDate: string | null;
  status: string;
  target: number;
  instructions: string;
  photosRequired: string[];
  approvalRequirements: string[];
  previousSubmissions: number;
  assignedAgencyId: string | null;
  assignedAgency: string | null;
  assignedInstallerId: string | null;
  assignedInstaller: string | null;
  coordinates: { latitude: number | null; longitude: number | null };
};

export type DeploymentSubmissionInput = {
  assignmentId?: string | null;
  localSubmissionId?: string | null;
  arrivalLatitude?: number | string | null;
  arrivalLongitude?: number | string | null;
  expectedLatitude?: number | string | null;
  expectedLongitude?: number | string | null;
  notes?: string | null;
  beforePhotoUrl?: string | null;
  afterPhotoUrl?: string | null;
  image?: File | null;
  additionalPhotoUrls?: string[] | string | null;
  imageUrl?: string | null;
  imagePath?: string | null;
  capturedAt?: string | null;
  offlineSyncStatus?: string | null;
  submitAnyway?: boolean | null;
};

function textArray(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
  const raw = text(value);
  return raw ? raw.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function elapsedMs(startedAt: number) {
  return Math.round((nowMs() - startedAt) * 10) / 10;
}

export function deploymentPerformanceLog(input: { route: string; step: string; elapsedMs: number; totalElapsedMs?: number | null }) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[deployment-performance]", {
    route: input.route,
    step: input.step,
    elapsedMs: input.elapsedMs,
    totalElapsedMs: input.totalElapsedMs ?? input.elapsedMs,
  });
}

export function gpsStatusFor(distanceMeters: number | null): GpsStatus {
  return canonicalGpsStatus({ distanceMeters });
}

async function currentUser() {
  const accessToken = await getCurrentAccessToken();
  if (!accessToken) throw Object.assign(new Error("Sign in to view deployment work."), { status: 401 });
  const { data, error } = await createUserSupabase(accessToken).auth.getUser(accessToken);
  if (error || !data.user) throw Object.assign(new Error("Sign in to view deployment work."), { status: 401 });
  return { id: data.user.id, email: data.user.email ?? null };
}

async function resolveExecutionContext(): Promise<{
  userId: string;
  email: string | null;
  clientId: string;
  productKey: string;
  role: DeploymentExecutionRole;
  installerId: string | null;
  installerName: string | null;
}> {
  const startedAt = nowMs();
  const user = await currentUser();
  const supabase = createAdminSupabase();
  const [{ data: installer }, { data: membership, error: membershipError }] = await Promise.all([
    supabase
      .from("installers")
      .select("id,client_id,workspace_id,installer_name,email,availability_status")
      .eq("user_id", user.id)
      .not("client_id", "is", null)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("workspace_memberships")
      .select("client_id,role_key,status")
      .eq("user_id", user.id)
      .eq("status", "active")
      .in("role_key", ["customer_admin", "workspace_owner", "workspace_manager", "supervisor", "field_coordinator", "agency_manager", "installer", "installer_field_agent"])
      .limit(1)
      .maybeSingle(),
  ]);
  if (membershipError) throw membershipError;
  const clientId = text((installer as Row | null)?.client_id) || text((membership as Row | null)?.client_id);
  if (!clientId) throw Object.assign(new Error("No deployments have been assigned yet."), { status: 403 });
  const roleKey = text((membership as Row | null)?.role_key);
  const role: DeploymentExecutionRole = roleKey === "customer_admin" || roleKey === "workspace_owner" || roleKey === "workspace_manager"
    ? "customer_admin"
    : roleKey === "supervisor" || roleKey === "field_coordinator" || roleKey === "agency_manager"
      ? "supervisor"
      : "installer";
  const { data: entitlement } = await supabase
    .from("product_entitlements")
    .select("product_key,status")
    .eq("client_id", clientId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  deploymentPerformanceLog({ route: "/workspace/installer", step: "Assignment load", elapsedMs: elapsedMs(startedAt), totalElapsedMs: elapsedMs(startedAt) });
  return {
    userId: user.id,
    email: user.email,
    clientId,
    productKey: text((entitlement as Row | null)?.product_key) || "retail",
    role,
    installerId: text((installer as Row | null)?.id) || null,
    installerName: text((installer as Row | null)?.installer_name) || user.email,
  };
}

async function resolveCustomerAdminContext() {
  return await resolveCustomerWorkspaceContext();
}

function locationName(location: Row | null | undefined) {
  return text(location?.outlet_name) || text(location?.location_name) || text(location?.external_id) || text(location?.outlet_code) || "Deployment location";
}

function normalizeAssignment(row: Row): DeploymentAssignment {
  const campaign = (row.workspace_campaigns ?? {}) as Row;
  const project = (row.projects ?? {}) as Row;
  const location = (row.deployment_locations ?? {}) as Row;
  const agency = (row.agencies ?? {}) as Row;
  const installer = (row.installers ?? {}) as Row;
  return {
    id: text(row.id),
    campaignId: text(row.campaign_id),
    projectId: text(row.project_id),
    campaignLocationId: text(row.campaign_location_id) || null,
    deploymentLocationId: text(row.deployment_location_id) || null,
    campaign: text(campaign.campaign_name) || "Campaign",
    project: text(project.project_name) || "Project",
    outlet: locationName(location),
    address: text(location.address) || null,
    state: text(location.state) || null,
    priority: "Normal",
    dueDate: text(campaign.end_date) || null,
    status: text(row.assignment_status) || "assigned",
    target: Number(row.target_quantity ?? 1),
    instructions: text(campaign.description) || "Complete the deployment evidence steps for this assigned location.",
    photosRequired: ["Before", "After"],
    approvalRequirements: ["GPS check", "Photo evidence", "Manager approval"],
    previousSubmissions: Number(row.previous_submission_count ?? 0),
    assignedAgencyId: text(row.agency_id) || null,
    assignedAgency: text(agency.agency_name) || null,
    assignedInstallerId: text(row.installer_id) || null,
    assignedInstaller: text(installer.installer_name) || null,
    coordinates: {
      latitude: numberOrNull(location.latitude ?? location.gps_latitude),
      longitude: numberOrNull(location.longitude ?? location.gps_longitude),
    },
  };
}

function assignmentQuery(clientId: string) {
  return createAdminSupabase()
    .from("workspace_field_assignments")
    .select("id,client_id,workspace_id,product_key,campaign_id,project_id,campaign_location_id,deployment_location_id,agency_id,installer_id,assignment_status,target_quantity,assigned_at,workspace_campaigns(campaign_name,brand_name,description,end_date,status),projects(project_name:name),deployment_locations(outlet_name,location_name,address,state,outlet_code,external_id,latitude,longitude,gps_latitude,gps_longitude),agencies(agency_name),installers(installer_name)")
    .eq("client_id", clientId)
    .is("removed_at", null)
    .order("assigned_at", { ascending: false })
    .limit(500);
}

export async function getInstallerAssignments() {
  const totalStartedAt = nowMs();
  const context = await resolveExecutionContext();
  const query = assignmentQuery(context.clientId);
  const { data, error } = context.role === "installer" && context.installerId
    ? await query.eq("installer_id", context.installerId)
    : await query;
  if (error) throw error;
  const rows = ((data ?? []) as Row[]).map(normalizeAssignment);
  const today = new Date().toISOString().slice(0, 10);
  const pending = rows.filter((row) => ["assigned", "ready", "in_progress"].includes(row.status));
  const completed = rows.filter((row) => row.status === "completed");
  const submissions = await createAdminSupabase()
    .from("submissions")
    .select("id,status,gps_status")
    .eq("client_id", context.clientId)
    .eq("installer_id", context.installerId || "")
    .limit(500);
  const submissionRows = (submissions.data ?? []) as Row[];
  deploymentPerformanceLog({ route: "/workspace/installer", step: "Total", elapsedMs: elapsedMs(totalStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  return {
    context,
    assignments: rows,
    kpis: [
      { label: "Assigned Today", value: rows.filter((row) => row.dueDate === today || row.status === "assigned").length },
      { label: "Pending", value: pending.length },
      { label: "Completed", value: completed.length },
      { label: "Rejected", value: submissionRows.filter((row) => text(row.status) === "Rejected").length },
      { label: "Awaiting Approval", value: submissionRows.filter((row) => text(row.status) === "Pending" || text(row.status) === "Flagged").length },
      { label: "GPS Issues", value: submissionRows.filter((row) => text(row.gps_status) === "Approximate" || text(row.gps_status) === "Unavailable").length },
    ],
    performance: performanceFromSubmissions(submissionRows),
  };
}

export async function getDeploymentAssignment(assignmentId: string) {
  const context = await resolveExecutionContext();
  const query = assignmentQuery(context.clientId);
  const { data, error } = context.role === "installer" && context.installerId
    ? await query.eq("id", assignmentId).eq("installer_id", context.installerId).maybeSingle()
    : await query.eq("id", assignmentId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const assignment = normalizeAssignment(data as Row);
  const { data: submissions } = await createAdminSupabase()
    .from("submissions")
    .select("id,status,submitted_at,rejection_reason,correction_notes")
    .eq("client_id", context.clientId)
    .eq("field_assignment_id", assignment.id)
    .order("submitted_at", { ascending: false })
    .limit(20);
  return { context, assignment, previousSubmissions: (submissions ?? []) as Row[] };
}

async function notifyDeploymentEvent(input: { clientId: string; projectId?: string | null; title: string; message: string; status: string }) {
  if (!notificationsEnabled()) return;
  await createAdminSupabase().from("notification_events").insert({
    client_id: input.clientId,
    project_id: input.projectId || null,
    title: input.title,
    message: input.message,
    status: input.status,
  });
}

export async function submitDeploymentEvidence(input: DeploymentSubmissionInput) {
  const totalStartedAt = nowMs();
  const detail = await getDeploymentAssignment(text(input.assignmentId));
  if (!detail) throw Object.assign(new Error("Assignment not found."), { status: 404 });
  if (detail.context.role === "installer" && !detail.context.installerId) throw Object.assign(new Error("Installer profile is required."), { status: 403 });
  const assignment = detail.assignment;
  const supabase = createAdminSupabase();
  let imageUrl = text(input.imageUrl) || text(input.afterPhotoUrl) || text(input.beforePhotoUrl);
  let imagePath = text(input.imagePath) || "workspace/deployment-evidence";
  if (input.image instanceof File) {
    const upload = await uploadSubmissionEvidence({
      supabase,
      bucket: getSubmissionStorageBucket(),
      image: input.image,
      pathPrefix: "workspace/deployment-evidence",
    });
    imageUrl = upload.imageUrl;
    imagePath = upload.imagePath;
  }
  const beforePhotoUrl = text(input.beforePhotoUrl) || imageUrl;
  const afterPhotoUrl = text(input.afterPhotoUrl) || imageUrl;
  if (!imageUrl || !beforePhotoUrl || !afterPhotoUrl) throw Object.assign(new Error("Before and after photo evidence is required."), { status: 400 });
  const expected = assignment.coordinates;
  const captured = { latitude: numberOrNull(input.arrivalLatitude), longitude: numberOrNull(input.arrivalLongitude) };
  const distance = distanceMetersBetween(captured, expected);
  const gpsStatus = gpsStatusFor(distance);
  const ocr = imageUrl ? await runSubmissionOcrAndBrandReview({ supabase, imageUrl, selectedBrandName: assignment.campaign }) : null;
  const evidencePayload = {
    beforePhotoUrl,
    afterPhotoUrl,
    additionalPhotoUrls: textArray(input.additionalPhotoUrls),
    notes: text(input.notes) || null,
    gpsStatus,
    gpsDistanceMeters: distance,
    offlineSyncStatus: text(input.offlineSyncStatus) || "synced",
  };
  const payload = buildCoreSubmissionPayload({
    localSubmissionId: text(input.localSubmissionId) || null,
    clientId: detail.context.clientId,
    projectId: assignment.projectId,
    projectName: assignment.project,
    brandName: assignment.campaign,
    installerUserId: detail.context.userId,
    installerName: detail.context.installerName,
    installerEmail: detail.context.email,
    selectedOutletId: assignment.deploymentLocationId,
    selectedOutletName: assignment.outlet,
    selectedOutletAddress: assignment.address,
    selectedOutletState: assignment.state,
    latitude: captured.latitude,
    longitude: captured.longitude,
    imageUrl,
    imagePath,
    capturedAt: text(input.capturedAt) || new Date().toISOString(),
    status: gpsStatus === "Verified" ? "Pending" : "Flagged",
    ocr,
    orchestration: {
      workspace_id: detail.context.clientId,
      campaign_id: assignment.campaignId,
      campaign_location_id: assignment.campaignLocationId,
      field_assignment_id: assignment.id,
      agency_id: assignment.assignedAgencyId,
      installer_id: detail.context.installerId,
      gps_status: gpsStatus,
      gps_distance_meters: distance,
      evidence_payload: evidencePayload,
      offline_sync_status: text(input.offlineSyncStatus) || "synced",
      deployment_started_at: text(input.capturedAt) || new Date().toISOString(),
      deployment_completed_at: new Date().toISOString(),
    },
  });
  const startedAt = nowMs();
  const data = await persistCoreSubmission(supabase, payload);
  deploymentPerformanceLog({ route: "/api/workspace/installer/assignments/[id]/submit", step: "Submission", elapsedMs: elapsedMs(startedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  await supabase
    .from("workspace_field_assignments")
    .update({ assignment_status: "completed", updated_at: new Date().toISOString() })
    .eq("id", assignment.id)
    .eq("client_id", detail.context.clientId);
  void notifyDeploymentEvent({
    clientId: detail.context.clientId,
    projectId: assignment.projectId,
    title: "Submission Completed",
    message: `${assignment.outlet} has been submitted for approval.`,
    status: "submission_completed",
  }).catch((error) => console.warn("[deployment-performance]", { step: "Audit", result: "failed", error: error instanceof Error ? error.message : "Unknown error" }));
  deploymentPerformanceLog({ route: "/api/workspace/installer/assignments/[id]/submit", step: "Total", elapsedMs: elapsedMs(totalStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  return { submission: data, gpsStatus, gpsDistanceMeters: distance };
}

function performanceFromSubmissions(submissions: Row[]) {
  const completed = submissions.filter((row) => text(row.status) === "Approved").length;
  const pending = submissions.filter((row) => ["Pending", "Flagged"].includes(text(row.status))).length;
  const rejected = submissions.filter((row) => text(row.status) === "Rejected" || text(row.status) === "Correction Requested").length;
  const gpsOk = submissions.filter((row) => text(row.gps_status) === "Verified" || (row.gps_latitude && row.gps_longitude)).length;
  return {
    completed,
    pending,
    rejected,
    approvalPercent: submissions.length ? Math.round((completed / submissions.length) * 100) : 0,
    gpsPercent: submissions.length ? Math.round((gpsOk / submissions.length) * 100) : 0,
    averageCompletionTime: "Not available",
  };
}

function supabaseErrorDiagnostic(error: unknown, step: string) {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return {
    step,
    code: typeof record.code === "string" ? record.code : null,
    message: error instanceof Error ? error.message : typeof record.message === "string" ? record.message : "Unknown Supabase error",
    details: typeof record.details === "string" ? record.details : null,
    hint: typeof record.hint === "string" ? record.hint : null,
  };
}

function normalizeWorkspaceSubmission(row: Row): Row {
  return {
    ...row,
    location_state: text(row.resolved_state) || text(row.installer_state) || text(row.state_region) || null,
  };
}

export async function getWorkspaceDeploymentSubmissions(filters: { projectId?: string | null } = {}) {
  const workspace = await resolveCustomerAdminContext();
  const { data, error } = await createAdminSupabase()
    .from("submissions")
    .select("id,project_id,status,project_name,brand_name,installer_name,selected_outlet_name,selected_outlet_address,resolved_state,installer_state,state_region,gps_status,gps_distance_meters,image_url,submitted_at,rejection_reason,correction_notes,approval_comments,reviewed_at,field_assignment_id")
    .eq("client_id", workspace.clientId)
    // Historical Core submissions can be tenant-scoped by client_id before workspace_id existed.
    .is("archived_at", null)
    .order("submitted_at", { ascending: false })
    .limit(500);
  if (error) {
    console.warn("[deployment-execution]", supabaseErrorDiagnostic(error, "Workspace submissions query"));
    return {
      workspace,
      submissions: [],
      performance: performanceFromSubmissions([]),
      queryStatus: "error" as const,
      loadError: "Submissions could not be loaded. Try refreshing this page.",
    };
  }
  const submissions = ((data ?? []) as Row[]).filter((row) => !filters.projectId || text(row.project_id) === filters.projectId).map(normalizeWorkspaceSubmission);
  return {
    workspace,
    submissions,
    performance: performanceFromSubmissions(submissions),
    queryStatus: "success" as const,
    isEmpty: submissions.length === 0,
  };
}

export async function reviewDeploymentSubmission(input: { submissionId?: string | null; action?: string | null; rejectionReason?: string | null; correctionNotes?: string | null; approvalComments?: string | null }) {
  const totalStartedAt = nowMs();
  const workspace = await resolveCustomerAdminContext();
  if (!workspace.permissions.includes("submissions.review")) throw Object.assign(new Error("Submission review permission is required."), { status: 403 });
  const submissionId = text(input.submissionId);
  const action = text(input.action);
  if (!submissionId) throw Object.assign(new Error("Submission is required."), { status: 400 });
  if (!["approve", "reject", "request_correction"].includes(action)) throw Object.assign(new Error("Unsupported review action."), { status: 400 });
  const result = await applySubmissionWorkflowTransition({
    supabase: createAdminSupabase(),
    submissionId,
    actorUserId: workspace.userId,
    tenantClientId: workspace.clientId,
    action: action as "approve" | "reject" | "request_correction",
    rejectionReason: input.rejectionReason,
    correctionNotes: input.correctionNotes,
    approvalComments: input.approvalComments,
  });
  deploymentPerformanceLog({ route: "/api/workspace/deployment-submissions/[id]/review", step: "Approval", elapsedMs: elapsedMs(totalStartedAt), totalElapsedMs: elapsedMs(totalStartedAt) });
  void notifyDeploymentEvent({
    clientId: workspace.clientId,
    projectId: text((result.submission as Row).project_id),
    title: action === "approve" ? "Submission Approved" : action === "reject" ? "Submission Rejected" : "Correction Requested",
    message: "A deployment submission review has been updated.",
    status: action,
  }).catch((error) => console.warn("[deployment-performance]", { step: "Audit", result: "failed", error: error instanceof Error ? error.message : "Unknown error" }));
  return result;
}

export async function getSupervisorDeploymentDashboard() {
  const context = await resolveExecutionContext();
  if (context.role === "installer") throw Object.assign(new Error("Supervisor access is required."), { status: 403 });
  const assignments = await getInstallerAssignments();
  const { data: submissions } = await createAdminSupabase().from("submissions").select("id,status,installer_id").eq("client_id", context.clientId).limit(500);
  return {
    context,
    assignments: assignments.assignments,
    kpis: [
      { label: "Assigned Installers", value: new Set(assignments.assignments.map((item) => item.assignedInstaller).filter(Boolean)).size },
      { label: "Live Progress", value: assignments.assignments.filter((item) => item.status === "in_progress").length },
      { label: "Pending Approvals", value: ((submissions ?? []) as Row[]).filter((row) => ["Pending", "Flagged"].includes(text(row.status))).length },
      { label: "Rejected Work", value: ((submissions ?? []) as Row[]).filter((row) => text(row.status) === "Rejected").length },
      { label: "Outstanding Assignments", value: assignments.assignments.filter((item) => item.status !== "completed").length },
    ],
  };
}

export async function getWorkspaceDeploymentMap(filters: {
  projectId?: string | null;
  status?: string | null;
  installer?: string | null;
  state?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
} = {}) {
  const workspace = await resolveCustomerAdminContext();
  const { data, error } = await createAdminSupabase()
    .from("submissions")
    .select("id,client_id,project_id,project_name,brand_name,installer_name,selected_outlet_name,resolved_state,installer_state,state_region,gps_latitude,gps_longitude,gps_status,gps_distance_meters,image_url,status,submitted_at")
    .eq("client_id", workspace.clientId)
    .is("archived_at", null)
    .order("submitted_at", { ascending: false })
    .limit(500);

  if (error) {
    return {
      workspace,
      queryStatus: "error" as const,
      loadError: "Deployment map data could not be loaded. Try refreshing the page.",
      points: [],
      metrics: { completed: 0, pending: 0, rejected: 0, gpsExceptions: 0 },
      filters,
      available: { projects: [], installers: [], states: [] },
    };
  }

  const rows = ((data ?? []) as Row[]).filter((row) => {
    if (text(row.client_id) && text(row.client_id) !== workspace.clientId) return false;
    return true;
  });

  const points: WorkspaceMapPoint[] = filterWorkspaceMapRows(rows, { ...filters, clientId: workspace.clientId });
  const metrics = buildWorkspaceMapMetrics(points);
  const available = {
    projects: Array.from(new Set(rows.map((row) => text(row.project_id)).filter(Boolean))).sort(),
    installers: Array.from(new Set(points.map((point) => point.installer).filter(Boolean))).sort(),
    states: Array.from(new Set(points.map((point) => point.state).filter((value): value is string => Boolean(value)))).sort(),
  };

  return {
    workspace,
    queryStatus: "success" as const,
    loadError: null,
    points,
    metrics,
    filters,
    available,
  };
}

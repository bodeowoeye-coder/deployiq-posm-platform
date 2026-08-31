import { AccessControlError } from "@/lib/accessControl";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { assertWorkPackageAccess } from "@/lib/build/workPackages/service";
import { instantiateTemplate } from "@/lib/build/templates/service";
import { fetchBuildEvidenceSignature } from "@/lib/build/runtime/evidenceVerification";
import type { BuildEvidenceUploadAuthorization, BuildRuntimeActivity, BuildRuntimeActivityExecution, BuildRuntimeEvidence, BuildRuntimeEvidenceType, BuildRuntimePerson, BuildWorkPlan } from "@/lib/build/runtime/types";

export const BUILD_EVIDENCE_BUCKET = "build-runtime-evidence" as const;
export const BUILD_EVIDENCE_MIME_TYPES = {
  photo: new Set(["image/jpeg", "image/png", "image/webp"]),
  video: new Set(["video/mp4", "video/quicktime", "video/webm"]),
  document: new Set(["application/pdf", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]),
} as const;
export const BUILD_EVIDENCE_SIZE_LIMITS = { photo: 10 * 1024 * 1024, video: 50 * 1024 * 1024, document: 20 * 1024 * 1024 } as const;
const BUILD_EVIDENCE_NOTE_LIMIT = 4000;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function loadWorkPlanByScope(params: { clientId: string; projectId: string; siteId: string; workPackageId: string }) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("build_work_plans")
    .select("*")
    .eq("client_id", params.clientId)
    .eq("project_id", params.projectId)
    .eq("site_id", params.siteId)
    .eq("work_package_id", params.workPackageId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new AccessControlError(`Could not load Work Plan: ${error.message}`, 500);
  return data as Record<string, unknown> | null;
}

async function hydrateWorkPlan(row: Record<string, unknown>): Promise<BuildWorkPlan> {
  const planId = text(row.id);
  const supabase = createAdminSupabase();
  const [activitiesResult, checklistsResult, dependenciesResult, requirementsResult, evidenceResult, exceptionResult] = await Promise.all([
    supabase.from("build_runtime_activities").select("*").eq("work_plan_id", planId).is("archived_at", null).order("sequence"),
    supabase.from("build_runtime_checklist_items").select("id,runtime_activity_id,status").eq("work_plan_id", planId).is("archived_at", null),
    supabase.from("build_runtime_dependencies").select("id,successor_runtime_activity_id").eq("work_plan_id", planId),
    supabase.from("build_runtime_resource_requirements").select("id,runtime_activity_id").eq("work_plan_id", planId),
    supabase.from("build_runtime_evidence").select("id,runtime_activity_id").eq("work_plan_id", planId).is("archived_at", null),
    supabase.from("build_runtime_exceptions").select("id,runtime_activity_id,status,due_at").eq("work_plan_id", planId),
  ]);
  for (const result of [activitiesResult, checklistsResult, dependenciesResult, requirementsResult, evidenceResult, exceptionResult]) {
    if (result.error) throw new AccessControlError(`Could not load Work Plan details: ${result.error.message}`, 500);
  }

  const checklistCounts = new Map<string, number>();
  const checklistResolvedCounts = new Map<string, number>();
  const predecessorCounts = new Map<string, number>();
  const resourceCounts = new Map<string, number>();
  const evidenceCounts = new Map<string, number>();
  const activeExceptionCounts = new Map<string, number>();
  const overdueExceptionCounts = new Map<string, number>();
  for (const item of checklistsResult.data ?? []) { checklistCounts.set(item.runtime_activity_id, (checklistCounts.get(item.runtime_activity_id) ?? 0) + 1); if (item.status !== "pending") checklistResolvedCounts.set(item.runtime_activity_id, (checklistResolvedCounts.get(item.runtime_activity_id) ?? 0) + 1); }
  for (const item of dependenciesResult.data ?? []) predecessorCounts.set(item.successor_runtime_activity_id, (predecessorCounts.get(item.successor_runtime_activity_id) ?? 0) + 1);
  for (const item of requirementsResult.data ?? []) if (item.runtime_activity_id) resourceCounts.set(item.runtime_activity_id, (resourceCounts.get(item.runtime_activity_id) ?? 0) + 1);
  for (const item of evidenceResult.data ?? []) evidenceCounts.set(item.runtime_activity_id, (evidenceCounts.get(item.runtime_activity_id) ?? 0) + 1);
  const now = Date.now();
  for (const item of exceptionResult.data ?? []) { if (item.status === "open" || item.status === "in_remediation") activeExceptionCounts.set(item.runtime_activity_id, (activeExceptionCounts.get(item.runtime_activity_id) ?? 0) + 1); if (item.status !== "verified" && item.due_at && new Date(item.due_at).getTime() < now) overdueExceptionCounts.set(item.runtime_activity_id, (overdueExceptionCounts.get(item.runtime_activity_id) ?? 0) + 1); }

  const activities = (activitiesResult.data ?? []).map((item) => ({
    ...item,
    checklist_count: checklistCounts.get(item.id) ?? 0,
    checklist_resolved_count: checklistResolvedCounts.get(item.id) ?? 0,
    evidence_count: evidenceCounts.get(item.id) ?? 0,
    active_exception_count: activeExceptionCounts.get(item.id) ?? 0,
    overdue_exception_count: overdueExceptionCounts.get(item.id) ?? 0,
    resource_requirement_count: resourceCounts.get(item.id) ?? 0,
    predecessor_count: predecessorCounts.get(item.id) ?? 0,
  })) as BuildRuntimeActivity[];

  return {
    ...(row as Omit<BuildWorkPlan, "counts" | "activities">),
    counts: {
      activities: activities.length,
      checklists: checklistsResult.data?.length ?? 0,
      dependencies: dependenciesResult.data?.length ?? 0,
      resourceRequirements: requirementsResult.data?.length ?? 0,
      notStarted: activities.filter((item) => item.status === "not_started").length,
      inProgress: activities.filter((item) => item.status === "in_progress").length,
      completed: activities.filter((item) => item.status === "completed").length,
      blocked: activities.filter((item) => item.status === "blocked").length,
      submittedForReview: activities.filter((item) => item.status === "submitted_for_review").length,
      changesRequired: activities.filter((item) => item.status === "changes_required").length,
      approved: activities.filter((item) => item.status === "approved").length,
    },
    activities,
  };
}

async function eligiblePeople(clientId: string) {
  const supabase = createAdminSupabase();
  const { data: memberships, error } = await supabase.from("workspace_memberships")
    .select("user_id,role_key,workspace_roles(label,status)").eq("client_id", clientId).eq("status", "active");
  if (error) throw new AccessControlError(`Could not load Activity responsibility options: ${error.message}`, 500);
  const active = (memberships ?? []).filter((row) => !row.workspace_roles || (row.workspace_roles as unknown as { status?: string }).status === "active");
  const userIds = active.map((row) => text(row.user_id)).filter(Boolean);
  const { data: profiles } = userIds.length ? await supabase.from("user_profiles").select("user_id,full_name,email,status").in("user_id", userIds) : { data: [] };
  const profilesById = new Map((profiles ?? []).map((row) => [text(row.user_id), row]));
  const people = active.map((row) => {
    const profile = profilesById.get(text(row.user_id));
    return { userId: text(row.user_id), name: text(profile?.full_name) || text(profile?.email) || "Workspace member", roleLabel: text((row.workspace_roles as unknown as { label?: string })?.label) || text(row.role_key), roleKey: text(row.role_key), profileStatus: text(profile?.status) };
  }).filter((person) => !person.profileStatus || person.profileStatus === "Active")
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    owners: people.filter((person) => new Set(["customer_admin", "workspace_manager", "project_manager", "supervisor", "agency_manager", "installer"]).has(person.roleKey)),
    supervisors: people.filter((person) => new Set(["customer_admin", "workspace_manager", "project_manager", "supervisor"]).has(person.roleKey)),
  };
}

export async function getRuntimeActivityExecution(params: { request?: Request; projectId: string; siteId: string; workPackageId: string; activityId: string }): Promise<BuildRuntimeActivityExecution> {
  const plan = await getWorkPlan(params);
  const activity = plan?.activities.find((item) => item.id === params.activityId);
  if (!plan || !activity) throw new AccessControlError("Activity is unavailable.", 404);
  const supabase = createAdminSupabase();
  const [{ data: events, error: eventError }, { data: dependencies, error: dependencyError }, { data: checklistItems, error: checklistError }, { data: resourceRequirements, error: resourceError }, people] = await Promise.all([
    supabase.from("build_runtime_activity_events").select("*").eq("runtime_activity_id", activity.id)
      .order("occurred_at").order("event_sequence", { nullsFirst: true }),
    supabase.from("build_runtime_dependencies").select("dependency_type,predecessor_runtime_activity_id").eq("successor_runtime_activity_id", activity.id),
    supabase.from("build_runtime_checklist_items").select("id,item,description,mandatory,requires_photo,requires_comment,acceptance_type,status,result_note,resolved_by,resolved_at").eq("runtime_activity_id", activity.id).is("archived_at", null).order("sequence"),
    supabase.from("build_runtime_resource_requirements").select("id,resource_name,resource_type,quantity,unit_of_measure,mandatory").eq("runtime_activity_id", activity.id).order("sequence"),
    eligiblePeople(plan.client_id),
  ]);
  if (eventError || dependencyError || checklistError || resourceError) throw new AccessControlError("Activity execution details could not be loaded.", 500);
  const predecessorIds = (dependencies ?? []).map((item) => text(item.predecessor_runtime_activity_id)).filter(Boolean);
  const { data: predecessorRows, error: predecessorError } = predecessorIds.length
    ? await supabase.from("build_runtime_activities").select("id,name,status").eq("work_plan_id", plan.id).in("id", predecessorIds)
    : { data: [], error: null };
  if (predecessorError) throw new AccessControlError("Activity dependency details could not be loaded.", 500);
  const predecessorById = new Map((predecessorRows ?? []).map((item) => [text(item.id), item]));
  const allPeople = new Map([...people.owners, ...people.supervisors].map((person) => [person.userId, person]));
  const { data: evidenceRows, error: evidenceError } = await supabase.from("build_runtime_evidence").select("*")
    .eq("runtime_activity_id", activity.id).is("archived_at", null).order("created_at");
  if (evidenceError) throw new AccessControlError("Activity evidence could not be loaded.", 500);
  const { data: inspectionRows, error: inspectionError } = await supabase.from("build_runtime_inspections").select("*")
    .eq("runtime_activity_id", activity.id).order("reviewed_at");
  if (inspectionError) throw new AccessControlError("Activity inspections could not be loaded.", 500);
  const { data: exceptionRows, error: exceptionError } = await supabase.from("build_runtime_exceptions").select("*")
    .eq("runtime_activity_id", activity.id).order("raised_at");
  if (exceptionError) throw new AccessControlError("Activity exceptions could not be loaded.", 500);
  const evidence = await Promise.all((evidenceRows ?? []).map(async (item): Promise<BuildRuntimeEvidence> => {
    const storagePath = text(item.storage_path);
    const signed = storagePath ? await supabase.storage.from(BUILD_EVIDENCE_BUCKET).createSignedUrl(storagePath, 300) : null;
    if (signed?.error) throw new AccessControlError("Activity evidence access could not be authorized.", 500);
    return {
      id: text(item.id), evidenceType: text(item.evidence_type) as BuildRuntimeEvidenceType,
      runtimeChecklistItemId: text(item.runtime_checklist_item_id) || null,
      runtimeExceptionId: text(item.runtime_exception_id) || null,
      originalFilename: text(item.original_filename) || null, mimeType: text(item.mime_type) || null,
      fileSizeBytes: item.file_size_bytes == null ? null : Number(item.file_size_bytes), note: text(item.note) || null,
      description: text(item.description) || null, latitude: item.latitude == null ? null : Number(item.latitude),
      longitude: item.longitude == null ? null : Number(item.longitude), uploadedBy: text(item.uploaded_by),
      uploaderName: allPeople.get(text(item.uploaded_by))?.name ?? "Workspace member", createdAt: text(item.created_at),
      signedUrl: signed?.data?.signedUrl ?? null,
    };
  }));
  const safe = (person: typeof people.owners[number]): BuildRuntimePerson => ({ userId: person.userId, name: person.name, roleLabel: person.roleLabel });
  const timeline = (events ?? []).map((event) => ({ ...event, actorName: allPeople.get(text(event.actor_user_id))?.name ?? "Workspace member" })) as BuildRuntimeActivityExecution["events"];
  const legacyTimestampCounts = new Map<string, number>();
  for (const event of timeline) if (event.event_sequence == null) legacyTimestampCounts.set(event.occurred_at, (legacyTimestampCounts.get(event.occurred_at) ?? 0) + 1);
  return {
    activity,
    owner: allPeople.get(activity.activity_owner_user_id ?? "") ? safe(allPeople.get(activity.activity_owner_user_id ?? "")!) : null,
    supervisor: allPeople.get(activity.supervisor_user_id ?? "") ? safe(allPeople.get(activity.supervisor_user_id ?? "")!) : null,
    eligibleOwners: people.owners.map(safe), eligibleSupervisors: people.supervisors.map(safe),
    events: timeline,
    dependencyTypes: (dependencies ?? []).map((item) => text(item.dependency_type)),
    predecessors: (dependencies ?? []).map((item) => {
      const predecessor = predecessorById.get(text(item.predecessor_runtime_activity_id));
      return { id: text(item.predecessor_runtime_activity_id), name: text(predecessor?.name) || "Predecessor Activity", status: (text(predecessor?.status) || "not_started") as BuildRuntimeActivity["status"], dependencyType: text(item.dependency_type) };
    }),
    checklistItems: (checklistItems ?? []).map((item) => ({ id: text(item.id), item: text(item.item), description: text(item.description) || null,
      mandatory: Boolean(item.mandatory), requiresPhoto: Boolean(item.requires_photo), requiresComment: Boolean(item.requires_comment),
      acceptanceType: text(item.acceptance_type) || null, status: text(item.status) as BuildRuntimeActivityExecution["checklistItems"][number]["status"],
      resultNote: text(item.result_note) || null, resolvedBy: text(item.resolved_by) || null, resolvedAt: text(item.resolved_at) || null })),
    evidence,
    inspections: (inspectionRows ?? []).map((item) => ({
      id: text(item.id), reviewerUserId: text(item.reviewer_user_id),
      reviewerName: allPeople.get(text(item.reviewer_user_id))?.name ?? "Workspace reviewer",
      outcome: text(item.outcome) as BuildRuntimeActivityExecution["inspections"][number]["outcome"],
      comments: text(item.comments) || null, reviewedAt: text(item.reviewed_at),
    })),
    exceptions: (exceptionRows ?? []).map((item) => ({
      id: text(item.id), runtimeInspectionId: text(item.runtime_inspection_id), title: text(item.title),
      description: text(item.description), severity: text(item.severity) as BuildRuntimeActivityExecution["exceptions"][number]["severity"],
      status: text(item.status) as BuildRuntimeActivityExecution["exceptions"][number]["status"],
      ownerUserId: text(item.exception_owner_user_id), ownerName: allPeople.get(text(item.exception_owner_user_id))?.name ?? "Workspace member",
      dueAt: text(item.due_at) || null, raisedByUserId: text(item.raised_by_user_id),
      raisedByName: allPeople.get(text(item.raised_by_user_id))?.name ?? "Workspace reviewer", raisedAt: text(item.raised_at),
      remediationStartedAt: text(item.remediation_started_at) || null, resolutionNote: text(item.resolution_note) || null,
      resolvedAt: text(item.resolved_at) || null, verifiedAt: text(item.verified_at) || null,
      verificationNote: text(item.verification_note) || null,
    })),
    resourceRequirements: (resourceRequirements ?? []).map((item) => ({ id: text(item.id), name: text(item.resource_name), type: text(item.resource_type), quantity: Number(item.quantity), unit: text(item.unit_of_measure) || null, mandatory: Boolean(item.mandatory) })),
    hasLegacyAmbiguousOrder: [...legacyTimestampCounts.values()].some((count) => count > 1),
  };
}

async function assertRuntimeExecutor(params: { request?: Request; projectId: string; siteId: string; workPackageId: string; activityId: string }) {
  const access = await assertWorkPackageAccess({ ...params, canWrite: false });
  const plan = await loadWorkPlanByScope({ clientId: access.project.client_id, projectId: access.project.id, siteId: access.site.id, workPackageId: access.workPackage!.id });
  if (!plan) throw new AccessControlError("Work Plan is unavailable.", 404);
  const { data: activity } = await createAdminSupabase().from("build_runtime_activities")
    .select("id,activity_owner_user_id,supervisor_user_id,status").eq("id", params.activityId).eq("work_plan_id", text(plan.id)).maybeSingle();
  if (!activity || !["in_progress", "blocked"].includes(text(activity.status))) throw new AccessControlError("Activity is not available for execution.", 400);
  const { data: membership } = await createAdminSupabase().from("workspace_memberships").select("role_key,status")
    .eq("client_id", access.project.client_id).eq("user_id", access.authContext.user_id).eq("status", "active").maybeSingle();
  const permitted = access.authContext.user_id === text(activity.activity_owner_user_id)
    || access.authContext.user_id === text(activity.supervisor_user_id)
    || ["customer_admin", "workspace_manager", "project_manager"].includes(text(membership?.role_key));
  if (!permitted) throw new AccessControlError("Activity execution is restricted to assigned responsibility and workspace management.", 403);
  return { access, plan, activity };
}

async function assertRuntimeChecklistScope(params: { activityId: string; workPlanId: string; checklistItemId?: string | null }) {
  const checklistItemId = text(params.checklistItemId) || null;
  if (!checklistItemId) return null;
  const { data, error } = await createAdminSupabase().from("build_runtime_checklist_items").select("id")
    .eq("id", checklistItemId).eq("runtime_activity_id", params.activityId).eq("work_plan_id", params.workPlanId)
    .is("archived_at", null).maybeSingle();
  if (error || !data) throw new AccessControlError("Checklist item is outside this Activity.", 403);
  return checklistItemId;
}

async function assertRuntimeExceptionScope(params: { request?: Request; projectId: string; siteId: string; workPackageId: string; activityId: string; exceptionId?: string | null }) {
  const exceptionId = text(params.exceptionId) || null;
  if (!exceptionId) return null;
  const access = await assertWorkPackageAccess({ ...params, canWrite: false });
  const { data, error } = await createAdminSupabase().from("build_runtime_exceptions").select("id,status,exception_owner_user_id")
    .eq("id", exceptionId).eq("client_id", access.project.client_id).eq("project_id", access.project.id)
    .eq("site_id", access.site.id).eq("work_package_id", access.workPackage!.id).eq("runtime_activity_id", params.activityId).maybeSingle();
  if (error || !data) throw new AccessControlError("Exception is outside this Activity.", 403);
  return { id: exceptionId, status: text(data.status), ownerUserId: text(data.exception_owner_user_id), access };
}

function validateFileEvidence(type: BuildRuntimeEvidenceType, mimeType: string, fileSizeBytes: number) {
  if (type === "note") throw new AccessControlError("Note evidence does not use file upload.", 400);
  if (!BUILD_EVIDENCE_MIME_TYPES[type].has(mimeType as never)) throw new AccessControlError("This evidence file type is not supported.", 400);
  if (!Number.isInteger(fileSizeBytes) || fileSizeBytes <= 0 || fileSizeBytes > BUILD_EVIDENCE_SIZE_LIMITS[type])
    throw new AccessControlError("This evidence file exceeds the permitted size.", 400);
}

function safeFilename(value: string) {
  const name = text(value).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 240);
  if (!name) throw new AccessControlError("An original filename is required.", 400);
  return name;
}

async function verifyStoredEvidence(path: string, mimeType: string, expectedSize: number) {
  const slash = path.lastIndexOf("/");
  const folder = slash < 0 ? "" : path.slice(0, slash);
  const name = slash < 0 ? path : path.slice(slash + 1);
  const supabase = createAdminSupabase();
  const listed = await supabase.storage.from(BUILD_EVIDENCE_BUCKET).list(folder, { search: name, limit: 2 });
  const object = listed.data?.find((item) => item.name === name);
  const storedSize = Number(object?.metadata?.size ?? -1);
  const storedMime = text(object?.metadata?.mimetype);
  if (listed.error || !object || storedSize !== expectedSize || (storedMime && storedMime !== mimeType))
    throw new AccessControlError("The uploaded evidence could not be verified.", 400);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new AccessControlError("Evidence verification is unavailable.", 500);
  try {
    await fetchBuildEvidenceSignature({
      url: `${url}/storage/v1/object/authenticated/${BUILD_EVIDENCE_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`,
      headers: { apikey: key, authorization: `Bearer ${key}` },
      mimeType,
    });
  } catch {
    throw new AccessControlError("The uploaded evidence could not be verified.", 400);
  }
}

export async function authorizeRuntimeEvidenceUpload(params: { request?: Request; projectId: string; siteId: string; workPackageId: string; activityId: string; checklistItemId?: string | null; exceptionId?: string | null; evidenceType: BuildRuntimeEvidenceType; originalFilename: string; mimeType: string; fileSizeBytes: number }): Promise<BuildEvidenceUploadAuthorization> {
  const exception = await assertRuntimeExceptionScope(params);
  const resolved = exception ? { access: exception.access, plan: await loadWorkPlanByScope({ clientId: exception.access.project.client_id, projectId: exception.access.project.id, siteId: exception.access.site.id, workPackageId: exception.access.workPackage!.id }) } : await assertRuntimeExecutor(params);
  if (!resolved.plan) throw new AccessControlError("Work Plan is unavailable.", 404);
  if (exception && exception.status !== "in_remediation") throw new AccessControlError("Corrective evidence requires an Exception in remediation.", 400);
  validateFileEvidence(params.evidenceType, params.mimeType, params.fileSizeBytes);
  if (exception && text(params.checklistItemId)) throw new AccessControlError("Corrective evidence cannot be linked to a Checklist item.", 400);
  const checklistItemId = await assertRuntimeChecklistScope({ activityId: params.activityId, workPlanId: text(resolved.plan.id), checklistItemId: params.checklistItemId });
  const id = crypto.randomUUID();
  const path = `${resolved.access.project.client_id}/${resolved.access.project.id}/${params.activityId}/${id}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const supabase = createAdminSupabase();
  const { data: expired } = await supabase.from("build_runtime_evidence_uploads").select("id,storage_path")
    .eq("authorized_by", resolved.access.authContext.user_id).eq("runtime_activity_id", params.activityId)
    .is("finalized_at", null).is("rejected_at", null).lt("expires_at", new Date().toISOString()).limit(20);
  const expiredPaths = (expired ?? []).map((item) => text(item.storage_path)).filter(Boolean);
  if (expiredPaths.length) await supabase.storage.from(BUILD_EVIDENCE_BUCKET).remove(expiredPaths);
  if (expired?.length) await supabase.from("build_runtime_evidence_uploads").update({ rejected_at: new Date().toISOString() })
    .in("id", expired.map((item) => item.id));
  const { error } = await supabase.from("build_runtime_evidence_uploads").insert({ id, client_id: resolved.access.project.client_id,
    project_id: resolved.access.project.id, site_id: resolved.access.site.id, work_package_id: resolved.access.workPackage!.id,
    work_plan_id: text(resolved.plan.id), runtime_activity_id: params.activityId, runtime_checklist_item_id: checklistItemId,
    runtime_exception_id: exception?.id ?? null,
    evidence_type: params.evidenceType, storage_bucket: BUILD_EVIDENCE_BUCKET, storage_path: path,
    original_filename: safeFilename(params.originalFilename), expected_mime_type: params.mimeType,
    expected_file_size_bytes: params.fileSizeBytes, authorized_by: resolved.access.authContext.user_id, expires_at: expiresAt });
  if (error) throw new AccessControlError("Evidence upload could not be authorized.", 500);
  const signed = await supabase.storage.from(BUILD_EVIDENCE_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (signed.error) {
    await supabase.from("build_runtime_evidence_uploads").update({ rejected_at: new Date().toISOString() }).eq("id", id);
    throw new AccessControlError("Evidence upload could not be authorized.", 500);
  }
  return { authorizationId: id, bucket: BUILD_EVIDENCE_BUCKET, path: signed.data.path, token: signed.data.token };
}

export async function finalizeRuntimeEvidence(params: { request?: Request; projectId: string; siteId: string; workPackageId: string; activityId: string; checklistItemId?: string | null; exceptionId?: string | null; authorizationId?: string | null; evidenceType: BuildRuntimeEvidenceType; description?: string | null; note?: string | null; latitude?: number | null; longitude?: number | null }) {
  const exception = await assertRuntimeExceptionScope(params);
  const resolved = exception ? { access: exception.access, plan: await loadWorkPlanByScope({ clientId: exception.access.project.client_id, projectId: exception.access.project.id, siteId: exception.access.site.id, workPackageId: exception.access.workPackage!.id }) } : await assertRuntimeExecutor(params);
  if (!resolved.plan) throw new AccessControlError("Work Plan is unavailable.", 404);
  if (exception && exception.status !== "in_remediation") throw new AccessControlError("Corrective evidence requires an Exception in remediation.", 400);
  if (exception && text(params.checklistItemId)) throw new AccessControlError("Corrective evidence cannot be linked to a Checklist item.", 400);
  const checklistItemId = await assertRuntimeChecklistScope({ activityId: params.activityId, workPlanId: text(resolved.plan.id), checklistItemId: params.checklistItemId });
  const description = text(params.description).slice(0, 2000) || null;
  const note = text(params.note);
  if (params.evidenceType === "note") {
    if (!note || note.length > BUILD_EVIDENCE_NOTE_LIMIT) throw new AccessControlError("Evidence notes must contain between 1 and 4000 characters.", 400);
  } else {
    const { data: authorization } = await createAdminSupabase().from("build_runtime_evidence_uploads").select("*")
      .eq("id", text(params.authorizationId)).eq("authorized_by", resolved.access.authContext.user_id).maybeSingle();
    if (!authorization || text(authorization.evidence_type) !== params.evidenceType || text(authorization.runtime_activity_id) !== params.activityId
      || text(authorization.runtime_exception_id) !== (exception?.id ?? "")
      || text(authorization.runtime_checklist_item_id) !== (checklistItemId ?? "")) throw new AccessControlError("Evidence upload authorization is invalid.", 403);
    try { await verifyStoredEvidence(text(authorization.storage_path), text(authorization.expected_mime_type), Number(authorization.expected_file_size_bytes)); }
    catch (error) {
      await createAdminSupabase().storage.from(BUILD_EVIDENCE_BUCKET).remove([text(authorization.storage_path)]);
      await createAdminSupabase().from("build_runtime_evidence_uploads").update({ rejected_at: new Date().toISOString() }).eq("id", authorization.id);
      throw error;
    }
  }
  const rpc = exception ? "record_build_runtime_exception_evidence" : "record_build_runtime_evidence";
  const rpcParams = exception ? {
    p_runtime_exception_id: exception.id, p_upload_authorization_id: params.evidenceType === "note" ? null : text(params.authorizationId),
    p_evidence_type: params.evidenceType, p_actor_user_id: resolved.access.authContext.user_id, p_description: description,
    p_note: params.evidenceType === "note" ? note : null, p_latitude: params.latitude ?? null, p_longitude: params.longitude ?? null,
  } : {
    p_runtime_activity_id: params.activityId, p_runtime_checklist_item_id: checklistItemId,
    p_upload_authorization_id: params.evidenceType === "note" ? null : text(params.authorizationId), p_evidence_type: params.evidenceType,
    p_actor_user_id: resolved.access.authContext.user_id, p_description: description, p_note: params.evidenceType === "note" ? note : null,
    p_latitude: params.latitude ?? null, p_longitude: params.longitude ?? null,
  };
  const { data, error } = await createAdminSupabase().rpc(rpc, rpcParams);
  if (error) throw new AccessControlError("Evidence could not be finalized.", 400);
  const evidenceId = text(data);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(evidenceId)) {
    throw new AccessControlError("Evidence finalization could not be verified.", 500);
  }
  return evidenceId;
}

export async function applyRuntimeChecklistResult(params: { request?: Request; projectId: string; siteId: string; workPackageId: string; activityId: string; checklistItemId: string; result: string; note?: string | null }) {
  const resolved = await assertRuntimeExecutor(params);
  await assertRuntimeChecklistScope({ activityId: params.activityId, workPlanId: text(resolved.plan.id), checklistItemId: params.checklistItemId });
  const { data, error } = await createAdminSupabase().rpc("apply_build_runtime_checklist_result", {
    p_runtime_checklist_item_id: params.checklistItemId, p_result: params.result,
    p_actor_user_id: resolved.access.authContext.user_id, p_note: text(params.note) || null,
  });
  const messages: Record<string, string> = { BUILD_CHECKLIST_REASON_REQUIRED: "Add a reason for this Checklist result.", BUILD_CHECKLIST_COMMENT_REQUIRED: "Add the required Checklist comment.", BUILD_CHECKLIST_PHOTO_REQUIRED: "Attach a Photo to this Checklist item before passing it." };
  if (error) {
    const key = Object.keys(messages).find((candidate) => error.message.includes(candidate));
    throw new AccessControlError(key ? messages[key] : "The Checklist result could not be recorded.", key ? 400 : 500);
  }
  return text(data);
}

export async function getRuntimeActivityProjectScope(params: { clientId: string; projectId: string; activityId: string }) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("build_runtime_activities")
    .select("site_id,work_package_id")
    .eq("client_id", params.clientId)
    .eq("project_id", params.projectId)
    .eq("id", params.activityId)
    .is("archived_at", null)
    .maybeSingle();
  if (error || !data) throw new AccessControlError("Activity is unavailable.", 404);
  return { siteId: text(data.site_id), workPackageId: text(data.work_package_id) };
}

export async function applyRuntimeActivityAction(params: { request?: Request; projectId: string; siteId: string; workPackageId: string; activityId: string; action: string; ownerUserId?: string | null; supervisorUserId?: string | null; note?: string | null }) {
  // Resolve authenticated tenant and full Build ancestry first. The database action
  // then applies the narrower role/owner/supervisor rule for this specific transition.
  const access = await assertWorkPackageAccess({ ...params, canWrite: false });
  const plan = await loadWorkPlanByScope({ clientId: access.project.client_id, projectId: access.project.id, siteId: access.site.id, workPackageId: access.workPackage!.id });
  if (!plan || text(plan.id) === "") throw new AccessControlError("Work Plan is unavailable.", 404);
  if (params.action === "assign_responsibility") {
    const { data: activity, error: activityError } = await createAdminSupabase().from("build_runtime_activities")
      .select("status")
      .eq("id", params.activityId)
      .eq("work_plan_id", text(plan.id))
      .eq("client_id", access.project.client_id)
      .maybeSingle();
    if (activityError || !activity) throw new AccessControlError("Activity is unavailable.", 404);
    if (["completed", "submitted_for_review", "approved"].includes(text(activity.status))) throw new AccessControlError("Activity responsibility is read-only in its current review state.", 400);
  }
  const { data, error } = await createAdminSupabase().rpc("apply_build_runtime_activity_action", {
    p_runtime_activity_id: params.activityId, p_action: params.action, p_actor_user_id: access.authContext.user_id,
    p_activity_owner_user_id: params.ownerUserId || null, p_supervisor_user_id: params.supervisorUserId || null, p_note: params.note || null,
  });
  if (error) {
    const messages: Record<string, string> = {
      BUILD_ACTIVITY_FS_PREDECESSOR_INCOMPLETE: "Complete the required predecessor Activity before starting this Activity.",
      BUILD_ACTIVITY_CHECKLIST_INCOMPLETE: "Complete the required checklist before this Activity can be completed.",
      BUILD_ACTIVITY_BLOCKER_REASON_REQUIRED: "Add a blocker reason before reporting this Activity as blocked.",
      BUILD_ACTIVITY_INVALID_TRANSITION: "That Activity action is not valid for its current status.",
      BUILD_ACTIVITY_REVIEW_REQUIRED: "Submit this Activity for review instead of completing it directly.",
    };
    const key = Object.keys(messages).find((candidate) => error.message.includes(candidate));
    throw new AccessControlError(key ? messages[key] : "The Activity action could not be completed.", key ? 400 : 500);
  }
  if (text(data) !== params.activityId) throw new AccessControlError("The Activity update could not be verified.", 500);
  return getRuntimeActivityExecution(params);
}

async function resolveRuntimeReviewAccess(params: { request?: Request; projectId: string; siteId: string; workPackageId: string; activityId: string }) {
  const access = await assertWorkPackageAccess({ ...params, canWrite: false });
  const plan = await loadWorkPlanByScope({ clientId: access.project.client_id, projectId: access.project.id, siteId: access.site.id, workPackageId: access.workPackage!.id });
  if (!plan) throw new AccessControlError("Work Plan is unavailable.", 404);
  const { data: activity, error } = await createAdminSupabase().from("build_runtime_activities").select("id,status,requires_approval,activity_owner_user_id,supervisor_user_id")
    .eq("id", params.activityId).eq("work_plan_id", text(plan.id)).eq("client_id", access.project.client_id).maybeSingle();
  if (error || !activity) throw new AccessControlError("Activity is unavailable.", 404);
  return { access, activity };
}

export async function submitRuntimeActivityForReview(params: { request?: Request; projectId: string; siteId: string; workPackageId: string; activityId: string }) {
  const { access } = await resolveRuntimeReviewAccess(params);
  const { data, error } = await createAdminSupabase().rpc("submit_build_runtime_activity_for_review", {
    p_runtime_activity_id: params.activityId, p_actor_user_id: access.authContext.user_id,
  });
  const messages: Record<string, string> = {
    BUILD_ACTIVITY_REVIEW_NOT_REQUIRED: "This Activity uses direct completion and does not require formal review.",
    BUILD_ACTIVITY_REVIEW_STATE_INVALID: "This Activity is not ready to be submitted for review.",
    BUILD_ACTIVITY_CHECKLIST_INCOMPLETE: "Complete the mandatory checklist and resolve failed items before review.",
    BUILD_CHECKLIST_COMMENT_REQUIRED: "Add all required Checklist comments before review.",
    BUILD_CHECKLIST_PHOTO_REQUIRED: "Attach each required Checklist Photo before review.",
    BUILD_ACTIVITY_PHOTO_REQUIRED: "Attach the required Activity Photo before review.",
    BUILD_ACTIVITY_ACTION_FORBIDDEN: "Only assigned responsibility or workspace management may submit this Activity.",
  };
  if (error) {
    const key = Object.keys(messages).find((candidate) => error.message.includes(candidate));
    throw new AccessControlError(key ? messages[key] : "The Activity could not be submitted for review.", key ? 400 : 500);
  }
  if (text(data) !== params.activityId) throw new AccessControlError("Review submission could not be verified.", 500);
  return getRuntimeActivityExecution(params);
}

export async function recordRuntimeInspection(params: { request?: Request; projectId: string; siteId: string; workPackageId: string; activityId: string; outcome: string; comments?: string | null }) {
  const { access } = await resolveRuntimeReviewAccess(params);
  const { data, error } = await createAdminSupabase().rpc("record_build_runtime_inspection", {
    p_runtime_activity_id: params.activityId, p_outcome: params.outcome,
    p_actor_user_id: access.authContext.user_id, p_comments: text(params.comments) || null,
  });
  const messages: Record<string, string> = {
    BUILD_INSPECTION_REVIEW_FORBIDDEN: "Only the assigned Supervisor or workspace management may inspect this Activity.",
    BUILD_INSPECTION_STALE_ACTIVITY_STATE: "This Activity is no longer awaiting review.",
    BUILD_INSPECTION_OUTCOME_INVALID: "Select a valid inspection outcome.",
    BUILD_INSPECTION_COMMENT_REQUIRED: "Add a meaningful observation when changes are required.",
  };
  if (error) {
    const key = Object.keys(messages).find((candidate) => error.message.includes(candidate));
    throw new AccessControlError(key ? messages[key] : "The Inspection decision could not be recorded.", key ? 400 : 500);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(data))) {
    throw new AccessControlError("The Inspection decision could not be verified.", 500);
  }
  return getRuntimeActivityExecution(params);
}

export async function resumeRuntimeActivityCorrections(params: { request?: Request; projectId: string; siteId: string; workPackageId: string; activityId: string }) {
  const { access } = await resolveRuntimeReviewAccess(params);
  const { data, error } = await createAdminSupabase().rpc("resume_build_runtime_activity_corrections", {
    p_runtime_activity_id: params.activityId, p_actor_user_id: access.authContext.user_id,
  });
  if (error) throw new AccessControlError(error.message.includes("BUILD_ACTIVITY_REVIEW_STATE_INVALID")
    ? "This Activity is not awaiting corrective work." : "Corrective work could not be resumed.", error.message.includes("BUILD_ACTIVITY_REVIEW_STATE_INVALID") ? 400 : 500);
  if (text(data) !== params.activityId) throw new AccessControlError("Corrective work could not be verified.", 500);
  return getRuntimeActivityExecution(params);
}

export async function createRuntimeException(params: { request?: Request; projectId: string; siteId: string; workPackageId: string; activityId: string; inspectionId: string; title: string; description: string; severity: string; ownerUserId: string; dueAt?: string | null }) {
  const { access } = await resolveRuntimeReviewAccess(params);
  const { data, error } = await createAdminSupabase().rpc("create_build_runtime_exception", {
    p_runtime_activity_id: params.activityId, p_runtime_inspection_id: params.inspectionId, p_title: text(params.title),
    p_description: text(params.description), p_severity: text(params.severity), p_exception_owner_user_id: text(params.ownerUserId),
    p_due_at: text(params.dueAt) || null, p_actor_user_id: access.authContext.user_id,
  });
  const messages: Record<string, string> = {
    BUILD_EXCEPTION_INSPECTION_ANCESTRY_INVALID: "Select an Inspection from this Activity.",
    BUILD_EXCEPTION_MEMBER_INELIGIBLE: "Select an eligible active workspace member.",
    BUILD_EXCEPTION_TITLE_INVALID: "Add a concise Exception title.", BUILD_EXCEPTION_DESCRIPTION_INVALID: "Add a meaningful Exception description.",
    BUILD_EXCEPTION_SEVERITY_INVALID: "Select a valid Exception severity.", BUILD_EXCEPTION_DUE_AT_INVALID: "Select a future due date.",
  };
  if (error) { const key = Object.keys(messages).find((candidate) => error.message.includes(candidate)); throw new AccessControlError(key ? messages[key] : "The Exception could not be created.", key ? 400 : 500); }
  if (!/^[0-9a-f-]{36}$/i.test(text(data))) throw new AccessControlError("The Exception could not be verified.", 500);
  return getRuntimeActivityExecution(params);
}

export async function applyRuntimeExceptionAction(params: { request?: Request; projectId: string; siteId: string; workPackageId: string; activityId: string; exceptionId: string; action: string; note?: string | null }) {
  await assertRuntimeExceptionScope(params);
  const access = await assertWorkPackageAccess({ ...params, canWrite: false });
  const { data, error } = await createAdminSupabase().rpc("apply_build_runtime_exception_action", {
    p_runtime_exception_id: params.exceptionId, p_action: params.action, p_actor_user_id: access.authContext.user_id, p_note: text(params.note) || null,
  });
  const messages: Record<string, string> = {
    BUILD_EXCEPTION_STALE_STATE: "This Exception has already moved to another lifecycle state.",
    BUILD_EXCEPTION_REMEDIATION_FORBIDDEN: "Only the Exception Owner or workspace management may start remediation.",
    BUILD_EXCEPTION_RESOLUTION_FORBIDDEN: "Only the Exception Owner or workspace management may resolve this Exception.",
    BUILD_EXCEPTION_RESOLUTION_NOTE_REQUIRED: "Add a meaningful corrective-action note before resolving.",
    BUILD_EXCEPTION_INDEPENDENT_VERIFIER_REQUIRED: "The Exception Owner cannot independently verify their own corrective work.",
    BUILD_EXCEPTION_VERIFICATION_FORBIDDEN: "Only an eligible independent reviewer may verify this resolution.",
  };
  if (error) { const key = Object.keys(messages).find((candidate) => error.message.includes(candidate)); throw new AccessControlError(key ? messages[key] : "The Exception action could not be completed.", key ? 400 : 500); }
  if (text(data) !== params.exceptionId) throw new AccessControlError("The Exception action could not be verified.", 500);
  return getRuntimeActivityExecution(params);
}

export async function getWorkPlan(params: { request?: Request; projectId: string; siteId: string; workPackageId: string }) {
  const access = await assertWorkPackageAccess({ ...params, canWrite: false });
  if (!access.workPackage || access.workPackage.archived_at || access.workPackage.status === "archived") {
    throw new AccessControlError("Work Package is unavailable.", 404);
  }
  const row = await loadWorkPlanByScope({ clientId: access.project.client_id, projectId: access.project.id, siteId: access.site.id, workPackageId: access.workPackage.id });
  return row ? await hydrateWorkPlan(row) : null;
}

export async function createWorkPlan(params: { request?: Request; projectId: string; siteId: string; workPackageId: string }) {
  const access = await assertWorkPackageAccess({ ...params, canWrite: true, allowCustomerAdminWrite: true });
  if (!access.workPackage || access.workPackage.archived_at || access.workPackage.status === "archived") {
    throw new AccessControlError("Work Package is unavailable.", 400);
  }
  if (!access.workPackage.template_id) throw new AccessControlError("Assign an active Operational Template before generating a Work Plan.", 400);

  const preview = await instantiateTemplate({ ...params, request: params.request, templateId: access.workPackage.template_id });
  if (preview.templateValidation.errors.length > 0) {
    throw new AccessControlError("The Operational Template must pass configuration validation before a Work Plan can be generated.", 400);
  }

  const { data, error } = await createAdminSupabase().rpc("create_build_work_plan", {
    p_project_id: access.project.id,
    p_site_id: access.site.id,
    p_work_package_id: access.workPackage.id,
    p_instantiated_by: access.authContext.user_id,
  });
  if (error) throw new AccessControlError(`Could not generate Work Plan: ${error.message}`, 500);
  const row = await loadWorkPlanByScope({ clientId: access.project.client_id, projectId: access.project.id, siteId: access.site.id, workPackageId: access.workPackage.id });
  if (!row || text(row.id) !== text(data)) throw new AccessControlError("The generated Work Plan could not be resolved.", 500);
  return await hydrateWorkPlan(row);
}

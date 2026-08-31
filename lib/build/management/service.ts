import "server-only";

import { createAdminSupabase } from "../../supabaseAdmin.ts";
import { resolveCanonicalBuildProject } from "../projects/service.ts";

type Row = Record<string, unknown>;
export type ManagementActivityStatus = "not_started" | "in_progress" | "completed" | "blocked" | "submitted_for_review" | "changes_required" | "approved";
export type ManagementExceptionStatus = "open" | "in_remediation" | "resolved" | "verified";

export type BuildManagementException = {
  id: string; title: string; severity: "low" | "medium" | "high" | "critical"; status: ManagementExceptionStatus;
  ownerUserId: string; ownerName: string; dueAt: string | null; overdue: boolean;
  siteId: string; siteName: string; workPackageId: string; workPackageName: string;
  activityId: string; activityName: string; inspectionOutcome: "accepted" | "changes_required";
  inspectionReviewedAt: string; correctiveEvidenceCount: number;
};

export type BuildManagementSummary = {
  projectId: string;
  hasWorkPlans: boolean;
  activities: Record<ManagementActivityStatus | "total", number>;
  exceptions: Record<ManagementExceptionStatus | "total" | "active" | "overdue" | "critical" | "high", number>;
  workPackages: Array<{ id: string; name: string; siteId: string; siteName: string; activities: BuildManagementSummary["activities"]; activeExceptions: number; overdueExceptions: number }>;
  responsibility: Array<{ ownerUserId: string; ownerName: string; outstanding: number; overdue: number; criticalHigh: number }>;
  exceptionsRegister: BuildManagementException[];
};

export type BuildExceptionFilters = { status?: string; severity?: string; owner?: string; due?: string; site?: string; workPackage?: string };

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const list = (data: Row[] | null) => data ?? [];
const byId = (rows: Row[]) => new Map(rows.map((row) => [text(row.id), row]));
function requireQuery(error: { message?: string } | null, label: string) {
  if (error) throw new Error(`Could not load Build management ${label}: ${error.message ?? "Unknown database error"}`);
}
export function isExceptionOverdue(dueAt: string | null, status: ManagementExceptionStatus, now: Date) {
  if (!dueAt || status === "verified") return false;
  const due = new Date(dueAt);
  return Number.isFinite(due.getTime()) && due.getTime() < now.getTime();
}
function activityCounts(rows: Row[]): BuildManagementSummary["activities"] {
  const count = (status: ManagementActivityStatus) => rows.filter((row) => text(row.status) === status).length;
  return { total: rows.length, not_started: count("not_started"), in_progress: count("in_progress"), completed: count("completed"), blocked: count("blocked"), submitted_for_review: count("submitted_for_review"), changes_required: count("changes_required"), approved: count("approved") };
}

export function filterBuildExceptions(rows: BuildManagementException[], filters: BuildExceptionFilters) {
  return rows.filter((row) => {
    if (filters.status && row.status !== filters.status) return false;
    if (filters.severity && row.severity !== filters.severity) return false;
    if (filters.owner && row.ownerUserId !== filters.owner) return false;
    if (filters.site && row.siteId !== filters.site) return false;
    if (filters.workPackage && row.workPackageId !== filters.workPackage) return false;
    if (filters.due === "overdue" && !row.overdue) return false;
    if (filters.due === "due" && (!row.dueAt || row.overdue || row.status === "verified")) return false;
    return true;
  });
}

export async function getBuildManagementSummary(projectId: string, now = new Date()): Promise<BuildManagementSummary> {
  const { project } = await resolveCanonicalBuildProject({ projectId, requiredPermission: "projects:read" });
  const supabase = createAdminSupabase();
  const { data: siteData, error: siteError } = await supabase.from("build_sites").select("id,name")
    .eq("client_id", project.client_id).eq("project_id", project.id).is("archived_at", null);
  requireQuery(siteError, "sites");
  const sites = list(siteData as Row[] | null), siteIds = sites.map((row) => text(row.id)).filter(Boolean);
  const workPackageResult = siteIds.length ? await supabase.from("build_work_packages").select("id,site_id,name")
    .eq("client_id", project.client_id).eq("project_id", project.id).in("site_id", siteIds).is("archived_at", null) : { data: [], error: null };
  requireQuery(workPackageResult.error, "work packages");
  const workPackages = list(workPackageResult.data as Row[] | null), workPackageIds = workPackages.map((row) => text(row.id)).filter(Boolean);
  const planResult = workPackageIds.length ? await supabase.from("build_work_plans").select("id,work_package_id")
    .eq("client_id", project.client_id).eq("project_id", project.id).in("work_package_id", workPackageIds).is("archived_at", null) : { data: [], error: null };
  requireQuery(planResult.error, "work plans");
  const plans = list(planResult.data as Row[] | null), planIds = plans.map((row) => text(row.id)).filter(Boolean);
  const activityResult = planIds.length ? await supabase.from("build_runtime_activities").select("id,work_plan_id,work_package_id,name,status,activity_owner_user_id,supervisor_user_id")
    .eq("client_id", project.client_id).eq("project_id", project.id).in("work_plan_id", planIds).is("archived_at", null) : { data: [], error: null };
  requireQuery(activityResult.error, "activities");
  const activities = list(activityResult.data as Row[] | null), activityIds = activities.map((row) => text(row.id)).filter(Boolean);
  const [exceptionResult, inspectionResult, evidenceResult] = activityIds.length ? await Promise.all([
    supabase.from("build_runtime_exceptions").select("id,runtime_activity_id,runtime_inspection_id,title,severity,status,exception_owner_user_id,due_at").eq("client_id", project.client_id).eq("project_id", project.id).in("runtime_activity_id", activityIds),
    supabase.from("build_runtime_inspections").select("id,runtime_activity_id,outcome,reviewed_at").eq("client_id", project.client_id).eq("project_id", project.id).in("runtime_activity_id", activityIds),
    supabase.from("build_runtime_evidence").select("id,runtime_activity_id,runtime_exception_id").eq("client_id", project.client_id).eq("project_id", project.id).in("runtime_activity_id", activityIds).not("runtime_exception_id", "is", null).is("archived_at", null),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  requireQuery(exceptionResult.error, "exceptions"); requireQuery(inspectionResult.error, "inspections"); requireQuery(evidenceResult.error, "corrective evidence");
  const exceptionRows = list(exceptionResult.data as Row[] | null);
  const ownerIds = [...new Set(exceptionRows.map((row) => text(row.exception_owner_user_id)).filter(Boolean))];
  const profileResult = ownerIds.length ? await supabase.from("user_profiles").select("user_id,full_name,email,status").in("user_id", ownerIds) : { data: [], error: null };
  requireQuery(profileResult.error, "owners");
  const sitesById = byId(sites), workPackagesById = byId(workPackages), activitiesById = byId(activities), inspectionsById = byId(list(inspectionResult.data as Row[] | null));
  const profilesById = new Map(list(profileResult.data as Row[] | null).map((row) => [text(row.user_id), row]));
  const evidenceCount = new Map<string, number>();
  for (const row of list(evidenceResult.data as Row[] | null)) { const id = text(row.runtime_exception_id); evidenceCount.set(id, (evidenceCount.get(id) ?? 0) + 1); }
  const register = exceptionRows.map((row): BuildManagementException => {
    const activity = activitiesById.get(text(row.runtime_activity_id)) ?? {}, wp = workPackagesById.get(text(activity.work_package_id)) ?? {};
    const site = sitesById.get(text(wp.site_id)) ?? {}, inspection = inspectionsById.get(text(row.runtime_inspection_id)) ?? {};
    const ownerId = text(row.exception_owner_user_id), profile = profilesById.get(ownerId), status = text(row.status) as ManagementExceptionStatus;
    return { id: text(row.id), title: text(row.title), severity: text(row.severity) as BuildManagementException["severity"], status,
      ownerUserId: ownerId, ownerName: text(profile?.full_name) || text(profile?.email) || "Workspace member", dueAt: text(row.due_at) || null,
      overdue: isExceptionOverdue(text(row.due_at) || null, status, now), siteId: text(site.id), siteName: text(site.name),
      workPackageId: text(wp.id), workPackageName: text(wp.name), activityId: text(activity.id), activityName: text(activity.name),
      inspectionOutcome: (text(inspection.outcome) || "changes_required") as BuildManagementException["inspectionOutcome"],
      inspectionReviewedAt: text(inspection.reviewed_at), correctiveEvidenceCount: evidenceCount.get(text(row.id)) ?? 0 };
  });
  const active = register.filter((row) => row.status === "open" || row.status === "in_remediation");
  const siteByIdMap = new Map(sites.map((row) => [text(row.id), text(row.name)]));
  const planByWorkPackage = new Map(plans.map((row) => [text(row.work_package_id), text(row.id)]));
  const workPackageSummary = workPackages.map((wp) => {
    const wpActivities = activities.filter((row) => text(row.work_plan_id) === planByWorkPackage.get(text(wp.id)));
    const ids = new Set(wpActivities.map((row) => text(row.id))), exceptions = register.filter((row) => ids.has(row.activityId));
    return { id: text(wp.id), name: text(wp.name), siteId: text(wp.site_id), siteName: siteByIdMap.get(text(wp.site_id)) ?? "Site unavailable",
      activities: activityCounts(wpActivities), activeExceptions: exceptions.filter((row) => row.status === "open" || row.status === "in_remediation").length,
      overdueExceptions: exceptions.filter((row) => row.overdue).length };
  });
  const owners = new Map<string, BuildManagementSummary["responsibility"][number]>();
  for (const row of active) { const current = owners.get(row.ownerUserId) ?? { ownerUserId: row.ownerUserId, ownerName: row.ownerName, outstanding: 0, overdue: 0, criticalHigh: 0 };
    current.outstanding += 1; if (row.overdue) current.overdue += 1; if (row.severity === "critical" || row.severity === "high") current.criticalHigh += 1; owners.set(row.ownerUserId, current); }
  const exceptionCount = (status: ManagementExceptionStatus) => register.filter((row) => row.status === status).length;
  return { projectId: project.id, hasWorkPlans: plans.length > 0, activities: activityCounts(activities),
    exceptions: { total: register.length, open: exceptionCount("open"), in_remediation: exceptionCount("in_remediation"), resolved: exceptionCount("resolved"), verified: exceptionCount("verified"), active: active.length, overdue: register.filter((row) => row.overdue).length, critical: active.filter((row) => row.severity === "critical").length, high: active.filter((row) => row.severity === "high").length },
    workPackages: workPackageSummary, responsibility: [...owners.values()].sort((a,b) => a.ownerName.localeCompare(b.ownerName)), exceptionsRegister: register };
}

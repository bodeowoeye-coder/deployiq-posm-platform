import "server-only";

import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type { OperationalBuildAccess } from "@/lib/workspace/operationalBuildAccess";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export type MobileBuildActivity = {
  id: string;
  projectId: string;
  projectName: string;
  siteId: string;
  siteName: string;
  workPackageId: string;
  workPackageName: string;
  name: string;
  code: string;
  status: string;
  ownerUserId: string | null;
  supervisorUserId: string | null;
  plannedStartAt: string | null;
  plannedFinishAt: string | null;
  requiresApproval: boolean;
  relevance: "managed" | "owned" | "supervised" | "review_pending" | "visible";
};

export async function listMobileBuildActivities(access: OperationalBuildAccess): Promise<MobileBuildActivity[]> {
  if (!access.authorizedProjectIds.length) return [];
  const supabase = createAdminSupabase();
  let query = supabase.from("build_runtime_activities")
    .select("id,project_id,site_id,work_package_id,name,code,status,activity_owner_user_id,supervisor_user_id,planned_start_at,planned_finish_at,requires_approval")
    .eq("client_id", access.clientId)
    .in("project_id", access.authorizedProjectIds)
    .is("archived_at", null);

  if (access.roleKey === "supervisor") query = query.eq("supervisor_user_id", access.userId);
  if (access.roleKey === "agency_manager" || access.roleKey === "field_coordinator") query = query.eq("activity_owner_user_id", access.userId);

  const { data, error } = await query.order("planned_start_at", { ascending: true, nullsFirst: false }).limit(500);
  if (error) throw new Error("Authorized Build Activities could not be loaded.");
  const rows = data ?? [];
  const projectIds = [...new Set(rows.map((row) => text(row.project_id)).filter(Boolean))];
  const siteIds = [...new Set(rows.map((row) => text(row.site_id)).filter(Boolean))];
  const workPackageIds = [...new Set(rows.map((row) => text(row.work_package_id)).filter(Boolean))];
  const [projects, sites, workPackages] = await Promise.all([
    projectIds.length ? supabase.from("projects").select("id,project_name").eq("client_id", access.clientId).in("id", projectIds).is("archived_at", null) : Promise.resolve({ data: [], error: null }),
    siteIds.length ? supabase.from("build_sites").select("id,name").eq("client_id", access.clientId).in("id", siteIds).is("archived_at", null) : Promise.resolve({ data: [], error: null }),
    workPackageIds.length ? supabase.from("build_work_packages").select("id,name").eq("client_id", access.clientId).in("id", workPackageIds).is("archived_at", null) : Promise.resolve({ data: [], error: null }),
  ]);
  if (projects.error || sites.error || workPackages.error) throw new Error("Build Activity ancestry could not be loaded.");
  const projectNames = new Map((projects.data ?? []).map((row) => [text(row.id), text(row.project_name)]));
  const siteNames = new Map((sites.data ?? []).map((row) => [text(row.id), text(row.name)]));
  const workPackageNames = new Map((workPackages.data ?? []).map((row) => [text(row.id), text(row.name)]));

  return rows.flatMap((row): MobileBuildActivity[] => {
    const projectId = text(row.project_id);
    const siteId = text(row.site_id);
    const workPackageId = text(row.work_package_id);
    if (!projectNames.has(projectId) || !siteNames.has(siteId) || !workPackageNames.has(workPackageId)) return [];
    const ownerUserId = text(row.activity_owner_user_id) || null;
    const supervisorUserId = text(row.supervisor_user_id) || null;
    const status = text(row.status);
    const relevance = access.roleKey === "project_manager" || access.roleKey === "workspace_administrator"
      ? "managed"
      : supervisorUserId === access.userId && status === "submitted_for_review"
        ? "review_pending"
        : supervisorUserId === access.userId
          ? "supervised"
          : ownerUserId === access.userId
            ? "owned"
            : "visible";
    return [{
      id: text(row.id), projectId, projectName: projectNames.get(projectId)!, siteId, siteName: siteNames.get(siteId)!,
      workPackageId, workPackageName: workPackageNames.get(workPackageId)!, name: text(row.name), code: text(row.code),
      status, ownerUserId, supervisorUserId, plannedStartAt: text(row.planned_start_at) || null,
      plannedFinishAt: text(row.planned_finish_at) || null, requiresApproval: row.requires_approval === true, relevance,
    }];
  });
}

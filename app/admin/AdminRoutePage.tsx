import { AdminDashboard } from "@/components/AdminDashboard";
import type { DashboardView } from "@/components/DashboardSidebar";
import { requireRole } from "@/lib/auth";
import { normalizeProjectRecords } from "@/lib/projects";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { listAuditLogs, listManagedUsers } from "@/lib/userManagement";
import type { Agency, AuditLog, Brand, Client, ClientProfile, DeploymentProgress, Installer, ManagedUser, Project, ProjectTarget, Submission, SubmissionStatusHistory } from "@/lib/types";

function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function timingMs(start: number) {
  return Math.round((nowMs() - start) * 10) / 10;
}

async function safeQuery<T>(label: string, query: PromiseLike<{ data: T[] | null; error?: { message?: string } | null }>) {
  const queryStart = nowMs();
  const { data, error } = await query;
  console.info("[admin-route-timing]", {
    stage: `${label}-fetch`,
    rows: data?.length ?? 0,
    ok: !error,
    durationMs: timingMs(queryStart)
  });
  if (error) {
    console.warn(`[admin-route] ${label} query failed`, { message: error.message ?? "Unknown error" });
    return [] as T[];
  }
  return (data ?? []) as T[];
}

export async function AdminRoutePage({ initialView, requestedPath }: { initialView: DashboardView; requestedPath: string }) {
  const totalStart = nowMs();
  console.info("[admin-route-timing]", { stage: "route-entered", initialView, requestedPath });
  const authStart = nowMs();
  const context = await requireRole(["admin"], requestedPath);
  console.info("[admin-route-timing]", {
    stage: "session-validation",
    userId: context.user.id,
    role: context.role.role,
    durationMs: timingMs(authStart)
  });
  const supabase = createAdminSupabase();
  const submissionsStart = nowMs();
  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .order("submitted_at", { ascending: false });
  console.info("[admin-route-timing]", {
    stage: "submission-fetch",
    rows: data?.length ?? 0,
    ok: !error,
    durationMs: timingMs(submissionsStart)
  });

  if (error) {
    throw new Error(error.message);
  }

  const submissionIds = (data ?? []).map((item) => item.id);
  const needsSubmissionHistory = initialView === "submissions";
  const needsAdminManagementData = !["dashboard", "reports", "submissions", "profile"].includes(initialView);
  const supportingDataStart = nowMs();
  const [
    projects,
    projectTargets,
    deploymentProgress,
    clients,
    brands,
    agencies,
    installers,
    clientProfiles,
    managedUsers,
    auditLogs
  ] = await Promise.all([
    safeQuery<Project>("projects", supabase.from("projects").select("*").order("created_at", { ascending: false })),
    safeQuery<ProjectTarget>("project_targets", supabase.from("project_targets").select("*")),
    safeQuery<DeploymentProgress>("deployment_progress", supabase.from("deployment_progress").select("*")),
    safeQuery<Client>("clients", supabase.from("clients").select("*").order("name", { ascending: true })),
    safeQuery<Brand>("brands", supabase.from("brands").select("*").order("brand_name", { ascending: true })),
    safeQuery<Agency>("agencies", supabase.from("agencies").select("*").order("agency_name", { ascending: true })),
    safeQuery<Installer>("installers", supabase.from("installers").select("*").order("installer_name", { ascending: true })),
    safeQuery<ClientProfile>("client_profiles", supabase.from("client_profiles").select("*")),
    needsAdminManagementData ? listManagedUsers() : Promise.resolve([] as ManagedUser[]),
    needsAdminManagementData ? listAuditLogs() : Promise.resolve([] as AuditLog[])
  ]);
  console.info("[admin-route-timing]", {
    stage: "supporting-dashboard-data-fetch",
    initialView,
    needsAdminManagementData,
    durationMs: timingMs(supportingDataStart)
  });
  console.info("[admin-route] assignment data loaded", {
    initialView,
    clients: clients.length,
    managedUsers: managedUsers.length,
    clientProfiles: clientProfiles.length,
    needsAdminManagementData
  });
  const normalizedProjects = (normalizeProjectRecords(projects) as Project[]).filter((project) => !project.archived_at);

  const historyStart = nowMs();
  const { data: history } =
    needsSubmissionHistory && submissionIds.length > 0
      ? await supabase
          .from("submission_status_history")
          .select("*")
          .in("submission_id", submissionIds)
          .order("created_at", { ascending: false })
      : { data: [] };
  console.info("[admin-route-timing]", {
    stage: "status-history-fetch",
    enabled: needsSubmissionHistory,
    rows: history?.length ?? 0,
    durationMs: timingMs(historyStart)
  });
  console.info("[admin-route-timing]", {
    stage: "dashboard-props-ready",
    initialView,
    submissions: data?.length ?? 0,
    projects: normalizedProjects.length,
    brands: brands.length,
    clients: clients.length,
    agencies: agencies.length,
    installers: installers.length,
    durationMs: timingMs(totalStart)
  });
  return (
    <AdminDashboard
      submissions={((data ?? []) as Submission[]).filter((submission) => !submission.archived_at)}
      history={(history ?? []) as SubmissionStatusHistory[]}
      projects={normalizedProjects}
      projectTargets={projectTargets}
      deploymentProgress={deploymentProgress}
      clients={clients}
      brands={brands}
      agencies={agencies}
      installers={installers}
      managedUsers={managedUsers}
      clientProfiles={clientProfiles}
      auditLogs={auditLogs}
      currentUserId={context.user.id}
      currentUserEmail={context.user.email ?? null}
      initialView={initialView}
    />
  );
}

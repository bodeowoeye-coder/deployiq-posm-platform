import { AdminDashboard } from "@/components/AdminDashboard";
import type { DashboardView } from "@/components/DashboardSidebar";
import { requireRole } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { listAuditLogs, listManagedUsers } from "@/lib/userManagement";
import type { Agency, AuditLog, Brand, Client, ClientProfile, DeploymentProgress, Installer, ManagedUser, Project, ProjectTarget, Submission, SubmissionStatusHistory } from "@/lib/types";

async function safeQuery<T>(label: string, query: PromiseLike<{ data: T[] | null; error?: { message?: string } | null }>) {
  const { data, error } = await query;
  if (error) {
    console.warn(`[admin-route] ${label} query failed`, { message: error.message ?? "Unknown error" });
    return [] as T[];
  }
  return (data ?? []) as T[];
}

export async function AdminRoutePage({ initialView, requestedPath }: { initialView: DashboardView; requestedPath: string }) {
  const context = await requireRole(["admin"], requestedPath);
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const submissionIds = (data ?? []).map((item) => item.id);
  const needsSubmissionHistory = initialView === "submissions";
  const needsAdminManagementData = !["dashboard", "reports", "submissions", "profile"].includes(initialView);
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
  const { data: history } =
    needsSubmissionHistory && submissionIds.length > 0
      ? await supabase
          .from("submission_status_history")
          .select("*")
          .in("submission_id", submissionIds)
          .order("created_at", { ascending: false })
      : { data: [] };
  return (
    <AdminDashboard
      submissions={(data ?? []) as Submission[]}
      history={(history ?? []) as SubmissionStatusHistory[]}
      projects={projects}
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

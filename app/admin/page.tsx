import { AdminDashboard } from "@/components/AdminDashboard";
import { requireRole } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { listAuditLogs, listManagedUsers } from "@/lib/userManagement";
import type { Agency, AuditLog, Brand, Client, ClientProfile, DeploymentProgress, Installer, ManagedUser, Project, ProjectTarget, Submission, SubmissionStatusHistory } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireRole(["admin"]);
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const submissionIds = (data ?? []).map((item) => item.id);
  const [
    { data: projects },
    { data: projectTargets },
    { data: deploymentProgress },
    { data: clients },
    { data: brands },
    { data: agencies },
    { data: installers },
    { data: clientProfiles },
    managedUsers,
    auditLogs
  ] = await Promise.all([
    supabase.from("projects").select("*").order("created_at", { ascending: false }),
    supabase.from("project_targets").select("*"),
    supabase.from("deployment_progress").select("*"),
    supabase.from("clients").select("*").order("name", { ascending: true }),
    supabase.from("brands").select("*").order("brand_name", { ascending: true }),
    supabase.from("agencies").select("*").order("agency_name", { ascending: true }),
    supabase.from("installers").select("*").order("installer_name", { ascending: true }),
    supabase.from("client_profiles").select("*"),
    listManagedUsers(),
    listAuditLogs()
  ]);
  const { data: history } =
    submissionIds.length > 0
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
      projects={(projects ?? []) as Project[]}
      projectTargets={(projectTargets ?? []) as ProjectTarget[]}
      deploymentProgress={(deploymentProgress ?? []) as DeploymentProgress[]}
      clients={(clients ?? []) as Client[]}
      brands={(brands ?? []) as Brand[]}
      agencies={(agencies ?? []) as Agency[]}
      installers={(installers ?? []) as Installer[]}
      managedUsers={managedUsers as ManagedUser[]}
      clientProfiles={(clientProfiles ?? []) as ClientProfile[]}
      auditLogs={auditLogs as AuditLog[]}
    />
  );
}

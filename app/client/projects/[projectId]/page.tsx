import { notFound } from "next/navigation";
import { ProjectDashboardShell } from "@/components/ProjectDashboardShell";
import { requireRole } from "@/lib/auth";
import { normalizeProjectRecord } from "@/lib/projects";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ClientProjectDashboardPage({
  params,
  searchParams
}: {
  params: { projectId: string };
  searchParams?: { tab?: string };
}) {
  const context = await requireRole(["client"], `/client/projects/${params.projectId}`);
  if (!context.client || !context.role.client_id) notFound();

  const supabase = createAdminSupabase();
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.projectId)
    .eq("client_id", context.role.client_id)
    .is("archived_at", null)
    .maybeSingle();

  if (!project) notFound();

  const normalized = normalizeProjectRecord(project) as Project;

  return (
    <ProjectDashboardShell
      project={normalized}
      audience="client"
      activeTab={searchParams?.tab}
      basePath={`/client/projects/${params.projectId}`}
    />
  );
}

import { notFound } from "next/navigation";
import { ProjectDashboardShell } from "@/components/ProjectDashboardShell";
import { requireRole } from "@/lib/auth";
import { normalizeProjectRecord } from "@/lib/projects";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminProjectDashboardPage({
  params,
  searchParams
}: {
  params: { projectId: string };
  searchParams?: { tab?: string };
}) {
  await requireRole(["admin"], `/admin/projects/${params.projectId}`);
  const supabase = createAdminSupabase();

  const { data: project } = await supabase.from("projects").select("*").eq("id", params.projectId).maybeSingle();
  if (!project) notFound();

  const normalized = normalizeProjectRecord(project) as Project;

  return (
    <ProjectDashboardShell
      project={normalized}
      audience="admin"
      activeTab={searchParams?.tab}
      basePath={`/admin/projects/${params.projectId}`}
    />
  );
}

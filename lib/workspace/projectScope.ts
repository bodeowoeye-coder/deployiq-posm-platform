import { normalizeProjectRecords, isLegacyProvisioningPlaceholderProject } from "@/lib/projects";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type { Project } from "@/lib/types";
import type { CustomerWorkspaceContext } from "@/lib/workspace/customerAdmin";

export type CustomerWorkspaceProjectScope = {
  projectId: string | null;
  projects: Project[];
  selectedProject: Project | null;
};

export async function getCustomerWorkspaceProjectScope(workspace: CustomerWorkspaceContext, requestedProjectId?: string | null): Promise<CustomerWorkspaceProjectScope> {
  const { data, error } = await createAdminSupabase()
    .from("projects")
    .select("*")
    .eq("client_id", workspace.clientId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const projects = normalizeProjectRecords((data ?? []) as Project[]).filter((project) => !isLegacyProvisioningPlaceholderProject(project)) as Project[];
  const projectId = typeof requestedProjectId === "string" && projects.some((project) => project.id === requestedProjectId) ? requestedProjectId : null;
  return { projectId, projects, selectedProject: projectId ? projects.find((project) => project.id === projectId) ?? null : null };
}

export function projectScopeQuery(projectId: string | null | undefined) {
  return projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
}

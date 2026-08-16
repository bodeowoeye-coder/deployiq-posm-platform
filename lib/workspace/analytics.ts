import { isLegacyProvisioningPlaceholderProject, normalizeProjectRecords } from "@/lib/projects";
import { deriveProjectRegions } from "@/lib/geography";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type { DeploymentProgress, Project, ProjectTarget, Submission } from "@/lib/types";
import { resolveCustomerWorkspaceContext, type CustomerWorkspaceContext } from "@/lib/workspace/customerAdmin";
import { buildWorkspaceAnalytics, geographyFor, isMissingDeploymentProgressTable, type WorkspaceAnalyticsFilters } from "@/lib/workspace/analyticsCore";

const ANALYTICS_SUBMISSION_LIMIT = 500;

export { buildWorkspaceAnalytics, filterWorkspaceAnalyticsSubmissions } from "@/lib/workspace/analyticsCore";
export { isMissingDeploymentProgressTable } from "@/lib/workspace/analyticsCore";
export type { WorkspaceAnalyticsFilters } from "@/lib/workspace/analyticsCore";

export type WorkspaceAnalyticsDashboard = {
  workspace: CustomerWorkspaceContext;
  queryStatus: "success" | "error";
  loadError: string | null;
  isEmpty: boolean;
  filters: WorkspaceAnalyticsFilters;
  available: {
    projects: Array<{ id: string; name: string }>;
    campaigns: string[];
    brands: string[];
    regions: string[];
    states: string[];
    installers: string[];
  };
  source: {
    submissions: Submission[];
    projects: Project[];
    projectTargets: ProjectTarget[];
    deploymentProgress: DeploymentProgress[];
  } | null;
  analytics: ReturnType<typeof buildWorkspaceAnalytics> | null;
};

export async function getWorkspaceAnalytics(filters: WorkspaceAnalyticsFilters = {}): Promise<WorkspaceAnalyticsDashboard> {
  const workspace = await resolveCustomerWorkspaceContext();
  const supabase = createAdminSupabase();
  const { data: submissions, error: submissionsError } = await supabase
    .from("submissions")
    .select("*")
    .eq("client_id", workspace.clientId)
    .is("archived_at", null)
    .order("submitted_at", { ascending: false })
    .limit(ANALYTICS_SUBMISSION_LIMIT);

  if (submissionsError) {
    return {
      workspace,
      queryStatus: "error",
      loadError: "Deployment analytics could not be loaded. Try refreshing the page.",
      isEmpty: false,
      filters,
      available: { projects: [], campaigns: [], brands: [], regions: [], states: [], installers: [] },
      source: null,
      analytics: null,
    };
  }

  const { data: projectRows, error: projectsError } = await supabase
    .from("projects")
    .select("*")
    .eq("client_id", workspace.clientId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (projectsError) {
    return {
      workspace,
      queryStatus: "error",
      loadError: "Deployment analytics could not be loaded. Try refreshing the page.",
      isEmpty: false,
      filters,
      available: { projects: [], campaigns: [], brands: [], regions: [], states: [], installers: [] },
      source: null,
      analytics: null,
    };
  }

  const projects = normalizeProjectRecords((projectRows ?? []) as Project[]).filter((project) => !isLegacyProvisioningPlaceholderProject(project)) as Project[];
  const projectIds = projects.map((project) => project.id);
  const [{ data: projectTargets, error: targetsError }, { data: deploymentProgress, error: progressError }] = projectIds.length
    ? await Promise.all([
        supabase.from("project_targets").select("*").in("project_id", projectIds),
        supabase.from("deployment_progress").select("*").in("project_id", projectIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];

  if (targetsError || (progressError && !isMissingDeploymentProgressTable(progressError))) {
    return {
      workspace,
      queryStatus: "error",
      loadError: "Deployment analytics could not be loaded. Try refreshing the page.",
      isEmpty: false,
      filters,
      available: { projects: [], campaigns: [], brands: [], regions: [], states: [], installers: [] },
      source: null,
      analytics: null,
    };
  }

  // Older runtime schemas do not have this optional stage table. Core Admin operations
  // already fall back to submission counts when no progress rows are available.
  const compatibleDeploymentProgress = progressError && isMissingDeploymentProgressTable(progressError) ? [] : deploymentProgress ?? [];

  const canonicalSubmissions = (submissions ?? []) as Submission[];
  const analytics = buildWorkspaceAnalytics({
    submissions: canonicalSubmissions,
    projects,
    projectTargets: (projectTargets ?? []) as ProjectTarget[],
    deploymentProgress: compatibleDeploymentProgress as DeploymentProgress[],
    filters,
  });

  return {
    workspace,
    queryStatus: "success",
    loadError: null,
    isEmpty: canonicalSubmissions.length === 0,
    filters,
    available: {
      projects: projects.map((project) => ({ id: project.id, name: project.project_name })).sort((left, right) => left.name.localeCompare(right.name)),
        campaigns: Array.from(new Set(projects.map((project) => project.campaign_name).filter((campaign): campaign is string => Boolean(campaign)))).sort(),
      brands: Array.from(new Set([
        ...canonicalSubmissions.map((submission) => submission.brand_name || "Unassigned"),
        ...projects.map((project) => (project as Project & { brand?: string | null }).brand || "").filter(Boolean),
      ])).sort(),
      regions: Array.from(new Set([
        ...canonicalSubmissions.map((submission) => submission.installer_region || ""),
        ...projects.flatMap((project) => deriveProjectRegions({ states: project.regions_covered ?? [], storedRegions: [...(project.project_regions ?? []), project.primary_target_region ?? ""] })),
      ].filter(Boolean))).sort(),
      states: Array.from(new Set([
        ...canonicalSubmissions.map(geographyFor),
        ...projects.flatMap((project) => [...(project.regions_covered ?? []), project.primary_target_state ?? ""]),
      ].filter(Boolean))).sort(),
      installers: Array.from(new Set(canonicalSubmissions.map((submission) => submission.installer_name || "Unnamed installer"))).sort(),
    },
    source: {
      submissions: canonicalSubmissions,
      projects,
      projectTargets: (projectTargets ?? []) as ProjectTarget[],
      deploymentProgress: compatibleDeploymentProgress as DeploymentProgress[],
    },
    analytics,
  };
}

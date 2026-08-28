import { AccessControlError, type AuthenticatedUserContext } from "@/lib/accessControl";
import { getProjectAccessRegistry, type ProjectAccessRegistry } from "@/lib/core/auth";
import type { DeployIQPermission } from "@/lib/core/permissions";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { assessBuildProjectAuthority, canonicalizeBuildProject, type CanonicalBuildProject } from "@/lib/build/projects/types";

export const CANONICAL_BUILD_PROJECT_FIELDS = [
  "id",
  "client_id",
  "project_name",
  "project_code",
  "client_project_reference",
  "project_type",
  "status",
  "start_date",
  "end_date",
  "planned_completion",
  "actual_completion",
  "primary_target_region",
  "primary_target_state",
  "project_regions",
  "regions_covered",
  "agency_id",
  "lead_installer_id",
  "archived_at"
] as const;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function authenticatedContextFromRegistry(registry: ProjectAccessRegistry): AuthenticatedUserContext {
  return {
    user_id: registry.user_id,
    email: registry.email,
    role: registry.role,
    client_id: registry.client_id,
    allowed_project_ids: registry.allowed_projects,
    is_admin: registry.is_admin
  };
}

function assertProjectAuthority(params: {
  registry: ProjectAccessRegistry;
  project: CanonicalBuildProject;
  requestedClientId?: string | null;
}) {
  const { registry, project } = params;
  const result = assessBuildProjectAuthority(project, {
    isAdmin: registry.is_admin,
    role: registry.role,
    clientId: registry.client_id,
    allowedProjectIds: registry.allowed_projects,
    requestedClientId: params.requestedClientId
  });
  if (result.ok) return;
  if (result.code === "requested_client_mismatch") {
    throw new AccessControlError("Project and client mismatch for Build access.", 400);
  }
  if (result.code === "role_not_allowed") {
    throw new AccessControlError("Only admin or client users can access Build projects.", 403);
  }
  if (result.code === "tenant_mismatch") {
    throw new AccessControlError("You do not have access to this project client.", 403);
  }
  throw new AccessControlError("You do not have access to this project.", 403);
}

export async function resolveCanonicalBuildProject(params: {
  request?: Request;
  projectId: string;
  requiredPermission: Extract<DeployIQPermission, "projects:read" | "projects:write">;
  requestedClientId?: string | null;
}) {
  const projectId = text(params.projectId);
  if (!projectId) throw new AccessControlError("projectId is required.", 400);

  const registry = await getProjectAccessRegistry(params.request);
  if (!registry.permissions.includes(params.requiredPermission)) {
    throw new AccessControlError("You do not have permission to access Build projects.", 403);
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("projects")
    .select(CANONICAL_BUILD_PROJECT_FIELDS.join(","))
    .eq("id", projectId)
    .maybeSingle();

  if (error) throw new AccessControlError(`Could not resolve project: ${error.message}`, 500);
  if (!data) throw new AccessControlError("Project not found.", 404);

  const result = canonicalizeBuildProject(data as unknown as Record<string, unknown>);
  if (!result.ok) {
    if (result.code === "project_archived") throw new AccessControlError("Project not found.", 404);
    if (result.code === "project_type_not_build_compatible") {
      throw new AccessControlError("Build is not available for this project type.", 400);
    }
    throw new AccessControlError("Project record is not valid for Build.", 500);
  }

  assertProjectAuthority({ registry, project: result.project, requestedClientId: params.requestedClientId });
  return {
    authContext: authenticatedContextFromRegistry(registry),
    registry,
    project: result.project
  };
}

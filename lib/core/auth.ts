import {
  getAuthenticatedUserContext,
  requireAdmin,
  requireClientUser,
  requireInstaller,
  type AuthenticatedUserContext
} from "@/lib/accessControl";
import type { DeployIQPermission } from "@/lib/core/permissions";
import { getPermissionsForRole } from "@/lib/core/permissions";

export type ProjectAccessRegistry = {
  user_id: string;
  email: string | null;
  role: AuthenticatedUserContext["role"];
  client_id: string | null;
  allowed_projects: string[];
  is_admin: boolean;
  permissions: DeployIQPermission[];
};

export async function getProjectAccessRegistry(request?: Request): Promise<ProjectAccessRegistry> {
  const context = await getAuthenticatedUserContext(request);
  return {
    user_id: context.user_id,
    email: context.email,
    role: context.role,
    client_id: context.client_id,
    allowed_projects: context.allowed_project_ids,
    is_admin: context.is_admin,
    permissions: getPermissionsForRole(context.role)
  };
}

export { getAuthenticatedUserContext, requireAdmin, requireClientUser, requireInstaller };

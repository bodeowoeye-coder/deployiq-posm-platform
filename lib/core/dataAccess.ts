import { AccessControlError, assertClientAccess, assertProjectAccess, type AuthenticatedUserContext } from "@/lib/accessControl";
import { getProjectAccessRegistry, type ProjectAccessRegistry } from "@/lib/core/auth";
import { createAdminSupabase } from "@/lib/supabaseAdmin";

type MaybeDbError = { code?: string; message?: string; details?: string } | null;

function accessError(message: string, status = 500): AccessControlError {
  return new AccessControlError(message, status);
}

function assertNoDbError(error: MaybeDbError, message: string) {
  if (error) {
    throw accessError(`${message}: ${error.message ?? "Unknown database error"}`, 500);
  }
}

export async function getClient(clientId: string) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle();
  assertNoDbError(error, "Could not resolve client");
  return data;
}

export async function getProject(projectId: string) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
  assertNoDbError(error, "Could not resolve project");
  return data;
}

export async function getSubmission(submissionId: string) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("submissions").select("*").eq("id", submissionId).maybeSingle();
  assertNoDbError(error, "Could not resolve submission");
  return data;
}

export function getProjectAccess(params: {
  userContext: AuthenticatedUserContext;
  projectId?: string | null;
  clientId?: string | null;
}) {
  const { userContext, projectId, clientId } = params;
  try {
    if (clientId) assertClientAccess(userContext, clientId);
    if (projectId) assertProjectAccess(userContext, projectId);
    return {
      allowed: true,
      role: userContext.role,
      user_id: userContext.user_id,
      client_id: userContext.client_id,
      allowed_projects: userContext.allowed_project_ids
    };
  } catch (error) {
    return {
      allowed: false,
      reason: error instanceof Error ? error.message : "Unknown access error",
      role: userContext.role,
      user_id: userContext.user_id,
      client_id: userContext.client_id,
      allowed_projects: userContext.allowed_project_ids
    };
  }
}

export async function getUserContext(request?: Request): Promise<ProjectAccessRegistry> {
  return getProjectAccessRegistry(request);
}

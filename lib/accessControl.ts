import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { getCurrentUserContext } from "@/lib/auth";
import type { UserRole } from "@/lib/types";

export type AuthenticatedUserContext = {
  user_id: string;
  email: string | null;
  role: UserRole;
  client_id: string | null;
  allowed_project_ids: string[];
  is_admin: boolean;
};

export class AccessControlError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "AccessControlError";
    this.status = status;
  }
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim())));
}

function profileProjectIds(profile: Record<string, unknown> | null | undefined) {
  if (!profile || !Array.isArray(profile.assigned_project_ids)) return [];
  return unique(profile.assigned_project_ids as Array<string | null | undefined>);
}

async function getClientProjectIds(clientId: string) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("client_id", clientId)
    .is("archived_at", null);

  if (error) {
    throw new AccessControlError(`Could not resolve project access scope: ${error.message}`, 500);
  }

  return unique((data ?? []).map((row) => row.id as string));
}

async function getInstallerProjectIds(userId: string, profile: Record<string, unknown> | null | undefined) {
  const supabase = createAdminSupabase();
  const profileIds = profileProjectIds(profile);

  const { data, error } = await supabase
    .from("installers")
    .select("assigned_project_ids")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new AccessControlError(`Could not resolve installer project access: ${error.message}`, 500);
  }

  const installerIds = Array.isArray(data?.assigned_project_ids)
    ? unique(data.assigned_project_ids as Array<string | null | undefined>)
    : [];

  return unique([...profileIds, ...installerIds]);
}

export async function getAuthenticatedUserContext(_request?: Request): Promise<AuthenticatedUserContext> {
  const context = await getCurrentUserContext();
  if (!context) {
    throw new AccessControlError("Unauthorized.", 401);
  }

  const role = context.role.role;
  const clientId = context.role.client_id ?? null;

  let allowedProjectIds: string[] = [];
  if (role === "client" && clientId) {
    allowedProjectIds = await getClientProjectIds(clientId);
  }

  if (role === "installer") {
    allowedProjectIds = await getInstallerProjectIds(context.user.id, context.profile ?? null);
  }

  return {
    user_id: context.user.id,
    email: context.user.email ?? null,
    role,
    client_id: clientId,
    allowed_project_ids: allowedProjectIds,
    is_admin: role === "admin"
  };
}

export async function requireAdmin(request?: Request) {
  const context = await getAuthenticatedUserContext(request);
  if (!context.is_admin) throw new AccessControlError("Unauthorized.", 403);
  return context;
}

export async function requireClientUser(request?: Request) {
  const context = await getAuthenticatedUserContext(request);
  if (context.role !== "client") throw new AccessControlError("Unauthorized.", 403);
  if (!context.client_id) throw new AccessControlError("Client account is not linked.", 400);
  return context;
}

export async function requireInstaller(request?: Request) {
  const context = await getAuthenticatedUserContext(request);
  if (context.role !== "installer") throw new AccessControlError("Unauthorized.", 403);
  return context;
}

export function assertClientAccess(userContext: AuthenticatedUserContext, clientId: string | null | undefined) {
  const normalizedClientId = typeof clientId === "string" ? clientId.trim() : "";
  if (!normalizedClientId) return;
  if (userContext.is_admin) return;
  if (!userContext.client_id || userContext.client_id !== normalizedClientId) {
    throw new AccessControlError("You do not have access to this client.", 403);
  }
}

export function assertProjectAccess(
  userContext: AuthenticatedUserContext,
  projectId: string | null | undefined,
  options?: { allowWhenNoAssignments?: boolean }
) {
  const normalizedProjectId = typeof projectId === "string" ? projectId.trim() : "";
  if (!normalizedProjectId) return;
  if (userContext.is_admin) return;

  if (userContext.role === "client") {
    if (!userContext.allowed_project_ids.includes(normalizedProjectId)) {
      throw new AccessControlError("You do not have access to this project.", 403);
    }
    return;
  }

  if (userContext.role === "installer") {
    if (userContext.allowed_project_ids.length === 0 && options?.allowWhenNoAssignments) {
      return;
    }

    if (!userContext.allowed_project_ids.includes(normalizedProjectId)) {
      throw new AccessControlError("You do not have access to this project.", 403);
    }
  }
}

export function applyTenantProjectScope<T extends { eq: Function; in: Function }>(
  query: T,
  userContext: AuthenticatedUserContext,
  options?: {
    clientColumn?: string;
    projectColumn?: string;
    requestedClientId?: string | null;
    requestedProjectId?: string | null;
    allowAdminUnscoped?: boolean;
  }
) {
  const clientColumn = options?.clientColumn ?? "client_id";
  const projectColumn = options?.projectColumn ?? "project_id";
  const requestedClientId = options?.requestedClientId?.trim() || null;
  const requestedProjectId = options?.requestedProjectId?.trim() || null;

  if (requestedClientId) {
    assertClientAccess(userContext, requestedClientId);
  }

  if (requestedProjectId) {
    assertProjectAccess(userContext, requestedProjectId, {
      allowWhenNoAssignments: false
    });
  }

  let scopedQuery = query;

  if (userContext.is_admin) {
    if (requestedClientId) scopedQuery = scopedQuery.eq(clientColumn, requestedClientId);
    if (requestedProjectId) scopedQuery = scopedQuery.eq(projectColumn, requestedProjectId);
    if (!options?.allowAdminUnscoped && !requestedClientId && !requestedProjectId) {
      return scopedQuery;
    }
    return scopedQuery;
  }

  if (userContext.client_id) {
    scopedQuery = scopedQuery.eq(clientColumn, userContext.client_id);
  }

  if (requestedProjectId) {
    scopedQuery = scopedQuery.eq(projectColumn, requestedProjectId);
    return scopedQuery;
  }

  if (userContext.allowed_project_ids.length > 0) {
    scopedQuery = scopedQuery.in(projectColumn, userContext.allowed_project_ids);
  }

  return scopedQuery;
}

export function accessControlErrorResponse(error: unknown) {
  if (error instanceof AccessControlError) {
    return { status: error.status, payload: { error: error.message } };
  }

  const message = error instanceof Error ? error.message : "Something went wrong.";
  return { status: 500, payload: { error: message } };
}

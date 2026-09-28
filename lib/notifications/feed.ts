import "server-only";
import type { AuthenticatedUserContext } from "../accessControl.ts";
import { createAdminSupabase } from "../supabaseAdmin.ts";
import { listAuthenticatedBuildNotifications } from "../build/notifications/repository.ts";
import { composeWorkspaceNotificationFeed, type WorkspaceNotificationFeed } from "./composition.ts";
import { projectRetailNotification, type WorkspaceNotification } from "./presentation.ts";

async function listRetail(context: AuthenticatedUserContext, requestedClientId: string | null, requestedProjectId: string | null) {
  const supabase = createAdminSupabase();
  let query = supabase.from("notification_events").select("*").order("created_at", { ascending: false }).limit(80);
  if (context.role === "client") {
    query = query.eq("client_id", context.client_id!);
    if (requestedProjectId) query = query.eq("project_id", requestedProjectId);
  } else {
    if (requestedClientId) query = query.eq("client_id", requestedClientId);
    if (requestedProjectId) query = query.eq("project_id", requestedProjectId);
  }
  const { data, error } = await query;
  if (error) throw new Error("Could not load Retail notifications");
  const projectIds = [...new Set((data ?? []).map((row) => row.project_id).filter((id): id is string => typeof id === "string"))];
  const projectMap = new Map<string, { project_name?: string | null; campaign_name?: string | null }>();
  if (projectIds.length) {
    let projectQuery = supabase.from("projects").select("id,project_name,campaign_name").in("id", projectIds);
    if (context.role === "client") projectQuery = projectQuery.eq("client_id", context.client_id!);
    const { data: projects, error: projectError } = await projectQuery;
    if (projectError) throw new Error("Could not load notification project labels");
    for (const project of projects ?? []) projectMap.set(project.id, project);
  }
  return (data ?? []).map((row) => {
    const project = row.project_id ? projectMap.get(row.project_id) : null;
    return projectRetailNotification({ ...row, project_name: project?.project_name ?? null, campaign_name: project?.campaign_name ?? null });
  });
}

export async function getWorkspaceNotificationFeed(input: {
  context: AuthenticatedUserContext;
  requestedClientId: string | null;
  requestedProjectId: string | null;
}): Promise<WorkspaceNotificationFeed> {
  const retailPromise = listRetail(input.context, input.requestedClientId, input.requestedProjectId);
  const buildPromise = input.context.role === "client"
    ? listAuthenticatedBuildNotifications().then(({ notifications }) => input.requestedProjectId ? notifications.filter((row) => row.projectId === input.requestedProjectId) : notifications)
    : Promise.resolve([] as WorkspaceNotification[]);
  const [retail, build] = await Promise.allSettled([retailPromise, buildPromise]);
  const unavailable = [retail.status === "rejected" ? "retail" : null, build.status === "rejected" ? "build" : null].filter(Boolean);
  if (unavailable.length) console.warn("[notifications] partial feed", { unavailableSources: unavailable });
  return composeWorkspaceNotificationFeed(retail, build);
}

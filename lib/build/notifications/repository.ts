import "server-only";
import { AccessControlError, getAuthenticatedUserContext, type AuthenticatedUserContext } from "../../accessControl.ts";
import { createAdminSupabase } from "../../supabaseAdmin.ts";
import { BUILD_NOTIFICATION_LABELS, type WorkspaceNotification } from "../../notifications/presentation.ts";
import { reconcileAuthenticatedBuildNotifications } from "./service.ts";

const BUILD_PROJECT_TYPES = new Set(["Construction", "Real Estate", "Facility Management"]);
const MAX_RECONCILIATION_PROJECTS = 20;
type Row = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" ? value : "";

async function resolveRecipientScope(context: AuthenticatedUserContext) {
  if (context.role !== "client" || !context.client_id) throw new AccessControlError("Unauthorized.", 403);
  const supabase = createAdminSupabase();
  const [{ data: membership, error: membershipError }, { data: projects, error: projectError }] = await Promise.all([
    supabase.from("workspace_memberships").select("user_id").eq("client_id", context.client_id).eq("user_id", context.user_id).eq("status", "active").maybeSingle(),
    context.allowed_project_ids.length
      ? supabase.from("projects").select("id,client_id,project_name,project_type,status,archived_at").eq("client_id", context.client_id).in("id", context.allowed_project_ids).is("archived_at", null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (membershipError || !membership) throw new AccessControlError("Unauthorized.", 403);
  if (projectError) throw new Error("Could not resolve Build notification project scope");
  const eligible = (projects ?? []).filter((project) => BUILD_PROJECT_TYPES.has(text(project.project_type)));
  return { supabase, projects: eligible, projectIds: eligible.map((project) => text(project.id)), projectLabels: new Map(eligible.map((project) => [text(project.id), text(project.project_name)])) };
}

async function reconcileBackstop(projectIds: string[]) {
  const bounded = projectIds.slice(0, MAX_RECONCILIATION_PROJECTS);
  const results = await Promise.allSettled(bounded.map((projectId) => reconcileAuthenticatedBuildNotifications({ projectId })));
  const failures = results.filter((result) => result.status === "rejected").length;
  if (failures) console.warn("[build-notifications] reconciliation unavailable", { projectsAttempted: bounded.length, failures });
  return { attempted: bounded.length, failures, truncated: projectIds.length > bounded.length };
}

async function loadAuthorizedRows(context: AuthenticatedUserContext, options?: { id?: string; reconcile?: boolean }) {
  const scope = await resolveRecipientScope(context);
  if (options?.reconcile !== false && scope.projectIds.length) await reconcileBackstop(scope.projectIds);
  if (!scope.projectIds.length) return { rows: [] as Row[], scope };
  const { data: recipients, error: recipientError } = await scope.supabase.from("build_notification_rule_recipients")
    .select("rule_id").eq("client_id", context.client_id!).eq("recipient_user_id", context.user_id).is("removed_at", null);
  if (recipientError) throw new Error("Could not authorize Build notification recipients");
  const ruleIds = [...new Set((recipients ?? []).map((row) => text(row.rule_id)).filter(Boolean))];
  if (!ruleIds.length) return { rows: [] as Row[], scope };
  let query = scope.supabase.from("build_recipient_notifications")
    .select("id,client_id,project_id,rule_id,rule_version,episode_id,recipient_user_id,category,title,summary,destination_type,materialized_at,read_at,acknowledged_at,acknowledged_by,suppression_state,resolved_at")
    .eq("client_id", context.client_id!).eq("recipient_user_id", context.user_id).eq("suppression_state", "visible")
    .in("project_id", scope.projectIds).in("rule_id", ruleIds).order("materialized_at", { ascending: false }).limit(80);
  if (options?.id) query = query.eq("id", options.id);
  const { data, error } = await query;
  if (error) throw new Error("Could not load Build notifications");
  return { rows: (data ?? []) as Row[], scope };
}

async function destinations(rows: Row[], context: AuthenticatedUserContext) {
  const supabase = createAdminSupabase();
  const episodeIds = [...new Set(rows.map((row) => text(row.episode_id)).filter(Boolean))];
  if (!episodeIds.length) return new Map<string, { type: string; href: string; available: boolean }>();
  const { data: episodes, error: episodeError } = await supabase.from("build_notification_episodes").select("id,condition_id").in("id", episodeIds);
  if (episodeError) throw new Error("Could not resolve Build notification episodes");
  const conditionIds = [...new Set((episodes ?? []).map((row) => text(row.condition_id)).filter(Boolean))];
  const { data: conditions, error: conditionError } = conditionIds.length
    ? await supabase.from("build_notification_conditions").select("id,client_id,project_id,category,source_entity_type,source_entity_id").in("id", conditionIds)
    : { data: [], error: null };
  if (conditionError) throw new Error("Could not resolve Build notification conditions");
  const conditionById = new Map((conditions ?? []).map((row) => [text(row.id), row]));
  const conditionByEpisode = new Map((episodes ?? []).map((row) => [text(row.id), conditionById.get(text(row.condition_id))]));
  const directActivityIds = [...new Set((conditions ?? []).filter((row) => row.source_entity_type === "runtime_activity").map((row) => text(row.source_entity_id)))];
  const exceptionIds = [...new Set((conditions ?? []).filter((row) => row.source_entity_type === "runtime_exception").map((row) => text(row.source_entity_id)))];
  const { data: exceptions, error: exceptionError } = exceptionIds.length
    ? await supabase.from("build_runtime_exceptions").select("id,client_id,project_id,runtime_activity_id").eq("client_id", context.client_id!).in("project_id", context.allowed_project_ids).in("id", exceptionIds)
    : { data: [], error: null };
  if (exceptionError) throw new Error("Could not authorize Build notification destinations");
  const activityIds = [...new Set([...directActivityIds, ...(exceptions ?? []).map((row) => text(row.runtime_activity_id))].filter(Boolean))];
  const { data: activities, error: activityError } = activityIds.length
    ? await supabase.from("build_runtime_activities").select("id,client_id,project_id").eq("client_id", context.client_id!).in("project_id", context.allowed_project_ids).in("id", activityIds).is("archived_at", null)
    : { data: [], error: null };
  if (activityError) throw new Error("Could not authorize Build notification destinations");
  const activityById = new Map((activities ?? []).map((row) => [text(row.id), row]));
  const exceptionById = new Map((exceptions ?? []).map((row) => [text(row.id), row]));
  const result = new Map<string, { type: string; href: string; available: boolean }>();
  for (const row of rows) {
    const condition = conditionByEpisode.get(text(row.episode_id));
    const projectId = text(row.project_id), category = text(row.category), destinationType = text(row.destination_type);
    if (!condition || text(condition.client_id) !== context.client_id || text(condition.project_id) !== projectId) { result.set(text(row.id), { type: destinationType, href: "", available: false }); continue; }
    let activityId = "";
    if (condition.source_entity_type === "runtime_activity") {
      const activity = activityById.get(text(condition.source_entity_id));
      if (text(activity?.client_id) === context.client_id && text(activity?.project_id) === projectId) activityId = text(activity?.id);
    }
    if (condition.source_entity_type === "runtime_exception") {
      const exception = exceptionById.get(text(condition.source_entity_id));
      const activity = exception ? activityById.get(text(exception.runtime_activity_id)) : null;
      if (text(exception?.client_id) === context.client_id && text(exception?.project_id) === projectId
        && text(activity?.client_id) === context.client_id && text(activity?.project_id) === projectId) activityId = text(activity?.id);
    }
    const expectedType = category === "execution_block" ? "activity_execution" : category === "exception" ? "activity_exceptions" : "activity_inspection";
    if (!activityId || destinationType !== expectedType) { result.set(text(row.id), { type: expectedType, href: "", available: false }); continue; }
    const view = category === "execution_block" ? "execution" : category === "exception" ? "exceptions" : "inspection";
    result.set(text(row.id), { type: expectedType, href: `/workspace/admin/projects/${encodeURIComponent(projectId)}/activities/${encodeURIComponent(activityId)}?view=${view}`, available: true });
  }
  return result;
}

export async function listAuthenticatedBuildNotifications(options?: { reconcile?: boolean }) {
  const context = await getAuthenticatedUserContext();
  const { rows, scope } = await loadAuthorizedRows(context, options);
  const destinationById = await destinations(rows, context);
  const notifications: WorkspaceNotification[] = rows.map((row) => ({
    id: text(row.id), source: "build", category: text(row.category),
    title: text(row.title) || BUILD_NOTIFICATION_LABELS[text(row.category) as keyof typeof BUILD_NOTIFICATION_LABELS] || "Build Update",
    summary: text(row.summary), projectId: text(row.project_id) || null, projectLabel: scope.projectLabels.get(text(row.project_id)) ?? null,
    occurredAt: text(row.materialized_at), readAt: text(row.read_at) || null,
    canAcknowledge: !row.acknowledged_at, acknowledgedAt: text(row.acknowledged_at) || null,
    state: row.resolved_at ? "resolved" : "active", destination: destinationById.get(text(row.id)) ?? null,
  }));
  return { notifications, reconciliationBound: MAX_RECONCILIATION_PROJECTS };
}

export async function getAuthenticatedBuildNotificationConsumption(id: string) {
  const context = await getAuthenticatedUserContext();
  const { rows } = await loadAuthorizedRows(context, { id, reconcile: false });
  const row = rows[0];
  if (!row) throw new AccessControlError("Notification is unavailable.", 404);
  const destination = (await destinations([row], context)).get(text(row.id));
  if (!destination?.available) throw new AccessControlError("Notification destination is unavailable.", 404);
  const match = destination.href.match(/^\/workspace\/admin\/projects\/([^/]+)\/activities\/([^?]+)\?view=(execution|inspection|exceptions)$/);
  if (!match) throw new AccessControlError("Notification destination is unavailable.", 404);
  return { notificationId: text(row.id), projectId: decodeURIComponent(match[1]), activityId: decodeURIComponent(match[2]), view: match[3] as "execution" | "inspection" | "exceptions" };
}

export async function updateAuthenticatedBuildNotification(input: { id: string; action: "mark_read" | "acknowledge" }) {
  const context = await getAuthenticatedUserContext();
  const { rows } = await loadAuthorizedRows(context, { id: input.id, reconcile: false });
  const row = rows[0];
  if (!row) throw new AccessControlError("Notification is unavailable.", 404);
  const now = new Date().toISOString();
  const patch = input.action === "mark_read" ? { read_at: row.read_at || now }
    : { acknowledged_at: row.acknowledged_at || now, acknowledged_by: context.user_id };
  const supabase = createAdminSupabase();
  const { error } = await supabase.from("build_recipient_notifications").update(patch)
    .eq("id", input.id).eq("client_id", context.client_id!).eq("recipient_user_id", context.user_id).eq("suppression_state", "visible");
  if (error) throw new Error("Could not update Build notification");
  const eventType = input.action === "mark_read" ? "notification_read" : "notification_acknowledged";
  const { error: auditError } = await supabase.from("build_notification_audit_events").upsert({
    client_id: row.client_id, project_id: row.project_id, event_type: eventType,
    transition_key: `notification:${row.id}:${input.action}`, actor_user_id: context.user_id,
    rule_id: row.rule_id, rule_version: row.rule_version, category: row.category, episode_id: row.episode_id,
    recipient_user_id: context.user_id, prior_state: input.action === "mark_read" ? "unread" : "unacknowledged",
    resulting_state: input.action === "mark_read" ? "read" : "acknowledged", evaluated_at: now,
  }, { onConflict: "transition_key", ignoreDuplicates: true });
  if (auditError) throw new Error("Could not audit Build notification update");
  return { ok: true, action: input.action, at: input.action === "mark_read" ? text(row.read_at) || now : text(row.acknowledged_at) || now };
}

import "server-only";
import { AccessControlError } from "@/lib/accessControl";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { resolveCanonicalBuildProject } from "@/lib/build/projects/service";
import { reconcileAuthenticatedBuildNotifications } from "@/lib/build/notifications/service";
import { BUILD_NOTIFICATION_CATEGORIES, BUILD_NOTIFICATION_CATEGORY_PRESENTATION, type BuildNotificationCategory, type BuildNotificationSettings, type BuildNotificationSettingsUpdate, type EligibleBuildNotificationRecipient } from "./settingsTypes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const encodeRevision = (category: BuildNotificationCategory, version: number) => Buffer.from(`${category}:${version}`).toString("base64url");
function decodeRevision(category: BuildNotificationCategory, revision: string | null) {
  if (revision === null) return null;
  try {
    const [decodedCategory, version, extra] = Buffer.from(revision, "base64url").toString("utf8").split(":");
    if (decodedCategory !== category || extra !== undefined || !/^\d+$/.test(version) || Number(version) < 1) throw new Error();
    return Number(version);
  } catch { throw new AccessControlError("Notification settings revision is invalid.", 400); }
}

async function resolveSettingsAuthority(projectId: string, request?: Request) {
  const resolved = await resolveCanonicalBuildProject({ request, projectId, requiredPermission: "projects:read" });
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.rpc("read_build_notification_governance_context", { p_project_id: resolved.project.id, p_actor_user_id: resolved.authContext.user_id });
  if (error) throw new AccessControlError("Could not verify notification settings authority.", 500);
  const context = data as { canManage?: boolean; eligibleRecipients?: EligibleBuildNotificationRecipient[] } | null;
  if (!context?.canManage) throw new AccessControlError("You do not have permission to manage notification settings.", 403);
  return { ...resolved, supabase, eligible: Array.isArray(context.eligibleRecipients) ? context.eligibleRecipients : [] };
}

export async function getBuildNotificationSettings(input: { projectId: string; request?: Request }): Promise<BuildNotificationSettings> {
  const { project, supabase, eligible } = await resolveSettingsAuthority(input.projectId, input.request);
  const { data: rules, error } = await supabase.from("build_notification_rules")
    .select("id,category,enabled,version").eq("client_id", project.client_id).eq("project_id", project.id).eq("channel", "in_app");
  if (error) throw new AccessControlError("Could not load notification settings.", 500);
  const ruleIds = (rules ?? []).map((rule) => rule.id);
  const recipientResult = ruleIds.length ? await supabase.from("build_notification_rule_recipients")
    .select("rule_id,recipient_user_id").in("rule_id", ruleIds).is("removed_at", null) : { data: [], error: null };
  if (recipientResult.error) throw new AccessControlError("Could not load notification settings.", 500);
  const eligibleById = new Map(eligible.map((recipient) => [recipient.userId, recipient]));
  const ruleByCategory = new Map((rules ?? []).map((rule) => [rule.category, rule]));
  const preferences = BUILD_NOTIFICATION_CATEGORIES.map((category) => {
    const rule = ruleByCategory.get(category);
    const recipients = rule ? (recipientResult.data ?? []).filter((row) => row.rule_id === rule.id).map((row) => eligibleById.get(row.recipient_user_id)).filter((row): row is EligibleBuildNotificationRecipient => Boolean(row)) : [];
    return { category, ...BUILD_NOTIFICATION_CATEGORY_PRESENTATION[category], enabled: Boolean(rule?.enabled), revision: rule ? encodeRevision(category, rule.version) : null, recipients };
  });
  return { project: { id: project.id, name: project.project_name }, channel: "in_app", preferences, eligibleRecipients: eligible, canManage: true };
}

export async function updateBuildNotificationSettings(input: { projectId: string; request?: Request; update: BuildNotificationSettingsUpdate }) {
  const { project, authContext, supabase, eligible } = await resolveSettingsAuthority(input.projectId, input.request);
  if (!input.update || !Array.isArray(input.update.preferences) || input.update.preferences.length !== BUILD_NOTIFICATION_CATEGORIES.length) throw new AccessControlError("Submit all notification categories.", 400);
  const eligibleIds = new Set(eligible.map((recipient) => recipient.userId));
  const seen = new Set<string>();
  const preferences = input.update.preferences.map((preference) => {
    if (!BUILD_NOTIFICATION_CATEGORIES.includes(preference.category) || seen.has(preference.category)) throw new AccessControlError("Notification category is invalid.", 400);
    seen.add(preference.category);
    const recipientUserIds = [...new Set(Array.isArray(preference.recipientUserIds) ? preference.recipientUserIds.map(text) : [])];
    if (recipientUserIds.some((id) => !UUID.test(id) || !eligibleIds.has(id))) throw new AccessControlError("A selected recipient is no longer eligible. Refresh and try again.", 409);
    if (preference.enabled && recipientUserIds.length === 0) throw new AccessControlError("Select at least one eligible recipient before enabling this notification.", 400);
    return { category: preference.category, enabled: Boolean(preference.enabled), expectedVersion: decodeRevision(preference.category, preference.revision), recipientUserIds };
  });
  const { error } = await supabase.rpc("configure_build_notification_settings", { p_project_id: project.id, p_actor_user_id: authContext.user_id, p_preferences: preferences });
  if (error) {
    if (error.message.includes("BUILD_NOTIFICATION_SETTINGS_STALE")) throw new AccessControlError("Notification settings changed. Refresh and try again.", 409);
    if (error.message.includes("BUILD_NOTIFICATION_RECIPIENT_INVALID")) throw new AccessControlError("A selected recipient is no longer eligible. Refresh and try again.", 409);
    throw new AccessControlError("Notification settings could not be saved.", 500);
  }
  try { await reconcileAuthenticatedBuildNotifications({ projectId: project.id }); } catch { console.warn("[build-notifications] post-governance reconciliation unavailable", { projectId: project.id }); }
  return getBuildNotificationSettings({ projectId: project.id, request: input.request });
}

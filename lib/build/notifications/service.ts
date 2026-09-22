import "server-only";
import { createAdminSupabase } from "../../supabaseAdmin.ts";
import { resolveCanonicalBuildProject } from "../projects/service.ts";
import { getBuildManagementSummary } from "../management/service.ts";
import { deriveBuildNotificationCandidates } from "./triggers.ts";
import type { ExistingBuildNotificationCondition, BuildNotificationReconciliationResult } from "./types.ts";

export async function reconcileAuthenticatedBuildNotifications(input: { projectId: string; evaluatedAt?: Date }): Promise<BuildNotificationReconciliationResult> {
  const evaluatedAt = input.evaluatedAt ?? new Date();
  if (!Number.isFinite(evaluatedAt.getTime())) throw new Error("Build notification evaluation time is invalid");
  const { project } = await resolveCanonicalBuildProject({ projectId: input.projectId, requiredPermission: "projects:read" });
  const summary = await getBuildManagementSummary(project.id, evaluatedAt);
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.from("build_notification_conditions")
    .select("client_id,project_id,category,source_entity_type,source_entity_id,condition_discriminator")
    .eq("client_id", project.client_id).eq("project_id", project.id);
  if (error) throw new Error("Could not load Build notification conditions");
  const existing = (data ?? []).map((row) => ({ clientId: row.client_id, projectId: row.project_id, category: row.category,
    sourceEntityType: row.source_entity_type, sourceEntityId: row.source_entity_id, discriminator: row.condition_discriminator })) as ExistingBuildNotificationCondition[];
  const candidates = deriveBuildNotificationCandidates({ clientId: project.client_id, projectId: project.id,
    attentionItems: summary.managementAttentionItems, existingConditions: existing });
  const { data: result, error: reconcileError } = await supabase.rpc("reconcile_build_notifications", {
    p_client_id: project.client_id, p_project_id: project.id, p_candidates: candidates, p_evaluated_at: evaluatedAt.toISOString(),
  });
  if (reconcileError) throw new Error("Could not reconcile Build notifications");
  return result as BuildNotificationReconciliationResult;
}

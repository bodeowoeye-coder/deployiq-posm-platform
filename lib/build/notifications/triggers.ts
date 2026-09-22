import type { ManagementAttentionItem } from "../management/managementAttention.ts";
import type { BuildNotificationCandidate, ExistingBuildNotificationCondition } from "./types.ts";

const supported = new Set(["execution_block", "changes_required", "review_pending", "exception"]);
const contract = {
  execution_block: { source: "runtime_activity", discriminator: "blocked", destination: "activity_execution", view: "execution" },
  changes_required: { source: "runtime_activity", discriminator: "changes_required", destination: "activity_inspection", view: "inspection" },
  review_pending: { source: "runtime_activity", discriminator: "submitted_for_review", destination: "activity_inspection", view: "inspection" },
  exception: { source: "runtime_exception", discriminator: "active", destination: "activity_exceptions", view: "exceptions" },
} as const;

const key = (item: Pick<BuildNotificationCandidate, "category" | "sourceEntityType" | "sourceEntityId" | "discriminator">) =>
  `${item.category}:${item.sourceEntityType}:${item.sourceEntityId}:${item.discriminator}`;

function path(projectId: string, activityId: string, view: string) {
  return `/workspace/admin/projects/${encodeURIComponent(projectId)}/activities/${encodeURIComponent(activityId)}?view=${view}`;
}

export function deriveBuildNotificationCandidates(input: {
  clientId: string;
  projectId: string;
  attentionItems: ReadonlyArray<ManagementAttentionItem>;
  existingConditions?: ReadonlyArray<ExistingBuildNotificationCondition>;
}): BuildNotificationCandidate[] {
  const candidates = new Map<string, BuildNotificationCandidate>();
  for (const item of input.attentionItems) {
    if (!supported.has(item.type) || item.dataQuality !== "complete" || !item.observedAt || !item.activityId) continue;
    const definition = contract[item.type as keyof typeof contract];
    if (item.projectId !== input.projectId || item.sourceRecordType !== definition.source) continue;
    const candidate: BuildNotificationCandidate = {
      clientId: input.clientId, projectId: input.projectId,
      category: item.type as BuildNotificationCandidate["category"],
      sourceEntityType: definition.source, sourceEntityId: item.sourceRecordId,
      discriminator: definition.discriminator, active: true, authoritativeAt: item.observedAt,
      destinationType: definition.destination,
      destinationPath: path(input.projectId, item.activityId, definition.view),
    };
    candidates.set(key(candidate), candidate);
  }
  for (const condition of input.existingConditions ?? []) {
    if (condition.clientId !== input.clientId || condition.projectId !== input.projectId || candidates.has(key(condition))) continue;
    const definition = contract[condition.category];
    candidates.set(key(condition), { ...condition, active: false, authoritativeAt: null,
      destinationType: definition.destination,
      destinationPath: `/workspace/admin/projects/${encodeURIComponent(input.projectId)}/activities/00000000-0000-0000-0000-000000000000?view=${definition.view}` });
  }
  return [...candidates.values()].sort((left, right) => key(left).localeCompare(key(right)));
}

import type { BuildNotificationCandidate, BuildNotificationCategory } from "./types.ts";

export type ReconciliationRule = { id: string; category: BuildNotificationCategory; enabled: boolean; version: number; recipients: string[] };
export type ReconciliationState = {
  conditions: Array<{ id: string; key: string; nextEpisode: number }>;
  episodes: Array<{ id: string; conditionId: string; number: number; resolved: boolean }>;
  notifications: Array<{ key: string; episodeId: string; ruleId: string; recipientId: string; read: boolean; acknowledged: boolean; resolved: boolean }>;
  auditKeys: string[];
};

const conditionKey = (c: BuildNotificationCandidate) => `${c.clientId}:${c.projectId}:${c.category}:${c.sourceEntityType}:${c.sourceEntityId}:${c.discriminator}`;
export function reconcileBuildNotificationState(input: { candidates: BuildNotificationCandidate[]; rules: ReconciliationRule[]; state: ReconciliationState; projectState?: string }) {
  const state: ReconciliationState = structuredClone(input.state);
  const audit = new Set(state.auditKeys);
  let sequence = state.conditions.length + 1;
  if (input.projectState === "archived") return state;
  for (const candidate of input.candidates) {
    const identity = conditionKey(candidate);
    let condition = state.conditions.find((row) => row.key === identity);
    if (!condition) { condition = { id: `condition-${sequence++}`, key: identity, nextEpisode: 1 }; state.conditions.push(condition); }
    let episode = state.episodes.find((row) => row.conditionId === condition!.id && !row.resolved);
    const activationAllowed = !["On Hold", "Completed", "Cancelled"].includes(input.projectState ?? "Active");
    if (candidate.active && !episode && activationAllowed) {
      episode = { id: `${condition.id}:episode:${condition.nextEpisode}`, conditionId: condition.id, number: condition.nextEpisode++, resolved: false };
      state.episodes.push(episode); audit.add(`episode:${episode.id}:activated`);
    } else if (!candidate.active && episode) {
      episode.resolved = true; audit.add(`episode:${episode.id}:resolved`);
      for (const notification of state.notifications.filter((row) => row.episodeId === episode!.id)) notification.resolved = true;
    }
    if (!candidate.active || !episode || input.projectState === "On Hold") continue;
    for (const rule of input.rules.filter((row) => row.enabled && row.category === candidate.category)) for (const recipient of rule.recipients) {
      const notificationKey = `${episode.id}:${rule.id}:${recipient}:in_app`;
      if (!state.notifications.some((row) => row.key === notificationKey)) {
        state.notifications.push({ key: notificationKey, episodeId: episode.id, ruleId: rule.id, recipientId: recipient, read: false, acknowledged: false, resolved: false });
        audit.add(`notification:${notificationKey}:materialized`);
      }
    }
  }
  state.auditKeys = [...audit].sort();
  return state;
}

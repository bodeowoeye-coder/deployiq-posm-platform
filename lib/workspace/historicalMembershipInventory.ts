import { createHash } from "node:crypto";

export type HistoricalRoleClassification =
  | "confirmed_administrator"
  | "confirmed_supervisor"
  | "ambiguous"
  | "conflicting_history"
  | "insufficient_history";

export type HistoricalMembershipSnapshot = {
  clientId: string;
  membershipId: string;
  userId: string;
  currentRoleId: string | null;
  currentRoleKey: string;
  membershipStatus: string;
  membershipCreatedAt: string;
  membershipUpdatedAt: string;
  currentRolePermissions: string[];
  operationalSupervisorEvidenceIds?: string[];
};

export type HistoricalRoleAuditSnapshot = {
  id: string;
  targetUserId: string | null;
  actionType: string;
  createdAt: string;
  newValue: unknown;
};

export type HistoricalMembershipInventoryEntry = {
  inventory_run_id: string;
  evidence_cutoff_at: string;
  client_id: string;
  membership_id: string;
  user_id: string;
  current_role_id: string | null;
  current_role_key: "workspace_manager";
  membership_status: string;
  membership_created_at: string;
  membership_updated_at: string;
  latest_reliable_evidence_id: string | null;
  latest_reliable_role_selection: "administrator" | "supervisor" | null;
  evidence_timestamp: string | null;
  evidence_source: "team_invitation" | "team_role_change" | null;
  supporting_evidence_ids: string[];
  classification: HistoricalRoleClassification;
  classification_reason: string;
  recommended_action: "retain_workspace_manager" | "review_supervisor_reclassification" | "manual_review_no_change" | "no_action_inactive";
  manual_review_required: boolean;
  current_role_permission_fingerprint: string;
};

export type HistoricalMembershipInventory = {
  inventory_run_id: string;
  evidence_cutoff_at: string;
  entries: HistoricalMembershipInventoryEntry[];
};

type ReliableEvidence = {
  id: string;
  selection: "administrator" | "supervisor";
  timestamp: string;
  timestampMs: number;
  source: "team_invitation" | "team_role_change";
};

const ROLE_SELECTION_ACTIONS = new Set(["user_invited", "invitation_link_generated", "role_changed"]);
const INVITATION_ACTIONS = new Set(["user_invited", "invitation_link_generated"]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roleSelection(value: unknown): "administrator" | "supervisor" | null {
  const normalized = text(value).toLowerCase();
  if (normalized === "administrator") return "administrator";
  if (normalized === "supervisor") return "supervisor";
  return null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.map(text).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function permissionFingerprint(permissions: string[]) {
  return `sha256:${sha256(JSON.stringify(uniqueSorted(permissions)))}`;
}

function classifyMembership(input: {
  membership: HistoricalMembershipSnapshot;
  auditEvents: HistoricalRoleAuditSnapshot[];
  cutoffAt: string;
  cutoffMs: number;
}): Omit<HistoricalMembershipInventoryEntry, "inventory_run_id"> {
  const { membership } = input;
  const createdMs = timestamp(membership.membershipCreatedAt);
  const updatedMs = timestamp(membership.membershipUpdatedAt);
  if (createdMs === null || updatedMs === null) throw new Error(`Membership ${membership.membershipId} has invalid chronology.`);

  const reliable: ReliableEvidence[] = [];
  let staleEvidenceCount = 0;
  let malformedEvidenceCount = 0;

  for (const event of input.auditEvents) {
    if (!ROLE_SELECTION_ACTIONS.has(event.actionType)) continue;
    if (text(event.targetUserId) !== membership.userId) continue;
    const eventMs = timestamp(event.createdAt);
    if (eventMs === null) {
      malformedEvidenceCount += 1;
      continue;
    }
    if (eventMs > input.cutoffMs) continue;

    const payload = object(event.newValue);
    if (!payload) {
      malformedEvidenceCount += 1;
      continue;
    }
    if (text(payload.clientId) !== membership.clientId) continue;
    const selection = roleSelection(payload.role);
    if (!selection) {
      malformedEvidenceCount += 1;
      continue;
    }

    const source = INVITATION_ACTIONS.has(event.actionType) ? "team_invitation" : "team_role_change";
    const stale = eventMs < createdMs || (source === "team_role_change" && eventMs < updatedMs);
    if (stale) {
      staleEvidenceCount += 1;
      continue;
    }
    reliable.push({ id: event.id, selection, timestamp: event.createdAt, timestampMs: eventMs, source });
  }

  reliable.sort((left, right) => left.timestampMs - right.timestampMs || left.id.localeCompare(right.id));
  const supportingIds = uniqueSorted(reliable.map((event) => event.id));
  const latestMs = reliable.at(-1)?.timestampMs ?? null;
  const latestEvents = latestMs === null ? [] : reliable.filter((event) => event.timestampMs === latestMs);
  const latestSelections = new Set(latestEvents.map((event) => event.selection));

  let classification: HistoricalRoleClassification;
  let reason: string;
  let latest: ReliableEvidence | null = null;
  if (latestSelections.size > 1) {
    classification = "conflicting_history";
    reason = "conflicting_latest_role_selection_events";
  } else if (latestEvents.length > 0) {
    latest = [...latestEvents].sort((left, right) => left.id.localeCompare(right.id))[0];
    classification = latest.selection === "supervisor" ? "confirmed_supervisor" : "confirmed_administrator";
    reason = latest.source === "team_role_change"
      ? `latest_reliable_team_role_change_selected_${latest.selection}`
      : `latest_reliable_team_invitation_selected_${latest.selection}`;
  } else if (staleEvidenceCount > 0) {
    classification = "conflicting_history";
    reason = "role_selection_evidence_conflicts_with_membership_chronology";
  } else if ((membership.operationalSupervisorEvidenceIds ?? []).length > 0) {
    classification = "ambiguous";
    reason = "operational_supervision_without_reliable_role_selection";
  } else {
    classification = "insufficient_history";
    reason = malformedEvidenceCount > 0 ? "role_selection_evidence_is_malformed" : "no_reliable_role_selection_evidence";
  }

  const inactive = membership.membershipStatus !== "active";
  const recommendedAction = inactive
    ? "no_action_inactive"
    : classification === "confirmed_administrator"
      ? "retain_workspace_manager"
      : classification === "confirmed_supervisor"
        ? "review_supervisor_reclassification"
        : "manual_review_no_change";

  return {
    evidence_cutoff_at: input.cutoffAt,
    client_id: membership.clientId,
    membership_id: membership.membershipId,
    user_id: membership.userId,
    current_role_id: membership.currentRoleId,
    current_role_key: "workspace_manager",
    membership_status: membership.membershipStatus,
    membership_created_at: membership.membershipCreatedAt,
    membership_updated_at: membership.membershipUpdatedAt,
    latest_reliable_evidence_id: latest?.id ?? null,
    latest_reliable_role_selection: latest?.selection ?? null,
    evidence_timestamp: latest?.timestamp ?? null,
    evidence_source: latest?.source ?? null,
    supporting_evidence_ids: supportingIds,
    classification,
    classification_reason: reason,
    recommended_action: recommendedAction,
    manual_review_required: inactive || classification !== "confirmed_administrator",
    current_role_permission_fingerprint: permissionFingerprint(membership.currentRolePermissions),
  };
}

export function assembleHistoricalMembershipInventory(input: {
  evidenceCutoffAt: string;
  memberships: HistoricalMembershipSnapshot[];
  auditEvents: HistoricalRoleAuditSnapshot[];
}): HistoricalMembershipInventory {
  const cutoffMs = timestamp(input.evidenceCutoffAt);
  if (cutoffMs === null) throw new Error("Evidence cutoff is invalid.");

  const scopedMemberships = input.memberships
    .filter((membership) => membership.currentRoleKey === "workspace_manager")
    .sort((left, right) => left.clientId.localeCompare(right.clientId) || left.membershipId.localeCompare(right.membershipId));
  const entriesWithoutRunId = scopedMemberships.map((membership) => classifyMembership({
    membership,
    auditEvents: input.auditEvents,
    cutoffAt: input.evidenceCutoffAt,
    cutoffMs,
  }));
  const inventoryRunId = `workspace-role-inventory:${sha256(JSON.stringify({
    evidenceCutoffAt: input.evidenceCutoffAt,
    entries: entriesWithoutRunId,
  }))}`;

  return {
    inventory_run_id: inventoryRunId,
    evidence_cutoff_at: input.evidenceCutoffAt,
    entries: entriesWithoutRunId.map((entry) => ({ inventory_run_id: inventoryRunId, ...entry })),
  };
}

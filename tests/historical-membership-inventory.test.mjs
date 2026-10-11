import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assembleHistoricalMembershipInventory } from "../lib/workspace/historicalMembershipInventory.ts";

const CUTOFF = "2026-10-11T12:00:00.000Z";

function membership(overrides = {}) {
  return {
    clientId: "10000000-0000-4000-8000-000000000001",
    membershipId: "20000000-0000-4000-8000-000000000001",
    userId: "30000000-0000-4000-8000-000000000001",
    currentRoleId: "40000000-0000-4000-8000-000000000001",
    currentRoleKey: "workspace_manager",
    membershipStatus: "active",
    membershipCreatedAt: "2026-08-20T09:00:00.000Z",
    membershipUpdatedAt: "2026-08-20T09:00:00.000Z",
    currentRolePermissions: ["users.manage", "settings.manage"],
    ...overrides,
  };
}

function event(role, overrides = {}) {
  return {
    id: "50000000-0000-4000-8000-000000000001",
    targetUserId: "30000000-0000-4000-8000-000000000001",
    actionType: "user_invited",
    createdAt: "2026-08-20T09:00:01.000Z",
    newValue: { clientId: "10000000-0000-4000-8000-000000000001", role },
    ...overrides,
  };
}

function inventory(memberships, auditEvents = []) {
  return assembleHistoricalMembershipInventory({ evidenceCutoffAt: CUTOFF, memberships, auditEvents });
}

test("confirmed Administrator requires correlated explicit Team selection", () => {
  const row = inventory([membership()], [event("Administrator")]).entries[0];
  assert.equal(row.classification, "confirmed_administrator");
  assert.equal(row.recommended_action, "retain_workspace_manager");
  assert.equal(row.manual_review_required, false);
});

test("confirmed Supervisor requires correlated explicit Team selection", () => {
  const row = inventory([membership()], [event("Supervisor")]).entries[0];
  assert.equal(row.classification, "confirmed_supervisor");
  assert.equal(row.recommended_action, "review_supervisor_reclassification");
  assert.equal(row.manual_review_required, true);
});

test("operational-only supervision remains ambiguous", () => {
  const row = inventory([membership({ operationalSupervisorEvidenceIds: ["runtime-activity-1"] })]).entries[0];
  assert.equal(row.classification, "ambiguous");
  assert.equal(row.classification_reason, "operational_supervision_without_reliable_role_selection");
});

test("missing history remains insufficient", () => {
  assert.equal(inventory([membership()]).entries[0].classification, "insufficient_history");
});

test("unorderable conflicting role selections are reported", () => {
  const events = [event("Administrator"), event("Supervisor", { id: "50000000-0000-4000-8000-000000000002" })];
  const row = inventory([membership()], events).entries[0];
  assert.equal(row.classification, "conflicting_history");
  assert.equal(row.latest_reliable_evidence_id, null);
});

test("latest chronologically ordered role change determines intent", () => {
  const events = [
    event("Administrator"),
    event("Supervisor", { id: "50000000-0000-4000-8000-000000000002", actionType: "role_changed", createdAt: "2026-09-02T10:00:01.000Z" }),
  ];
  const row = inventory([membership({ membershipUpdatedAt: "2026-09-02T10:00:00.000Z" })], events).entries[0];
  assert.equal(row.classification, "confirmed_supervisor");
  assert.equal(row.evidence_source, "team_role_change");
});

test("duplicate equivalent audit events do not create a conflict", () => {
  const events = [event("Supervisor"), event("Supervisor", { id: "50000000-0000-4000-8000-000000000002" })];
  const row = inventory([membership()], events).entries[0];
  assert.equal(row.classification, "confirmed_supervisor");
  assert.deepEqual(row.supporting_evidence_ids, events.map((item) => item.id));
});

test("cross-tenant evidence is rejected", () => {
  const row = inventory([membership()], [event("Supervisor", { newValue: { clientId: "foreign-client", role: "Supervisor" } })]).entries[0];
  assert.equal(row.classification, "insufficient_history");
});

test("wrong-user evidence is rejected", () => {
  const row = inventory([membership()], [event("Supervisor", { targetUserId: "foreign-user" })]).entries[0];
  assert.equal(row.classification, "insufficient_history");
});

test("stale role-change evidence conflicts with membership chronology", () => {
  const stale = event("Supervisor", { actionType: "role_changed", createdAt: "2026-08-21T09:00:00.000Z" });
  const row = inventory([membership({ membershipUpdatedAt: "2026-09-01T09:00:00.000Z" })], [stale]).entries[0];
  assert.equal(row.classification, "conflicting_history");
  assert.equal(row.classification_reason, "role_selection_evidence_conflicts_with_membership_chronology");
});

test("invitation followed by a later role change uses the role change", () => {
  const events = [
    event("Supervisor"),
    event("Administrator", { id: "50000000-0000-4000-8000-000000000002", actionType: "role_changed", createdAt: "2026-09-01T09:00:01.000Z" }),
  ];
  const row = inventory([membership({ membershipUpdatedAt: "2026-09-01T09:00:00.000Z" })], events).entries[0];
  assert.equal(row.classification, "confirmed_administrator");
  assert.equal(row.latest_reliable_role_selection, "administrator");
});

test("inactive membership is classified but never recommended for change", () => {
  const row = inventory([membership({ membershipStatus: "inactive" })], [event("Supervisor")]).entries[0];
  assert.equal(row.classification, "confirmed_supervisor");
  assert.equal(row.recommended_action, "no_action_inactive");
});

test("canonical Supervisor membership is excluded", () => {
  assert.equal(inventory([membership({ currentRoleKey: "supervisor" })]).entries.length, 0);
});

test("Retail field_supervisor membership is excluded", () => {
  assert.equal(inventory([membership({ currentRoleKey: "field_supervisor" })]).entries.length, 0);
});

test("Customer Admin and workspace owner memberships are excluded", () => {
  const rows = [membership({ membershipId: "admin", currentRoleKey: "customer_admin" }), membership({ membershipId: "owner", currentRoleKey: "workspace_owner" })];
  assert.equal(inventory(rows).entries.length, 0);
});

test("customized permissions affect only the deterministic fingerprint", () => {
  const first = inventory([membership({ currentRolePermissions: ["custom.permission", "users.manage"] })], [event("Supervisor")]).entries[0];
  const reordered = inventory([membership({ currentRolePermissions: ["users.manage", "custom.permission", "custom.permission"] })], [event("Supervisor")]).entries[0];
  assert.equal(first.classification, "confirmed_supervisor");
  assert.equal(first.current_role_permission_fingerprint, reordered.current_role_permission_fingerprint);
});

test("repeated execution is byte-for-byte deterministic", () => {
  const inputMemberships = [membership()];
  const events = [event("Administrator")];
  assert.deepEqual(inventory(inputMemberships, events), inventory(inputMemberships, events));
});

test("evidence after the cutoff cannot affect classification", () => {
  const future = event("Supervisor", { createdAt: "2026-10-12T09:00:00.000Z" });
  assert.equal(inventory([membership()], [future]).entries[0].classification, "insufficient_history");
});

test("implementation has no mutation, RPC, route, or authorization side effects", () => {
  const source = readFileSync(new URL("../lib/workspace/historicalMembershipInventory.ts", import.meta.url), "utf8");
  assert.doesNotMatch(
    source,
    /createAdminSupabase|createServerSupabase|\.from\(|\.rpc\(|\.(?:insert|upsert|delete)\(/,
  );
  assert.doesNotMatch(source, /authDestinations|defaultDestinationForResolvedUser|workspaceAccessPolicy/);
});

test("malformed audit payloads never confirm intent", () => {
  const malformed = [
    event("Supervisor", { newValue: null }),
    event("Supervisor", { id: "2", newValue: { clientId: membership().clientId } }),
    event("Supervisor", { id: "3", createdAt: "not-a-date" }),
  ];
  const row = inventory([membership()], malformed).entries[0];
  assert.equal(row.classification, "insufficient_history");
  assert.equal(row.classification_reason, "role_selection_evidence_is_malformed");
});

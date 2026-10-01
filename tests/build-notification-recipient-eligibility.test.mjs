import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deriveBuildNotificationCandidates } from "../lib/build/notifications/triggers.ts";
import { reconcileBuildNotificationState } from "../lib/build/notifications/reconciliation.ts";

const migration = readFileSync(new URL("../supabase/migrations/20261001010000_align_build_notification_recipient_eligibility.sql", import.meta.url), "utf8");
const governance = readFileSync(new URL("../supabase/migrations/20260902020000_configure_build_notification_governance.sql", import.meta.url), "utf8");
const foundation = readFileSync(new URL("../supabase/migrations/20260902010000_add_build_notification_reconciliation_foundation.sql", import.meta.url), "utf8");

const canonicalEligibility = [
  /m\.status='active'/,
  /up\.status='Active'/,
  /wr\.id is null or wr\.status='active'/,
  /coalesce\(wr\.app_role,'client'\)<>'installer'/,
  /assigned_project_ids/,
];

const candidate = () => deriveBuildNotificationCandidates({
  clientId: "client",
  projectId: "project",
  attentionItems: [{
    key: "block", type: "execution_block", projectId: "project", siteId: "site", workPackageId: "package",
    workPlanId: "plan", activityId: "activity", ownerUserId: null, ownerDisplayName: null, ownerKind: null,
    expectedActor: "project_management", expectedActorUserId: null, expectedActorDisplayName: null,
    condition: "Activity blocked", expectedNextAction: "Resume", observedAt: "2026-10-01T10:00:00Z",
    dueAt: null, overdue: null, sourceRecordType: "runtime_activity", sourceRecordId: "activity",
    route: "ignored", dataQuality: "complete",
  }],
})[0];

const empty = () => ({ conditions: [], episodes: [], notifications: [], auditKeys: [] });
const rule = (recipients) => [{ id: "rule", category: "execution_block", enabled: true, version: 1, recipients }];

test("materialization and suppression use the canonical governance eligibility contract", () => {
  for (const predicate of canonicalEligibility) {
    assert.match(governance, predicate);
    assert.ok((migration.match(new RegExp(predicate.source, "g")) ?? []).length >= 2);
  }
  assert.equal((migration.match(/up\.status='Active'/g) ?? []).length, 2);
  assert.doesNotMatch(migration, /up\.status='active'/);
});

test("inactive membership, profile, role, project assignment and cross-tenant state fail closed", () => {
  assert.match(migration, /m\.client_id=n\.client_id and m\.user_id=n\.recipient_user_id and m\.status='active'/);
  assert.match(migration, /m\.client_id=rr\.client_id and m\.user_id=rr\.recipient_user_id and m\.status='active'/);
  assert.match(migration, /join public\.user_profiles up on up\.user_id=m\.user_id and up\.status='Active'/);
  assert.match(migration, /wr\.id is null or wr\.status='active'/);
  assert.match(migration, /n\.project_id=any\(coalesce\(up\.assigned_project_ids,'\{\}'::uuid\[\]\)\)/);
  assert.match(migration, /p_project_id=any\(coalesce\(up\.assigned_project_ids,'\{\}'::uuid\[\]\)\)/);
});

test("eligibility loss suppresses visible history without deleting domain facts", () => {
  assert.match(migration, /not exists\([\s\S]*up\.status='Active'[\s\S]*assigned_project_ids/);
  assert.match(migration, /suppression_state='suppressed',suppression_reason=v_recipient\.reason/);
  assert.match(migration, /recipient_access_revoked/);
  assert.match(migration, /recipient_unauthorized/);
  assert.doesNotMatch(migration, /delete from public\.(build_recipient_notifications|build_notification_conditions|build_notification_episodes|build_notification_audit_events)/i);
});

test("fully eligible configured recipients remain materializable through the existing uniqueness boundary", () => {
  assert.match(migration, /where rr\.rule_id=v_rule\.id and rr\.removed_at is null/);
  assert.match(migration, /insert into public\.build_recipient_notifications/);
  assert.match(migration, /on conflict\(episode_id,rule_id,recipient_user_id,channel\) do nothing/);
  assert.match(foundation, /unique\(episode_id,rule_id,recipient_user_id,channel\)/);
});

test("same-episode restoration does not resurrect or duplicate a prior identity", () => {
  const active = candidate();
  const eligible = reconcileBuildNotificationState({ candidates: [active], rules: rule(["recipient"]), state: empty() });
  const ineligible = reconcileBuildNotificationState({ candidates: [active], rules: rule([]), state: eligible });
  const restored = reconcileBuildNotificationState({ candidates: [active], rules: rule(["recipient"]), state: ineligible });
  assert.equal(eligible.notifications.length, 1);
  assert.equal(restored.notifications.length, 1);
});

test("a restored recipient may receive one notification in a legitimate future episode", () => {
  const active = candidate();
  let state = reconcileBuildNotificationState({ candidates: [active], rules: rule(["recipient"]), state: empty() });
  state = reconcileBuildNotificationState({ candidates: [{ ...active, active: false }], rules: rule(["recipient"]), state });
  state = reconcileBuildNotificationState({ candidates: [active], rules: rule(["recipient"]), state });
  assert.deepEqual(state.episodes.map((episode) => episode.number), [1, 2]);
  assert.equal(state.notifications.length, 2);
});

test("forward migration preserves the service-only reconciliation trust boundary", () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path=pg_catalog/);
  assert.match(migration, /revoke all on function[\s\S]*public,anon,authenticated,service_role/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /email|sms|whatsapp|openai/i);
});

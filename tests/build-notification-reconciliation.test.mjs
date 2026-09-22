import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deriveBuildNotificationCandidates } from "../lib/build/notifications/triggers.ts";
import { reconcileBuildNotificationState } from "../lib/build/notifications/reconciliation.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260902010000_add_build_notification_reconciliation_foundation.sql", import.meta.url), "utf8");
const service = readFileSync(new URL("../lib/build/notifications/service.ts", import.meta.url), "utf8");
const empty = () => ({ conditions: [], episodes: [], notifications: [], auditKeys: [] });
const item = (type, overrides = {}) => ({ key: type, type, projectId: "project", siteId: "site", workPackageId: "package", workPlanId: "plan", activityId: "activity", ownerUserId: null, ownerDisplayName: null, ownerKind: null, expectedActor: "project_management", expectedActorUserId: null, expectedActorDisplayName: null, condition: type, expectedNextAction: null, observedAt: "2026-09-22T10:00:00Z", dueAt: null, overdue: null, sourceRecordType: type === "exception" ? "runtime_exception" : "runtime_activity", sourceRecordId: type === "exception" ? "exception" : "activity", route: "ignored", dataQuality: "complete", ...overrides });
const derive = (items, existingConditions = []) => deriveBuildNotificationCandidates({ clientId: "client", projectId: "project", attentionItems: items, existingConditions });
const rules = [{ id: "rule", category: "execution_block", enabled: true, version: 1, recipients: ["recipient"] }];

test("exactly the four deterministic v1 adapters produce bounded canonical destinations", () => {
  const candidates = derive([item("execution_block"), item("changes_required"), item("review_pending"), item("exception")]);
  assert.deepEqual(candidates.map((row) => row.category), ["changes_required", "exception", "execution_block", "review_pending"]);
  assert.deepEqual(new Set(candidates.map((row) => row.discriminator)), new Set(["blocked", "changes_required", "submitted_for_review", "active"]));
  assert.ok(candidates.every((row) => row.destinationPath.startsWith("/workspace/admin/projects/project/activities/activity?view=")));
});

test("unsupported, incomplete, ambiguous, cross-project and missing-timestamp facts fail closed", () => {
  assert.deepEqual(derive([item("schedule_overdue"), item("execution_block", { dataQuality: "ambiguous_history" }), item("review_pending", { observedAt: null }), item("exception", { projectId: "other" })]), []);
});

test("existing conditions absent from authoritative active facts become inactive candidates", () => {
  const active = derive([item("execution_block")])[0];
  const [inactive] = derive([], [active]);
  assert.equal(inactive.active, false); assert.equal(inactive.authoritativeAt, null);
});

test("same condition and episode reconcile idempotently", () => {
  const candidates = derive([item("execution_block")]);
  const once = reconcileBuildNotificationState({ candidates, rules, state: empty() });
  const twice = reconcileBuildNotificationState({ candidates, rules, state: once });
  assert.equal(twice.conditions.length, 1); assert.equal(twice.episodes.length, 1); assert.equal(twice.notifications.length, 1); assert.deepEqual(twice.auditKeys, once.auditKeys);
});

test("disabled/re-enabled rules and recipients added during an episode materialize only missing identities", () => {
  const candidates = derive([item("execution_block")]);
  const disabled = reconcileBuildNotificationState({ candidates, rules: [{ ...rules[0], enabled: false }], state: empty() });
  assert.equal(disabled.episodes.length, 1); assert.equal(disabled.notifications.length, 0);
  const enabled = reconcileBuildNotificationState({ candidates, rules, state: disabled });
  const added = reconcileBuildNotificationState({ candidates, rules: [{ ...rules[0], recipients: ["recipient", "second"] }], state: enabled });
  const readded = reconcileBuildNotificationState({ candidates, rules, state: added });
  assert.equal(added.notifications.length, 2); assert.equal(readded.notifications.length, 2);
});

test("resolution is independent of read/ack and recurrence creates a new numbered episode", () => {
  const active = derive([item("execution_block")]);
  let state = reconcileBuildNotificationState({ candidates: active, rules, state: empty() });
  state.notifications[0].read = true; state.notifications[0].acknowledged = true;
  state = reconcileBuildNotificationState({ candidates: [{ ...active[0], active: false }], rules, state });
  assert.deepEqual({ resolved: state.notifications[0].resolved, read: state.notifications[0].read, acknowledged: state.notifications[0].acknowledged }, { resolved: true, read: true, acknowledged: true });
  state = reconcileBuildNotificationState({ candidates: active, rules, state });
  assert.deepEqual(state.episodes.map((row) => row.number), [1, 2]); assert.equal(state.notifications.length, 2);
});

test("project lifecycle suppresses activation/materialization without inventing resolution", () => {
  const active = derive([item("execution_block")]);
  for (const projectState of ["On Hold", "Completed", "Cancelled"]) {
    const state = reconcileBuildNotificationState({ candidates: active, rules, state: empty(), projectState });
    assert.equal(state.episodes.length, 0); assert.equal(state.notifications.length, 0);
  }
  const established = reconcileBuildNotificationState({ candidates: active, rules, state: empty() });
  const held = reconcileBuildNotificationState({ candidates: active, rules, state: established, projectState: "On Hold" });
  assert.equal(held.episodes[0].resolved, false); assert.equal(held.notifications.length, 1);
  assert.deepEqual(reconcileBuildNotificationState({ candidates: active, rules, state: empty(), projectState: "archived" }), empty());
});

test("database constraints are the final concurrency and ancestry protection", () => {
  assert.match(migration, /unique\(client_id,project_id,category,source_entity_type,source_entity_id,condition_discriminator\)/i);
  assert.match(migration, /unique index build_notification_episodes_active_uidx[\s\S]*where resolved_at is null/i);
  assert.match(migration, /unique\(episode_id,rule_id,recipient_user_id,channel\)/i);
  assert.match(migration, /transition_key text not null unique/i);
  assert.match(migration, /for update/i); assert.match(migration, /on conflict[\s\S]*do nothing/i);
  assert.match(migration, /BUILD_NOTIFICATION_CANDIDATE_ANCESTRY_INVALID/); assert.match(migration, /BUILD_NOTIFICATION_RULE_ANCESTRY_INVALID/);
});

test("six isolated RLS tables and immutable audit transitions are defined", () => {
  for (const table of ["rules", "rule_recipients", "conditions", "episodes", "recipient_notifications", "audit_events"]) {
    assert.match(migration, new RegExp(`create table public\\.build_notification_${table}|create table public\\.build_${table}`));
  }
  assert.equal((migration.match(/enable row level security/g) ?? []).length, 6);
  for (const event of ["rule_created", "rule_changed", "rule_enabled", "rule_disabled", "recipient_added", "recipient_removed", "episode_activated", "episode_resolved", "notification_materialized", "notification_suppressed", "recipient_access_revoked"]) assert.match(migration, new RegExp(event));
  assert.match(migration, /BUILD_NOTIFICATION_AUDIT_IMMUTABLE/);
});

test("templates, service authority and isolated notification domain contain no AI or external delivery", () => {
  assert.doesNotMatch(migration, /openai|prompt|model|email provider|sms|whatsapp|signed_url/i);
  assert.match(migration, /A Build Activity is blocked and requires attention/);
  assert.match(service, /resolveCanonicalBuildProject[\s\S]*requiredPermission: "projects:read"/);
  assert.match(service, /createAdminSupabase[\s\S]*rpc\("reconcile_build_notifications"/);
  assert.match(service, /input: \{ projectId: string; evaluatedAt\?: Date \}/); // no browser-supplied client scope
  assert.doesNotMatch(migration, /alter table public\.notification_events/i);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260830030000_add_build_runtime_activity_event_sequence.sql");
const originalMigration = read("supabase/migrations/20260830020000_add_build_runtime_activity_execution_foundation.sql");
const service = read("lib/build/runtime/service.ts");
const ui = read("components/workspace/BuildRuntimeActivityExecution.tsx");

test("remediation preserves identical business timestamps with a separate sequence", () => {
  assert.match(migration, /add column event_sequence bigint/);
  assert.doesNotMatch(migration, /update public\.build_runtime_activity_events/);
});
test("remediation sequence is global and database authoritative", () => {
  assert.match(migration, /create sequence public\.build_runtime_activity_event_sequence/);
  assert.match(migration, /new\.event_sequence := nextval/);
  assert.match(migration, /before insert/);
});
test("caller supplied sequence is always overwritten", () => assert.match(migration, /Always overwrite caller input/));
test("sequence supports rapid and concurrent inserts", () => assert.match(migration, /nextval\('public\.build_runtime_activity_event_sequence'\)/));
test("existing events remain honestly unsequenced", () => {
  assert.match(migration, /Existing rows deliberately remain unsequenced/);
  assert.doesNotMatch(migration, /set event_sequence/);
});
test("UUID values do not determine lifecycle order", () => {
  assert.doesNotMatch(service, /order\("id"\)/);
  assert.doesNotMatch(migration, /order\s+by\s+(?:\w+\.)?(?:id|uuid)/i);
});
test("canonical timeline orders by occurred_at then event_sequence", () => {
  assert.match(service, /order\("occurred_at"\)\.order\("event_sequence", \{ nullsFirst: true \}\)/);
});
test("legacy equal-timestamp ambiguity is customer-honest", () => {
  assert.match(service, /hasLegacyAmbiguousOrder/);
  assert.match(ui, /Some historical events share the same recorded time\. Their exact sequence is unavailable\./);
  assert.doesNotMatch(ui, /acceptance transaction|event_sequence|UUID/i);
});
test("lifecycle facts retain start block resume and completion semantics", () => {
  for (const event of ["started", "blocked", "resumed", "completed"]) assert.match(originalMigration, new RegExp(event));
});
test("responsibility events share the same sequence authority", () => {
  assert.match(originalMigration, /responsibility_assigned/);
  assert.match(migration, /for each row execute function public\.assign_build_runtime_activity_event_sequence/);
});
test("sequence and event business fields remain immutable", () => {
  assert.match(originalMigration, /before update or delete/);
  assert.match(originalMigration, /BUILD_ACTIVITY_EVENT_IMMUTABLE/);
});
test("event table privilege posture remains restrictive", () => {
  assert.match(originalMigration, /revoke all on table public\.build_runtime_activity_events from public, anon, authenticated, service_role/);
  assert.match(originalMigration, /grant select, insert on table public\.build_runtime_activity_events to service_role/);
  assert.doesNotMatch(migration, /grant (update|delete|truncate)/i);
});
test("sequence is unavailable to browser roles", () => assert.match(migration, /revoke all on sequence [\s\S]* from public, anon, authenticated, service_role/));
test("remediation remains Build-only", () => assert.doesNotMatch([migration, service, ui].join("\n"), /Retail Deployment/));
test("remediation introduces no AI", () => assert.doesNotMatch([migration, service, ui].join("\n"), /OpenAI|AI summary|executive brief/i));
test("remediation introduces no legacy client route", () => assert.doesNotMatch([service, ui].join("\n"), /["'`]\/client(?:\/|["'`])/));

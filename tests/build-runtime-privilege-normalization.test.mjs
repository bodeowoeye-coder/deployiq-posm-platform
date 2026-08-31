import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const correction = read("supabase/migrations/20260831010000_normalize_build_runtime_event_trigger_privilege.sql");
const execution = read("supabase/migrations/20260830020000_add_build_runtime_activity_execution_foundation.sql");
const checklistEvidence = read("supabase/migrations/20260830040000_add_build_runtime_checklist_evidence_execution.sql");

test("normalization targets the exact zero-argument trigger-only signature", () => {
  assert.match(correction, /revoke execute on function public\.prevent_build_runtime_activity_event_mutation\(\)/);
  assert.match(correction, /from public, anon, authenticated, service_role/);
  assert.doesNotMatch(correction, /create(?: or replace)? function|drop function|create trigger|drop trigger/i);
});

test("history guard retains its safe body, search_path and trigger", () => {
  assert.match(execution, /prevent_build_runtime_activity_event_mutation\(\)[\s\S]*set search_path = pg_catalog/);
  assert.match(execution, /raise exception 'BUILD_ACTIVITY_EVENT_IMMUTABLE'/);
  assert.match(execution, /before update or delete on public\.build_runtime_activity_events/);
});

test("history UPDATE and DELETE remain trigger-rejected", () => {
  assert.match(execution, /before update or delete/);
  assert.match(execution, /BUILD_ACTIVITY_EVENT_IMMUTABLE/);
});

test("authoritative S3A-7 and S3A-8 functions retain event insertion", () => {
  assert.match(execution, /apply_build_runtime_activity_action[\s\S]*insert into public\.build_runtime_activity_events/);
  assert.match(checklistEvidence, /apply_build_runtime_checklist_result[\s\S]*insert into public\.build_runtime_activity_events/);
  assert.match(checklistEvidence, /record_build_runtime_evidence[\s\S]*'evidence_added'/);
  assert.match(checklistEvidence, /grant execute on function public\.apply_build_runtime_checklist_result[\s\S]*to service_role/);
  assert.match(checklistEvidence, /grant execute on function public\.record_build_runtime_evidence[\s\S]*to service_role/);
});

test("correction is privilege-only", () => {
  assert.doesNotMatch(correction, /\b(?:insert|update|delete|alter table|grant|create|drop)\b/i);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyRuntimeActivityActionError } from "../lib/build/runtime/activityActionError.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const service = read("lib/build/runtime/service.ts");
const route = read("app/api/build/runtime-activities/[activityId]/route.ts");
const migration = read("supabase/migrations/20260830040000_add_build_runtime_checklist_evidence_execution.sql");

test("exact RPC authorization denials are sanitized as forbidden", () => {
  assert.deepEqual(classifyRuntimeActivityActionError({ code: "P0001", message: "BUILD_ACTIVITY_ACTION_FORBIDDEN" }), {
    status: 403,
    message: "You do not have permission to perform this Activity action.",
  });
  assert.deepEqual(classifyRuntimeActivityActionError({ code: "P0001", message: "BUILD_ACTIVITY_ACTOR_INELIGIBLE" }), {
    status: 403,
    message: "You do not have permission to perform this Activity action.",
  });
});

test("classification requires an exact sentinel and SQLSTATE", () => {
  assert.equal(classifyRuntimeActivityActionError({ code: "P0001", message: "prefix BUILD_ACTIVITY_ACTION_FORBIDDEN suffix" }).status, 500);
  assert.equal(classifyRuntimeActivityActionError({ code: "42501", message: "BUILD_ACTIVITY_ACTION_FORBIDDEN" }).status, 500);
});

test("concealed unavailable Activities remain not found", () => {
  assert.deepEqual(classifyRuntimeActivityActionError({ code: "P0001", message: "BUILD_RUNTIME_ACTIVITY_UNAVAILABLE" }), {
    status: 404,
    message: "Activity is unavailable.",
  });
});

test("lifecycle conflicts retain bounded validation semantics", () => {
  for (const message of [
    "BUILD_ACTIVITY_FS_PREDECESSOR_INCOMPLETE",
    "BUILD_ACTIVITY_CHECKLIST_INCOMPLETE",
    "BUILD_ACTIVITY_BLOCKER_REASON_REQUIRED",
    "BUILD_ACTIVITY_INVALID_TRANSITION",
    "BUILD_ACTIVITY_REVIEW_REQUIRED",
  ]) assert.equal(classifyRuntimeActivityActionError({ code: "P0001", message }).status, 400);
});

test("unexpected database failures remain sanitized server errors", () => {
  assert.deepEqual(classifyRuntimeActivityActionError({ code: "XX000", message: "internal database detail" }), {
    status: 500,
    message: "The Activity action could not be completed.",
  });
  assert.equal(classifyRuntimeActivityActionError({ code: "P0001", message: "UNKNOWN_RUNTIME_FAILURE" }).status, 500);
});

test("route preserves unauthenticated and cross-tenant access classifications", () => {
  assert.match(route, /error instanceof AccessControlError \? error\.status : 500/);
  assert.match(service, /assertWorkPackageAccess\(\{ \.\.\.params, canWrite: false \}\)/);
  assert.match(migration, /BUILD_ACTIVITY_ACTION_FORBIDDEN/);
});

test("classification changes no RPC authority or lifecycle writes", () => {
  const activityAction = service.slice(
    service.indexOf("export async function applyRuntimeActivityAction"),
    service.indexOf("async function resolveRuntimeReviewAccess"),
  );
  assert.match(activityAction, /classifyRuntimeActivityActionError\(error\)/);
  assert.doesNotMatch(activityAction, /error\.message\.includes\(candidate\)/);
  assert.match(migration, /p_actor_user_id<>v_activity\.activity_owner_user_id/);
  assert.match(migration, /p_actor_user_id is distinct from v_activity\.supervisor_user_id/);
});

test("denied actors raise before every lifecycle mutation", () => {
  const authorizationCheck = migration.indexOf("BUILD_ACTIVITY_ACTION_FORBIDDEN");
  const firstLifecycleUpdate = migration.indexOf("update public.build_runtime_activities set status=v_resulting_status");
  assert.ok(authorizationCheck >= 0);
  assert.ok(firstLifecycleUpdate > authorizationCheck);
});

test("Project Manager and assigned Supervisor authority remain unchanged", () => {
  assert.match(migration, /v_actor_role not in \('customer_admin','workspace_manager','project_manager'\)/);
  assert.match(migration, /p_actor_user_id is distinct from v_activity\.supervisor_user_id/);
  assert.match(migration, /p_actor_user_id<>v_activity\.activity_owner_user_id/);
});

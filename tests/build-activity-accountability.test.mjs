import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { selectActivityAttentionItems } from "../lib/build/management/activityAttention.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const service = read("lib/build/runtime/service.ts");
const types = read("lib/build/runtime/types.ts");
const ui = read("components/workspace/BuildRuntimeActivityExecution.tsx");
const route = read("app/workspace/admin/projects/[id]/activities/[activityId]/page.tsx");
const attention = read("lib/build/management/managementAttention.ts");
const item = (key, overrides = {}) => ({ key, type: "review_pending", projectId: "project", siteId: "site", workPackageId: "package", workPlanId: "plan", activityId: "activity",
  ownerUserId: "owner", ownerDisplayName: "Activity Owner", ownerKind: "activity_owner", expectedActor: "assigned_supervisor_or_management", expectedActorUserId: "supervisor", expectedActorDisplayName: "Supervisor",
  condition: "Awaiting Review", expectedNextAction: "Review submission", observedAt: "2026-09-05T10:00:00Z", dueAt: null, overdue: null,
  sourceRecordType: "runtime_activity", sourceRecordId: key, route: `/workspace/admin/projects/project/activities/activity?view=inspection`, dataQuality: "complete", ...overrides });

test("Activity execution receives Activity-scoped output from the accepted A.5.1 engine", () => {
  assert.match(service, /deriveManagementAttention/); assert.match(service, /selectActivityAttentionItems/);
  assert.match(types, /attentionItems: import\("\.\.\/management\/managementAttention"\)\.ManagementAttentionItem\[\]/);
  assert.doesNotMatch(ui, /deriveManagementAttention|deriveSchedulePerformance|deriveDependencyIntelligence/);
});

test("existing authoritative Activity route and navigation are retained", () => {
  assert.match(route, /getRuntimeActivityExecution/); assert.match(route, /BuildRuntimeActivityExecution/);
  assert.match(ui, /BUILD_ACTIVITY_VIEWS/); assert.match(ui, /Activity Responsibility & Attention/);
  assert.doesNotMatch(route + ui, /management-attention\/|accountability\/queue/);
});

test("Activity Owner and assigned Supervisor are separate factual fields", () => {
  assert.match(ui, /label="Activity Owner" value=\{execution\.owner\?\.name \?\? "Unassigned"\}/);
  assert.match(ui, /label="Assigned Supervisor" value=\{execution\.supervisor\?\.name \?\? "Not assigned"\}/);
  assert.doesNotMatch(service, /activityOwnerDisplayName:[^\n]*(?:supervisor|manager|created_by)/i);
});

test("Expected Actor remains separate from ownership and supports review authority", () => {
  assert.match(ui, /label="Expected Actor" value=\{expectedActorLabel\(item\)\}/);
  assert.match(ui, /Assigned Supervisor or authorized project management/);
  assert.match(service, /supervisorDisplayName/); assert.match(service, /expectedActorDisplayName/);
});

test("Activity attention preserves simultaneous overdue and blocked obligations", () => {
  const selected = selectActivityAttentionItems([item("blocked", { type: "execution_block", overdue: null }), item("schedule", { type: "schedule_overdue", overdue: true, dueAt: "2026-09-01T09:00:00Z" })], "activity");
  assert.deepEqual(selected.map((row) => row.key), ["schedule", "blocked"]);
  assert.deepEqual(new Set(selected.map((row) => row.type)), new Set(["schedule_overdue", "execution_block"]));
});

test("selector excludes other Activities and orders factual categories deterministically", () => {
  const selected = selectActivityAttentionItems([item("other", { activityId: "other" }), item("dependency", { type: "dependency_attention" }), item("changes", { type: "changes_required" }), item("block", { type: "execution_block" })], "activity");
  assert.deepEqual(selected.map((row) => row.key), ["block", "changes", "dependency"]);
});

test("schedule deadlines and factual overdue styling are shown only from A.5.1 items", () => {
  assert.match(ui, /item\.dueAt \? <Fact label="Authoritative Deadline"/); assert.match(ui, /item\.overdue \? <span/);
  assert.doesNotMatch(ui, /review deadline|correction deadline|blocked deadline|assignment deadline|days outstanding/i);
});

test("blocked context retains reason and recorded timestamp without treating blocked_by as an owner", () => {
  assert.match(service, /blockerReason: activity\.blocker_reason/); assert.match(service, /blockedAt: activity\.blocked_at/);
  assert.match(attention, /Resolve block and resume Activity/); assert.doesNotMatch(service + ui, /blocked_by.*(?:owner|responsible)/i);
});

test("Changes Required preserves authoritative reviewer instruction and history quality", () => {
  assert.match(ui, /latestCorrection\?\.note/); assert.match(ui, /Reviewer instruction:/);
  assert.match(ui, /item\.observedAt && item\.dataQuality === "complete"/); assert.match(ui, /Supporting timestamp unavailable/);
});

test("Review Pending retains Activity ownership and distinguishes Supervisor action", () => {
  assert.match(attention, /key: `review:/); assert.match(attention, /expectedActor: activity\.supervisorUserId \? "assigned_supervisor_or_management" : "project_management"/);
  assert.match(attention, /expectedNextAction: "Review submission"/);
});

test("assignment missing is factual and never auto-assigns a management identity", () => {
  assert.match(ui, /item\.ownerDisplayName \?\? "Unassigned"/); assert.match(attention, /expectedNextAction: "Assign Activity Owner"/);
  assert.doesNotMatch(service + ui, /auto.?assign|default owner|fallback owner/i);
});

test("dependency attention uses A.4 facts while waiting-for-lag remains excluded", () => {
  assert.match(service, /dependencyEdges: plan\.dependencies\.filter/); assert.match(attention, /edge\.condition === "constraint_released" \|\| edge\.condition === "waiting_for_lag"/);
  assert.match(attention, /Complete required predecessor/); assert.match(ui, /item\.sourceRecordType === "runtime_dependency" \? routeBase/);
});

test("active Runtime Exceptions remain distinct obligations with owner severity due date and existing route", () => {
  for (const value of ["exception?.title", "exception.severity", "Exception Owner", "Authoritative Deadline"]) assert.match(ui, new RegExp(value.replace(/[?.]/g, "\\$&")));
  for (const action of ["Start remediation", "Complete corrective action and resolve", "Verify resolution"]) assert.match(attention, new RegExp(action));
  assert.match(attention, /exception\.status === "verified"/); assert.match(ui, /item\.route/);
});

test("completed and approved exclusion and zero state continue to come from A.5.1", () => {
  assert.match(attention, /terminalActivityStates\.has\(activity\.status\)/);
  assert.match(ui, /No outstanding attention items for this Activity\./);
});

test("tenant ancestry, archived filtering and execution gates remain server authoritative", () => {
  assert.match(service, /const plan = await getWorkPlan\(params\)/); assert.match(service, /plan\?\.activities\.find/);
  assert.match(service, /\.is\("archived_at", null\)/); assert.match(route, /getRuntimeActivityProjectScope/);
  assert.doesNotMatch(ui, /clientId/); assert.match(service, /assertRuntimeExecutor/);
});

test("presentation is responsive, compact and free from scoring blame prediction or AI language", () => {
  assert.match(ui, /sm:grid-cols-2 lg:grid-cols-3/); assert.match(ui, /flex flex-col gap-2 sm:flex-row/);
  assert.doesNotMatch(ui + service, /risk score|accountability score|urgency score|critical path|predicted delay|caused delay|responsible for delay|poor performer|negligence|Ask AI/i);
});

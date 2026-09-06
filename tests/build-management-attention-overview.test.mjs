import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { orderManagementAttentionPreview } from "../lib/build/management/managementAttentionPreview.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const service = read("lib/build/management/service.ts");
const preview = read("lib/build/management/managementAttentionPreview.ts");
const overview = read("app/workspace/admin/projects/[id]/page.tsx");
const item = (key, overrides = {}) => ({ key, type: "review_pending", projectId: "project", siteId: "site", workPackageId: "package", workPlanId: "plan", activityId: key,
  ownerUserId: "owner", ownerDisplayName: "Owner", ownerKind: "activity_owner", expectedActor: "project_management", expectedActorUserId: null, expectedActorDisplayName: null,
  condition: "Awaiting Review", expectedNextAction: "Review submission", observedAt: null, dueAt: null, overdue: null, sourceRecordType: "runtime_activity", sourceRecordId: key,
  route: `/activity/${key}`, dataQuality: "complete", activityName: key, siteName: "Site", workPackageName: "Package", exceptionTitle: null, exceptionSeverity: null, ...overrides });

test("Project management service composes authoritative A.3 and A.4 facts through A.5.1", () => {
  assert.match(service, /deriveManagementAttention/); assert.match(service, /schedulePerformance: performanceByActivity/); assert.match(service, /dependencyEdges/);
  assert.match(service, /managementAttention: attention\.summary/); assert.match(service, /managementAttentionPreview: attentionPreview/);
  assert.doesNotMatch(overview, /deriveManagementAttention|deriveSchedulePerformance|deriveDependencyIntelligence/);
});

test("Overview renders distinct A.5.1 roll-ups and every supported category", () => {
  for (const label of ["Outstanding Obligations","Overdue Obligations","Activities Affected","Work Packages Affected","Unassigned Obligations","Schedule Overdue","Execution Blocks","Corrective Action Required","Active Exceptions","Overdue Exceptions","Reviews Pending","Assignments Missing","Dependency Attention","Data Incomplete"]) assert.match(overview, new RegExp(label));
  assert.match(overview, /summary\.outstandingObligations/); assert.match(overview, /summary\.activitiesAffected/); assert.match(overview, /summary\.workPackagesAffected/); assert.match(overview, /summary\.unassignedObligations/);
});

test("preview ordering is factual deterministic and overdue-first without scoring", () => {
  const rows = orderManagementAttentionPreview([item("z"), item("block", { type: "execution_block", activityName: "Zed" }), item("due-late", { type: "exception", overdue: true, dueAt: "2026-09-11T10:00:00Z" }), item("due-early", { type: "schedule_overdue", overdue: true, dueAt: "2026-09-10T10:00:00Z" }), item("alpha", { activityName: "Alpha" })]);
  assert.deepEqual(rows.map((row) => row.key), ["due-early", "due-late", "block", "alpha", "z"]);
  assert.doesNotMatch(service + preview + overview, /risk score|accountability score|performance score|priority score|rank people/i);
});

test("preview stays bounded and uses existing authoritative Activity routes", () => {
  assert.match(service, /orderManagementAttentionPreview[\s\S]*\.slice\(0, 6\)/);
  assert.match(overview, /href=\{item\.route\}/); assert.doesNotMatch(overview, /management-attention\/queue|attention\/\[id\]/);
});

test("owner and expected actor remain separate with calm Unassigned handling", () => {
  assert.match(overview, /item\.ownerDisplayName \?\? "Unassigned"/); assert.match(overview, /Expected actor:/);
  assert.match(overview, /Assigned Supervisor or authorized project management/); assert.match(service, /supervisorDisplayName/);
  assert.doesNotMatch(service, /activityOwnerDisplayName:[^\n]*(?:supervisor|manager)/i);
});

test("only authoritative overdue flags receive overdue presentation and no SLA is invented", () => {
  assert.match(overview, /item\.overdue \? "Overdue" : item\.condition/); assert.match(overview, /item\.overdue \?/);
  assert.doesNotMatch(service + overview, /\bSLA\b|escalat|days outstanding|hours outstanding/i);
});

test("Schedule Responsibility remains distinct and superseded Outstanding Responsibility is removed", () => {
  assert.match(overview, /Schedule Responsibility/); assert.doesNotMatch(overview, /Outstanding Responsibility/);
  assert.doesNotMatch(service, /responsibility: Array/);
});

test("canonical analytical sections and responsive Work Package behavior remain unchanged", () => {
  for (const label of ["Activity Execution","Schedule Performance","Schedule Attention","Delay &amp; Dependencies","Exception Health","Work Package Execution","Schedule Responsibility","Build foundation"]) assert.match(overview, new RegExp(label));
  assert.match(overview, /overflow-x-auto overscroll-x-contain/); assert.match(overview, /sm:grid-cols-2 xl:grid-cols-5/); assert.match(overview, /flex flex-col gap-2 sm:flex-row/);
});

test("zero and mixed states have neutral customer language without blame or causal judgment", () => {
  assert.match(overview, /No outstanding management attention items\./); assert.match(overview, /managementAttentionPreview\.map/);
  assert.doesNotMatch(service + overview, /caused delay|responsible for delay|\bfault\b|poor performance|high-risk employee|delay attributable to|negligent|worst performer/i);
});

test("management reads preserve bounded tenant and Project scoping with archived ancestry exclusion", () => {
  for (const table of ["build_sites","build_work_packages","build_work_plans","build_runtime_activities","build_runtime_exceptions"]) assert.match(service, new RegExp(`from\\("${table}"\\)[\\s\\S]*?\\.eq\\("client_id", project\\.client_id\\)\\.eq\\("project_id", project\\.id\\)`));
  assert.match(service, /\.is\("archived_at", null\)/); assert.doesNotMatch(service, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test("presentation label remains outside the neutral domain contract", () => {
  const contract = read("lib/build/management/managementAttention.ts");
  assert.match(overview, />Management Attention</); assert.doesNotMatch(contract, /sectionTitle|customerLabel|Management Attention/);
});

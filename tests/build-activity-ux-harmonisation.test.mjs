import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const list = read("components/workspace/BuildRuntimeWorkPlan.tsx");
const activity = read("components/workspace/BuildRuntimeActivityExecution.tsx");
const route = read("app/workspace/admin/projects/[id]/activities/[activityId]/page.tsx");
const service = read("lib/build/runtime/service.ts");

test("Manage Activity opens a dedicated refresh-stable route", () => {
  assert.match(list, /\$\{base\}\/\$\{encodeURIComponent\(activity\.id\)\}/);
  assert.match(route, /params: \{ id: string; activityId: string \}/);
  assert.match(route, /getRuntimeActivityExecution/);
  assert.match(route, /SERVER_ACTIVITY_VIEWS\.has\(activeView\)/);
  assert.doesNotMatch(route, /BUILD_ACTIVITY_VIEWS\.includes/);
});
test("runtime Activity route fails closed for wrong Activity, Project, or tenant", () => {
  assert.match(route, /clientId: overview\.project\.client_id/);
  assert.match(route, /projectId: overview\.project\.id/);
  assert.match(service, /\.eq\("client_id", params\.clientId\)[\s\S]*\.eq\("project_id", params\.projectId\)[\s\S]*\.eq\("id", params\.activityId\)/);
  assert.match(service, /Activity is unavailable/);
});
test("Work Plan page no longer renders the management panel below its list", () => {
  assert.doesNotMatch(list, /ActivityExecution|selectedActivityId|execution=/);
});
test("dedicated Activity view preserves ancestry and return path", () => {
  assert.match(activity, /Activity ancestry/);
  for (const value of ["projectName", "siteName", "workPackageName", "Back to Activities"]) assert.match(activity, new RegExp(value));
});
test("Activity navigation has the accepted long-term sections", () => {
  for (const label of ["Overview", "Responsibility", "Execution", "Checklist", "Evidence", "Resources", "Activity History"]) assert.match(activity, new RegExp(`label: "${label}"`));
});
test("Overview is a read-only operational summary", () => {
  for (const label of ["Activity Name", "Activity Code", "Category", "Current Status", "Planned Duration", "Actual Start", "Actual Completion", "Dependencies", "Checklist Requirements", "Resource Requirements", "Activity Owner", "Supervisor"]) assert.match(activity, new RegExp(`label="${label}"`));
});
test("completed Activity responsibility is locked", () => {
  assert.match(activity, /activity\.status === "completed"[\s\S]*Completed Activity responsibility is read-only/);
  assert.match(service, /params\.action === "assign_responsibility"[\s\S]*activity\.status === "completed"[\s\S]*Completed Activity responsibility is read-only/);
});
test("Execution exposes state-valid actions and dependency-aware Start UX", () => {
  for (const action of ["Start Activity", "Complete Activity", "Report Blocker", "Resume Activity"]) assert.match(activity, new RegExp(action));
  assert.match(activity, /Waiting for predecessor/);
  assert.match(activity, /must be completed before this Activity can start/);
  assert.match(activity, /Finish-to-Start \(FS\)/);
  assert.match(service, /predecessor_runtime_activity_id/);
});
test("Checklist and Resources are read-only and Evidence is unavailable", () => {
  assert.match(activity, /Checklist execution will become available in the next execution stage/);
  assert.match(activity, /Evidence capture is not available at this execution stage/);
  assert.match(activity, /Allocation, issuance, consumption and inventory are not available/);
  assert.doesNotMatch(activity, /checkbox|upload|camera|signature|getUserMedia/i);
});
test("Activity History is contained, deterministic and customer-safe", () => {
  assert.match(activity, /activeView === "history"/);
  assert.match(service, /order\("occurred_at"\)\.order\("event_sequence"/);
  assert.match(activity, /Some historical events share the same recorded time\. Their exact sequence is unavailable/);
  assert.doesNotMatch(activity, /acceptance transaction|event_sequence|UUID/i);
});
test("customer time presentation omits seconds", () => {
  assert.match(activity, /minute: "2-digit"/);
  assert.doesNotMatch(activity, /second:/);
});
test("Activity UX has no client portal or S3A-8 mutation surface", () => {
  assert.doesNotMatch([list, activity, route, service].join("\n"), /["'`]\/client(?:\/|["'`])/);
  assert.doesNotMatch(activity, /complete_checklist|upload_evidence|capture_evidence|inspection|approval|escalation/i);
});

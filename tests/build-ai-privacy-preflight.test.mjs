import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { classifyAcceptancePrivacyKey, inspectBuildAIAcceptanceProjection } from "./support/build-ai-privacy-preflight.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
function compile(source, requires = {}) {
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = vm.createContext({ exports: {}, module: { exports: {} }, require(name) { if (name === "server-only") return {}; if (name in requires) return requires[name]; throw new Error(`Unexpected import ${name}`); } });
  context.exports = context.module.exports; new vm.Script(javascript).runInContext(context); return context.module.exports;
}
const semantic = compile(read("../lib/build/ai/semanticSupport.ts"));
const projection = compile(read("../lib/build/ai/projection.ts"), { "./semanticSupport.ts": semantic });
const policy = { governanceVersion: "build-ai-governance-v2", visibility: "shadow", allowedTask: "executive_summary", allowedStatementTypes: ["interpretation", "attention", "decision_option", "limitation"], requireFactReferences: true, requireCoverageQualification: true, unsupportedConclusions: ["root_cause"], allowAutonomousActions: false, allowModelAuthoredFacts: false, decisionOptionsOnly: true };

function dataset(history = false) {
  const value = { schemaVersion: "1.0", scope: { kind: "project", projectId: "a1000000-0000-4000-8000-000000000002" }, timing: { currentState: { asOf: "2026-09-16T12:00:00.000Z" } }, currentState: { activitiesAccepted: 1, activitiesCompleted: 2, activitiesExpectedComplete: 3, currentOverdue: 1, managementAttention: 2, openExceptions: 0 }, progress: { completed: 2, total: 3 }, plannedPosition: { expected: 3 }, schedule: { currentlyOverdue: 1 }, attention: { summary: { outstandingObligations: 2, overdueObligations: 1, activitiesAffected: 1, workPackagesAffected: 1, explicitOwnersAffected: 1, unassignedObligations: 0, categoryCounts: { scheduleOverdue: 1 } }, preview: { total: 1, returned: 1, truncated: false, items: [{ type: "schedule_overdue", condition: "overdue", overdue: true, dataQuality: "complete", expectedActor: "activity_owner", expectedNextAction: "review", activityOwner: { assignmentState: "assigned", role: "activity_owner" }, expectedNextActor: { assignmentState: "assigned", role: "activity_owner" } }] } }, quality: { accepted: 1 }, dependencies: { summary: { blocked: 0 } }, exceptions: { summary: { active: 0, open: 0, overdue: 0 }, preview: { total: 0, returned: 0, truncated: false, items: [] } }, recentExecution: { ok: true, dataQuality: "complete", periodStart: "2026-08-01", periodEnd: "2026-09-14", timezone: "UTC", interval: "daily", counts: { activitiesStarted: 7, operationalCompletions: 3 } }, coverage: { progress: "complete", schedule: { numerator: 3, denominator: 3, state: "available" }, review: { numerator: 1, denominator: 1, state: "available" }, dependencyDataIncomplete: 0 }, constraints: { unsupportedConclusions: ["root_cause"] }, provenance: { groups: [{ key: "progress" }, { key: "schedule" }, { key: "history" }] } };
  if (history) value.history = { summary: { activitiesStarted: 7, activitiesCompleted: 3, activitiesAccepted: 1, submissions: 2, initialSubmissions: 1, resubmissions: 1 }, review: { cyclesTotal: 1, cyclesMeasured: 1 }, coverage: { dataQuality: "complete" } };
  return value;
}
function projected(task) {
  const request = { task, question: null, authorizedContext: [{ toolCallId: "tool-call-1", tool: task === "change_interpretation" ? "get_build_execution_history" : "get_build_project_intelligence", dataset: dataset(task === "change_interpretation") }], policy: { ...policy, allowedTask: task }, outputContract: { schemaVersion: "2.0" }, signal: new AbortController().signal };
  return JSON.parse(JSON.stringify(projection.projectBuildAIProviderRequest(request)));
}

test("legitimate governance and reference terminology is not classified by substring", () => {
  assert.equal(classifyAcceptancePrivacyKey("allowModelAuthoredFacts").sensitive, false);
  assert.equal(classifyAcceptancePrivacyKey("authoritativeReference").sensitive, false);
  assert.equal(classifyAcceptancePrivacyKey("authorizationPolicyVersion").sensitive, false);
  assert.equal(classifyAcceptancePrivacyKey("authorization").sensitive, true);
});

test("current v2 projections pass the strict acceptance privacy preflight", () => {
  for (const task of ["executive_summary", "management_attention", "change_interpretation"]) {
    const result = inspectBuildAIAcceptanceProjection(projected(task));
    assert.equal(result.ok, true, `${task}: ${result.violations.join(", ")}`);
  }
});

test("sensitive exact keys and unknown provider fields fail closed", () => {
  const prohibited = ["password", "accessToken", "refreshToken", "authorization", "cookie", "session", "secret", "apiKey", "email", "phone", "displayName", "address", "location", "clientId", "tenantId", "storageUrl", "evidenceUrl", "fileBytes"];
  for (const key of prohibited) {
    const value = projected("executive_summary"); value[key] = "synthetic";
    const result = inspectBuildAIAcceptanceProjection(value);
    assert.equal(result.ok, false, key); assert.ok(result.violations.some((item) => item.includes("sensitive_key")), key);
  }
  const unknown = projected("executive_summary"); unknown.unexpectedProviderField = false;
  assert.deepEqual(inspectBuildAIAcceptanceProjection(unknown).violations, ["$/unexpectedProviderField:unknown_field"]);
});

test("credential contact identity and storage-shaped scalar values remain rejected", () => {
  const values = ["Bearer synthetic-token", "aaaabbbbccccdddd.eeeeffffgggghhhh.iiiijjjjkkkkllll", "person@example.invalid", "+234 800 000 0000", "sk-syntheticcredential", "https://storage.invalid/private"];
  for (const candidate of values) {
    const value = projected("executive_summary"); value.context[0].facts[0].value = candidate;
    const result = inspectBuildAIAcceptanceProjection(value);
    assert.equal(result.ok, false, candidate); assert.ok(result.violations.some((item) => item.endsWith(":sensitive_value")), candidate);
  }
});

test("synthetic identity UUID values are rejected without rejecting ordinary counts and statuses", () => {
  const unsafe = projected("executive_summary"); unsafe.context[0].facts[0].value = "a1000000-0000-4000-8000-000000000002";
  assert.equal(inspectBuildAIAcceptanceProjection(unsafe).ok, false);
  const safe = projected("executive_summary"); safe.context[0].facts[0].value = "assigned";
  assert.equal(inspectBuildAIAcceptanceProjection(safe).ok, true);
});

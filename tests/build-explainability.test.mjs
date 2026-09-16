import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../lib/build/ai/explainability.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = vm.createContext({ exports: {}, module: { exports: {} }, require(specifier) { if (specifier === "server-only") return {}; throw new Error(`Unexpected import ${specifier}`); }, Object, Reflect, Set, Map });
context.exports = context.module.exports; new vm.Script(javascript).runInContext(context); const contract = context.module.exports;
const PROJECT = "a1000000-0000-4000-8000-000000000002", AS_OF = "2026-09-15T09:00:00.000Z", GENERATED = "2026-09-15T09:00:01.000Z";
const tasks = ["executive_summary", "management_attention", "change_interpretation"];
const reference = (path) => ({ toolCallId: "tool-call-1", factPath: path, provenanceKeys: [path.startsWith("/history") || path.startsWith("/timing") ? "history" : "current"] });
function sourceResult(task, dataset, statements = [], limitations = []) { return { task, result: { ok: true, status: "interpreted", toolResults: [{ id: "tool-call-1", tool: task === "change_interpretation" ? "get_build_execution_history" : "get_build_project_intelligence", result: { ok: true, dataset } }], interpretation: { schemaVersion: "1.0", generatedAt: GENERATED, scope: { kind: "project", projectId: PROJECT }, task, dataset: { schemaVersion: "1.0", toolCalls: [{ id: "tool-call-1", tool: "get_build_project_intelligence", scope: { kind: "project", projectId: PROJECT }, datasetSchemaVersion: "1.0", asOf: AS_OF }] }, statements, limitations, validation: { status: "accepted", policyVersion: "v1" } }, audit: {} } }; }
const datasets = {
  executive_summary: { currentState: { activitiesCompleted: 4 }, schedule: { currentlyOverdue: 3 }, timing: { currentState: { asOf: AS_OF } } },
  management_attention: { attention: { summary: { outstandingObligations: 5 }, preview: { items: [{ condition: "blocked", expectedNextAction: "Review dependency", activityOwner: { role: "activity_owner" }, expectedNextActor: { role: "assigned_supervisor" } }] } }, timing: { currentState: { asOf: AS_OF } } },
  change_interpretation: { timing: { currentState: { asOf: AS_OF }, requestedHistory: { from: "2026-09-01", through: "2026-09-14", timezone: "UTC", cadence: "daily" } }, history: { summary: { activitiesCompleted: 2 }, review: { cyclesMeasured: 1, averageHours: 2.5 }, coverage: { dataQuality: "partial" } } },
};
const evidenceInput = [
  ["executive_summary", "/currentState/activitiesCompleted"], ["executive_summary", "/schedule/currentlyOverdue"],
  ["management_attention", "/attention/summary/outstandingObligations"], ["management_attention", "/attention/preview/items/0/condition"],
  ["change_interpretation", "/history/summary/activitiesCompleted"], ["change_interpretation", "/history/review/cyclesMeasured"], ["change_interpretation", "/history/review/averageHours"], ["change_interpretation", "/history/coverage/dataQuality"],
];
function input({ unknown = false, duplicate = false } = {}) {
  const evidence = evidenceInput.map(([task, path], index) => ({ id: `${task}:fact:${index}`, sourceTask: task, authoritativeReference: reference(path) }));
  if (unknown) evidence.push({ id: "executive_summary:unknown", sourceTask: "executive_summary", authoritativeReference: reference("/schedule/futureUnknown") });
  if (duplicate) evidence.push({ ...evidence[0] });
  const decisionFacts = [reference("/schedule/currentlyOverdue")], limitationId = "executive_summary:limit-1";
  return { interpretation: { contract: "deployiq.build.executive_interpretation", schemaVersion: "1.0", scope: { kind: "project", projectId: PROJECT }, availability: "available", sections: [
    { id: "executive_position", statements: [] }, { id: "current_management_attention", statements: [] }, { id: "material_execution_changes", statements: [] },
    { id: "decision_considerations", statements: [{ id: "executive_summary:decision-1", sourceTask: "executive_summary", sourceStatementId: "decision-1", type: "decision_option", text: "Management may review the overdue position.", supportState: "coverage_limited", supportingFacts: decisionFacts, limitationIds: [limitationId] }] },
    { id: "data_coverage_and_limitations", limitations: [{ id: limitationId, sourceTask: "executive_summary", sourceLimitationId: "limit-1", code: "partial_coverage", text: "Executive coverage is partial.", coverageRefs: [{ toolCallId: "tool-call-1", coveragePath: "/coverage/progress" }] }, { id: "change_interpretation:history-limit", sourceTask: "change_interpretation", sourceLimitationId: "history-limit", code: "history_unavailable", text: "Historical schedule-position, Management Attention and exception movement are unavailable.", coverageRefs: [{ toolCallId: "tool-call-1", coveragePath: "/history/coverage/dataQuality" }] }] },
    { id: "supporting_deterministic_facts", evidence },
  ] }, sources: tasks.map((task) => sourceResult(task, datasets[task])) };
}
const json = (value) => JSON.parse(JSON.stringify(value));

test("all three governed sources produce stable typed customer descriptors with authoritative references", () => {
  const result = contract.buildBuildExecutiveExplainability(input()); assert.equal(result.ok, true);
  assert.deepEqual(json({ contract: result.explainability.contract, schemaVersion: result.explainability.schemaVersion, scope: result.explainability.scope }), { contract: "deployiq.build.executive_explainability", schemaVersion: "1.0", scope: { kind: "project", projectId: PROJECT } });
  assert.deepEqual(json(result.explainability.evidence.map((item) => item.conceptId)), ["execution_position", "schedule_performance", "management_attention", "management_attention", "execution_change_history", "review_change_history", "review_change_history", "historical_data_coverage"]);
  assert.deepEqual(json(result.explainability.evidence.map((item) => item.source.label)), ["Executive Position", "Executive Position", "Management Attention", "Management Attention", "Material Execution Changes", "Material Execution Changes", "Material Execution Changes", "Material Execution Changes"]);
  assert.equal(result.explainability.evidence[0].value.type, "count"); assert.equal(result.explainability.evidence[0].value.raw, 4); assert.equal(result.explainability.evidence[3].value.type, "text");
  assert.equal(result.explainability.evidence[0].timing.asOf, AS_OF); assert.equal(result.explainability.evidence[0].timing.generatedAt, GENERATED);
  assert.equal(result.explainability.evidence[6].value.type, "duration_hours"); assert.equal(result.explainability.evidence[6].value.raw, 2.5); assert.equal(result.explainability.evidence[7].value.type, "status");
  assert.deepEqual(json(result.explainability.evidence[4].timing.historyPeriod), { from: "2026-09-01", through: "2026-09-14", timezone: "UTC", cadence: "daily" });
  assert.deepEqual(json(result.explainability.evidence[0].authoritativeReference), reference("/currentState/activitiesCompleted"));
});

test("unknown exact paths retain authority but expose no guessed concept or value", () => {
  const result = contract.buildBuildExecutiveExplainability(input({ unknown: true })); assert.equal(result.ok, true); const item = result.explainability.evidence.at(-1);
  assert.deepEqual(json({ conceptId: item.conceptId, label: item.label, availability: item.availability, value: item.value }), { conceptId: null, label: "Evidence descriptor unavailable", availability: "descriptor_unavailable", value: null });
  assert.equal(item.authoritativeReference.factPath, "/schedule/futureUnknown");
});

test("schedule overdue has an exact count descriptor without changing its governed value or reference", () => {
  const result = contract.buildBuildExecutiveExplainability(input());
  const item = result.explainability.evidence[1];
  assert.equal(item.availability, "available");
  assert.equal(item.conceptId, "schedule_performance");
  assert.deepEqual(json(item.value), { type: "count", raw: 3 });
  assert.deepEqual(json(item.authoritativeReference), reference("/schedule/currentlyOverdue"));
});

test("known roots and leaves cannot be recombined into unauthorized descriptors", () => {
  const paths = ["/schedule/dataQuality", "/progress/currentlyOverdue", "/quality/totalConstraints", "/attention/completionPercentage", "/schedule/futureUnknown", "/futureRoot/currentlyOverdue"];
  for (const path of paths) {
    const candidate = input();
    candidate.sources[0].result.toolResults[0].result.dataset = { ...candidate.sources[0].result.toolResults[0].result.dataset, [path.split("/")[1]]: { [path.split("/")[2]]: 7 } };
    candidate.interpretation.sections[5].evidence.push({ id: `unknown:${path}`, sourceTask: "executive_summary", authoritativeReference: reference(path) });
    const result = contract.buildBuildExecutiveExplainability(candidate);
    const item = result.explainability.evidence.at(-1);
    assert.deepEqual(json({ availability: item.availability, conceptId: item.conceptId, value: item.value, label: item.label }), { availability: "descriptor_unavailable", conceptId: null, value: null, label: "Evidence descriptor unavailable" }, path);
    assert.deepEqual(json(item.authoritativeReference), reference(path));
  }
});

test("only seven reviewed Management Attention category counts receive exact descriptors", () => {
  const candidate = input();
  const dataset = candidate.sources[1].result.toolResults[0].result.dataset;
  dataset.attention.summary.categoryCounts = {
    executionBlocks: 1, reviewsPending: 2, activeExceptions: 3, overdueExceptions: 4,
    correctiveActionsRequired: 5, assignmentsMissing: 6, scheduleOverdue: 7, futureCategory: 8,
  };
  const labels = {
    executionBlocks: "Execution Blocks", reviewsPending: "Reviews Pending", activeExceptions: "Active Exceptions",
    overdueExceptions: "Overdue Exceptions", correctiveActionsRequired: "Corrective Actions Required",
    assignmentsMissing: "Assignments Missing", scheduleOverdue: "Schedule Overdue",
  };
  for (const field of [...Object.keys(labels), "futureCategory"]) candidate.interpretation.sections[5].evidence.push({ id: `category:${field}`, sourceTask: "management_attention", authoritativeReference: reference(`/attention/summary/categoryCounts/${field}`) });
  const result = contract.buildBuildExecutiveExplainability(candidate);
  assert.equal(result.ok, true);
  for (const [field, expectedLabel] of Object.entries(labels)) {
    const item = result.explainability.evidence.find((entry) => entry.id === `category:${field}`);
    assert.deepEqual(json({ availability: item.availability, conceptId: item.conceptId, label: item.label, type: item.value?.type }), { availability: "available", conceptId: "management_attention", label: expectedLabel, type: "count" });
  }
  const unknown = result.explainability.evidence.find((entry) => entry.id === "category:futureCategory");
  assert.equal(unknown.availability, "descriptor_unavailable");
  assert.equal(unknown.value, null);
});

test("preview patterns authorize only accepted fields at bounded positions", () => {
  const candidate = input();
  const dataset = candidate.sources[1].result.toolResults[0].result.dataset;
  dataset.attention.preview.items[6] = { condition: "future" };
  for (const path of ["/attention/preview/items/6/condition", "/attention/preview/items/0/currentlyOverdue"]) {
    candidate.interpretation.sections[5].evidence.push({ id: `preview:${path}`, sourceTask: "management_attention", authoritativeReference: reference(path) });
  }
  dataset.attention.preview.items[0].currentlyOverdue = 2;
  const result = contract.buildBuildExecutiveExplainability(candidate);
  assert.equal(result.explainability.evidence.find((item) => item.authoritativeReference.factPath === "/attention/preview/items/0/condition").availability, "available");
  for (const path of ["/attention/preview/items/6/condition", "/attention/preview/items/0/currentlyOverdue"]) {
    const item = result.explainability.evidence.find((entry) => entry.id === `preview:${path}`);
    assert.equal(item.availability, "descriptor_unavailable", path);
    assert.equal(item.value, null);
  }
});

test("approved path metadata assigns representative exact semantic value types", () => {
  const candidate = input();
  const dataset = candidate.sources[0].result.toolResults[0].result.dataset;
  Object.assign(dataset, { progress: { operationalShortfall: 2, durationExpected: { numerator: 1, denominator: 2, ratio: 0.5 } }, recentExecution: { periodStart: "2026-09-01T00:00:00Z", ok: true }, quality: { reviewCoverageState: "partial" } });
  const expected = [["/progress/operationalShortfall", "number"], ["/progress/durationExpected/ratio", "ratio"], ["/recentExecution/periodStart", "date_time"], ["/recentExecution/ok", "boolean"], ["/quality/reviewCoverageState", "status"], ["/timing/requestedHistory/from", "date"]];
  for (const [path, type] of expected) {
    const sourceTask = path.startsWith("/timing") ? "change_interpretation" : "executive_summary";
    candidate.interpretation.sections[5].evidence.push({ id: `typed:${path}`, sourceTask, authoritativeReference: reference(path) });
  }
  const result = contract.buildBuildExecutiveExplainability(candidate);
  for (const [path, type] of expected) {
    const item = result.explainability.evidence.find((evidence) => evidence.id === `typed:${path}`);
    assert.equal(item.availability, "available", path);
    assert.equal(item.value.type, type, path);
  }
});

test("decision considerations are structurally non-binding and link only validated evidence and limitations", () => {
  const result = contract.buildBuildExecutiveExplainability(input()); const decision = result.explainability.decisionConsiderations[0];
  assert.deepEqual(json(decision), { id: "executive_summary:decision-1", label: "Decision Consideration", authority: "non_binding", sourceTask: "executive_summary", text: "Management may review the overdue position.", supportState: "coverage_limited", evidenceIds: ["executive_summary:fact:1"], limitationIds: ["executive_summary:limit-1"] });
  assert.equal(result.explainability.limitations[0].sourceTask, "executive_summary"); assert.equal(result.explainability.limitations[0].code, "partial_coverage");
  assert.equal(result.explainability.limitations[1].sourceTask, "change_interpretation"); assert.equal(result.explainability.limitations[1].code, "history_unavailable");
});

test("request-local aliases remain source scoped and ordering follows composed evidence", () => {
  const result = contract.buildBuildExecutiveExplainability(input()); assert.equal(result.ok, true);
  assert.equal(new Set(result.explainability.evidence.map((item) => item.id)).size, result.explainability.evidence.length);
  assert.deepEqual(json(result.explainability.evidence.map((item) => item.source.task)), evidenceInput.map(([task]) => task));
});

test("exact builder input fails closed while same-task duplicate authority is not expanded", () => {
  assert.equal(contract.buildBuildExecutiveExplainability({ ...input(), extra: true }).ok, false);
  const wrongTask = input(); wrongTask.sources[0].result.interpretation.task = "management_attention"; assert.equal(contract.buildBuildExecutiveExplainability(wrongTask).ok, false);
  const wrongDecision = input(); wrongDecision.interpretation.sections[3].statements[0].type = "attention"; assert.equal(contract.buildBuildExecutiveExplainability(wrongDecision).ok, false);
  const duplicated = contract.buildBuildExecutiveExplainability(input({ duplicate: true })); assert.equal(duplicated.ok, true); assert.equal(duplicated.explainability.evidence.length, evidenceInput.length);
});

test("contract remains provider network persistence scoring inference action and renderer independent", () => {
  assert.match(source, /^import "server-only";/); assert.doesNotMatch(source, /openai|provider\.generate|orchestrateBuildAI|fetch\(|supabase|\.from\(|insert\(|update\(|upsert\(|cache|snapshot|migration|React|jsx|card|chart|dashboard|notification|recipient|channel|autonomous|confidenceScore|priorityScore|severityScore|riskScore|healthScore|rootCause|forecast|prediction|financial|costOfDelay|revenue/i);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../lib/build/ai/executiveInterpretation.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = vm.createContext({ exports: {}, module: { exports: {} }, require(specifier) { if (specifier === "server-only") return {}; throw new Error(`Unexpected import ${specifier}`); }, Object, Reflect, Set, Map });
context.exports = context.module.exports; new vm.Script(javascript).runInContext(context);
const contract = context.module.exports;
const PROJECT = "a1000000-0000-4000-8000-000000000002";
const tasks = ["executive_summary", "management_attention", "change_interpretation"];
const labels = ["Executive Position", "Current Management Attention", "Material Execution Changes", "Decision Considerations", "Data Coverage and Limitations", "Supporting Deterministic Facts"];

function interpretation(task, { decision = false, limitation = false } = {}) {
  const limitations = limitation ? [{ id: "limit-1", code: "partial_coverage", text: "Coverage is partial.", coverageRefs: [{ toolCallId: "tool-call-1", coveragePath: "/coverage/progress" }] }] : [];
  const statements = [{ id: "statement-1", type: "interpretation", text: `${task} interpretation`, supportingFacts: [{ toolCallId: "tool-call-1", factPath: "/currentState/total", provenanceKeys: ["current"] }], limitationIds: limitation ? ["limit-1"] : [], supportState: limitation ? "coverage_limited" : "fully_supported" }];
  if (decision) statements.push({ id: "option-1", type: "decision_option", text: "Management may review the supported position.", supportingFacts: [{ toolCallId: "tool-call-1", factPath: "/attention/summary/outstanding", provenanceKeys: ["attention"] }], limitationIds: [], supportState: "fully_supported" });
  return { schemaVersion: "1.0", generatedAt: "2026-09-15T10:00:00.000Z", scope: { kind: "project", projectId: PROJECT }, task, dataset: { schemaVersion: "1.0", toolCalls: [] }, statements, limitations, validation: { status: "accepted", policyVersion: "build-ai-governance-v1" } };
}
function sourceRecord(task, status = "interpreted", options) { return { task, status, deterministicIntelligenceAvailable: ["interpreted", "ai_unavailable", "interpretation_unavailable"].includes(status), interpretation: status === "interpreted" ? interpretation(task, options) : null }; }
function input(overrides = {}) { return { scope: { kind: "project", projectId: PROJECT }, sources: tasks.map((task) => sourceRecord(task, overrides[task]?.status ?? "interpreted", overrides[task])) }; }
const json = (value) => JSON.parse(JSON.stringify(value));

test("all three accepted tasks compose into the exact renderer-neutral Project contract", () => {
  const result = contract.composeBuildExecutiveInterpretation(input()); assert.equal(result.ok, true);
  assert.deepEqual(json({ contract: result.interpretation.contract, schemaVersion: result.interpretation.schemaVersion, scope: result.interpretation.scope, availability: result.interpretation.availability }), { contract: "deployiq.build.executive_interpretation", schemaVersion: "1.0", scope: { kind: "project", projectId: PROJECT }, availability: "available" });
  assert.deepEqual(json(result.interpretation.sections.map((section) => section.label)), labels);
  assert.deepEqual(json(result.interpretation.sections.slice(0, 3).map((section) => section.sourceTasks)), tasks.map((task) => [task]));
});

test("each governed source can be requested independently without fabricated sections", () => {
  for (const selected of tasks) {
    const overrides = Object.fromEntries(tasks.map((task) => [task, { status: task === selected ? "interpreted" : "not_requested" }]));
    const result = contract.composeBuildExecutiveInterpretation(input(overrides)); assert.equal(result.ok, true); assert.equal(result.interpretation.availability, "partial");
    assert.deepEqual(json(result.interpretation.sections.slice(0, 3).map((section) => section.availability)), tasks.map((task) => task === selected ? "available" : "not_requested"));
  }
});

test("source failures remain isolated and overall availability is derived without Project health semantics", () => {
  for (const status of ["ai_unavailable", "interpretation_unavailable", "no_data", "not_authorized", "invalid_request", "deterministic_intelligence_unavailable"]) {
    const result = contract.composeBuildExecutiveInterpretation(input({ change_interpretation: { status } })); assert.equal(result.ok, true); assert.equal(result.interpretation.availability, "partial"); assert.equal(result.interpretation.sections[2].availability, status); assert.equal(result.interpretation.sections[2].statements.length, 0);
  }
  const none = contract.composeBuildExecutiveInterpretation(input(Object.fromEntries(tasks.map((task) => [task, { status: "ai_unavailable" }])))); assert.equal(none.ok, true); assert.equal(none.interpretation.availability, "unavailable");
  assert.ok(none.interpretation.sections.every((section) => section.statements.length === 0));
});

test("decision options limitations and evidence are grouped once with source traceability", () => {
  const result = contract.composeBuildExecutiveInterpretation(input({ executive_summary: { decision: true, limitation: true }, management_attention: { limitation: true } })); assert.equal(result.ok, true);
  const [position,,, decisions, coverage, evidence] = result.interpretation.sections;
  assert.equal(position.statements.some((statement) => statement.type === "decision_option"), false); assert.equal(decisions.statements.length, 1); assert.equal(decisions.statements[0].sourceTask, "executive_summary");
  assert.equal(coverage.limitations.length, 2); assert.deepEqual(json(coverage.limitations.map((item) => item.id)), ["executive_summary:limit-1", "management_attention:limit-1"]);
  assert.ok(evidence.evidence.length > 0); assert.ok(evidence.evidence.every((item) => item.authoritativeReference.toolCallId === "tool-call-1" && item.authoritativeReference.factPath.startsWith("/") && item.authoritativeReference.provenanceKeys.length));
});

test("composition is deterministic namespaces identities and preserves authoritative references", () => {
  const first = contract.composeBuildExecutiveInterpretation(input({ executive_summary: { decision: true } })), second = contract.composeBuildExecutiveInterpretation(input({ executive_summary: { decision: true } }));
  assert.deepEqual(json(first), json(second)); assert.equal(first.ok, true);
  const statements = first.interpretation.sections.flatMap((section) => section.statements); assert.equal(new Set(statements.map((item) => item.id)).size, statements.length);
  assert.ok(statements.every((item) => item.id.startsWith(`${item.sourceTask}:`) && item.supportingFacts.every((fact) => fact.toolCallId === "tool-call-1")));
});

test("exact-shape validation rejects unknown invalid duplicated and ungoverned inputs", () => {
  const cases = [];
  cases.push({ ...input(), extra: true });
  const unknownSource = input(); unknownSource.sources[0].extra = true; cases.push(unknownSource);
  const invalidTask = input(); invalidTask.sources[0].task = "new_task"; cases.push(invalidTask);
  const duplicateTask = input(); duplicateTask.sources[1].task = "executive_summary"; cases.push(duplicateTask);
  const invalidStatus = input(); invalidStatus.sources[0].status = "healthy"; cases.push(invalidStatus);
  const invalidAvailability = input(); invalidAvailability.sources[0].deterministicIntelligenceAvailable = false; cases.push(invalidAvailability);
  const invalidSection = input(); invalidSection.sources[0].interpretation.scope.kind = "work_package"; cases.push(invalidSection);
  const duplicateId = input(); duplicateId.sources[0].interpretation.statements.push({ ...duplicateId.sources[0].interpretation.statements[0] }); cases.push(duplicateId);
  const missingFact = input(); missingFact.sources[0].interpretation.statements[0].supportingFacts = []; cases.push(missingFact);
  const invalidLimitation = input(); invalidLimitation.sources[0].interpretation.statements[0].limitationIds = ["missing"]; cases.push(invalidLimitation);
  for (const candidate of cases) assert.equal(contract.composeBuildExecutiveInterpretation(candidate).ok, false);
});

test("contract remains provider UI persistence notification and action independent", () => {
  assert.match(source, /^import "server-only";/); assert.doesNotMatch(source, /openai|responses\.create|orchestrateBuildAI|getAuthenticatedBuildIntelligence|supabase|\.from\(|insert\(|update\(|upsert\(|fetch\(|route\.ts|React|jsx|card|chart|dashboard|notification|email|sms|whatsapp|autonomous/i);
  assert.doesNotMatch(source, /riskScore|healthScore|confidenceScore|severityScore|priorityScore|rootCause|forecast|criticalPath/i);
});

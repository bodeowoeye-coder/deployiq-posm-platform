import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const read = (name) => readFileSync(new URL(`../lib/build/ai/${name}.ts`, import.meta.url), "utf8");
function compile(source, requires = {}) {
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = vm.createContext({ exports: {}, module: { exports: {} }, require(name) { if (name === "server-only") return {}; if (name in requires) return requires[name]; throw new Error(`Unexpected import ${name}`); } });
  context.exports = context.module.exports;
  new vm.Script(javascript).runInContext(context);
  context.module.exports.realm = (value) => { context.input = JSON.stringify(value); return vm.runInContext("JSON.parse(input)", context); };
  return context.module.exports;
}
const semantics = compile(read("semanticSupport"));
const validation = compile(read("validation"), { "./semanticSupport.ts": semantics });
const projectId = "a1000000-0000-4000-8000-000000000002", scope = { kind: "project", projectId }, asOf = "2026-09-16T12:00:00.000Z";
const governance = { version: "build-ai-governance-v2", allowedTasks: ["change_interpretation"], permittedStatementTypes: ["interpretation", "attention", "decision_option", "limitation"], forbiddenConclusions: [], requireCoverageQualification: true, requireFactReferences: true, allowAutonomousActions: false, visibilityMode: "shadow" };
const dataset = { schemaVersion: "1.0", scope, timing: { currentState: { asOf } }, history: { summary: { activitiesStarted: 7, activitiesCompleted: 3, activitiesAccepted: 1, submissions: 2, initialSubmissions: 1, resubmissions: 1 }, coverage: { dataQuality: "complete" } }, progress: { durationExpected: { numerator: 1, denominator: 2, ratio: 0.5 } }, coverage: { progress: "complete" }, provenance: { groups: [{ key: "history" }, { key: "progress" }] }, constraints: { unsupportedConclusions: [] } };
const call = { id: "tool-1", tool: "get_build_execution_history", result: { ok: true, dataset } };
const fact = (path, key = "history") => ({ toolCallId: "tool-1", factPath: path, provenanceKeys: [key] });
const semanticFact = (path, value, key = "history") => ({ reference: fact(path, key), value, scope });
function output(relationship, facts, type = "interpretation", textOverride) {
  const rendered = semantics.renderBuildAISemanticClaim(relationship, facts.map((entry) => semanticFact(entry[0], entry[1], entry[2])), type);
  const refs = facts.map((entry) => fact(entry[0], entry[2]));
  return { schemaVersion: "2.0", generatedAt: asOf, scope, task: "change_interpretation", dataset: { schemaVersion: "1.0", toolCalls: [{ id: "tool-1", tool: call.tool, scope, datasetSchemaVersion: "1.0", asOf }] }, statements: [{ id: "s1", type, text: textOverride ?? rendered ?? "Unsupported relationship.", claim: { relationship, factRefs: refs }, supportingFacts: refs, limitationIds: [] }], limitations: [] };
}
const validate = (value) => validation.validateBuildAIModelOutput({ output: validation.realm(value), toolCalls: validation.realm([call]), governance: validation.realm(governance) });

test("direct historical aggregate facts remain reportable without implying overlap", () => {
  const value = output("direct", [["/history/summary/activitiesStarted", 7], ["/history/summary/activitiesCompleted", 3]]);
  assert.equal(validate(value).ok, true);
  assert.equal(value.statements[0].text.includes("Start events: 7"), true);
});

test("independent event counts cannot be converted to item-level remainder, even with a linked limitation", () => {
  const value = output("approved_difference", [["/history/summary/activitiesStarted", 7], ["/history/summary/activitiesCompleted", 3]], "decision_option", "4 started activities are not represented among completed activities.");
  value.statements[0].limitationIds = ["l1"];
  value.limitations = [{ id: "l1", code: "history_unavailable", text: semantics.renderBuildAILimitation("history_unavailable"), coverageRefs: [{ toolCallId: "tool-1", coveragePath: "/history/coverage/dataQuality" }] }];
  const result = validate(value);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((item) => item.code === "unsupported_conclusion"), true);
  const metadata = semantics.buildAIFactSemantics("/history/summary/activitiesStarted", scope);
  assert.equal(metadata.measureKind, "event_count");
  assert.equal(metadata.deniedCapabilities.includes("item_overlap_from_aggregate_events"), true);
  assert.equal(metadata.deniedCapabilities.includes("entity_transition_from_aggregate_rollups"), true);
});

test("approved numerator/denominator ratio and difference preserve authorized arithmetic", () => {
  const pairs = [["/progress/durationExpected/numerator", 1, "progress"], ["/progress/durationExpected/denominator", 2, "progress"]];
  assert.equal(validate(output("approved_ratio", pairs)).ok, true);
  assert.equal(validate(output("approved_difference", pairs)).ok, true);
  const incompatible = [["/history/summary/activitiesStarted", 7], ["/progress/durationExpected/denominator", 2, "progress"]];
  assert.equal(validate(output("approved_difference", incompatible)).ok, false);
});

test("approved sum requires the exact deterministic submission partition", () => {
  const partition = [["/history/summary/initialSubmissions", 1], ["/history/summary/resubmissions", 1], ["/history/summary/submissions", 2]];
  assert.equal(validate(output("approved_sum", partition)).ok, true);
  assert.equal(validate(output("approved_sum", partition.slice(0, 2))).ok, false);
  assert.equal(validate(output("approved_sum", [["/history/summary/activitiesStarted", 7], ["/history/summary/activitiesCompleted", 3], ["/history/summary/activitiesAccepted", 1]])).ok, false);
});

test("unknown derivation, model-authored semantic metadata and factual prose mismatch fail closed", () => {
  const direct = output("direct", [["/history/summary/activitiesStarted", 7]]);
  assert.equal(validate({ ...direct, statements: [{ ...direct.statements[0], text: "Four started activities remain incomplete." }] }).ok, false);
  assert.equal(validate({ ...direct, statements: [{ ...direct.statements[0], claim: { ...direct.statements[0].claim, populationId: "invented" } }] }).ok, false);
  assert.equal(validate({ ...direct, statements: [{ ...direct.statements[0], claim: { ...direct.statements[0].claim, relationship: "item_overlap" } }] }).ok, false);
  assert.equal(validate({ ...direct, statements: [{ ...direct.statements[0], claim: { ...direct.statements[0].claim, relationship: "approved_sum" } }] }).ok, false);
  assert.equal(validate({ ...direct, schemaVersion: "1.0" }).ok, false);
});

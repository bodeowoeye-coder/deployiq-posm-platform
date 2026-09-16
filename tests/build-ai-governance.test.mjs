import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const typesSource = readFileSync(new URL("../lib/build/ai/types.ts", import.meta.url), "utf8");
const governanceSource = readFileSync(new URL("../lib/build/ai/governance.ts", import.meta.url), "utf8");
const validationSource = readFileSync(new URL("../lib/build/ai/validation.ts", import.meta.url), "utf8");
const semanticSource = readFileSync(new URL("../lib/build/ai/semanticSupport.ts", import.meta.url), "utf8");
const semanticJavascript = ts.transpileModule(semanticSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const semanticContext = vm.createContext({ exports: {}, module: { exports: {} }, require(specifier) { if (specifier === "server-only") return {}; throw new Error(`Unexpected import ${specifier}`); } });
semanticContext.exports = semanticContext.module.exports;
new vm.Script(semanticJavascript).runInContext(semanticContext);
const semantic = semanticContext.module.exports;
const canonicalConstraints = readFileSync(new URL("../lib/build/intelligence/constraints.ts", import.meta.url), "utf8");
const PROJECT = "a1000000-0000-4000-8000-000000000002";
const AS_OF = "2026-09-09T12:00:00.000Z";

const governance = {
  version: "build-ai-governance-v1",
  allowedTasks: ["executive_summary", "change_interpretation", "management_attention"],
  permittedStatementTypes: ["interpretation", "attention", "decision_option", "limitation"],
  forbiddenConclusions: ["root_cause", "critical_path", "financial_impact", "project_health_score"],
  requireCoverageQualification: true, requireFactReferences: true, allowAutonomousActions: false, visibilityMode: "shadow",
};

function loadValidator() {
  const javascript = ts.transpileModule(validationSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = vm.createContext({ exports: {}, module: { exports: {} }, require(specifier) { if (specifier === "server-only") return {}; if (specifier === "./semanticSupport.ts") return semantic; throw new Error(`Unexpected import ${specifier}`); } });
  context.exports = context.module.exports;
  new vm.Script(javascript, { filename: "validation.ts" }).runInContext(context);
  return {
    validate: context.module.exports.validateBuildAIModelOutput,
    realm(value) { context.serialized = JSON.stringify(value); return vm.runInContext("JSON.parse(serialized)", context); },
    custom(expression) { return vm.runInContext(expression, context); },
  };
}

function dataset({ partialSchedule = false } = {}) {
  return {
    schemaVersion: "1.0", scope: { kind: "project", projectId: PROJECT },
    timing: { currentState: { asOf: AS_OF, mutableAfterAsOf: true } },
    schedule: { currentlyOverdue: 4 }, quality: { firstPassAcceptance: { numerator: 1, denominator: 2, ratio: 0.5 } },
    coverage: { progress: "complete", schedule: { numerator: partialSchedule ? 1 : 2, denominator: 2, ratio: partialSchedule ? 0.5 : 1, state: "available" }, review: { numerator: 2, denominator: 2, ratio: 1, state: "available" }, dependencyDataIncomplete: 0 },
    constraints: { unsupportedConclusions: ["root_cause", "critical_path"], notices: [] },
    provenance: { authority: "deployiq_deterministic_build_intelligence", groups: [{ key: "schedule" }, { key: "quality" }] },
  };
}

function toolCalls(data = dataset()) {
  return [{ id: "tool-1", tool: "get_build_project_intelligence", result: { ok: true, tool: "get_build_project_intelligence", scope: data.scope, dataset: data } }];
}

function model(overrides = {}) {
  const data = dataset();
  return {
    schemaVersion: "1.0", generatedAt: "2026-09-09T12:00:01.000Z", scope: data.scope, task: "executive_summary",
    dataset: { schemaVersion: "1.0", toolCalls: [{ id: "tool-1", tool: "get_build_project_intelligence", scope: data.scope, datasetSchemaVersion: "1.0", asOf: AS_OF }] },
    statements: [{ id: "statement-1", type: "interpretation", text: "Management attention is concentrated on overdue work.", supportingFacts: [{ toolCallId: "tool-1", factPath: "/schedule/currentlyOverdue", provenanceKeys: ["schedule"] }], limitationIds: [] }],
    limitations: [], ...overrides,
  };
}

function validate(output, calls = toolCalls()) {
  const runtime = loadValidator();
  return runtime.validate({ output: runtime.realm(output), toolCalls: runtime.realm(calls), governance: runtime.realm(governance) });
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test("11A.2 defines only the three tasks and four non-fact statement types", () => {
  assert.match(typesSource, /"executive_summary" \| "change_interpretation" \| "management_attention"/);
  assert.match(typesSource, /"interpretation" \| "attention" \| "decision_option" \| "limitation"/);
  assert.doesNotMatch(typesSource, /BuildAIStatementType[^;]+(?:fact|prediction|forecast|root_cause|action|score)/);
});

test("default governance is conservative shadow policy and reuses D.2 constraints", () => {
  assert.match(governanceSource, /^import "server-only";/);
  assert.match(governanceSource, /BUILD_INTELLIGENCE_UNSUPPORTED_CONCLUSIONS/);
  assert.match(governanceSource, /version: "build-ai-governance-v1"/);
  assert.match(governanceSource, /allowAutonomousActions: false/);
  assert.match(governanceSource, /requireCoverageQualification: true/);
  assert.match(governanceSource, /requireFactReferences: true/);
  assert.match(governanceSource, /visibilityMode: "shadow"/);
  assert.doesNotMatch(governanceSource, /threshold|critical threshold|riskScore|confidence/i);
  for (const conclusion of ["root_cause", "critical_path", "physical_progress", "productivity", "financial_impact", "project_health_score"]) assert.match(canonicalConstraints, new RegExp(`"${conclusion}"`));
});

test("valid interpretation is accepted and deterministic support is added by validation", () => {
  const result = validate(model());
  assert.equal(result.ok, true);
  assert.equal(result.interpretation.validation.status, "accepted");
  assert.equal(result.interpretation.validation.policyVersion, "build-ai-governance-v1");
  assert.equal(result.interpretation.statements[0].supportState, "fully_supported");
});

test("untrusted model output cannot author final validation state", () => {
  const result = validate({ ...model(), validation: { status: "accepted", policyVersion: "model" } });
  assert.equal(result.ok, false); assert.equal(result.errors[0].code, "invalid_shape");
});

test("exact shapes reject unknown top-level statement and limitation keys", () => {
  const variants = [
    { ...model(), extra: true },
    { ...model(), statements: [{ ...model().statements[0], extra: true }] },
    { ...model(), statements: [], limitations: [{ id: "limit-1", code: "partial_coverage", text: "Coverage is partial.", coverageRefs: [], extra: true }] },
  ];
  for (const value of variants) assert.equal(validate(value).ok, false);
});

test("fact prediction decision and action statement types are rejected", () => {
  for (const type of ["fact", "prediction", "decision", "action"]) {
    const result = validate({ ...model(), statements: [{ ...model().statements[0], type }] });
    assert.equal(result.ok, false); assert.ok(result.errors.some((item) => item.code === "unsupported_statement_type"));
  }
});

test("subjective severity numeric confidence and autonomous fields fail with stable codes", () => {
  const cases = [["severity", "critical", "subjective_severity_not_allowed"], ["healthScore", 90, "subjective_severity_not_allowed"], ["confidence", 0.92, "numeric_confidence_not_allowed"], ["probability", 0.8, "numeric_confidence_not_allowed"], ["action", "notify", "autonomous_action_not_allowed"], ["executed", true, "autonomous_action_not_allowed"]];
  for (const [key, value, code] of cases) {
    const result = validate({ ...model(), statements: [{ ...model().statements[0], [key]: value }] });
    assert.equal(result.ok, false); assert.equal(result.errors[0].code, code);
  }
});

test("structured unsupported conclusions fail closed without a prose keyword blacklist", () => {
  for (const [key, value] of [["forecast", "tomorrow"], ["rootCause", "supplier"], ["financialImpact", 100], ["criticalPath", true]]) {
    const result = validate({ ...model(), statements: [{ ...model().statements[0], [key]: value }] });
    assert.equal(result.ok, false); assert.equal(result.errors[0].code, "unsupported_conclusion");
  }
  assert.doesNotMatch(validationSource, /includes\(.*text|text\.match|keyword blacklist/i);
});

test("unknown task wrong version invalid timestamps duplicates and bounds fail closed", () => {
  const tooMany = Array.from({ length: 13 }, (_, index) => ({ ...model().statements[0], id: `statement-${index}` }));
  const variants = [
    { ...model(), task: "forecast_completion" }, { ...model(), schemaVersion: "2.0" }, { ...model(), generatedAt: "yesterday" },
    { ...model(), statements: [model().statements[0], model().statements[0]] }, { ...model(), statements: tooMany },
    { ...model(), statements: [{ ...model().statements[0], text: "x".repeat(501) }] },
  ];
  for (const value of variants) assert.equal(validate(value).ok, false);
});

test("prototype-like and symbol-bearing outputs fail closed", () => {
  const runtime = loadValidator();
  const calls = runtime.realm(toolCalls()); const policy = runtime.realm(governance);
  const inherited = runtime.custom(`Object.assign(Object.create({task:"executive_summary"}), ${JSON.stringify(model())})`);
  const symbol = runtime.custom(`Object.assign(${JSON.stringify(model())}, {[Symbol("action")]:true})`);
  assert.equal(runtime.validate({ output: inherited, toolCalls: calls, governance: policy }).ok, false);
  assert.equal(runtime.validate({ output: symbol, toolCalls: calls, governance: policy }).ok, false);
});

test("fact references require a declared known tool call and an existing safe path", () => {
  const badFacts = [
    { toolCallId: "unknown", factPath: "/schedule/currentlyOverdue", provenanceKeys: ["schedule"] },
    { toolCallId: "tool-1", factPath: "/schedule/fabricatedMetric", provenanceKeys: ["schedule"] },
    { toolCallId: "tool-1", factPath: "/schedule/*", provenanceKeys: ["schedule"] },
    { toolCallId: "tool-1", factPath: "/__proto__/polluted", provenanceKeys: ["schedule"] },
    { toolCallId: "tool-1", factPath: "schedule.currentlyOverdue", provenanceKeys: ["schedule"] },
  ];
  for (const fact of badFacts) {
    const result = validate({ ...model(), statements: [{ ...model().statements[0], supportingFacts: [fact] }] });
    assert.equal(result.ok, false); assert.ok(result.errors.some((item) => item.code === "invalid_fact_reference"));
  }
});

test("fact provenance must exist in its own deterministic dataset", () => {
  const result = validate({ ...model(), statements: [{ ...model().statements[0], supportingFacts: [{ ...model().statements[0].supportingFacts[0], provenanceKeys: ["fabricated"] }] }] });
  assert.equal(result.ok, false); assert.ok(result.errors.some((item) => item.code === "invalid_provenance_reference"));
});

test("partial coverage requires and accepts an exact explicit coverage limitation", () => {
  const partial = dataset({ partialSchedule: true });
  const calls = toolCalls(partial);
  const base = model({ scope: partial.scope, dataset: { schemaVersion: "1.0", toolCalls: [{ id: "tool-1", tool: "get_build_project_intelligence", scope: partial.scope, datasetSchemaVersion: "1.0", asOf: AS_OF }] } });
  const rejected = validate(base, calls);
  assert.equal(rejected.ok, false); assert.ok(rejected.errors.some((item) => item.code === "coverage_limitation_required"));
  const limitation = { id: "limit-1", code: "partial_coverage", text: "Schedule coverage is partial.", coverageRefs: [{ toolCallId: "tool-1", coveragePath: "/coverage/schedule" }] };
  const accepted = validate({ ...base, statements: [{ ...base.statements[0], limitationIds: ["limit-1"] }], limitations: [limitation] }, calls);
  assert.equal(accepted.ok, true); assert.equal(accepted.interpretation.statements[0].supportState, "coverage_limited");
});

test("interpretation attention and decision options require facts while limitations may stand alone", () => {
  for (const type of ["interpretation", "attention", "decision_option"]) {
    const result = validate({ ...model(), statements: [{ ...model().statements[0], type, supportingFacts: [] }] });
    assert.equal(result.ok, false); assert.ok(result.errors.some((item) => item.code === "invalid_fact_reference"));
  }
  const result = validate({ ...model(), statements: [{ id: "statement-limit", type: "limitation", text: "Interpretation is unavailable.", supportingFacts: [], limitationIds: [] }] });
  assert.equal(result.ok, true);
});

test("tool references must match authorized tool identity scope schema and as-of", () => {
  for (const patch of [{ id: "unknown" }, { tool: "get_build_activity_intelligence" }, { scope: { kind: "project", projectId: "other" } }, { datasetSchemaVersion: "2.0" }, { asOf: "2026-09-08T00:00:00.000Z" }]) {
    const output = model(); output.dataset.toolCalls[0] = { ...output.dataset.toolCalls[0], ...patch };
    assert.equal(validate(output).ok, false);
  }
});

test("validator leaves deterministic tool calls datasets coverage provenance and constraints unchanged", () => {
  const calls = toolCalls(); const before = JSON.stringify(calls);
  const result = validate(model(), calls);
  assert.equal(result.ok, true); assert.equal(JSON.stringify(calls), before);
});

test("contracts express deterministic fallback without discarding tool results", () => {
  assert.match(typesSource, /deterministicToolCalls: readonly BuildAIAcceptedToolCall\[\]/);
  assert.match(typesSource, /interpretation: null/);
  assert.match(typesSource, /"interpretation_unavailable" \| "no_data" \| "partial_data" \| "not_authorized" \| "ai_unavailable"/);
});

test("11A.2 remains server-only provider-free and has no orchestration IO or UI", () => {
  assert.match(validationSource, /^import "server-only";/);
  const combined = `${governanceSource}\n${validationSource}`;
  assert.doesNotMatch(combined, /openai|anthropic|gemini|ai-sdk|createAdminSupabase|\.from\(|\.select\(|getAuthenticatedBuildIntelligence|BUILD_INTELLIGENCE_TOOLS|NextResponse|fetch\(|route\.ts|React|notification|insert\(|update\(|upsert\(/i);
  assert.doesNotMatch(combined, /prompt|system prompt|model invocation|orchestration/i);
});

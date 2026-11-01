import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const serviceSource = readFileSync(new URL("../lib/build/ai/executiveService.ts", import.meta.url), "utf8");
const compositionSource = readFileSync(new URL("../lib/build/ai/executiveInterpretation.ts", import.meta.url), "utf8");
const explainabilitySource = readFileSync(new URL("../lib/build/ai/explainability.ts", import.meta.url), "utf8");
const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(source, imports = {}, sharedContext) {
  const context = sharedContext ?? vm.createContext({ setTimeout });
  context.module = { exports: {} }; context.exports = context.module.exports;
  context.require = (specifier) => { if (specifier === "server-only") return {}; if (specifier in imports) return imports[specifier]; throw new Error(`Unexpected import ${specifier}`); };
  new vm.Script(`(function (exports, module, require) { ${compile(source)}\n})(exports, module, require);`).runInContext(context); return { exports: context.module.exports, context };
}
const loadedComposition = load(compositionSource);
const composition = loadedComposition.exports;
const explainability = load(explainabilitySource, {}, loadedComposition.context).exports;
const orchestrationModule = { orchestrateBuildAI() { throw new Error("Production orchestration must be injected in offline tests."); } };
const service = load(serviceSource, { "./orchestration.ts": orchestrationModule, "./executiveInterpretation.ts": composition, "./explainability.ts": explainability }, loadedComposition.context).exports;
const realmValue = (value) => { loadedComposition.context.__bridge = JSON.stringify(value); return vm.runInContext("JSON.parse(__bridge)", loadedComposition.context); };
const PROJECT = "a1000000-0000-4000-8000-000000000002";
const HISTORY = { from: "2026-08-01", through: "2026-08-31", timezone: "UTC", cadence: "weekly" };
const primary = ["executive_position", "current_management_attention", "material_execution_changes"];
const taskBySection = { executive_position: "executive_summary", current_management_attention: "management_attention", material_execution_changes: "change_interpretation" };
const json = (value) => JSON.parse(JSON.stringify(value));

function interpretation(task, { decision = false, limitation = false } = {}) {
  const limitations = limitation ? [{ id: "limitation-1", code: "partial_coverage", text: `${task} coverage is partial.`, coverageRefs: [{ toolCallId: "tool-call-1", coveragePath: "/coverage/current" }] }] : [];
  const statements = [{ id: "statement-1", type: "interpretation", text: `${task} result`, supportingFacts: [{ toolCallId: "tool-call-1", factPath: "/currentState/total", provenanceKeys: ["current"] }], limitationIds: limitation ? ["limitation-1"] : [], supportState: limitation ? "coverage_limited" : "fully_supported" }];
  if (decision) statements.push({ id: "decision-1", type: "decision_option", text: `${task} option`, supportingFacts: [{ toolCallId: "tool-call-1", factPath: "/attention/total", provenanceKeys: ["attention"] }], limitationIds: [], supportState: "fully_supported" });
  return { schemaVersion: "1.0", generatedAt: "2026-09-15T10:00:00.000Z", scope: { kind: "project", projectId: PROJECT }, task, dataset: { schemaVersion: "1.0", toolCalls: [] }, statements, limitations, validation: { status: "accepted", policyVersion: "build-ai-governance-v1" } };
}
function result(task, status = "interpreted", options) {
  return { ok: status === "interpreted", status, toolResults: status === "deterministic_intelligence_unavailable" ? [] : [{}], interpretation: status === "interpreted" ? interpretation(task, options) : null, audit: { provider: status === "interpreted" ? { providerId: "openai", modelId: "gpt-test" } : null, providerFailureCategory: null, validationOutcome: status === "interpreted" ? "accepted" : "not_run", startedAt: "2026-09-15T10:00:00.000Z", completedAt: "2026-09-15T10:00:00.125Z" } };
}
function harness(outcomes = {}, delays = {}) {
  const calls = []; let active = 0, maximumActive = 0;
  const executeInRealm = service.createBuildExecutiveService({ orchestrate: async (request) => {
    calls.push(json(request)); active += 1; maximumActive = Math.max(maximumActive, active);
    try { if (delays[request.task]) await new Promise((resolve) => setTimeout(resolve, delays[request.task])); const value = outcomes[request.task]; if (value instanceof Error) throw value; return realmValue(value ?? result(request.task)); }
    finally { active -= 1; }
  } });
  const execute = (input) => executeInRealm(realmValue(input));
  return { execute, calls, maximumActive: () => maximumActive };
}

test("each primary section invokes exactly its governed task and shared sections invoke nothing", async () => {
  for (const section of primary) {
    const h = harness(); const request = { projectId: PROJECT, sections: [section], ...(section === "material_execution_changes" ? { history: HISTORY } : {}) };
    const output = await h.execute(request); assert.equal(output.ok, true); assert.deepEqual(json(h.calls.map((call) => call.task)), [taskBySection[section]]); assert.equal(output.interpretation.availability, "partial");
  }
});

test("two and three selected tasks have exact bounded call counts and task-specific request shapes", async () => {
  const two = harness(); await two.execute({ projectId: PROJECT, sections: primary.slice(0, 2) }); assert.equal(two.calls.length, 2); assert.ok(two.calls.every((call) => !("history" in call)));
  const three = harness(); await three.execute({ projectId: PROJECT, sections: primary, history: HISTORY }); assert.equal(three.calls.length, 3); assert.deepEqual(json(three.calls.find((call) => call.task === "change_interpretation").history), HISTORY); assert.ok(three.calls.filter((call) => call.task !== "change_interpretation").every((call) => !("history" in call)));
});

test("exact structural validation rejects malformed cost or authority input before invocation", async () => {
  const invalid = [
    {}, { projectId: "bad", sections: ["executive_position"] }, { projectId: PROJECT }, { projectId: PROJECT, sections: [] },
    { projectId: PROJECT, sections: ["executive_position", "executive_position"] }, { projectId: PROJECT, sections: ["unknown"] },
    { projectId: PROJECT, sections: ["decision_considerations"] }, { projectId: PROJECT, sections: ["executive_position"], clientId: PROJECT },
    { projectId: PROJECT, sections: ["material_execution_changes"], history: { ...HISTORY, timezone: "Africa/Lagos" } },
    { projectId: PROJECT, sections: ["material_execution_changes"], history: { ...HISTORY, extra: true } },
    { projectId: PROJECT, sections: ["material_execution_changes"], history: { ...HISTORY, from: "2026-02-30" } },
    { projectId: PROJECT, sections: ["executive_position"], history: HISTORY },
  ];
  for (const request of invalid) { const h = harness(); assert.deepEqual(json(await h.execute(request)), { ok: false, status: "invalid_request" }); assert.equal(h.calls.length, 0); }
});

test("missing change history is source-local invalid_request while other selected work proceeds", async () => {
  const h = harness(); const output = await h.execute({ projectId: PROJECT, sections: ["executive_position", "material_execution_changes"] });
  assert.equal(output.ok, true); assert.deepEqual(json(h.calls.map((call) => call.task)), ["executive_summary"]); assert.equal(output.interpretation.availability, "partial");
  assert.equal(output.interpretation.sections[0].availability, "available"); assert.equal(output.interpretation.sections[2].availability, "invalid_request"); assert.equal(output.interpretation.sections[2].statements.length, 0);
});

test("eligible work executes concurrently while final source and section ordering stays deterministic", async () => {
  const h = harness({}, { executive_summary: 30, management_attention: 20, change_interpretation: 10 });
  const output = await h.execute({ projectId: PROJECT, sections: primary, history: HISTORY }); assert.equal(output.ok, true); assert.equal(h.maximumActive(), 3);
  assert.deepEqual(json(output.interpretation.sections.slice(0, 3).map((section) => section.sourceTasks[0])), ["executive_summary", "management_attention", "change_interpretation"]);
});

test("governed task failures are isolated without retry replacement or cross-task facts", async () => {
  for (const status of ["ai_unavailable", "interpretation_unavailable", "deterministic_intelligence_unavailable", "no_data", "not_authorized"]) {
    const h = harness({ management_attention: result("management_attention", status) }); const output = await h.execute({ projectId: PROJECT, sections: primary.slice(0, 2) });
    assert.equal(output.ok, true); assert.equal(h.calls.length, 2); assert.equal(output.interpretation.availability, "partial"); assert.equal(output.interpretation.sections[1].availability, status); assert.equal(output.interpretation.sections[1].statements.length, 0);
  }
  const all = harness(Object.fromEntries(["executive_summary", "management_attention"].map((task) => [task, result(task, "ai_unavailable")]))); const unavailable = await all.execute({ projectId: PROJECT, sections: primary.slice(0, 2) }); assert.equal(unavailable.interpretation.availability, "unavailable");
});

test("bounded diagnostics distinguish successful provider and validation failure outcomes", async () => {
  const failed = (task, providerFailureCategory, validationOutcome = "not_run") => ({
    ...result(task, "interpretation_unavailable"),
    audit: { provider: null, providerFailureCategory, validationOutcome, startedAt: "2026-09-15T10:00:00.000Z", completedAt: "2026-09-15T10:00:00.250Z" },
  });
  const cases = [
    ["provider_timeout", "provider_timeout"],
    ["provider_refusal", "provider_rejection"],
    ["invalid_provider_response", "malformed_structured_output"],
    ["invalid_provider_reference", "invalid_fact_references"],
  ];
  for (const [category, outcome] of cases) {
    const h = harness({ executive_summary: failed("executive_summary", category) });
    const output = await h.execute({ projectId: PROJECT, sections: primary.slice(0, 2) });
    const diagnostic = output.diagnostics.find((item) => item.task === "executive_summary");
    assert.deepEqual(json(diagnostic), { task: "executive_summary", status: "interpretation_unavailable", outcome, effectiveModel: null, providerFailureCategory: category, providerFailureDetail: null, validationOutcome: "not_run", validationErrorCodes: [], durationMs: 250 });
    assert.equal(output.diagnostics.find((item) => item.task === "management_attention").outcome, "successful");
  }
  const governanceResult = failed("executive_summary", null, "rejected");
  governanceResult.errors = [
    { code: "coverage_limitation_required", path: "private.path", message: "private detail" },
    { code: "unsupported_conclusion", path: "private.path", message: "private detail" },
    { code: "coverage_limitation_required", path: "private.path", message: "private detail" },
  ];
  governanceResult.audit.validationErrorCodes = ["coverage_limitation_required", "unsupported_conclusion"];
  const governance = harness({ executive_summary: governanceResult });
  const output = await governance.execute({ projectId: PROJECT, sections: primary.slice(0, 2) });
  const governanceDiagnostic = output.diagnostics.find((item) => item.task === "executive_summary");
  assert.equal(governanceDiagnostic.outcome, "governance_validation_rejection");
  assert.deepEqual(json(governanceDiagnostic.validationErrorCodes), ["coverage_limitation_required", "unsupported_conclusion"]);
  assert.doesNotMatch(JSON.stringify(governanceDiagnostic), /private\.path|private detail/);
});

test("diagnostics remain bounded and never contain datasets prompts credentials or raw errors", async () => {
  const h = harness({ management_attention: new Error("private provider body and token") });
  const output = await h.execute({ projectId: PROJECT, sections: primary.slice(0, 2) });
  const serialized = JSON.stringify(output.diagnostics);
  assert.equal(output.diagnostics.length, 3);
  assert.equal(output.diagnostics.find((item) => item.task === "management_attention").outcome, "unexpected_failure");
  for (const forbidden of ["private provider body", "token", "dataset", "prompt", "credential", "statement"]) assert.equal(serialized.includes(forbidden), false);
});

test("unexpected task exceptions are contained independently and never retried", async () => {
  const h = harness({ management_attention: new Error("private failure") }); const output = await h.execute({ projectId: PROJECT, sections: primary.slice(0, 2) });
  assert.equal(output.ok, true); assert.equal(h.calls.length, 2); assert.equal(output.interpretation.sections[0].availability, "available"); assert.equal(output.interpretation.sections[1].availability, "deterministic_intelligence_unavailable");
});

test("decision limitations partial coverage and request-local aliases preserve source identity", async () => {
  const h = harness({ executive_summary: result("executive_summary", "interpreted", { decision: true, limitation: true }), management_attention: result("management_attention", "interpreted", { decision: true, limitation: true }) });
  const output = await h.execute({ projectId: PROJECT, sections: primary.slice(0, 2) }); assert.equal(output.ok, true);
  const decisions = output.interpretation.sections[3], limitations = output.interpretation.sections[4], evidence = output.interpretation.sections[5];
  assert.deepEqual(json(decisions.statements.map((item) => item.sourceTask)), ["executive_summary", "management_attention"]); assert.deepEqual(json(limitations.limitations.map((item) => item.id)), ["executive_summary:limitation-1", "management_attention:limitation-1"]);
  assert.equal(evidence.evidence.filter((item) => item.authoritativeReference.toolCallId === "tool-call-1").length, 4); assert.ok(evidence.evidence.every((item) => item.id.startsWith(`${item.sourceTask}:`)));
});

test("service is server-only provider-neutral renderer-neutral and persistence-free", () => {
  assert.match(serviceSource, /^import "server-only";/); assert.match(serviceSource, /orchestrateBuildAI/); assert.match(serviceSource, /composeBuildExecutiveInterpretation/);
  assert.doesNotMatch(serviceSource, /providers\/openai|from ["']openai|responses\.create|supabase|\.from\(|insert\(|update\(|upsert\(|fetch\(|route\.ts|React|jsx|card|chart|dashboard|notification|email|sms|whatsapp|setTimeout|Promise\.race/i);
});

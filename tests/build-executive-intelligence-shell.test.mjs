import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { composeExecutiveIntelligenceViewModel, groupExecutiveAttentionItems, groupExecutiveStatements } from "../lib/build/ai/executivePresentation.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const routeSource = read("app/api/workspace/build/executive-intelligence/[id]/route.ts");
const pageSource = read("app/workspace/admin/projects/[id]/[section]/page.tsx");
const shellSource = read("components/workspace/ExecutiveIntelligenceShell.tsx");
const navigationSource = read("components/workspace/BuildProjectShell.tsx");
const fixtureSource = read("lib/build/ai/executivePresentationFixture.ts");
const projectId = "a1000000-0000-4000-8000-000000000002";
const clientId = "b1000000-0000-4000-8000-000000000002";
const history = { from: "2026-09-01", through: "2026-09-07", timezone: "UTC", cadence: "daily" };

function routeHarness({ authorized = true, providerReady = true } = {}) {
  const calls = { auth: 0, scope: 0, canonical: 0, providerFactory: 0, executive: 0 };
  const serviceResult = { ok: false, status: "composition_unavailable" };
  const project = { id: projectId, client_id: clientId, project_type: "Construction" };
  const imports = {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200, headers: options.headers }) } },
    "@/lib/accessControl": { AccessControlError: class AccessControlError extends Error { constructor(message, status = 403) { super(message); this.status = status; } } },
    "@/lib/build/ai/executiveService": { createBuildExecutiveServiceFromOrchestration: () => async (input) => { calls.executive++; calls.input = input; return serviceResult; } },
    "@/lib/build/ai/executivePresentation": { composeExecutiveIntelligenceViewModel: () => ({ availability: "partial" }) },
    "@/lib/build/ai/providers/openai": { createConfiguredBuildAIProvider: () => { calls.providerFactory++; return providerReady ? { status: "ready", provider: {}, config: { timeoutMs: 15000 } } : { status: "disabled" }; } },
    "@/lib/build/projects/service": { resolveCanonicalBuildProject: async (input) => { calls.canonical++; calls.canonicalInput = input; return { project }; } },
    "@/lib/build/projects/types": { isBuildProjectType: (type) => type === "Construction" },
    "@/lib/workspace/customerAdmin": { CustomerWorkspaceRedirect: class CustomerWorkspaceRedirect extends Error {}, requireCustomerWorkspace: async () => { calls.auth++; if (!authorized) throw new imports["@/lib/accessControl"].AccessControlError("Denied", 403); return { clientId }; } },
    "@/lib/workspace/projectScope": { getCustomerWorkspaceProjectScope: async (workspace, id) => { calls.scope++; return { selectedProject: authorized && workspace.clientId === clientId && id === projectId ? project : null }; } },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(routeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = vm.createContext({ module, exports: module.exports, require: (name) => { if (!(name in imports)) throw Error(`Unexpected ${name}`); return imports[name]; }, Date, Object, Reflect, JSON, Number, Set, URL });
  new vm.Script(code).runInContext(context);
  const request = (body) => ({ url: "http://localhost:3000/api/workspace/build/executive-intelligence/fixture", headers: { get: (name) => name === "content-type" ? "application/json" : name === "origin" ? "http://localhost:3000" : null }, text: async () => JSON.stringify(body) });
  return { POST: module.exports.POST, request, calls };
}

test("page GET is canonical and does not invoke the AI boundary", () => {
  assert.match(pageSource, /getBuildProjectWorkspaceOverview\(params\.id\)/);
  assert.match(pageSource, /section === "executive-intelligence"/);
  assert.doesNotMatch(pageSource, /createBuildExecutiveService|createConfiguredBuildAIProvider|orchestrateBuildAI/);
  assert.match(navigationSource, /key: "executive-intelligence", label: "Executive Intelligence"/);
  assert.match(shellSource, /onClick=\{generate\}/);
  assert.doesNotMatch(shellSource, /useEffect|OPENAI_API_KEY|\/client/);
});

test("explicit POST validates canonical membership and project before provider creation", async () => {
  const denied = routeHarness({ authorized: false });
  assert.equal((await denied.POST(denied.request({ history }), { params: { id: projectId } })).status, 403);
  assert.equal(denied.calls.providerFactory, 0);
  assert.equal(denied.calls.executive, 0);
  const allowed = routeHarness();
  const response = await allowed.POST(allowed.request({ history }), { params: { id: projectId } });
  assert.equal(response.status, 200);
  assert.equal(allowed.calls.auth, 1);
  assert.equal(allowed.calls.canonicalInput.requiredPermission, "projects:read");
  assert.equal(allowed.calls.canonicalInput.requestedClientId, clientId);
  assert.equal(allowed.calls.executive, 1);
  assert.deepEqual(Array.from(allowed.calls.input.sections), ["executive_position", "current_management_attention", "material_execution_changes"]);
  assert.equal(allowed.calls.input.history.timezone, "UTC");
});

test("browser cannot supply tenant or provider authority and invalid history cannot invoke AI", async () => {
  const harness = routeHarness();
  for (const body of [{ history, clientId }, { history, provider: "openai" }, { history: { ...history, timezone: "Africa/Lagos" } }, { history: { ...history, through: "2028-09-07" } }]) {
    assert.equal((await harness.POST(harness.request(body), { params: { id: projectId } })).status, 400);
  }
  assert.equal(harness.calls.providerFactory, 0);
  assert.equal(harness.calls.executive, 0);
});

test("disabled provider returns controlled unavailability without invoking service", async () => {
  const harness = routeHarness({ providerReady: false });
  const response = await harness.POST(harness.request({ history }), { params: { id: projectId } });
  assert.equal(response.status, 503);
  assert.equal(harness.calls.executive, 0);
});

test("presentation preserves partial sections, non-binding decisions, qualifications and unavailable evidence", () => {
  const fact = { toolCallId: "tool-call-1", factPath: "/attention/summary/categoryCounts/scheduleOverdue", provenanceKeys: ["project"] };
  const sections = ["executive_position", "current_management_attention", "material_execution_changes", "decision_considerations", "data_coverage_and_limitations", "supporting_deterministic_facts"].map((id) => ({ id, availability: id === "material_execution_changes" ? "ai_unavailable" : "available", statements: id === "executive_position" ? [{ id: "statement-1", text: "A grounded statement.", type: "interpretation", sourceTask: "executive_summary", supportState: "coverage_limited", supportingFacts: [fact], limitationIds: ["limit-1"] }] : [], limitations: [], evidence: [], sourceTasks: [] }));
  const evidence = [{ id: "evidence-1", label: "Evidence descriptor unavailable", source: { task: "executive_summary", label: "Executive Position" }, availability: "descriptor_unavailable", value: null, timing: { asOf: "", generatedAt: "" }, authoritativeReference: fact }];
  const result = { ok: true, interpretation: { contract: "deployiq.build.executive_interpretation", schemaVersion: "1.0", scope: { kind: "project", projectId }, availability: "partial", sections }, explainability: { contract: "deployiq.build.executive_explainability", schemaVersion: "1.0", scope: { kind: "project", projectId }, evidence, limitations: [{ id: "limit-1", code: "partial_coverage", text: "Coverage is partial." }], decisionConsiderations: [{ id: "decision-1", text: "Consider review.", evidenceIds: ["evidence-1"], limitationIds: [], authority: "non_binding" }] } };
  const view = composeExecutiveIntelligenceViewModel(result, projectId);
  assert.equal(view.availability, "partial");
  assert.equal(view.materialChanges.availability, "ai_unavailable");
  assert.equal(view.executivePosition.statements[0].supportState, "coverage_limited");
  assert.deepEqual(view.executivePosition.statements[0].limitationIds, ["limit-1"]);
  assert.equal(view.decisionConsiderations.authority, "non_binding");
  assert.equal(view.evidence[0].availability, "descriptor_unavailable");
  assert.equal(view.evidence[0].href, null);
  assert.equal(view.coverage.limitations[0].text, "Coverage is partial.");
  assert.equal(composeExecutiveIntelligenceViewModel(result, "other-project"), null);
});

test("presentation groups only exact repeated statements and retains all evidence", () => {
  const base = { text: "Review the overdue work package.", supportState: "supported", limitationIds: [] };
  const grouped = groupExecutiveStatements([
    { id: "one", ...base, evidenceIds: ["fact-1"] },
    { id: "two", ...base, evidenceIds: ["fact-2"] },
    { id: "three", ...base, evidenceIds: ["fact-2", "fact-3"] },
    { id: "different", ...base, text: "Review a blocked activity.", evidenceIds: ["fact-4"] },
    { id: "limited", ...base, supportState: "coverage_limited", evidenceIds: ["fact-5"] },
  ]);
  assert.equal(grouped.length, 3);
  assert.equal(grouped[0].itemCount, 3);
  assert.deepEqual(grouped[0].sourceIds, ["one", "two", "three"]);
  assert.deepEqual(grouped[0].evidenceIds, ["fact-1", "fact-2", "fact-3"]);
  assert.equal(grouped[1].itemCount, 1);
  assert.equal(grouped[2].supportState, "coverage_limited");
});

test("management condition/action grouping is exact and losslessly retains evidence", () => {
  const descriptor = (id, index, field, raw) => ({
    id, label: field, source: { task: "management_attention", label: "Management Attention" },
    availability: "available", value: { type: "text", raw }, timing: { asOf: "2026-09-20T10:00:00.000Z", generatedAt: "2026-09-20T10:01:00.000Z" },
    authoritativeReference: { toolCallId: "tool-1", factPath: `/attention/preview/items/${index}/${field}`, provenanceKeys: ["project"] }, href: null,
  });
  const grouped = groupExecutiveAttentionItems([
    descriptor("condition-0", 0, "condition", "Activity overdue to complete"),
    descriptor("action-0", 0, "expectedNextAction", "Complete work or submit for review as configured"),
    descriptor("condition-1", 1, "condition", "Activity overdue to complete"),
    descriptor("action-1", 1, "expectedNextAction", "Complete work or submit for review as configured"),
    descriptor("condition-2", 2, "condition", "Activity blocked"),
    descriptor("action-2", 2, "expectedNextAction", "Resolve the blocking dependency"),
  ]);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].itemCount, 2);
  assert.deepEqual(grouped[0].evidenceIds, ["condition-0", "action-0", "condition-1", "action-1"]);
  assert.equal(grouped[1].itemCount, 1);
});

test("executive presentation hierarchy is explicit, progressive and responsive", () => {
  const position = shellSource.indexOf("Executive Position");
  const attention = shellSource.indexOf("Management Attention");
  const decisions = shellSource.indexOf("Decision Considerations");
  const changes = shellSource.indexOf("Material Changes");
  const coverage = shellSource.indexOf("Data Coverage &amp; Limitations");
  const evidence = shellSource.indexOf("Supporting Evidence");
  assert.ok(position < attention && attention < decisions && decisions < changes && changes < coverage && coverage < evidence);
  assert.match(shellSource, /<details/);
  assert.match(shellSource, /Non-binding/);
  assert.match(shellSource, /As Of/);
  assert.match(shellSource, /Generated At/);
  assert.match(shellSource, /History Period/);
  assert.match(shellSource, /disabled=\{pending \|\| !from \|\| !through\}/);
  assert.doesNotMatch(shellSource, /Numerator|Denominator|Raw path|href=\{item\.href\}/);
});

test("populated presentation fixture is disposable-local and server gated", () => {
  assert.match(fixtureSource, /import "server-only"/);
  assert.match(fixtureSource, /NODE_ENV !== "development"/);
  assert.match(fixtureSource, /DEPLOYIQ_BUILD_EXECUTIVE_FIXTURE !== "1"/);
  assert.match(fixtureSource, /http:\/\/127\.0\.0\.1:54321/);
  assert.match(fixtureSource, new RegExp(projectId));
  assert.doesNotMatch(fixtureSource, /OPENAI_API_KEY|createConfiguredBuildAIProvider|fetch\(/);
  assert.match(pageSource, /initialView=\{getLocalExecutivePresentationFixture\(overview\.project\.id\)\}/);
});

test("no persistence, schema or fourth task is added by the shell", () => {
  const combined = [routeSource, pageSource, shellSource, fixtureSource, read("lib/build/ai/executivePresentation.ts")].join("\n");
  assert.doesNotMatch(combined, /\.insert\(|\.upsert\(|\.update\(|\.delete\(|CREATE TABLE|CREATE POLICY/);
  assert.doesNotMatch(routeSource, /model:|prompt:|provider: .*request|temperature/);
  assert.match(routeSource, /createBuildExecutiveServiceFromOrchestration/);
});

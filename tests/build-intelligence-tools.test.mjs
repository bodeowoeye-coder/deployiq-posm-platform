import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../lib/build/intelligence/tools.ts", import.meta.url), "utf8");
const PROJECT = "a1000000-0000-4000-8000-000000000002";
const WORK_PACKAGE = "a1000000-0000-4000-8000-000000000004";
const ACTIVITY = "9144974b-df60-44d7-b0cc-9eea25951d0a";

class ServiceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function loadAdapter(service = async () => { throw new Error("unexpected service call"); }) {
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = vm.createContext({
    exports: {}, module: { exports: {} },
    require(specifier) {
      if (specifier === "server-only") return {};
      if (specifier === "./service.ts") return { BuildIntelligenceServiceError: ServiceError, getAuthenticatedBuildIntelligence: service };
      if (specifier === "./types.ts") return {};
      throw new Error(`Unexpected test import: ${specifier}`);
    },
  });
  context.exports = context.module.exports;
  new vm.Script(javascript, { filename: "tools.ts" }).runInContext(context);
  return {
    adapter: context.module.exports,
    input(value) {
      context.serializedInput = JSON.stringify(value);
      return vm.runInContext("JSON.parse(serializedInput)", context);
    },
    customInput(expression) { return vm.runInContext(expression, context); },
  };
}

function dataset(scope) {
  return {
    schemaVersion: "1.0", contract: { name: "deployiq.build.intelligence", detailLevel: scope.kind === "project" ? "summary" : scope.kind }, scope,
    coverage: { schedule: { numerator: 1, denominator: 1, ratio: 1 } },
    constraints: { unsupportedConclusions: ["root_cause", "critical_path"], notices: ["deterministic"] },
    provenance: { authority: "deployiq_deterministic_build_intelligence", groups: [{ key: "schedule" }] },
    workPackages: { items: [], total: 0, returned: 0, truncated: false, continuationToken: null },
  };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test("D.4 is server-only and defines exactly four stable provider-neutral tools", () => {
  assert.match(source, /^import "server-only";/);
  const { adapter } = loadAdapter();
  assert.deepEqual(Array.from(adapter.BUILD_INTELLIGENCE_TOOL_NAMES), [
    "get_build_project_intelligence", "get_build_work_package_intelligence",
    "get_build_activity_intelligence", "get_build_execution_history",
  ]);
  assert.equal(adapter.BUILD_INTELLIGENCE_TOOLS.length, 4);
  assert.equal(new Set(adapter.BUILD_INTELLIGENCE_TOOLS.map((tool) => tool.name)).size, 4);
});

test("D.4 depends only on D.3 and intelligence types", () => {
  const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(imports, ["./service.ts", "./types.ts"]);
  assert.doesNotMatch(source, /supabase|management\/service|reporting\/|\.from\(|\.select\(|NextResponse|route\.ts/i);
  assert.doesNotMatch(source, /openai|anthropic|gemini|ai-sdk|prompt|provider sdk/i);
});

test("registry schemas reject additional properties and expose no authority fields", () => {
  const { adapter } = loadAdapter();
  assert.ok(adapter.BUILD_INTELLIGENCE_TOOLS.every((tool) => tool.inputSchema.additionalProperties === false));
  const schemas = JSON.stringify(adapter.BUILD_INTELLIGENCE_TOOLS.map((tool) => tool.inputSchema));
  for (const field of ["clientId", "tenantId", "workspaceId", "userId", "role", "permissions", "authContext", "session", "token", "serviceRoleKey", "asOf", "generatedAt", "dataset", "query", "filter", "projection", "sql", "provider", "model", "prompt", "callbacks"]) {
    assert.doesNotMatch(schemas, new RegExp(`"${field}"`));
  }
});

test("Project tool validates then translates to exactly one D.3 Project request", async () => {
  const calls = [], expected = dataset({ kind: "project", projectId: PROJECT });
  const { adapter, input } = loadAdapter(async (request) => { calls.push(request); return expected; });
  const result = await adapter.BUILD_INTELLIGENCE_TOOLS[0].handler(input({ projectId: PROJECT }));
  assert.deepEqual(plain(calls), [{ scope: "project", projectId: PROJECT }]);
  assert.equal(result.ok, true); assert.equal(result.dataset, expected); assert.equal(result.scope, expected.scope);
});

test("Work Package tool translates to exactly one ancestry-bearing D.3 request", async () => {
  const calls = [], expected = dataset({ kind: "work_package", projectId: PROJECT, workPackageId: WORK_PACKAGE });
  const { adapter, input } = loadAdapter(async (request) => { calls.push(request); return expected; });
  const result = await adapter.BUILD_INTELLIGENCE_TOOLS[1].handler(input({ projectId: PROJECT, workPackageId: WORK_PACKAGE }));
  assert.deepEqual(plain(calls), [{ scope: "work_package", projectId: PROJECT, workPackageId: WORK_PACKAGE }]);
  assert.equal(result.dataset, expected);
});

test("Activity tool translates to exactly one full-ancestry D.3 request", async () => {
  const calls = [], expected = { ...dataset({ kind: "activity", projectId: PROJECT, workPackageId: WORK_PACKAGE, activityId: ACTIVITY }), activities: { items: [{ id: ACTIVITY }], total: 1, returned: 1, truncated: false, continuationToken: null } };
  const { adapter, input } = loadAdapter(async (request) => { calls.push(request); return expected; });
  const result = await adapter.BUILD_INTELLIGENCE_TOOLS[2].handler(input({ projectId: PROJECT, workPackageId: WORK_PACKAGE, activityId: ACTIVITY }));
  assert.deepEqual(plain(calls), [{ scope: "activity", projectId: PROJECT, workPackageId: WORK_PACKAGE, activityId: ACTIVITY }]);
  assert.equal(result.dataset, expected); assert.equal(result.dataset.activities.items.length, 1);
});

test("History tool translates Project and Work Package periods without timing authority", async () => {
  const calls = [];
  const { adapter, input } = loadAdapter(async (request) => { calls.push(request); return dataset({ kind: request.scope, projectId: request.projectId, ...(request.scope === "work_package" ? { workPackageId: request.workPackageId } : {}) }); });
  const tool = adapter.BUILD_INTELLIGENCE_TOOLS[3];
  const period = { from: "2026-01-01", through: "2026-12-31", timezone: "UTC", cadence: "weekly" };
  await tool.handler(input({ projectId: PROJECT, ...period }));
  await tool.handler(input({ projectId: PROJECT, workPackageId: WORK_PACKAGE, ...period }));
  assert.deepEqual(plain(calls), [
    { scope: "project", projectId: PROJECT, history: period },
    { scope: "work_package", projectId: PROJECT, workPackageId: WORK_PACKAGE, history: period },
  ]);
  assert.ok(calls.every((call) => !("asOf" in call) && !("generatedAt" in call)));
});

test("invalid identifiers and missing required fields fail before D.3", async () => {
  let calls = 0;
  const { adapter, input } = loadAdapter(async () => { calls += 1; return dataset({ kind: "project", projectId: PROJECT }); });
  const cases = [
    [0, {}], [0, { projectId: "not-a-uuid" }],
    [1, { projectId: PROJECT, workPackageId: "bad" }],
    [2, { projectId: PROJECT, workPackageId: WORK_PACKAGE, activityId: "bad" }],
  ];
  for (const [index, value] of cases) {
    const result = await adapter.BUILD_INTELLIGENCE_TOOLS[index].handler(input(value));
    assert.deepEqual(result.error.code, "invalid_arguments");
  }
  assert.equal(calls, 0);
});

test("all unknown and authority-like fields fail closed before D.3", async () => {
  let calls = 0;
  const { adapter, input } = loadAdapter(async () => { calls += 1; return dataset({ kind: "project", projectId: PROJECT }); });
  for (const field of ["unexpected", "clientId", "tenantId", "workspaceId", "permissions", "authContext", "serviceRoleKey", "asOf", "generatedAt", "dataset", "query", "filter", "provider", "model"]) {
    const result = await adapter.BUILD_INTELLIGENCE_TOOLS[0].handler(input({ projectId: PROJECT, [field]: "untrusted" }));
    assert.equal(result.error.code, "invalid_arguments", field);
  }
  assert.equal(calls, 0);
});

test("prototype-like and symbol-bearing objects fail before D.3", async () => {
  let calls = 0;
  const { adapter, customInput } = loadAdapter(async () => { calls += 1; return dataset({ kind: "project", projectId: PROJECT }); });
  const inherited = customInput(`Object.assign(Object.create({clientId:"x"}), {projectId:"${PROJECT}"})`);
  const nullPrototype = customInput(`Object.assign(Object.create(null), {projectId:"${PROJECT}"})`);
  const symbolBearing = customInput(`Object.assign({projectId:"${PROJECT}"}, {[Symbol("query")]:"x"})`);
  for (const value of [inherited, nullPrototype, symbolBearing]) {
    const result = await adapter.BUILD_INTELLIGENCE_TOOLS[0].handler(value);
    assert.equal(result.error.code, "invalid_arguments");
  }
  assert.equal(calls, 0);
});

test("history requires strict valid Gregorian dates in chronological order", async () => {
  let calls = 0;
  const { adapter, input } = loadAdapter(async () => { calls += 1; return dataset({ kind: "project", projectId: PROJECT }); });
  const invalid = [
    { from: "2026-1-01", through: "2026-01-02", timezone: "UTC", cadence: "daily" },
    { from: "2026-02-30", through: "2026-03-01", timezone: "UTC", cadence: "daily" },
    { from: "2026-03-02", through: "2026-03-01", timezone: "UTC", cadence: "daily" },
  ];
  for (const period of invalid) {
    const result = await adapter.BUILD_INTELLIGENCE_TOOLS[3].handler(input({ projectId: PROJECT, ...period }));
    assert.equal(result.error.code, "invalid_arguments");
  }
  assert.equal(calls, 0);
});

test("history permits 366 inclusive calendar days and rejects 367 without truncation", async () => {
  const calls = [];
  const { adapter, input } = loadAdapter(async (request) => { calls.push(request); return dataset({ kind: "project", projectId: PROJECT }); });
  const tool = adapter.BUILD_INTELLIGENCE_TOOLS[3];
  const accepted = await tool.handler(input({ projectId: PROJECT, from: "2024-01-01", through: "2024-12-31", timezone: "UTC", cadence: "daily" }));
  const rejected = await tool.handler(input({ projectId: PROJECT, from: "2024-01-01", through: "2025-01-01", timezone: "UTC", cadence: "daily" }));
  assert.equal(accepted.ok, true); assert.equal(rejected.error.code, "invalid_arguments"); assert.equal(calls.length, 1);
});

test("history rejects non-UTC unsupported cadence and Activity-history shapes", async () => {
  let calls = 0;
  const { adapter, input } = loadAdapter(async () => { calls += 1; return dataset({ kind: "project", projectId: PROJECT }); });
  const tool = adapter.BUILD_INTELLIGENCE_TOOLS[3];
  for (const extra of [{ timezone: "Africa/Lagos", cadence: "daily" }, { timezone: "UTC", cadence: "monthly" }, { timezone: "UTC", cadence: "daily", activityId: ACTIVITY }]) {
    const result = await tool.handler(input({ projectId: PROJECT, from: "2026-01-01", through: "2026-01-02", ...extra }));
    assert.equal(result.error.code, "invalid_arguments");
  }
  assert.equal(calls, 0);
});

test("success wrapping preserves dataset identity provenance coverage constraints and collection metadata", async () => {
  const expected = dataset({ kind: "project", projectId: PROJECT });
  const { adapter, input } = loadAdapter(async () => expected);
  const result = await adapter.BUILD_INTELLIGENCE_TOOLS[0].handler(input({ projectId: PROJECT }));
  assert.equal(result.dataset, expected);
  assert.equal(result.dataset.coverage, expected.coverage);
  assert.equal(result.dataset.provenance, expected.provenance);
  assert.equal(result.dataset.constraints, expected.constraints);
  assert.equal(result.dataset.workPackages, expected.workPackages);
  assert.ok(!("activities" in result.dataset));
});

test("recognized D.3 errors retain stable safe codes and messages", async () => {
  const codes = ["unauthenticated", "permission_denied", "project_not_found", "work_package_not_found", "activity_not_found", "scope_mismatch", "invalid_period", "unsupported_cadence", "ambiguous_work_plan", "dataset_validation_failed"];
  for (const code of codes) {
    const { adapter, input } = loadAdapter(async () => { throw new ServiceError(code, `Safe ${code}`); });
    const result = await adapter.BUILD_INTELLIGENCE_TOOLS[0].handler(input({ projectId: PROJECT }));
    assert.deepEqual({ code: result.error.code, message: result.error.message }, { code, message: `Safe ${code}` });
  }
});

test("unexpected internal errors are generic and do not leak details", async () => {
  const { adapter, input } = loadAdapter(async () => { throw new Error("relation secret_table missing; token=secret"); });
  const result = await adapter.BUILD_INTELLIGENCE_TOOLS[0].handler(input({ projectId: PROJECT }));
  assert.deepEqual(plain(result.error), { code: "dataset_validation_failed", message: "Build intelligence is unavailable." });
  assert.doesNotMatch(JSON.stringify(result), /secret_table|token=secret/);
});

test("D.4 adds no logging persistence interpretation pagination or mutable payload policy", () => {
  assert.doesNotMatch(source, /console\.|logger|insert\(|update\(|upsert\(|migration|snapshot|natural.language|interpret|summary text/i);
  assert.doesNotMatch(source, /continuationToken|pagination|detailLevel|projection|fields:/);
  assert.doesNotMatch(source, /Retail|campaign|submission|installation-images|user_profiles|email|phone/);
});

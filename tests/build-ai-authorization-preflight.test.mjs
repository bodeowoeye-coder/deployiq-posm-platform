import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const preflightSource = read("./support/build-ai-authorization-preflight.ts");
const projectServiceSource = read("../lib/build/projects/service.ts");

function compilePreflight(resolveCanonicalBuildProject) {
  const javascript = ts.transpileModule(preflightSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = vm.createContext({
    exports: {},
    module: { exports: {} },
    require(name) {
      if (name === "server-only") return {};
      if (name === "../../lib/build/projects/service.ts") return { resolveCanonicalBuildProject };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  context.exports = context.module.exports;
  new vm.Script(javascript).runInContext(context);
  return context.module.exports;
}

test("authorized synthetic client passes through the canonical production resolver", async () => {
  const calls = [];
  const { verifyBuildAIAcceptanceAuthorization } = compilePreflight(async (input) => {
    calls.push(input);
    return { project: { id: input.projectId } };
  });

  const result = await verifyBuildAIAcceptanceAuthorization("synthetic-build-project");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].projectId, "synthetic-build-project");
  assert.equal(calls[0].requiredPermission, "projects:read");
  assert.deepEqual({ ...result }, {
    authenticated: true,
    applicationRoleResolved: true,
    projectsRead: true,
    canonicalProjectResolved: true,
    projectEligible: true,
    clientAuthorityMatched: true,
    allowedProjectAuthorityMatched: true,
  });
});

for (const [name, message] of [
  ["unauthenticated user", "Authentication is required."],
  ["invalid or missing application role", "A valid application role is required."],
  ["missing projects:read", "You do not have permission to access Build projects."],
  ["wrong project/client authority", "You do not have access to this project client."],
  ["project outside the server-derived allowed-project list", "You do not have access to this project."],
  ["archived or ineligible Build project", "Build is not available for this project type."],
]) {
  test(`canonical resolver rejection propagates for ${name}`, async () => {
    const canonicalError = new Error(message);
    const { verifyBuildAIAcceptanceAuthorization } = compilePreflight(async () => {
      throw canonicalError;
    });

    await assert.rejects(
      verifyBuildAIAcceptanceAuthorization("synthetic-build-project"),
      (error) => error === canonicalError,
    );
  });
}

test("preflight does not create a workspace membership authority gate", () => {
  assert.doesNotMatch(preflightSource, /workspace_memberships/);
  assert.doesNotMatch(preflightSource, /role_key|\.role\b/);
  assert.match(preflightSource, /resolveCanonicalBuildProject/);
  assert.match(preflightSource, /requiredPermission: "projects:read"/);
});

test("canonical resolver retains the complete production authority chain", () => {
  assert.match(projectServiceSource, /resolveBuildProjectAccessRegistry/);
  assert.match(projectServiceSource, /permissions\.includes\(params\.requiredPermission\)/);
  assert.match(projectServiceSource, /canonicalizeBuildProject/);
  assert.match(projectServiceSource, /assessBuildProjectAuthority/);
  assert.match(projectServiceSource, /clientId: registry\.client_id/);
  assert.match(projectServiceSource, /allowedProjectIds: registry\.allowed_projects/);
});

test("obsolete workspace_memberships.role query cannot recur in acceptance support", () => {
  assert.doesNotMatch(preflightSource, /workspace_memberships[\s\S]*\brole\b/);
  assert.doesNotMatch(preflightSource, /\.select\(["'`]([^"'`]*,)?role(,[^"'`]*)?["'`]\)/);
});

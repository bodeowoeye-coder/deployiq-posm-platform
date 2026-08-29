import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolveWorkspaceComposition } from "../lib/workspace/composition.ts";

const resolverSource = readFileSync(new URL("../lib/workspace/customerAdmin.ts", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../app/workspace/admin/page.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");
const serverResolverSource = readFileSync(new URL("../lib/workspace/compositionServer.ts", import.meta.url), "utf8");

function classify(input) {
  return resolveWorkspaceComposition(input);
}

test("composition: Retail authority remains Retail", () => {
  assert.deepEqual(classify({ settingsProductKey: "retail", entitlementProductKeys: ["retail"], projects: [{ project_type: "Retail Deployment", archived_at: null }] }).kind, "retail");
});

test("composition: exact Build project allowlist resolves Build without Retail records", () => {
  for (const projectType of ["Construction", "Real Estate", "Facility Management"]) {
    const result = classify({ projects: [{ project_type: projectType, archived_at: null }] });
    assert.equal(result.kind, "build");
    assert.equal(result.issue, "none");
  }
});

test("composition: Retail is never admitted by the Build resolver", () => {
  const result = classify({ projects: [{ project_type: "Retail Deployment", archived_at: null }] });
  assert.equal(result.kind, "retail");
  assert.equal(result.buildProjectCount, 0);
});

test("composition: mixed Retail and Build projects resolve mixed", () => {
  assert.equal(classify({ projects: [{ project_type: "Retail Deployment" }, { project_type: "Construction" }] }).kind, "mixed");
});

test("composition: unknown, null and malformed project types fail closed", () => {
  for (const projectType of [null, "", "construction", " Construction ", "Unknown Product"]) {
    const result = classify({ projects: [{ project_type: projectType }] });
    assert.equal(result.kind, "shared");
    assert.equal(result.issue, "unknown_project_type");
  }
});

test("composition: archived Build projects do not grant Build composition", () => {
  const result = classify({ projects: [{ project_type: "Construction", archived_at: "2026-08-29T00:00:00Z" }] });
  assert.equal(result.kind, "shared");
  assert.equal(result.buildProjectCount, 0);
  assert.equal(result.archivedProjectCount, 1);
});

test("composition: conflicting commercial authority fails closed", () => {
  const result = classify({ settingsProductKey: "retail", entitlementProductKeys: ["build"], projects: [] });
  assert.equal(result.kind, "shared");
  assert.equal(result.issue, "product_authority_conflict");
});

test("composition: malformed or unsupported product authority fails closed", () => {
  for (const settingsProductKey of [" retail ", "unknown", 42]) {
    const result = classify({ settingsProductKey, projects: [] });
    assert.equal(result.kind, "shared");
    assert.equal(result.issue, "unsupported_product_key");
  }
});

test("composition: product and project disagreement fails closed", () => {
  const result = classify({ settingsProductKey: "retail", entitlementProductKeys: ["retail"], projects: [{ project_type: "Construction" }] });
  assert.equal(result.kind, "shared");
  assert.equal(result.issue, "product_project_conflict");
});

test("workspace universal authority remains tenant-scoped and fail closed", () => {
  assert.match(serverResolverSource, /import "server-only"/);
  assert.match(resolverSource, /\.eq\("client_id", clientId\)[\s\S]*\.eq\("user_id", authContext\.user\.id\)[\s\S]*\.eq\("status", "active"\)/);
  assert.match(resolverSource, /if \(role !== "customer_admin"\)/);
  assert.match(resolverSource, /select\("id,name,status"\)\.eq\("id", clientId\)/);
  assert.match(resolverSource, /status\)\.toLowerCase\(\) !== "active"/);
  assert.match(resolverSource, /from\("projects"\)[\s\S]*\.eq\("client_id", clientId\)/);
});

test("Retail composition rows are optional but Retail activation remains enforced", () => {
  assert.match(resolverSource, /workspaceLookup<Record<string, unknown>>[\s\S]*"Workspace composition lookup"/);
  assert.match(resolverSource, /workspaceLookup<Array<Record<string, unknown>>>[\s\S]*"Product composition lookup"/);
  assert.doesNotMatch(resolverSource, /NO OPTIONAL WORKSPACE SETTINGS", required: true/);
  assert.doesNotMatch(resolverSource, /NO OPTIONAL ACTIVE ENTITLEMENTS", required: true/);
  assert.match(resolverSource, /composition\.kind === "retail" && activationStatus !== "Active"/);
});

test("shared home does not invoke Retail module loaders", () => {
  assert.match(pageSource, /if \(workspace\.composition\.kind !== "retail"\)[\s\S]*return <SharedWorkspaceHome/);
  assert.match(pageSource, /DeployIQ Workspace/);
  assert.match(pageSource, /project\.project_name/);
  assert.match(pageSource, /project\.project_type/);
  assert.match(pageSource, /project\.status/);
});

test("shared shell consumes resolver-authoritative navigation", () => {
  assert.match(shellSource, /workspace\.navigation\.map/);
  assert.match(shellSource, /workspace\.accountNavigation\.map/);
});

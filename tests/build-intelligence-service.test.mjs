import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync(new URL("../lib/build/intelligence/service.ts", import.meta.url), "utf8");
const management = readFileSync(new URL("../lib/build/management/service.ts", import.meta.url), "utf8");
const dataset = readFileSync(new URL("../lib/build/intelligence/dataset.ts", import.meta.url), "utf8");

function functionBody(name) {
  const start = service.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = service.indexOf("\nfunction ", start + 10);
  const nextExport = service.indexOf("\nexport ", start + 10);
  const boundaries = [next, nextExport].filter((value) => value > start);
  return service.slice(start, boundaries.length ? Math.min(...boundaries) : undefined);
}

test("D.3 is a server-only service with one public authenticated entry point", () => {
  assert.match(service, /^import "server-only";/);
  assert.equal((service.match(/export async function getAuthenticatedBuildIntelligence\(/g) ?? []).length, 1);
  assert.doesNotMatch(service, /NextResponse|export async function (GET|POST|PATCH)|route\.ts/);
});

test("public requests are discriminated and contain no caller authority or trusted timing", () => {
  const contract = service.slice(service.indexOf("export type AuthenticatedBuildIntelligenceRequest"), service.indexOf("export type BuildIntelligenceServiceErrorCode"));
  for (const scope of ["project", "work_package", "activity"]) assert.match(contract, new RegExp(`scope: "${scope}"`));
  for (const forbidden of ["clientId", "workspaceId", "tenantId", "role", "permissions", "allowedProjectIds", "authContext", "asOf", "generatedAt", "serviceRole"]) {
    assert.doesNotMatch(contract, new RegExp(`\\b${forbidden}\\b`));
  }
});

test("Project authority is resolved first through the canonical projects:read boundary", () => {
  const body = functionBody("getAuthenticatedBuildIntelligenceInternal");
  const authority = body.indexOf("deps.resolveProject");
  const managementRead = body.indexOf("deps.loadManagement");
  const overviewRead = body.indexOf("deps.loadOverview");
  assert.ok(authority >= 0 && managementRead > authority && overviewRead > authority);
  assert.match(body, /requiredPermission: "projects:read"/);
});

test("D.3 reuses accepted management and C.2 C.3 C.4 D.2 composers", () => {
  for (const dependency of [
    "getBuildManagementSummary", "getBuildExecutionHistory", "composeBuildManagementReport",
    "composeBuildWorkPackageReport", "composeBuildExecutionHistoryReport",
    "composeBuildProjectIntelligenceV1", "composeBuildWorkPackageIntelligenceV1",
    "composeBuildActivityIntelligenceV1", "attachBuildExecutionHistoryV1",
  ]) assert.match(service, new RegExp(`\\b${dependency}\\b`));
});

test("Work Package scope resolves only inside the authorized Project overview", () => {
  const body = functionBody("workPackageContext");
  assert.match(body, /overview\.workPackages\.filter/);
  assert.match(body, /overview\.sites\.filter/);
  assert.match(body, /work_package_not_found/);
  assert.match(body, /scope_mismatch/);
});

test("Activity scope requires exact Project client Site and Work Package ancestry", () => {
  const body = functionBody("getAuthenticatedBuildIntelligenceInternal");
  for (const check of ["activity.projectId !== project.id", "activity.clientId !== project.client_id", "activity.workPackageId !== context.workPackage.id", "activity.siteId !== context.site.id"]) {
    assert.ok(body.includes(check), `missing ancestry check: ${check}`);
  }
  assert.match(body, /activity_not_found/);
  assert.match(body, /composeBuildActivityIntelligenceV1/);
});

test("Activity history is rejected by the public type rather than synthesized", () => {
  assert.match(service, /scope: "activity"[\s\S]*history\?: never/);
  assert.doesNotMatch(service, /activity_history|composeBuildActivityHistory/);
});

test("history retains strict UTC daily or weekly accepted parsing and half-open composition", () => {
  const body = functionBody("historyPeriod");
  assert.match(body, /daily/);
  assert.match(body, /weekly/);
  assert.match(body, /history\.timezone !== "UTC"/);
  assert.match(body, /parseExecutionHistoryQuery\(history\)/);
  assert.match(body, /parsed\.state !== "ready"/);
  assert.match(service, /new Date\(period\.periodStart\)/);
  assert.match(service, /new Date\(period\.periodEnd\)/);
});

test("request timing is centralized and caller timing cannot override it", () => {
  const body = functionBody("getAuthenticatedBuildIntelligenceInternal");
  assert.equal((body.match(/const asOf = validInstant\(deps\.clock\(\)/g) ?? []).length, 1);
  assert.equal((body.match(/const generatedAt = validInstant\(deps\.clock\(\)/g) ?? []).length, 2);
  assert.match(body, /loadManagement\(project\.id, asOf\)/);
  assert.match(body, /generatedAt < asOf/);
  assert.doesNotMatch(body, /request\.(asOf|generatedAt)/);
});

test("service maps authority and dataset failures to stable safe errors", () => {
  const body = functionBody("serviceError");
  for (const code of ["unauthenticated", "permission_denied", "project_not_found", "scope_mismatch", "dataset_validation_failed"]) {
    assert.match(body, new RegExp(`"${code}"`));
  }
  assert.doesNotMatch(body, /error\.message|stack|details|hint/);
  assert.match(service, /"invalid_as_of"/);
  assert.match(service, /"ambiguous_work_plan"/);
});

test("accepted dependency edges are reused without a new intelligence query", () => {
  assert.match(management, /dependencyEdges: DependencyEdgeIntelligence\[\]/);
  assert.match(management, /dependencyFacts: dependencyRollup\.project, dependencyEdges/);
  assert.match(service, /dependencies: management\.dependencyEdges/g);
  assert.doesNotMatch(service, /createAdminSupabase|\.from\(|\.select\(/);
});

test("D.3 adds no analytics reconstruction raw query renderer provider prompt or persistence", () => {
  for (const forbidden of [
    /deriveSchedule|deriveProgress|deriveQuality|deriveDependency|deriveManagementAttention/,
    /createAdminSupabase|\.from\(|\.select\(|\.insert\(|\.update\(|\.upsert\(/,
    /reporting\/pdf|renderBuildReportPdf|NextResponse/,
    /openai|anthropic|gemini|ai-sdk|prompt|embedding|vector|rag/i,
    /redis|snapshot|migration|webhook|notification/i,
  ]) assert.doesNotMatch(service, forbidden);
});

test("personal-data minimization remains owned by D.2 with no D.3 enrichment", () => {
  assert.doesNotMatch(service, /user_profiles|email|phone|profile|cookie|token|displayName/);
  assert.match(dataset, /attention\.preview\.slice\(0,6\)/);
  assert.match(dataset, /exceptions\.preview\.slice\(0,5\)/);
});

test("Project summary remains bounded and Activity detail remains singular", () => {
  assert.match(dataset, /composeBuildProjectIntelligenceV1/);
  assert.match(dataset, /composeBuildActivityIntelligenceV1/);
  assert.match(dataset, /activities:\[activity\]/);
  const projectComposer = dataset.slice(dataset.indexOf("export function composeBuildProjectIntelligenceV1"), dataset.indexOf("export function composeBuildWorkPackageIntelligenceV1"));
  assert.doesNotMatch(projectComposer, /activities:/);
});

test("no Retail or browser authority is introduced by the service boundary", () => {
  assert.doesNotMatch(service, /Retail|installation-images|campaign|submission|window\.|localStorage|sessionStorage/);
});

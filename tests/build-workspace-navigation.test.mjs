import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assessBuildProjectAuthority,
  canonicalizeBuildProject,
  isBuildProjectType,
} from "../lib/build/projects/types.ts";

const workspaceFoundation = readFileSync(new URL("../lib/workspace/customerAdminFoundation.ts", import.meta.url), "utf8");
const workspaceShell = readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");
const workspaceHome = readFileSync(new URL("../app/workspace/admin/page.tsx", import.meta.url), "utf8");
const projectList = readFileSync(new URL("../app/workspace/admin/projects/page.tsx", import.meta.url), "utf8");
const projectEntry = readFileSync(new URL("../app/workspace/admin/projects/[id]/page.tsx", import.meta.url), "utf8");
const projectSection = readFileSync(new URL("../app/workspace/admin/projects/[id]/[section]/page.tsx", import.meta.url), "utf8");
const projectShell = readFileSync(new URL("../components/workspace/BuildProjectShell.tsx", import.meta.url), "utf8");
const projectOverview = readFileSync(new URL("../lib/build/projects/workspaceOverview.ts", import.meta.url), "utf8");

function project(overrides = {}) {
  return {
    id: "build-project",
    client_id: "client-authoritative",
    project_name: "Synthetic Build Project",
    project_type: "Construction",
    archived_at: null,
    ...overrides,
  };
}

test("S3A-3 exposes Projects and preserves shared User Management", () => {
  assert.match(workspaceFoundation, /label: "Projects", href: "\/workspace\/admin\/projects"/);
  assert.match(workspaceFoundation, /label: "User Management", href: "\/workspace\/admin\/team"/);
});

test("S3A-3 workspace identity is composition-aware", () => {
  assert.match(workspaceShell, /kind === "build"/);
  assert.match(workspaceShell, /DeployIQ Build Workspace/);
  assert.match(workspaceShell, /kind === "retail"/);
  assert.match(workspaceShell, /DeployIQ Admin Workspace/);
  assert.match(workspaceShell, /DeployIQ Customer Workspace/);
});

test("S3A-3 home and project list enter through the canonical workspace route", () => {
  for (const source of [workspaceHome, projectList]) {
    assert.match(source, /`\/workspace\/admin\/projects\/\$\{project\.id\}`/);
    assert.doesNotMatch(source, /["'`]\/client(?:\/|["'`])/);
  }
  assert.match(projectList, /isBuildProjectType\(project\.project_type\)/);
  assert.match(projectList, /project\.project_type === "Retail Deployment"/);
});

test("S3A-3 Build project shell exposes the canonical project navigation only", () => {
  for (const label of ["Overview", "Sites", "Work Packages", "Activities", "Resources", "Documents", "Reports", "Analytics", "Settings"]) {
    assert.match(projectShell, new RegExp(`label: "${label}"`));
  }
  assert.match(projectShell, /`\/workspace\/admin\/projects\/\$\{project\.id\}`/);
  assert.match(projectShell, /project\.project_name/);
  assert.match(projectShell, /project\.project_type/);
  assert.match(projectShell, /project\.status/);
  assert.match(projectShell, /project\.project_code/);
  assert.match(projectShell, /project\.client_project_reference/);
  assert.doesNotMatch(projectShell, /\/admin\/build\/template-authoring|\/client/);
});

test("S3A-3 canonical project entry remains tenant scoped and project-type explicit", () => {
  assert.match(projectEntry, /resolveCustomerWorkspaceContext\(\)/);
  assert.match(projectEntry, /getCustomerWorkspaceProjectScope\(workspace, params\.id\)/);
  assert.match(projectEntry, /if \(!canonicalProject\) notFound\(\)/);
  assert.match(projectEntry, /isBuildProjectType\(canonicalProject\.project_type\)/);
  assert.match(projectEntry, /canonicalProject\.project_type !== "Retail Deployment"/);
});

test("S3A-3 overview reuses canonical Build authority and scopes every project-owned read", () => {
  assert.match(projectOverview, /resolveCanonicalBuildProject\(\{[\s\S]*requiredPermission: "projects:read"/);
  assert.match(projectOverview, /from\("build_sites"\)[\s\S]*\.eq\("client_id", project\.client_id\)[\s\S]*\.eq\("project_id", project\.id\)/);
  assert.match(projectOverview, /from\("build_work_packages"\)[\s\S]*\.eq\("client_id", project\.client_id\)[\s\S]*\.eq\("project_id", project\.id\)[\s\S]*\.in\("site_id", siteIds\)/);
  assert.doesNotMatch(projectOverview, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test("S3A-3 allows only exact active Build project types", () => {
  for (const type of ["Construction", "Real Estate", "Facility Management"]) {
    assert.equal(isBuildProjectType(type), true);
    assert.equal(canonicalizeBuildProject(project({ project_type: type })).ok, true);
  }
  for (const type of ["Retail Deployment", null, "", "Construction ", "construction", "Unknown"]) {
    assert.equal(isBuildProjectType(type), false);
    assert.equal(canonicalizeBuildProject(project({ project_type: type })).ok, false);
  }
  assert.deepEqual(canonicalizeBuildProject(project({ archived_at: "2026-08-29T00:00:00Z" })), {
    ok: false,
    code: "project_archived",
  });
});

test("S3A-3 Build authority remains membership and tenant constrained", () => {
  const canonical = canonicalizeBuildProject(project());
  assert.equal(canonical.ok, true);
  if (!canonical.ok) return;
  assert.deepEqual(assessBuildProjectAuthority(canonical.project, {
    isAdmin: false,
    role: "client",
    clientId: "other-client",
    allowedProjectIds: [canonical.project.id],
  }), { ok: false, code: "tenant_mismatch" });
  assert.deepEqual(assessBuildProjectAuthority(canonical.project, {
    isAdmin: false,
    role: "client",
    clientId: canonical.project.client_id,
    allowedProjectIds: [],
  }), { ok: false, code: "project_not_allowed" });
});

test("S3A-3 route contract delegates Sites and Work Packages while unfinished modules remain explicit", () => {
  assert.match(projectSection, /getBuildProjectWorkspaceOverview\(params\.id\)/);
  assert.match(projectSection, /BuildProjectManagement mode="sites"/);
  assert.match(projectSection, /BuildProjectManagement mode="work-packages"/);
  assert.match(projectSection, /Controlled foundation state/);
  assert.match(projectSection, /later Build phase/);
  assert.doesNotMatch(projectSection, /\/admin\/build\/template-authoring/);
});

test("S3A-3 does not introduce legacy client portal entry", () => {
  const combined = [workspaceFoundation, workspaceShell, workspaceHome, projectList, projectEntry, projectSection, projectShell, projectOverview].join("\n");
  assert.doesNotMatch(combined, /["'`]\/client(?:\/|["'`])/);
});

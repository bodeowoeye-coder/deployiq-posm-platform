import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assessBuildProjectAuthority,
  canonicalizeBuildProject,
  isBuildProjectType
} from "../lib/build/projects/types.ts";

const resolver = readFileSync(new URL("../lib/build/projects/service.ts", import.meta.url), "utf8");
const sites = readFileSync(new URL("../lib/build/sites/service.ts", import.meta.url), "utf8");
const workPackages = readFileSync(new URL("../lib/build/workPackages/service.ts", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../components/ProjectDashboardShell.tsx", import.meta.url), "utf8");
const adminProjectPage = readFileSync(new URL("../app/admin/projects/[projectId]/page.tsx", import.meta.url), "utf8");
const clientProjectPage = readFileSync(new URL("../app/client/projects/[projectId]/page.tsx", import.meta.url), "utf8");

function project(overrides = {}) {
  return {
    id: "project-build-1",
    client_id: "client-authoritative",
    project_name: "Synthetic Construction Project",
    project_code: "BUILD-001",
    client_project_reference: null,
    project_type: "Construction",
    status: "Planning",
    start_date: null,
    end_date: null,
    planned_completion: null,
    actual_completion: null,
    primary_target_region: null,
    primary_target_state: null,
    project_regions: [],
    regions_covered: [],
    agency_id: null,
    lead_installer_id: null,
    archived_at: null,
    ...overrides
  };
}

for (const projectType of ["Construction", "Real Estate", "Facility Management"]) {
  test(`BH-1A accepts canonical Build project type: ${projectType}`, () => {
    assert.equal(isBuildProjectType(projectType), true);
    const result = canonicalizeBuildProject(project({ project_type: projectType }));
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.project.project_type, projectType);
  });
}

for (const projectType of ["Retail Deployment", null, "", "Unknown", "construction", " Construction "]) {
  test(`BH-1A rejects non-canonical Build project type: ${String(projectType)}`, () => {
    assert.equal(isBuildProjectType(projectType), false);
    assert.deepEqual(canonicalizeBuildProject(project({ project_type: projectType })), {
      ok: false,
      code: "project_type_not_build_compatible"
    });
  });
}

test("BH-1A rejects archived Build projects", () => {
  assert.deepEqual(canonicalizeBuildProject(project({ archived_at: "2026-08-28T00:00:00Z" })), {
    ok: false,
    code: "project_archived"
  });
});

test("BH-1A rejects authoritative tenant mismatch and unassigned projects", () => {
  const result = canonicalizeBuildProject(project());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(assessBuildProjectAuthority(result.project, {
    isAdmin: false,
    role: "client",
    clientId: "different-client",
    allowedProjectIds: [result.project.id]
  }), { ok: false, code: "tenant_mismatch" });
  assert.deepEqual(assessBuildProjectAuthority(result.project, {
    isAdmin: false,
    role: "client",
    clientId: result.project.client_id,
    allowedProjectIds: []
  }), { ok: false, code: "project_not_allowed" });
});

test("BH-1A browser-supplied client id cannot override project authority", () => {
  const result = canonicalizeBuildProject(project());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(assessBuildProjectAuthority(result.project, {
    isAdmin: true,
    role: "admin",
    clientId: null,
    allowedProjectIds: [],
    requestedClientId: "different-client"
  }), { ok: false, code: "requested_client_mismatch" });
});

test("BH-1A resolver selects canonical project fields and never legacy names", () => {
  for (const field of ["project_name", "project_type", "client_id", "project_code", "archived_at"]) {
    assert.match(resolver, new RegExp(`\\b${field}\\b`));
  }
  assert.doesNotMatch(resolver, /project_name:name|projects\.name|projects\.campaign|projects\.brand/);
  assert.doesNotMatch(sites, /project_name:name|project_type:\s*null|function getBuildProject/);
  assert.doesNotMatch(workPackages, /project_name:name|project_type:\s*null|function getBuildProject/);
});

test("BH-1A site and work-package UUIDs remain constrained by their full hierarchy", () => {
  assert.match(sites, /validateProjectSiteOwnership\(\{[\s\S]*projectId: project\.id,[\s\S]*siteId,[\s\S]*clientId: project\.client_id/);
  assert.match(workPackages, /validateProjectSiteOwnership\(\{[\s\S]*projectId: project\.id,[\s\S]*siteId,[\s\S]*clientId: project\.client_id/);
  assert.match(workPackages, /validateWorkPackageOwnership\(\{[\s\S]*projectId: project\.id,[\s\S]*siteId: site\.id,[\s\S]*workPackageId,[\s\S]*clientId: project\.client_id/);
});

test("BH-1A dashboard and both project routes use the explicit shared Build allowlist", () => {
  assert.match(dashboard, /isBuildProjectType\(project\.project_type\)/);
  assert.match(dashboard, /buildProject \? "DeployIQ Build Foundation" : "Project Dashboard"/);
  assert.match(adminProjectPage, /isBuildProjectType\(normalized\.project_type\)/);
  assert.match(clientProjectPage, /isBuildProjectType\(normalized\.project_type\)/);
  for (const source of [dashboard, adminProjectPage, clientProjectPage]) {
    assert.doesNotMatch(source, /toLowerCase\(\)\s*!==\s*["']retail deployment|project_type\s*\|\|\s*["']Retail Deployment/);
  }
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assessWorkspaceAccess } from "../lib/workspace/workspaceAccessPolicy.ts";

const USER = "user-1";
const CLIENT = "client-1";
const projects = [
  { id: "build-1", clientId: CLIENT, projectType: "Construction" },
  { id: "build-2", clientId: CLIENT, projectType: "Real Estate" },
  { id: "retail-1", clientId: CLIENT, projectType: "Retail Deployment" },
  { id: "archived", clientId: CLIENT, projectType: "Construction", archivedAt: "2026-10-01" },
  { id: "foreign", clientId: "client-2", projectType: "Construction" },
];

function input(roleKey, overrides = {}) {
  const appRole = roleKey === "installer" ? "installer" : "client";
  return {
    userId: USER,
    appRole,
    authenticatedClientId: CLIENT,
    profileStatus: "Active",
    clientStatus: "Active",
    membership: { userId: USER, clientId: CLIENT, roleKey, status: "active" },
    role: { roleKey, appRole, status: "active", permissions: ["projects.view"] },
    projects,
    explicitlyAssignedProjectIds: [],
    installerAssignedProjectIds: [],
    activityAssignments: [],
    ...overrides,
  };
}

function allowed(decision) {
  assert.equal(decision.allowed, true);
  return decision;
}

for (const roleKey of ["customer_admin", "workspace_owner", "workspace_manager"]) {
  test(`${roleKey} receives all active tenant projects`, () => {
    const decision = allowed(assessWorkspaceAccess(input(roleKey)));
    assert.deepEqual(decision.authorizedProjectIds, ["build-1", "build-2", "retail-1"]);
    assert.equal(decision.visibility, "tenant_wide_administration");
    assert.equal(decision.readOnly, false);
  });
}

test("project manager visibility is limited to explicit valid assignments", () => {
  const decision = allowed(assessWorkspaceAccess(input("project_manager", {
    explicitlyAssignedProjectIds: ["build-2", "foreign", "archived", "missing"],
  })));
  assert.deepEqual(decision.authorizedProjectIds, ["build-2"]);
});

test("canonical supervisor visibility is derived only from supervised work", () => {
  const decision = allowed(assessWorkspaceAccess(input("supervisor", {
    explicitlyAssignedProjectIds: ["build-2"],
    activityAssignments: [
      { projectId: "build-1", supervisorUserId: USER },
      { projectId: "build-2", ownerUserId: USER },
      { projectId: "foreign", supervisorUserId: USER },
      { projectId: "retail-1", supervisorUserId: "someone-else" },
    ],
  })));
  assert.deepEqual(decision.authorizedProjectIds, ["build-1"]);
  assert.equal(decision.visibility, "supervised_work");
});

for (const roleKey of ["agency_manager", "field_coordinator"]) {
  test(`${roleKey} sees explicitly assigned projects and owned work only`, () => {
    const decision = allowed(assessWorkspaceAccess(input(roleKey, {
      explicitlyAssignedProjectIds: ["build-2"],
      activityAssignments: [
        { projectId: "build-1", ownerUserId: USER },
        { projectId: "retail-1", ownerUserId: "someone-else" },
      ],
    })));
    assert.deepEqual(decision.authorizedProjectIds, ["build-1", "build-2"]);
  });
}

test("viewer receives explicit read-only grants and no broad tenant visibility", () => {
  const decision = allowed(assessWorkspaceAccess(input("client_viewer", {
    explicitlyAssignedProjectIds: ["build-2"],
  })));
  assert.deepEqual(decision.authorizedProjectIds, ["build-2"]);
  assert.equal(decision.readOnly, true);
});

test("installer preserves Retail assignment isolation and receives no Build visibility", () => {
  const decision = allowed(assessWorkspaceAccess(input("installer", {
    explicitlyAssignedProjectIds: ["build-1"],
    installerAssignedProjectIds: ["retail-1", "build-2"],
    activityAssignments: [{ projectId: "build-1", ownerUserId: USER }],
  })));
  assert.deepEqual(decision.authorizedProjectIds, ["retail-1"]);
  assert.equal(decision.productComposition.kind, "retail");
});

for (const [name, override, reason] of [
  ["inactive profile", { profileStatus: "Suspended" }, "profile_inactive"],
  ["inactive workspace", { clientStatus: "Suspended" }, "workspace_inactive"],
  ["missing membership", { membership: null }, "membership_missing"],
  ["inactive membership", { membership: { userId: USER, clientId: CLIENT, roleKey: "project_manager", status: "inactive" } }, "membership_inactive"],
  ["missing role", { role: null }, "role_missing"],
  ["inactive role", { role: { roleKey: "project_manager", appRole: "client", status: "inactive", permissions: [] } }, "role_inactive"],
  ["mismatched role", { role: { roleKey: "client_viewer", appRole: "client", status: "active", permissions: [] } }, "role_mismatch"],
  ["mismatched app role", { role: { roleKey: "project_manager", appRole: "installer", status: "active", permissions: [] } }, "role_app_mismatch"],
]) {
  test(`${name} is denied explicitly`, () => {
    assert.deepEqual(assessWorkspaceAccess(input("project_manager", override)), { allowed: false, reason });
  });
}

test("foreign, archived, malformed and stale assignments fail closed", () => {
  const decision = allowed(assessWorkspaceAccess(input("project_manager", {
    explicitlyAssignedProjectIds: ["foreign", "archived", "missing", ""],
  })));
  assert.deepEqual(decision.authorizedProjectIds, []);
});

test("mixed Retail and Build composition is computed only from authorized projects", () => {
  const decision = allowed(assessWorkspaceAccess(input("project_manager", {
    explicitlyAssignedProjectIds: ["build-1", "retail-1"],
  })));
  assert.equal(decision.productComposition.kind, "mixed");
  assert.deepEqual(decision.authorizedProjectIds, ["build-1", "retail-1"]);
});

test("workspace_manager ambiguity is documented without historical reclassification", () => {
  const ambiguous = allowed(assessWorkspaceAccess(input("workspace_manager")));
  const canonicalSupervisor = allowed(assessWorkspaceAccess(input("supervisor")));
  assert.equal(ambiguous.supervisorRoleAmbiguous, true);
  assert.equal(canonicalSupervisor.supervisorRoleAmbiguous, false);
  assert.equal(ambiguous.roleKey, "workspace_manager");
  assert.equal(canonicalSupervisor.roleKey, "supervisor");
});

test("visibility contract does not grant Activity execution authority or alter routing", () => {
  const policy = readFileSync(new URL("../lib/workspace/workspaceAccessPolicy.ts", import.meta.url), "utf8");
  const adapter = readFileSync(new URL("../lib/workspace/workspaceAccess.ts", import.meta.url), "utf8");
  const destinations = readFileSync(new URL("../lib/authDestinations.ts", import.meta.url), "utf8");
  assert.doesNotMatch(policy, /applyRuntimeActivityAction|record_build_runtime|router\.|redirect\(/);
  assert.doesNotMatch(adapter, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
  assert.match(destinations, /getOperationalNotificationDestination/);
  assert.doesNotMatch(destinations, /resolveWorkspaceAccess/);
});

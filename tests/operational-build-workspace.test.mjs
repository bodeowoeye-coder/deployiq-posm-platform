import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { operationalBuildEligibility } from "../lib/workspace/operationalBuildAccessPolicy.ts";
import { assessWorkspaceAccess } from "../lib/workspace/workspaceAccessPolicy.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const buildProject = { id: "build-1", clientId: "tenant-1", projectType: "Construction", archivedAt: null };
const retailProject = { id: "retail-1", clientId: "tenant-1", projectType: "Retail Deployment", archivedAt: null };

function decision(roleKey, options = {}) {
  return assessWorkspaceAccess({
    userId: "user-1",
    appRole: options.appRole ?? "client",
    authenticatedClientId: "tenant-1",
    profileStatus: options.profileStatus ?? "active",
    clientStatus: "active",
    membership: { userId: "user-1", clientId: "tenant-1", roleKey, status: options.membershipStatus ?? "active" },
    role: { roleKey, appRole: options.appRole ?? "client", status: "active", permissions: options.permissions ?? ["projects.view"] },
    projects: options.projects ?? [buildProject, retailProject],
    explicitlyAssignedProjectIds: options.explicit ?? ["build-1"],
    installerAssignedProjectIds: options.installer ?? ["retail-1"],
    activityAssignments: options.activities ?? [{ projectId: "build-1", ownerUserId: "user-1", supervisorUserId: "user-1" }],
  });
}

test("Customer Admin and Workspace Owner stay on the existing administration boundary", () => {
  for (const role of ["customer_admin", "workspace_owner"]) {
    assert.deepEqual(operationalBuildEligibility(decision(role)), { eligible: false, code: "customer_admin_workspace" });
  }
  const destinations = source("lib/authDestinations.ts");
  assert.match(destinations, /resolveOperationalBuildDestination/);
  assert.match(source("app/workspace/build/layout.tsx"), /customer_admin_workspace[\s\S]*redirect\("\/workspace\/admin"\)/);
});

test("durable operational roles require project visibility and an authorized Build project", () => {
  for (const role of ["workspace_administrator", "project_manager", "supervisor", "agency_manager", "field_coordinator", "client_viewer"]) {
    assert.equal(operationalBuildEligibility(decision(role)).eligible, true, role);
  }
  assert.deepEqual(operationalBuildEligibility(decision("project_manager", { permissions: [] })), { eligible: false, code: "projects_view_missing" });
  assert.deepEqual(operationalBuildEligibility(decision("project_manager", { explicit: ["retail-1"] })), { eligible: false, code: "no_authorized_build_projects" });
});

test("historical workspace_manager ambiguity fails closed at workspace and Build service boundaries", () => {
  assert.deepEqual(operationalBuildEligibility(decision("workspace_manager")), { eligible: false, code: "historical_role_ambiguous" });
  const adapter = source("lib/workspace/operationalBuildAccess.ts");
  assert.match(adapter, /decision\.roleKey === "workspace_manager" \|\| decision\.supervisorRoleAmbiguous/);
  assert.doesNotMatch(adapter, /historicalMembershipInventory|classifyHistorical/);
});

test("project visibility remains assignment-scoped and excludes foreign archived and Retail projects", () => {
  const result = decision("project_manager", {
    explicit: ["build-1", "foreign", "archived", "retail-1"],
    projects: [
      buildProject,
      retailProject,
      { id: "foreign", clientId: "tenant-2", projectType: "Construction", archivedAt: null },
      { id: "archived", clientId: "tenant-1", projectType: "Construction", archivedAt: "2026-01-01" },
    ],
  });
  assert.equal(result.allowed, true);
  assert.deepEqual(result.authorizedProjectIds, ["build-1", "retail-1"]);
  assert.equal(operationalBuildEligibility(result).eligible, true);
  const adapter = source("lib/workspace/operationalBuildAccess.ts");
  assert.match(adapter, /BUILD_PROJECT_TYPES\.has/);
  assert.match(adapter, /\.is\("archived_at", null\)/);
});

test("inactive memberships and Installer identities receive no operational Build workspace", () => {
  assert.deepEqual(operationalBuildEligibility(decision("project_manager", { membershipStatus: "inactive" })), { eligible: false, code: "workspace_authority_unavailable" });
  assert.deepEqual(operationalBuildEligibility(decision("installer", { appRole: "installer" })), { eligible: false, code: "operational_role_not_eligible" });
});

test("the operational shell reuses Build modules without exposing admin or Executive Intelligence navigation", () => {
  const frame = source("components/workspace/OperationalBuildProjectFrame.tsx");
  const section = source("app/workspace/build/projects/[id]/[section]/page.tsx");
  for (const label of ["Sites", "Work Packages", "Work Plans", "Activities", "Inspections", "Exceptions", "Management Attention"]) {
    assert.match(frame, new RegExp(label));
  }
  assert.doesNotMatch(frame, /Executive Intelligence/);
  assert.match(section, /BuildRuntimeWorkPlan/);
  assert.match(section, /BuildExceptionRegister/);
  assert.doesNotMatch(frame + section, /\/workspace\/admin/);
});

test("Viewer and unsupported operational actors receive read-only activity presentation", () => {
  const page = source("app/workspace/build/projects/[id]/activities/[activityId]/page.tsx");
  assert.match(page, /canUseExecution = access\.roleKey === "project_manager"/);
  assert.match(page, /access\.roleKey === "supervisor" && assignedSupervisor/);
  assert.match(page, /if \(!canUseExecution\) return <ReadOnlyActivity/);
  assert.match(page, /cannot perform lifecycle actions/);
});

test("direct Build service and nested routes enforce canonical server authority", () => {
  const service = source("lib/build/projects/service.ts");
  const layout = source("app/workspace/build/projects/[id]/layout.tsx");
  const activity = source("app/workspace/build/projects/[id]/activities/[activityId]/page.tsx");
  assert.match(service, /resolveBuildProjectAccessRegistry/);
  assert.match(service, /requiredPermission/);
  assert.match(service, /assessBuildProjectAuthority/);
  assert.match(layout, /authorizedProjectIds\.includes\(params\.id\)/);
  assert.match(activity, /getRuntimeActivityProjectScope/);
  assert.match(activity, /workPackage\.siteId !== site\.id/);
});

test("Global Auth accepts only authoritative Build namespace return paths and preserves password precedence", () => {
  const auth = source("lib/auth.ts");
  const session = source("app/api/auth/session/route.ts");
  const refresh = source("app/api/auth/session/refresh/route.ts");
  const password = source("app/api/auth/password/route.ts");
  assert.match(auth, /normalized === "\/workspace\/build"/);
  for (const file of [session, refresh, password]) assert.match(file, /authoritativePath === "\/workspace\/build"/);
  assert.match(refresh, /passwordChangeRequired[\s\S]*\/login\/create-password/);
  assert.match(password, /getAuthoritativeAccountSecurityState/);
});

test("Build notifications preserve recipient and ancestry authority while using operational deep links", () => {
  const repository = source("lib/build/notifications/repository.ts");
  assert.match(repository, /resolveWorkspaceAccessForIdentity/);
  assert.match(repository, /recipient_user_id/);
  assert.match(repository, /authorizedProjectIds/);
  assert.match(repository, /workspaceDestination === "\/workspace\/build"/);
  assert.match(repository, /\(\?:admin\|build\)/);
});

test("responsive support is shell-only and introduces no Build Mobile engine", () => {
  const shell = source("components/workspace/OperationalBuildWorkspaceShell.tsx");
  assert.match(shell, /overflow-x-auto/);
  assert.match(shell, /lg:grid-cols/);
  assert.match(shell, /min-h-11/);
  assert.doesNotMatch(shell, /BuildMobile|mobile execution engine/i);
});

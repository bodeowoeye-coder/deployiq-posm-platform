import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CUSTOMER_ADMIN_DENIED_PERMISSIONS,
  CUSTOMER_ADMIN_PERMISSIONS,
  canListAllTenants,
  isCustomerAdminRole,
} from "../lib/workspace/customerAdminModel.ts";

test("permissions: customer_admin has explicit tenant administration permissions", () => {
  assert.deepEqual(CUSTOMER_ADMIN_PERMISSIONS, [
    "workspace.read",
    "workspace.update",
    "project.create",
    "project.read",
    "project.update",
    "project.archive",
    "campaign.manage",
    "location.manage",
    "submission.read",
    "submission.review",
    "user.invite",
    "user.manage_within_workspace",
    "agency.manage",
    "installer.manage",
    "report.generate",
    "map.read",
    "analytics.read",
    "notification.manage",
    "workspace_settings.manage",
    "billing.read",
  ]);
});

test("permissions: customer_admin explicitly denies platform and cross-tenant powers", () => {
  assert.deepEqual(CUSTOMER_ADMIN_DENIED_PERMISSIONS, [
    "tenant.list_all",
    "tenant.access_other",
    "platform_settings.manage",
    "platform_pricing.manage",
    "cross_tenant_reporting",
    "platform_user_management",
    "service_role_operations",
    "provisioning_admin_actions",
  ]);
});

test("permissions: customer_admin cannot list all tenants", () => {
  assert.equal(canListAllTenants({ role: "customer_admin" }), false);
  assert.equal(canListAllTenants({ role: "platform_admin" }), true);
});

test("permissions: role concepts separate customer_admin from client_viewer", () => {
  assert.equal(isCustomerAdminRole("customer_admin"), true);
  assert.equal(isCustomerAdminRole("client_viewer"), false);
});

test("permissions: submission review roles exclude installers and viewers", () => {
  const source = readFileSync(new URL("../lib/workspace/team.ts", import.meta.url), "utf8");
  for (const role of ["primary_administrator", "administrator", "project_manager", "supervisor"]) {
    assert.match(source, new RegExp(`key: "${role}"[\\s\\S]*?submissions\\.review`));
  }
  for (const role of ["installer", "viewer"]) {
    const block = source.match(new RegExp(`key: "${role}"[\\s\\S]*?permissions: \\[([^\\]]*)\\]`))?.[1] ?? "";
    assert.doesNotMatch(block, /submissions\.review/);
  }
});

test("permissions: platform admin permissions remain in existing app matrix", () => {
  const source = readFileSync(new URL("../lib/core/permissions.ts", import.meta.url), "utf8");
  assert.match(source, /platform:diagnostics:view/);
  assert.match(source, /clients:write/);
  assert.match(source, /users:write/);
});

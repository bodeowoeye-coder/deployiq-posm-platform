import assert from "node:assert/strict";
import test from "node:test";

import { hasWorkspaceSettingsPermission } from "../lib/workspace/customerAdminModel.ts";

test("customer admin workspace settings permission is accepted", () => {
  assert.equal(hasWorkspaceSettingsPermission(["workspace_settings.manage"]), true);
  assert.equal(hasWorkspaceSettingsPermission(["settings.manage"]), true);
});

test("review-only permissions are rejected for workflow settings", () => {
  assert.equal(hasWorkspaceSettingsPermission(["submissions.review"]), false);
  assert.equal(hasWorkspaceSettingsPermission(["notifications.manage"]), false);
});

test("empty permission lists are rejected", () => {
  assert.equal(hasWorkspaceSettingsPermission([]), false);
  assert.equal(hasWorkspaceSettingsPermission(undefined), false);
});

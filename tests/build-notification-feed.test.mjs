import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { composeWorkspaceNotificationFeed } from "../lib/notifications/composition.ts";
import { projectRetailNotification, workspaceNotificationIdentity } from "../lib/notifications/presentation.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const build = (overrides = {}) => ({ id: "same", source: "build", category: "execution_block", title: "Activity Blocked", summary: "Action is required.", projectId: "project", projectLabel: "Build project", occurredAt: "2026-09-28T10:00:00Z", readAt: null, canAcknowledge: true, acknowledgedAt: null, state: "active", destination: { type: "activity_execution", href: "/workspace/admin/projects/project/activities/activity?view=execution", available: true }, ...overrides });
const retail = (overrides = {}) => projectRetailNotification({ id: "same", project_id: "retail-project", title: "Deployment started", message: "Retail status copy", status: "deployment_started", created_at: "2026-09-28T09:00:00Z", read_at: null, project_name: "Retail project", ...overrides });

test("Retail projection preserves copy/read details without fabricating lifecycle", () => {
  const item = retail({ phase_name: "Lagos", destination: "Island", quantity: 12 });
  assert.deepEqual({ source: item.source, category: item.category, summary: item.summary, readAt: item.readAt, state: item.state }, { source: "retail", category: "deployment_started", summary: "Retail status copy", readAt: null, state: "not_applicable" });
  assert.deepEqual(item.retailDetails, { phaseName: "Lagos", destination: "Island", quantity: 12, campaignName: null });
});

test("combined feed sorts chronologically, counts unread and keeps source identity distinct", () => {
  const result = composeWorkspaceNotificationFeed({ status: "fulfilled", value: [retail()] }, { status: "fulfilled", value: [build()] });
  assert.deepEqual(result.notifications.map(workspaceNotificationIdentity), ["build:same", "retail:same"]);
  assert.equal(result.unreadCount, 2); assert.equal(result.partial, false);
});

test("each single-source failure returns safe partial output and both failures fail closed", () => {
  const failed = { status: "rejected", reason: new Error("unavailable") };
  const retailOnly = composeWorkspaceNotificationFeed({ status: "fulfilled", value: [retail()] }, failed);
  assert.deepEqual(retailOnly.unavailableSources, ["build"]); assert.equal(retailOnly.notifications[0].source, "retail");
  const buildOnly = composeWorkspaceNotificationFeed(failed, { status: "fulfilled", value: [build()] });
  assert.deepEqual(buildOnly.unavailableSources, ["retail"]); assert.equal(buildOnly.notifications[0].source, "build");
  assert.throws(() => composeWorkspaceNotificationFeed(failed, failed), /Could not load notifications/);
});

test("Build repository derives recipient scope and never trusts browser tenant authority", () => {
  const repository = source("lib/build/notifications/repository.ts");
  assert.match(repository, /getAuthenticatedUserContext\(\)/);
  assert.match(repository, /workspace_memberships[\s\S]*\.eq\("status", "active"\)/);
  assert.match(repository, /\.eq\("recipient_user_id", context\.user_id\)/);
  assert.match(repository, /\.eq\("suppression_state", "visible"\)/);
  assert.match(repository, /\.in\("project_id", scope\.projectIds\)/);
  assert.doesNotMatch(repository, /input: \{[^}]*recipient_user_id|input: \{[^}]*client_id|input: \{[^}]*project_id/);
});

test("Build read and acknowledgement are recipient-only, idempotent and lifecycle-independent", () => {
  const repository = source("lib/build/notifications/repository.ts");
  assert.match(repository, /read_at: row\.read_at \|\| now/);
  assert.match(repository, /acknowledged_at: row\.acknowledged_at \|\| now, acknowledged_by: context\.user_id/);
  assert.match(repository, /\.eq\("recipient_user_id", context\.user_id\)/);
  assert.doesNotMatch(repository, /resolved_at:/);
  assert.match(repository, /notification_read/); assert.match(repository, /notification_acknowledged/);
});

test("destinations are reconstructed from authorized ancestry and unavailable paths fail closed", () => {
  const repository = source("lib/build/notifications/repository.ts");
  assert.match(repository, /build_notification_episodes/); assert.match(repository, /build_notification_conditions/);
  assert.match(repository, /build_runtime_activities/); assert.match(repository, /build_runtime_exceptions/);
  assert.match(repository, /text\(activity\?\.project_id\) === projectId/);
  assert.match(repository, /href: "", available: false/);
  assert.doesNotMatch(repository, /destination_path/);
});

test("feed reconciliation is bounded, server-only, best effort and does not wire runtime mutations", () => {
  const repository = source("lib/build/notifications/repository.ts");
  const combined = repository + source("lib/notifications/feed.ts");
  assert.match(repository, /^import "server-only";/);
  assert.match(repository, /MAX_RECONCILIATION_PROJECTS = 20/);
  assert.match(repository, /Promise\.allSettled/);
  assert.match(repository, /reconcileAuthenticatedBuildNotifications/);
  assert.doesNotMatch(combined, /openai|applyRuntimeActivityAction|submitRuntimeActivityForReview|recordRuntimeInspection|resumeRuntimeActivityCorrections|createRuntimeException|applyRuntimeExceptionAction/i);
});

test("API and UI preserve domain-safe actions, partial warnings and mobile controls", () => {
  const api = source("app/api/notifications/route.ts");
  const page = source("components/workspace/WorkspaceNotificationsClient.tsx");
  const bell = source("components/NotificationCenter.tsx");
  assert.match(api, /source === "build"/); assert.match(api, /action === "acknowledge"/);
  assert.match(page, /Mark all Retail as read/); assert.match(page, /Destination no longer available/);
  assert.match(page, /Some updates are temporarily unavailable/); assert.match(page, /min-h-11/);
  assert.match(page, /workspaceNotificationIdentity/); assert.match(page, /Acknowledge/);
  assert.match(bell, /30000/); assert.match(bell, /workspaceNotificationIdentity/);
});

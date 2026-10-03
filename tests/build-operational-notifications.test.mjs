import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("operational notification context is active, permission-bound and excludes administrators", () => {
  const context = source("lib/workspace/operationalNotifications.ts");
  assert.match(context, /^import "server-only";/);
  assert.match(context, /auth\.role !== "client"/);
  assert.match(context, /workspace_memberships[\s\S]*\.eq\("status", "active"\)/);
  assert.match(context, /user_profiles[\s\S]*\.select\("status"\)/);
  assert.match(context, /workspace_roles[\s\S]*\.select\("status,app_role"\)/);
  assert.match(context, /notifications\.view/);
  assert.match(context, /FALLBACK_NOTIFICATION_ROLES\.has\(roleKey\)/);
  assert.match(context, /membership\.isCustomerAdministrator/);
  assert.doesNotMatch(context, /notifications\.manage"\)\s*\?\s*true/);
});

test("Supervisor destination is stable and never opens the customer administration boundary", () => {
  const destinations = source("lib/authDestinations.ts");
  const root = source("app/page.tsx");
  const admin = source("lib/workspace/customerAdmin.ts");
  const session = source("app/api/auth/session/route.ts");
  assert.match(destinations, /getOperationalNotificationDestination/);
  assert.match(root, /defaultDestinationForResolvedUser/);
  assert.match(admin, /CustomerWorkspaceRedirect\("\/workspace\/notifications"\)/);
  assert.match(session, /authoritativePath === "\/workspace\/notifications"/);
  assert.doesNotMatch(root, /redirect\("\/submit"\)/);
});

test("operational API reuses recipient-only Build notification authority", () => {
  const route = source("app/api/workspace/notifications/route.ts");
  const repository = source("lib/build/notifications/repository.ts");
  assert.match(route, /requireOperationalNotificationContext/);
  assert.match(route, /listAuthenticatedBuildNotifications/);
  assert.match(route, /updateAuthenticatedBuildNotification/);
  assert.match(repository, /\.eq\("recipient_user_id", context\.user_id\)/);
  assert.match(repository, /\.eq\("suppression_state", "visible"\)/);
  assert.match(repository, /\.in\("project_id", scope\.projectIds\)/);
  assert.match(repository, /getAuthenticatedBuildNotificationConsumption/);
});

test("notification-specific destination fails closed before exact Build ancestry is rendered", () => {
  const repository = source("lib/build/notifications/repository.ts");
  const page = source("app/workspace/notifications/[notificationId]/page.tsx");
  assert.match(repository, /if \(!row\) throw new AccessControlError\("Notification is unavailable\.", 404\)/);
  assert.match(repository, /if \(!destination\?\.available\)/);
  assert.match(page, /getAuthenticatedBuildNotificationConsumption/);
  assert.match(page, /getRuntimeActivityProjectScope/);
  assert.match(page, /getRuntimeActivityExecution/);
  assert.match(page, /\.eq\("client_id", member\.clientId\)/);
  assert.match(page, /notFound\(\)/);
});

test("shared feed uses an operational route/API without exposing Retail bulk actions", () => {
  const client = source("components/workspace/WorkspaceNotificationsClient.tsx");
  const page = source("app/workspace/notifications/page.tsx");
  const layout = source("app/workspace/notifications/layout.tsx");
  assert.match(client, /operationalBuildLinks/);
  assert.match(page, /apiPath="\/api\/workspace\/notifications"/);
  assert.match(page, /routeBase="\/workspace\/notifications"/);
  assert.match(layout, /Operational Workspace/);
  assert.doesNotMatch(layout, /CustomerWorkspaceShell|User Management|Workspace Settings|Billing/);
});

test("operational layout routes unsupported identities before invoking its strict context guard", () => {
  const layout = source("app/workspace/notifications/layout.tsx");
  const routeResolution = layout.indexOf("getOperationalNotificationDestination");
  const strictGuard = layout.lastIndexOf("requireOperationalNotificationContext()");
  assert.match(layout, /getAuthenticatedUserContext/);
  assert.match(layout, /defaultDestinationForRole/);
  assert.match(layout, /canonicalDestination === "\/workspace\/admin"[\s\S]*redirect\(canonicalDestination\)/);
  assert.match(layout, /canonicalDestination !== "\/workspace\/notifications"[\s\S]*notFound\(\)/);
  assert.match(layout, /\/login\?returnTo=%2Fworkspace%2Fnotifications/);
  assert.ok(routeResolution >= 0 && strictGuard > routeResolution);
});

test("installer and Retail routes remain separate and no notification-generation contract changes", () => {
  const destinations = source("lib/authDestinations.ts");
  const operationalApi = source("app/api/workspace/notifications/route.ts");
  assert.match(destinations, /if \(input\.role === "installer"\) return "\/submit"/);
  assert.doesNotMatch(operationalApi, /notification_events|reconcile_build_notifications|configure_build_notification_settings/);
});

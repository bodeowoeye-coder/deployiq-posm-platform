import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = () => readFileSync(new URL("../app/workspace/admin/notifications/page.tsx", import.meta.url), "utf8");
const client = () => readFileSync(new URL("../components/workspace/WorkspaceNotificationsClient.tsx", import.meta.url), "utf8");
const api = () => readFileSync(new URL("../app/api/notifications/route.ts", import.meta.url), "utf8");
const bell = () => readFileSync(new URL("../components/NotificationCenter.tsx", import.meta.url), "utf8");
const schema = () => readFileSync(new URL("../add_notification_events.sql", import.meta.url), "utf8");
const notificationService = () => readFileSync(new URL("../lib/notifications.ts", import.meta.url), "utf8");

test("workspace notifications use the existing event stream and feature flag", () => {
  assert.match(page(), /WorkspaceNotificationsClient/);
  assert.match(page(), /notificationsEnabled/);
  assert.match(api(), /from\("notification_events"\)/);
  assert.match(api(), /query = query\.eq\("client_id", context\.client_id\)/);
  assert.match(notificationService(), /workspaceNotificationsEnabled/);
  assert.match(notificationService(), /workspace_settings/);
  assert.match(notificationService(), /workspace_notification_defaults/);
  assert.doesNotMatch(page() + client(), /clientId|workspaceId|tenantId/);
});

test("notifications reuse canonical read state and header bell source", () => {
  assert.match(schema(), /notification_events/);
  assert.match(schema(), /read_at/);
  assert.match(api(), /markAllRead/);
  assert.match(api(), /read_at: readAt/);
  assert.match(client(), /PATCH/);
  assert.match(client(), /markAllRead: true/);
  assert.match(bell(), /fetch\("\/api\/notifications"/);
  assert.match(bell(), /read_at/);
});

test("notifications preserve empty state, filters, and existing module actions", () => {
  const source = client();
  assert.match(source, /No notifications yet/);
  assert.match(source, /Workspace activity and updates will appear here/);
  for (const label of ["All", "Unread", "Project", "Event type", "Date", "Mark all as read", "Open"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /\/workspace\/admin\/submissions/);
  assert.match(source, /\/workspace\/admin\/projects/);
});

test("Alerts remain separate from Notifications", () => {
  const alerts = readFileSync(new URL("../app/workspace/admin/alerts/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(client(), /getWorkspaceAlertsDashboard|WorkspaceAlert/);
  assert.match(alerts, /WorkspaceAlertsClient/);
});

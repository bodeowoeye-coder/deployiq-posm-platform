import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260902020000_configure_build_notification_governance.sql", import.meta.url), "utf8");
const service = readFileSync(new URL("../lib/build/notifications/settingsService.ts", import.meta.url), "utf8");
const types = readFileSync(new URL("../lib/build/notifications/settingsTypes.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/workspace/build/projects/[id]/notification-settings/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/workspace/admin/projects/[id]/[section]/page.tsx", import.meta.url), "utf8");
const ui = readFileSync(new URL("../components/workspace/BuildNotificationSettings.tsx", import.meta.url), "utf8");

test("governance exposes exactly four factual in-app categories", () => {
  for (const category of ["execution_block", "changes_required", "review_pending", "exception"]) assert.match(types, new RegExp(category));
  assert.match(types, /channel: "in_app"/);
  assert.doesNotMatch(ui, /Email|SMS|WhatsApp/);
});

test("project Settings uses a dedicated authenticated governance boundary", () => {
  assert.match(page, /section === "settings"[\s\S]*BuildNotificationSettings/);
  assert.match(route, /getBuildNotificationSettings/);
  assert.match(route, /updateBuildNotificationSettings/);
  assert.match(service, /resolveCanonicalBuildProject[\s\S]*requiredPermission: "projects:read"/);
  assert.match(service, /read_build_notification_governance_context/);
  assert.match(migration, /workspace_role_permissions[\s\S]*notifications\.manage/);
});

test("recipient eligibility includes only canonical active profiles with active same-tenant access", () => {
  assert.match(migration, /m\.client_id=v_client_id and m\.status='active'/);
  assert.match(migration, /m\.client_id=v_client_id and m\.user_id=recipient_id and m\.status='active'/);
  assert.equal((migration.match(/up\.status='Active'/g) ?? []).length, 2);
  assert.doesNotMatch(migration, /up\.status='active'/);
  assert.match(migration, /wr\.app_role,'client'\)<>'installer'[\s\S]*assigned_project_ids/);
  assert.match(service, /eligibleIds\.has\(id\)/);
});

test("inactive profiles, inactive memberships, cross-tenant users and unassigned installers fail eligibility", () => {
  assert.equal((migration.match(/up\.status='Active'/g) ?? []).length, 2);
  assert.ok((migration.match(/m\.status='active'/g) ?? []).length >= 4);
  assert.doesNotMatch(migration, /lower\(up\.status\)|ilike[\s\S]*active/i);
  assert.match(migration, /where m\.client_id=v_client_id and m\.user_id=recipient_id/);
  assert.match(migration, /p_project_id=any\(coalesce\(up\.assigned_project_ids,'\{\}'::uuid\[\]\)\)/);
});

test("read and configuration RPCs share canonical profile activity semantics", () => {
  assert.match(migration, /read_build_notification_governance_context[\s\S]*join public\.user_profiles up on up\.user_id=m\.user_id and up\.status='Active'/);
  assert.match(migration, /configure_build_notification_settings[\s\S]*join public\.user_profiles up on up\.user_id=m\.user_id[\s\S]*up\.status='Active'/);
  assert.match(migration, /where m\.client_id=v_client_id and m\.status='active'/);
  assert.match(migration, /where m\.client_id=v_client_id and m\.user_id=recipient_id and m\.status='active'/);
  assert.match(migration, /m\.client_id=v_client_id and m\.user_id=recipient_id/);
  assert.match(migration, /wr\.app_role,'client'\)<>'installer'[\s\S]*assigned_project_ids/);
});

test("one atomic compare-and-swap transaction applies the complete configuration", () => {
  assert.match(migration, /jsonb_array_length\(p_preferences\) <> 4/);
  assert.match(migration, /count\(distinct value->>'category'\)[\s\S]*<> 4/);
  assert.match(migration, /for update/);
  assert.match(migration, /BUILD_NOTIFICATION_SETTINGS_STALE/);
  assert.match(service, /configure_build_notification_settings/);
  assert.match(service, /Notification settings changed\. Refresh and try again\./);
});

test("RPC remains a service-only trust boundary with no new tables or channel", () => {
  assert.equal((migration.match(/create table/gi) ?? []).length, 0);
  assert.match(migration, /revoke all on function[\s\S]*public,anon,authenticated,service_role/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.match(migration, /channel='in_app'/);
  assert.doesNotMatch(migration, /openai|channel\s*=\s*'email'|channel\s*=\s*'sms'|channel\s*=\s*'whatsapp'/i);
});

test("zero-recipient validation, explicit save and responsive cards are preserved", () => {
  assert.match(ui, /Select at least one eligible recipient before enabling this notification\./);
  assert.match(ui, /Save Changes/);
  assert.match(ui, /sm:grid-cols-2/);
  assert.match(ui, /No eligible project members are available for notifications\./);
  assert.match(ui, /Notification settings saved\./);
});

test("successful save reuses project reconciliation and stale writes remain all-or-nothing", () => {
  assert.match(service, /reconcileAuthenticatedBuildNotifications/);
  assert.match(migration, /returns void[\s\S]*language plpgsql/);
  assert.match(migration, /removed_at=now\(\),removed_by=p_actor_user_id/);
  assert.match(migration, /on conflict\(rule_id,recipient_user_id\) do update/);
});

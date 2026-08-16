import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const support = () => readFileSync(new URL("../lib/admin/supportAccess.ts", import.meta.url), "utf8");
const route = () => readFileSync(new URL("../app/api/admin/support-sessions/route.ts", import.meta.url), "utf8");
const resolver = () => readFileSync(new URL("../lib/workspace/customerAdmin.ts", import.meta.url), "utf8");
const dialog = () => readFileSync(new URL("../components/admin/OpenWorkspaceSupportAccess.tsx", import.meta.url), "utf8");
const banner = () => readFileSync(new URL("../components/workspace/SupportModeBanner.tsx", import.meta.url), "utf8");
const shell = () => readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");
const customer360Page = () => readFileSync(new URL("../app/admin/customers/[clientId]/page.tsx", import.meta.url), "utf8");
const migration = () => readFileSync(new URL("../supabase/migrations/20260815010000_add_workspace_support_sessions.sql", import.meta.url), "utf8");

test("1. Platform admin can create a support session for a provisioned customer", () => {
  const source = support();
  assert.match(source, /export async function createSupportSession/);
  assert.match(source, /\.from\("workspace_settings"\)\.select\("client_id,status"\)\.eq\("client_id", clientId\)/);
  assert.match(source, /\.from\("workspace_support_sessions"\)\s*\.insert\(/);
  assert.match(source, /status: "active"/);
});

test("2-3. Customer users and installers cannot create support sessions", () => {
  const source = support();
  assert.match(source, /async function requirePlatformAdmin\(\)/);
  assert.match(source, /if \(context\.role\.role !== "admin"\) throw new SupportAccessError\([\s\S]{0,120}403\)/);
  assert.match(source, /export async function createSupportSession[\s\S]{0,200}await requirePlatformAdmin\(\)/);
});

test("4. Support session is bound to the authenticated admin user", () => {
  const source = support();
  assert.match(source, /admin_user_id: context\.user\.id/);
  // Resolution re-checks ownership, so a leaked session id is useless to another account.
  assert.match(source, /\.eq\("admin_user_id", context\.user\.id\)/);
  assert.match(source, /if \(!context\?\.user \|\| context\.role\.role !== "admin"\) return null;/);
});

test("5-6. Support session is bound to exactly one client and cannot be substituted", () => {
  const source = support();
  const resolverSource = resolver();
  assert.match(source, /client_id: clientId/);
  // The tenant comes from the stored session, never from the request.
  assert.match(resolverSource, /const clientId = supportSession \? supportSession\.clientId : authContext\.role\.client_id!/);
});

test("7. An arbitrary workspace query parameter grants nothing", () => {
  const resolverSource = resolver();
  assert.doesNotMatch(resolverSource, /searchParams\.get\("workspace"\)|searchParams\.get\("clientId"\)/);
  assert.match(resolverSource, /const supportSession = authContext\.role\.role === "admin" \? await resolveActiveSupportSession\(\) : null;/);
  // The cookie carries only an opaque id; authorisation is the database row.
  assert.match(support(), /export const SUPPORT_SESSION_COOKIE = "deployiq_support_session"/);
  assert.match(support(), /httpOnly: true/);
});

test("8. Expired support sessions cannot resolve workspace context", () => {
  const source = support();
  assert.match(source, /const remainingMs = new Date\(expiresAt\)\.getTime\(\) - Date\.now\(\)/);
  assert.match(source, /if \(!expiresAt \|\| Number\.isNaN\(remainingMs\) \|\| remainingMs <= 0\) \{[\s\S]{0,200}return null;/);
  assert.match(source, /status: "expired"/);
  assert.match(source, /export const SUPPORT_SESSION_MINUTES = 60/);
});

test("9. Ended support sessions cannot resolve workspace context", () => {
  const source = support();
  assert.match(source, /\.eq\("status", "active"\)\s*\.maybeSingle\(\)/);
  assert.match(source, /export async function endSupportSession/);
  assert.match(source, /status: "ended", ended_at: new Date\(\)\.toISOString\(\)/);
});

test("10. Active support session resolves the selected customer workspace", () => {
  const resolverSource = resolver();
  assert.match(resolverSource, /const role = supportSession \? "customer_admin" : roleFromMembership\(membershipRoleKey\)/);
  assert.match(resolverSource, /const clientRecord: Client = authContext\.client \?\? \{/);
});

test("11-12. Normal customer sign-in is unchanged and admin identity is preserved", () => {
  const resolverSource = resolver();
  const source = support();
  // Customer sessions never touch the support path.
  assert.match(source, /const sessionId = cookies\(\)\.get\(SUPPORT_SESSION_COOKIE\)\?\.value;\s*if \(!sessionId\) return null;/);
  assert.match(resolverSource, /if \(!supportSession && \(authContext\.role\.role !== "client"/);
  // The admin keeps their own user id and role; no membership or customer user is created.
  assert.match(resolverSource, /userId: authContext\.user\.id/);
  assert.doesNotMatch(source, /workspace_memberships/);
  assert.doesNotMatch(source, /user_roles/);
  assert.doesNotMatch(source, /auth\.admin\.(createUser|updateUserById|generateLink)/);
});

test("13. Exit Support Mode returns to Customer 360", () => {
  assert.match(route(), /redirectTo: result\.clientId \? `\/admin\/customers\/\$\{result\.clientId\}` : "\/admin\/customers"/);
  assert.match(banner(), /method: "DELETE"/);
  assert.match(banner(), /Exit Support Mode/);
});

test("14. Support session lifecycle is audited", () => {
  const source = support();
  for (const action of ["support_session_started", "support_session_ended", "support_session_expired"]) {
    assert.ok(source.includes(`actionType: "${action}"`), `missing audit event ${action}`);
  }
  assert.match(source, /actorUserId: context\.user\.id/);
  assert.match(source, /reason,/);
});

test("15. Support access never widens beyond the selected tenant", () => {
  const resolverSource = resolver();
  // Every downstream workspace query still uses the single resolved clientId.
  assert.match(resolverSource, /\.eq\("client_id", clientId\)/);
  assert.doesNotMatch(support(), /\.in\("client_id"/);
});

test("16. Unprovisioned customers cannot start support mode", () => {
  assert.match(support(), /if \(!workspace\) throw new SupportAccessError\("Workspace not provisioned\.", 409\)/);
  assert.match(support(), /if \(text\(workspace\.status\) === "archived"\)/);
  assert.match(dialog(), /if \(!provisioned\) \{[\s\S]{0,320}Workspace not provisioned/);
});

test("17. Open Workspace never sends a platform admin to onboarding/Acquire", () => {
  const resolverSource = resolver();
  // A platform admin without a support session goes back to Core Admin, not the acquisition journey.
  assert.match(resolverSource, /if \(authContext\.role\.role === "admin" && !supportSession\) \{[\s\S]{0,320}throw new CustomerWorkspaceRedirect\("\/admin\/customers"\)/);
  assert.doesNotMatch(customer360Page(), /\/onboarding/);
});

test("18. Support Mode banner renders only during an active support session", () => {
  assert.match(shell(), /\{workspace\.supportSession \? \(\s*<SupportModeBanner/);
  assert.match(banner(), /DeployIQ Support Mode/);
  assert.match(banner(), /You are accessing \{organisation\} as a DeployIQ Platform Administrator\./);
  assert.match(banner(), /Session expires in \{expiresInMinutes\} minutes\./);
  assert.match(resolver(), /supportSession: supportSession/);
});

test("support access uses assisting language, never impersonation", () => {
  assert.match(dialog(), /Access Customer Workspace/);
  assert.match(dialog(), /You will remain signed in as/);
  assert.match(dialog(), /Your access will be recorded as a DeployIQ support session\./);
  assert.match(dialog(), /Start Support Session/);
  // The support surfaces themselves must never use impersonation wording.
  assert.doesNotMatch(`${dialog()}\n${banner()}`, /impersonat|Login as Customer|Become User/i);
  // Customer 360 may still state that impersonation is deliberately unavailable.
  assert.match(customer360Page(), /Impersonation, destructive delete, billing override and subscription cancellation are not available\./);
});

test("support session schema is additive and stores no credentials", () => {
  const sql = migration();
  assert.match(sql, /create table if not exists public\.workspace_support_sessions/);
  assert.match(sql, /admin_user_id uuid not null references auth\.users\(id\)/);
  assert.match(sql, /client_id uuid not null references public\.clients\(id\)/);
  assert.match(sql, /status text not null default 'active' check \(status in \('active', 'ended', 'expired'\)\)/);
  assert.match(sql, /expires_at timestamptz not null/);
  // Indexed for the per-request validation lookup.
  assert.match(sql, /create index if not exists workspace_support_sessions_active_idx\s*on public\.workspace_support_sessions \(admin_user_id, status, expires_at desc\)/);
  assert.match(sql, /enable row level security/);
  // No destructive statement, and no credential column is declared.
  assert.doesNotMatch(sql, /drop table|drop column|delete from|truncate|alter table public\.clients/i);
  const columnBlock = sql.slice(sql.indexOf("create table"), sql.indexOf(");"));
  assert.doesNotMatch(columnBlock, /password|token|secret|service_role/i);
});

test("support validation stays cheap on the workspace request path", () => {
  const source = support();
  // A single indexed lookup, and only when the support cookie is present on an admin session.
  assert.equal((source.match(/\.from\("workspace_support_sessions"\)\s*\.select\(/g) ?? []).length, 1);
  assert.match(source, /if \(!sessionId\) return null;/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const baseline = read("supabase/baselines/20260816020000_pre_core2a.sql");
const migration = read("supabase/migrations/20261014010000_repair_canonical_session_table_privileges.sql");
const auth = read("lib/auth.ts");
const session = read("app/api/auth/session/route.ts");

for (const [label, sql] of [["baseline", baseline], ["forward migration", migration]]) {
  test(`${label} grants only row-filtered browser session reads`, () => {
    assert.match(sql, /revoke all privileges on table public\.user_roles, public\.user_profiles, public\.clients from anon/);
    assert.match(sql, /revoke all privileges on table public\.user_roles, public\.user_profiles, public\.clients from authenticated/);
    assert.match(sql, /grant select on table public\.user_roles, public\.user_profiles, public\.clients to authenticated/);
    assert.doesNotMatch(sql, /grant\s+(?:all|insert|update|delete).*to authenticated/i);
    assert.doesNotMatch(sql, /grant\s+.*to anon/i);
  });

  test(`${label} restores bounded server session authority`, () => {
    for (const table of ["user_roles", "user_profiles", "clients", "onboarding_drafts", "workspace_memberships", "workspace_roles", "workspace_role_permissions", "projects"])
      assert.match(sql, new RegExp(`public\\.${table}`));
    assert.match(sql, /to service_role/);
  });
}

test("session architecture retains user-scoped RLS reads and service fallback", () => {
  assert.match(auth, /userClient[\s\S]*\.from\("user_roles"\)[\s\S]*\.eq\("user_id", resolvedUser\.id\)/);
  assert.match(auth, /createAdminSupabase\(\)[\s\S]*\.from\("user_roles"\)/);
  assert.match(session, /createAdminSupabase\(\)[\s\S]*\.from\("user_roles"\)[\s\S]*\.eq\("user_id", data\.user\.id\)/);
});

test("self-only role and profile policies remain canonical", () => {
  assert.match(baseline, /create policy "Users can read their own role"[\s\S]*using \(auth\.uid\(\) = user_id\)/);
  assert.match(baseline, /create policy "Users can read their own profile"[\s\S]*using \(auth\.uid\(\) = user_id\)/);
  assert.match(baseline, /create policy "Clients can read their own client row"[\s\S]*user_roles\.user_id = auth\.uid\(\)[\s\S]*user_roles\.client_id = clients\.id/);
});

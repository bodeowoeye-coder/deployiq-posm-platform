import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { E1C_FIXTURE, E1C_PERSONAS, assertE1CLocalTarget } from "../scripts/lib/e1c-build-uat.mjs";

const source = readFileSync(new URL("../scripts/lib/e1c-build-uat.mjs", import.meta.url), "utf8");
const local = { DEPLOYIQ_ENVIRONMENT: "local", DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS: "local", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" };

test("E1C harness accepts only explicit loopback local targets", () => assert.doesNotThrow(() => assertE1CLocalTarget(local)));
for (const [name, overrides] of Object.entries({
  production: { NEXT_PUBLIC_SUPABASE_URL: "https://vmurvcpmqwnxgruhqevf.supabase.co" },
  staging: { DEPLOYIQ_ENVIRONMENT: "staging", NEXT_PUBLIC_SUPABASE_URL: "https://pmdgpgfbtolrgmuusszy.supabase.co" },
  remoteDb: { SUPABASE_DB_URL: "postgresql://postgres.ref@example.supabase.co/postgres" },
  missingEnvironment: { DEPLOYIQ_ENVIRONMENT: "" },
})) test(`E1C harness rejects ${name}`, () => assert.throws(() => assertE1CLocalTarget({ ...local, ...overrides })));

test("fixture is synthetic and contains the full approved persona matrix", () => {
  assert.equal(E1C_FIXTURE.organisation, "Meridian Civil Works Ltd");
  assert.equal(E1C_FIXTURE.projectCode, "MCW-LEK-001");
  assert.deepEqual(Object.keys(E1C_PERSONAS), ["customerAdmin", "workspaceOwner", "projectManager", "supervisor", "fieldCoordinator", "viewer", "unassigned", "crossTenant", "retailInstaller", "ambiguousManager"]);
  for (const [email] of Object.values(E1C_PERSONAS)) assert.match(email, /@e1c\.deployiq\.test$/);
});

test("fixture seeds prerequisites but does not fabricate runtime outcomes", () => {
  assert.doesNotMatch(source, /from\("build_runtime_(activities|events|evidence|inspections|exceptions|recipient_notifications)"\)\.(insert|upsert|update)/);
  assert.doesNotMatch(source, /password\s*[:=]\s*["'][^"']+["']/i);
  assert.match(source, /mode: 0o600/);
});

import { resolve } from "node:path";
import { assertE1DUatApplicationEnvironment, assertSafeSupabaseTarget } from "./lib/assert-safe-supabase-target.mjs";
import { seedE1CBuildFixture } from "./lib/e1c-build-uat.mjs";
import { assertCurrentSchema, normalizedInventory } from "./lib/local-baseline-recovery.mjs";

function required(env, key) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`e1d_${key.toLowerCase()}_missing`);
  return value;
}

export function assertE1DRemoteUatMutationTarget(env = process.env) {
  assertE1DUatApplicationEnvironment(env);
  if (env.DEPLOYIQ_CONFIRM_REMOTE_UAT_MUTATION !== "YES") throw new Error("e1d_remote_uat_confirmation_missing");
  const databaseUrl = required(env, "SUPABASE_DB_URL");
  const result = assertSafeSupabaseTarget({
    operationClass: "E1D synthetic Build UAT fixture",
    destructive: true,
    databaseUrl,
    env,
    log: () => {},
  });
  if (result.environment !== "uat" || result.projectRef === "local") throw new Error("e1d_remote_uat_target_required");
  return { apiUrl: required(env, "NEXT_PUBLIC_SUPABASE_URL"), databaseUrl, projectRef: result.projectRef };
}

const target = assertE1DRemoteUatMutationTarget();
assertCurrentSchema(normalizedInventory(target.databaseUrl));

const e1dPassword = required(process.env, "E1D_UAT_PASSWORD");
const outputPath = resolve(process.cwd(), process.env.E1D_UAT_MANIFEST_PATH?.trim() || ".e1d-uat-manifest.json");
const fixtureEnv = { ...process.env, E1C_UAT_PASSWORD: e1dPassword };
const manifest = await seedE1CBuildFixture({
  env: fixtureEnv,
  outputPath,
  assertTarget: () => ({ apiUrl: target.apiUrl, dbUrl: target.databaseUrl }),
});

console.log(`E1D synthetic Build UAT fixture ready: ${manifest.fixture.projectCode}`);
console.log(`Synthetic personas: ${Object.keys(manifest.identities).length}`);
console.log(`Restricted manifest written: ${outputPath}`);
console.log("No credential values were written to the manifest or output.");

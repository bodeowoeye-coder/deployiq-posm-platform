import { assertSafeSupabaseTarget } from "./lib/assert-safe-supabase-target.mjs";
import { assertCanonicalLocalData, assertCurrentSchema, fingerprintInventory, normalizedInventory } from "./lib/local-baseline-recovery.mjs";

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) throw new Error("supabase_db_url_missing");
assertSafeSupabaseTarget({ operationClass: "read-only current local schema verification", databaseUrl });
const inventory = normalizedInventory(databaseUrl);
assertCurrentSchema(inventory);
assertCanonicalLocalData(databaseUrl);
const fingerprint = fingerprintInventory(inventory);
console.log(`Current local schema fingerprint: ${fingerprint}`);
console.log("Current local schema verification passed.");

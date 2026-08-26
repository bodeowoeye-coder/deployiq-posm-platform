import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { assertSafeSupabaseTarget } from "./lib/assert-safe-supabase-target.mjs";

const args = new Set(process.argv.slice(2));
const mode = args.has("--reference") ? "reference-seed" : args.has("--fixtures") ? "synthetic-fixtures" : "schema-bootstrap";
const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) throw new Error("supabase_db_url_missing");
assertSafeSupabaseTarget({ operationClass: mode, databaseUrl });
const psql = spawnSync("psql", ["--version"], { encoding: "utf8" });
if (psql.error?.code === "ENOENT") throw new Error("psql_not_available");
if (psql.status !== 0) throw new Error("psql_unavailable");

const root = resolve(import.meta.dirname, "..");
const file = resolve(root, mode === "schema-bootstrap"
  ? "supabase/baselines/20260816020000_pre_core2a.sql"
  : mode === "reference-seed"
    ? "supabase/seeds/canonical_reference_data.sql"
    : "supabase/seeds/staging_synthetic_fixtures.sql");
if (!existsSync(file)) throw new Error("bootstrap_sql_missing");

if (mode === "schema-bootstrap") {
  const probe = spawnSync("psql", [databaseUrl, "-XAt", "-v", "ON_ERROR_STOP=1", "-c",
    "select count(*) from pg_tables where schemaname='public' and tablename not in ('spatial_ref_sys');"], { encoding: "utf8" });
  if (probe.status !== 0) throw new Error("bootstrap_target_probe_failed");
  if (Number(probe.stdout.trim()) !== 0) throw new Error("bootstrap_target_not_empty");
}

const command = [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "--single-transaction"];
if (mode === "synthetic-fixtures") {
  const id = process.env.DEPLOYIQ_SYNTHETIC_ADMIN_USER_ID?.trim();
  if (!id) throw new Error("synthetic_admin_user_id_missing");
  command.push("-v", `synthetic_admin_user_id=${id}`);
}
command.push("-f", file);
const applied = spawnSync("psql", command, { stdio: ["ignore", "inherit", "inherit"] });
if (applied.status !== 0) throw new Error(`${mode}_failed`);
console.log(`${mode} completed safely.`);

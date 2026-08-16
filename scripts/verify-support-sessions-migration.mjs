/**
 * Verifies the workspace_support_sessions migration and exercises the support-session lifecycle.
 * Run: node scripts/verify-support-sessions-migration.mjs
 * All probe rows are removed before exit.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let failures = 0;
function check(label, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

console.log(`Project: ${url}\n=== 1. Table & columns ===`);
const columns = "id,admin_user_id,client_id,reason,status,started_at,expires_at,ended_at,initiated_from,last_activity_at,created_at";
const probe = await admin.from("workspace_support_sessions").select(columns).limit(1);
if (probe.error) {
  console.log(`FAIL  table not found — ${probe.error.message}`);
  console.log("\nApply supabase/migrations/20260815010000_add_workspace_support_sessions.sql first.");
  process.exit(1);
}
check("workspace_support_sessions exists with all 11 columns", true);

console.log("\n=== 2. Constraints ===");
const { data: adminUser } = await admin.from("user_roles").select("user_id").eq("role", "admin").limit(1).maybeSingle();
const { data: client } = await admin.from("workspace_settings").select("client_id").limit(1).maybeSingle();
if (!adminUser || !client) {
  console.log("FAIL  need one platform admin and one provisioned workspace to verify");
  process.exit(1);
}
const adminUserId = adminUser.user_id;
const clientId = client.client_id;
const future = new Date(Date.now() + 60 * 60_000).toISOString();

const badStatus = await admin.from("workspace_support_sessions").insert({ admin_user_id: adminUserId, client_id: clientId, reason: "probe", status: "hijacked", expires_at: future }).select("id").maybeSingle();
check("status CHECK rejects an unknown value", badStatus.error?.code === "23514", badStatus.error?.code ?? "accepted");

const emptyReason = await admin.from("workspace_support_sessions").insert({ admin_user_id: adminUserId, client_id: clientId, reason: "   ", expires_at: future }).select("id").maybeSingle();
check("reason CHECK rejects blank text", emptyReason.error?.code === "23514", emptyReason.error?.code ?? "accepted");

const noExpiry = await admin.from("workspace_support_sessions").insert({ admin_user_id: adminUserId, client_id: clientId, reason: "probe" }).select("id").maybeSingle();
check("expires_at NOT NULL enforced", noExpiry.error?.code === "23502", noExpiry.error?.code ?? "accepted");

const badClient = await admin.from("workspace_support_sessions").insert({ admin_user_id: adminUserId, client_id: "00000000-0000-0000-0000-000000000000", reason: "probe", expires_at: future }).select("id").maybeSingle();
check("client_id foreign key enforced", badClient.error?.code === "23503", badClient.error?.code ?? "accepted");

console.log("\n=== 3. Row Level Security ===");
const anonRead = await anon.from("workspace_support_sessions").select("id").limit(1);
check("anon key cannot read support sessions (RLS on, no policy)", Boolean(anonRead.error) || (anonRead.data ?? []).length === 0, anonRead.error?.message ?? `${(anonRead.data ?? []).length} rows`);
const anonWrite = await anon.from("workspace_support_sessions").insert({ admin_user_id: adminUserId, client_id: clientId, reason: "anon probe", expires_at: future }).select("id").maybeSingle();
check("anon key cannot create a support session", Boolean(anonWrite.error), anonWrite.error?.code ?? "INSERT ACCEPTED");

console.log("\n=== 4. Lifecycle ===");
const created = await admin.from("workspace_support_sessions").insert({
  admin_user_id: adminUserId, client_id: clientId, reason: "Migration verification probe",
  status: "active", expires_at: future, initiated_from: "verification_script",
}).select("id,status,expires_at").single();
check("active session created", !created.error, created.error?.message ?? created.data.id);

const bound = await admin.from("workspace_support_sessions").select("id,client_id")
  .eq("id", created.data.id).eq("admin_user_id", adminUserId).eq("status", "active").maybeSingle();
check("session resolves for the owning admin", Boolean(bound.data) && bound.data.client_id === clientId);

const otherAdmin = "00000000-0000-0000-0000-000000000001";
const notBound = await admin.from("workspace_support_sessions").select("id")
  .eq("id", created.data.id).eq("admin_user_id", otherAdmin).eq("status", "active").maybeSingle();
check("session does not resolve for a different admin", !notBound.data);

const expired = await admin.from("workspace_support_sessions").insert({
  admin_user_id: adminUserId, client_id: clientId, reason: "Expired probe",
  status: "active", expires_at: new Date(Date.now() - 60_000).toISOString(),
}).select("id,expires_at").single();
check("expired session is detectable as past expiry", new Date(expired.data.expires_at).getTime() < Date.now());

await admin.from("workspace_support_sessions").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", created.data.id);
const afterEnd = await admin.from("workspace_support_sessions").select("id").eq("id", created.data.id).eq("status", "active").maybeSingle();
check("ended session no longer resolves as active", !afterEnd.data);

await admin.from("workspace_support_sessions").delete().in("id", [created.data.id, expired.data.id]);
const { count } = await admin.from("workspace_support_sessions").select("id", { count: "exact", head: true });
check("probe rows removed", (count ?? 0) === 0, `${count ?? 0} rows remain`);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);

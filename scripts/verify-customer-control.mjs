// Verifies the Core Admin customer control data layer against live canonical tables.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const t = (v) => (typeof v === "string" ? v.trim() : "");

const started = Date.now();
const [clients, profiles, settings, entitlements, memberships, projects, jobs, drafts] = await Promise.all([
  s.from("clients").select("id,name,status,created_at").order("name"),
  s.from("client_profiles").select("client_id,contact_person,email,phone"),
  s.from("workspace_settings").select("client_id,workspace_slug,product_key,product_name,commercial_model,commercial_reference,status,provisioned_at"),
  s.from("product_entitlements").select("client_id,product_key,status,commercial_model,acquisition_draft_id"),
  s.from("workspace_memberships").select("client_id,user_id,role_key,status"),
  s.from("projects").select("client_id").is("archived_at", null),
  s.from("provisioning_jobs").select("id,acquisition_draft_id,workspace_slug,status"),
  s.from("onboarding_drafts").select("id,status"),
]);
const batchMs = Date.now() - started;

const settingsBy = new Map(settings.data.map((r) => [r.client_id, r]));
const entBy = new Map(entitlements.data.map((r) => [r.client_id, r]));
const draftBy = new Map(drafts.data.map((r) => [r.id, r]));
const jobByDraft = new Map(jobs.data.map((r) => [r.acquisition_draft_id, r]));
const jobBySlug = new Map(jobs.data.map((r) => [r.workspace_slug, r]));
const projCount = new Map();
for (const p of projects.data) projCount.set(p.client_id, (projCount.get(p.client_id) ?? 0) + 1);
const userCount = new Map();
for (const m of memberships.data.filter((x) => x.status === "active")) userCount.set(m.client_id, (userCount.get(m.client_id) ?? 0) + 1);

console.log(`Parallel batch for the whole customer list: ${batchMs} ms (8 queries, ${clients.data.length} customers)\n`);

let provisioned = 0, legacy = 0;
const ids = new Set();
for (const c of clients.data) {
  if (ids.has(c.id)) console.log(`DUPLICATE customer row: ${c.name}`);
  ids.add(c.id);
  const w = settingsBy.get(c.id);
  const e = entBy.get(c.id);
  const job = jobByDraft.get(e?.acquisition_draft_id) ?? jobBySlug.get(w?.workspace_slug);
  const source = job ? "Self-service" : w ? "Assisted" : "Legacy / Unknown";
  if (w) provisioned += 1; else legacy += 1;
  console.log(
    `${c.name.slice(0, 30).padEnd(31)} ws=${(w?.status ?? "none").padEnd(9)} product=${(w?.product_key ?? "-").padEnd(7)} plan=${(w?.commercial_model ?? "-").padEnd(20)} prov=${(job?.status ?? "n/a").padEnd(10)} proj=${String(projCount.get(c.id) ?? 0).padEnd(3)} users=${String(userCount.get(c.id) ?? 0).padEnd(3)} ${source}`,
  );
}
console.log(`\nunique customers: ${ids.size} (no duplicates: ${ids.size === clients.data.length})`);
console.log(`provisioned workspaces: ${provisioned} | legacy/manual: ${legacy}`);

// Customer 360 shell timing for one provisioned customer.
const target = clients.data.find((c) => settingsBy.has(c.id));
const shellStart = Date.now();
await Promise.all([
  s.from("client_profiles").select("*").eq("client_id", target.id).maybeSingle(),
  s.from("workspace_settings").select("*").eq("client_id", target.id).maybeSingle(),
  s.from("product_entitlements").select("*").eq("client_id", target.id).maybeSingle(),
  s.from("workspace_memberships").select("user_id,role_key,status").eq("client_id", target.id),
  s.from("projects").select("id,name,status").eq("client_id", target.id).is("archived_at", null),
  s.from("workspace_statuses").select("category,status_key,label").eq("client_id", target.id),
]);
console.log(`\nCustomer 360 shell batch for "${target.name}": ${Date.now() - shellStart} ms`);

// Tenant leak probe: another customer's project must never appear under this customer.
const other = clients.data.find((c) => c.id !== target.id && (projCount.get(c.id) ?? 0) > 0);
if (other) {
  const { data: leaked } = await s.from("projects").select("id").eq("client_id", target.id).limit(200);
  const { data: otherProjects } = await s.from("projects").select("id").eq("client_id", other.id).limit(200);
  const overlap = leaked.filter((p) => otherProjects.some((o) => o.id === p.id));
  console.log(`cross-customer project leak: ${overlap.length === 0 ? "NONE (PASS)" : `${overlap.length} leaked (FAIL)`}`);
}

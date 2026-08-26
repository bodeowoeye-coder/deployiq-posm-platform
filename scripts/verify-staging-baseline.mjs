import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { assertSafeSupabaseTarget } from "./lib/assert-safe-supabase-target.mjs";

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) throw new Error("supabase_db_url_missing");
assertSafeSupabaseTarget({ operationClass: "read-only baseline verification", databaseUrl });

const requiredTables = [
  "clients","projects","onboarding_drafts","commercial_pricing_templates",
  "commercial_pricing_tiers","commercial_pricing_snapshots","provisioning_jobs",
  "provisioning_events","workspace_settings","product_entitlements",
  "workspace_memberships","workspace_campaigns","workspace_campaign_locations",
  "workspace_field_assignments","workspace_activation_notifications",
  "workspace_support_sessions","workspace_directory_import_batches","submissions",
];
const forbiddenTables = ["build_sites","build_work_packages","build_activity_templates","commercial_payment_records","commercial_approvals"];
const sql = `
select jsonb_build_object(
 'tables',(select jsonb_agg(tablename order by tablename) from pg_tables where schemaname='public'),
 'columns',(select jsonb_agg(table_name||'.'||column_name order by table_name,column_name) from information_schema.columns where table_schema='public'),
 'indexes',(select jsonb_agg(indexname order by indexname) from pg_indexes where schemaname='public'),
 'foreign_keys',(select jsonb_agg(conrelid::regclass::text||':'||conname||':'||confrelid::regclass::text order by conrelid::regclass::text,conname) from pg_constraint where contype='f' and connamespace='public'::regnamespace),
 'rls',(select jsonb_agg(relname order by relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity),
 'policies',(select jsonb_agg(tablename||':'||policyname order by tablename,policyname) from pg_policies where schemaname in ('public','storage')),
 'functions',(select jsonb_agg(p.proname order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
 'routine_grants',(select jsonb_agg(routine_name||':'||grantee||':'||privilege_type order by routine_name,grantee,privilege_type) from information_schema.routine_privileges where specific_schema='public'),
 'bucket',(select jsonb_agg(id||':'||public::text||':'||file_size_limit::text order by id) from storage.buckets)
)::text;`;
const result = spawnSync("psql", [databaseUrl,"-XAt","-v","ON_ERROR_STOP=1","-c",sql], { encoding: "utf8" });
if (result.error?.code === "ENOENT") throw new Error("psql_not_available");
if (result.status !== 0) throw new Error("baseline_inventory_failed");
const inventory = JSON.parse(result.stdout.trim());
for (const table of requiredTables) if (!inventory.tables?.includes(table)) throw new Error(`required_table_missing:${table}`);
for (const table of forbiddenTables) if (inventory.tables?.includes(table)) throw new Error(`forbidden_table_present:${table}`);
for (const column of [
  "clients.acquisition_draft_id","provisioning_jobs.execution_lock_token",
  "provisioning_jobs.execution_locked_at","submissions.workspace_id",
  "submissions.campaign_id","deployment_locations.client_id",
]) if (!inventory.columns?.includes(column)) throw new Error(`required_column_missing:${column}`);
for (const index of ["clients_acquisition_draft_id_uidx","provisioning_jobs_acquisition_draft_id_uidx","product_entitlements_product_key_idx"])
  if (!inventory.indexes?.includes(index)) throw new Error(`required_index_missing:${index}`);
for (const fkName of ["clients_acquisition_draft_id_fkey","provisioning_jobs_acquisition_draft_id_fkey"])
  if (!inventory.foreign_keys?.some((value) => value.includes(`:${fkName}:`))) throw new Error(`required_foreign_key_missing:${fkName}`);
for (const table of ["clients","submissions","onboarding_drafts","workspace_activation_notifications","workspace_support_sessions"])
  if (!inventory.rls?.includes(table)) throw new Error(`required_rls_missing:${table}`);
for (const rpc of ["claim_acquisition_provisioning_job","commit_workspace_directory_import"])
  if (!inventory.functions?.includes(rpc)) throw new Error(`required_rpc_missing:${rpc}`);
for (const rpc of ["claim_acquisition_provisioning_job","commit_workspace_directory_import"])
  if (!inventory.routine_grants?.includes(`${rpc}:service_role:EXECUTE`)) throw new Error(`service_role_rpc_grant_missing:${rpc}`);
for (const grant of inventory.routine_grants ?? [])
  if (/^(claim_acquisition_provisioning_job|commit_workspace_directory_import):(anon|authenticated|PUBLIC):EXECUTE$/.test(grant))
    throw new Error(`unsafe_rpc_grant:${grant}`);
if (!inventory.bucket?.some((value) => value === "installation-images:true:5242880")) throw new Error("storage_bucket_invalid");
const fingerprint = createHash("sha256").update(JSON.stringify(inventory)).digest("hex");

const dataCheckSql = `select jsonb_build_object(
  'clients',(select count(*) from public.clients),
  'projects',(select count(*) from public.projects),
  'drafts',(select count(*) from public.onboarding_drafts),
  'jobs',(select count(*) from public.provisioning_jobs),
  'stages',(select count(*) from public.deployment_stages),
  'retail_templates',(select count(*) from public.commercial_pricing_templates where id='6f6a0db0-0f4d-4f95-b66c-79f70ce48b60'),
  'retail_tiers',(select count(*) from public.commercial_pricing_tiers where pricing_template_id='6f6a0db0-0f4d-4f95-b66c-79f70ce48b60')
)::text;`;
const dataResult = spawnSync("psql", [databaseUrl,"-XAt","-v","ON_ERROR_STOP=1","-c",dataCheckSql], { encoding: "utf8" });
if (dataResult.status !== 0) throw new Error("baseline_data_inventory_failed");
const counts = JSON.parse(dataResult.stdout.trim());
for (const key of ["clients","projects","drafts","jobs"]) if (Number(counts[key]) !== 0) throw new Error(`fixture_rows_present:${key}`);
if (Number(counts.stages) !== 5 || Number(counts.retail_templates) !== 1 || Number(counts.retail_tiers) !== 5)
  throw new Error("canonical_reference_data_invalid");
console.log(`Schema fingerprint: ${fingerprint}`);
console.log("Baseline verification passed.");

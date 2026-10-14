import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const BASELINE_BOUNDARY = "20260816020000";
export const FIRST_FORWARD_MIGRATION = "20260823010000";
export const E1B_MIGRATION = "20261013010000";
export const AUTHORIZATION_REPAIR_MIGRATION = "20261014010000";
export const E1C_FIELD_COORDINATOR_MIGRATION = "20261015010000";
export const E1C_WORKSPACE_STATUS_PRIVILEGE_MIGRATION = "20261015020000";

export function migrationFiles(root) {
  const directory = resolve(root, "supabase/migrations");
  return readdirSync(directory)
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .sort()
    .map((name) => ({ name, version: name.slice(0, 14), path: resolve(directory, name) }));
}

export function representedMigrationVersions(root) {
  return migrationFiles(root)
    .filter(({ version }) => version <= BASELINE_BOUNDARY)
    .map(({ version }) => version);
}

export function forwardMigrations(root) {
  return migrationFiles(root).filter(({ version }) => version > BASELINE_BOUNDARY);
}

export function assertRecoveryFiles(root) {
  const required = [
    "supabase/baselines/20260816020000_pre_core2a.sql",
    "supabase/seeds/canonical_reference_data.sql",
    `supabase/migrations/${FIRST_FORWARD_MIGRATION}_add_commercial_entitlement_authority_foundation.sql`,
    `supabase/migrations/${E1B_MIGRATION}_add_build_mobile_evidence_sync_foundation.sql`,
    `supabase/migrations/${AUTHORIZATION_REPAIR_MIGRATION}_repair_canonical_session_table_privileges.sql`,
    `supabase/migrations/${E1C_FIELD_COORDINATOR_MIGRATION}_align_field_coordinator_activity_owner_authority.sql`,
    `supabase/migrations/${E1C_WORKSPACE_STATUS_PRIVILEGE_MIGRATION}_repair_customer_workspace_status_lookup_privilege.sql`,
  ];
  for (const relative of required) {
    if (!existsSync(resolve(root, relative))) throw new Error(`recovery_file_missing:${relative}`);
  }
  const forward = forwardMigrations(root);
  if (forward[0]?.version !== FIRST_FORWARD_MIGRATION) throw new Error("unexpected_first_forward_migration");
  if (forward.at(-1)?.version !== E1C_WORKSPACE_STATUS_PRIVILEGE_MIGRATION) throw new Error("unexpected_last_forward_migration");
}

export function run(command, args, { cwd, capture = false, env = process.env } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error?.code === "ENOENT") throw new Error(`tool_missing:${command}`);
  if (result.status !== 0) {
    const safeDetail = capture ? (result.stderr || result.stdout || "").trim().split("\n").at(-1) : "";
    throw new Error(`command_failed:${command}${safeDetail ? `:${safeDetail}` : ""}`);
  }
  return capture ? result.stdout.trim() : "";
}

export function psql(databaseUrl, sql, { tuplesOnly = true } = {}) {
  const args = [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1"];
  if (tuplesOnly) args.push("-At");
  args.push("-c", sql);
  return run("psql", args, { capture: true });
}

export function applySqlFile(databaseUrl, file) {
  run("psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "--single-transaction", "-f", file], { capture: true });
}

export function appliedMigrationVersions(databaseUrl) {
  const ledger = psql(databaseUrl, "select to_regclass('supabase_migrations.schema_migrations') is not null;");
  if (ledger !== "t") return [];
  const raw = psql(databaseUrl, "select version from supabase_migrations.schema_migrations order by version;");
  return raw ? raw.split("\n").map((value) => value.trim()).filter(Boolean) : [];
}

export function normalizedInventory(databaseUrl) {
  const sql = String.raw`
select jsonb_build_object(
  'tables', coalesce((select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'forced_rls',c.relforcerowsecurity) order by c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')), '[]'::jsonb),
  'columns', coalesce((select jsonb_agg(jsonb_build_object('table',table_name,'name',column_name,'type',data_type,'udt',udt_name,'nullable',is_nullable,'default',column_default) order by table_name,ordinal_position)
    from information_schema.columns where table_schema='public'), '[]'::jsonb),
  'constraints', coalesce((select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'type',c.contype,'definition',pg_get_constraintdef(c.oid,true),'validated',c.convalidated) order by c.conrelid::regclass::text,c.conname)
    from pg_constraint c where c.connamespace='public'::regnamespace), '[]'::jsonb),
  'indexes', coalesce((select jsonb_agg(jsonb_build_object('table',tablename,'name',indexname,'definition',indexdef) order by tablename,indexname)
    from pg_indexes where schemaname='public'), '[]'::jsonb),
  'policies', coalesce((select jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'name',policyname,'permissive',permissive,'roles',roles,'command',cmd,'using',qual,'check',with_check) order by schemaname,tablename,policyname)
    from pg_policies where schemaname in ('public','storage')), '[]'::jsonb),
  'functions', coalesce((select jsonb_agg(jsonb_build_object('name',p.proname,'identity_args',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid),'security_definer',p.prosecdef,'config',p.proconfig) order by p.proname,pg_get_function_identity_arguments(p.oid))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'), '[]'::jsonb),
  'routine_grants', coalesce((select jsonb_agg(jsonb_build_object('name',routine_name,'specific',specific_name,'grantee',grantee,'privilege',privilege_type) order by routine_name,specific_name,grantee,privilege_type)
    from information_schema.routine_privileges where specific_schema='public'), '[]'::jsonb),
  'table_grants', coalesce((select jsonb_agg(jsonb_build_object('table',table_name,'grantee',grantee,'privilege',privilege_type) order by table_name,grantee,privilege_type)
    from information_schema.table_privileges where table_schema='public'), '[]'::jsonb),
  'triggers', coalesce((select jsonb_agg(jsonb_build_object('table',event_object_table,'name',trigger_name,'timing',action_timing,'event',event_manipulation,'statement',action_statement) order by event_object_table,trigger_name,event_manipulation)
    from information_schema.triggers where trigger_schema='public'), '[]'::jsonb),
  'buckets', coalesce((select jsonb_agg(jsonb_build_object('id',id,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types) order by id) from storage.buckets), '[]'::jsonb),
  'migrations', coalesce((select jsonb_agg(version order by version) from supabase_migrations.schema_migrations), '[]'::jsonb)
)::text;`;
  return JSON.parse(psql(databaseUrl, sql));
}

export function assertCurrentSchema(inventory) {
  const tables = new Map(inventory.tables.map((item) => [item.name, item]));
  const columns = new Set(inventory.columns.map((item) => `${item.table}.${item.name}`));
  const indexes = new Map(inventory.indexes.map((item) => [item.name, item]));
  const constraints = new Map(inventory.constraints.map((item) => [item.name, item]));
  const functions = new Set(inventory.functions.map((item) => item.name));
  const requiredTables = [
    "clients","projects","commercial_payment_records","commercial_approvals","workspace_roles","workspace_memberships",
    "build_sites","build_work_packages","build_activity_templates","build_work_plans","build_runtime_activities",
    "build_runtime_activity_events","build_runtime_evidence_uploads","build_runtime_evidence","build_runtime_inspections",
    "build_runtime_exceptions","build_notification_rules","build_recipient_notifications",
  ];
  for (const table of requiredTables) if (!tables.has(table)) throw new Error(`required_table_missing:${table}`);
  for (const table of requiredTables.filter((name) => name.startsWith("build_"))) {
    if (!tables.get(table)?.rls) throw new Error(`build_rls_missing:${table}`);
  }
  for (const column of [
    "build_runtime_evidence.mobile_operation_id","build_runtime_evidence.device_captured_at",
    "build_runtime_evidence.device_timezone_offset_minutes","build_runtime_evidence.gps_accuracy_metres",
    "build_runtime_evidence.gps_captured_at","build_runtime_evidence.gps_source",
    "build_runtime_evidence.location_status","build_runtime_evidence_uploads.mobile_operation_id",
  ]) if (!columns.has(column)) throw new Error(`required_column_missing:${column}`);
  for (const index of ["build_runtime_evidence_mobile_operation_uidx","build_runtime_evidence_uploads_active_mobile_operation_uidx"])
    if (!indexes.has(index) || !/CREATE UNIQUE INDEX/i.test(indexes.get(index).definition)) throw new Error(`idempotency_index_invalid:${index}`);
  const expectedConstraints = new Map([
    ["build_runtime_evidence_device_timezone_check", { pattern: /-840.*840/i }],
    ["build_runtime_evidence_gps_accuracy_check", { pattern: />= 0.*<= 100000/i }],
    ["build_runtime_evidence_gps_source_check", { pattern: /device_geolocation.*unavailable/i }],
    ["build_runtime_evidence_location_status_check", { pattern: /granted.*denied.*prompt.*unavailable.*error/i }],
    ["build_sites_project_client_fkey", { pattern: /FOREIGN KEY \(project_id, client_id\).*projects\(id, client_id\)/i, legacyNotValid: true }],
    ["build_work_packages_site_project_client_fkey", { pattern: /FOREIGN KEY \(site_id, project_id, client_id\).*build_sites\(id, project_id, client_id\)/i, legacyNotValid: true }],
  ]);
  for (const [name, expectation] of expectedConstraints) {
    const constraint = constraints.get(name);
    if (!constraint) throw new Error(`required_constraint_missing:${name}`);
    if (!expectation.pattern.test(constraint.definition)) throw new Error(`required_constraint_invalid:${name}`);
    if (!expectation.legacyNotValid && !constraint.validated) throw new Error(`required_constraint_unvalidated:${name}`);
  }
  for (const rpc of [
    "create_build_work_plan","apply_build_runtime_activity_action","apply_build_runtime_checklist_result",
    "record_build_runtime_evidence","submit_build_runtime_activity_for_review","record_build_runtime_inspection",
    "create_build_runtime_exception","apply_build_runtime_exception_action","baseline_build_work_plan_schedule",
    "reconcile_build_notifications","configure_build_notification_settings","ensure_canonical_supervisor_role",
  ]) if (!functions.has(rpc)) throw new Error(`required_rpc_missing:${rpc}`);
  const protectedRpcs = new Set([
    "create_build_work_plan","apply_build_runtime_activity_action","apply_build_runtime_checklist_result",
    "record_build_runtime_evidence","submit_build_runtime_activity_for_review","record_build_runtime_inspection",
    "create_build_runtime_exception","apply_build_runtime_exception_action","baseline_build_work_plan_schedule",
    "reconcile_build_notifications","configure_build_notification_settings","ensure_canonical_supervisor_role",
  ]);
  for (const grant of inventory.routine_grants) {
    if (protectedRpcs.has(grant.name) && ["PUBLIC","anon","authenticated"].includes(grant.grantee) && grant.privilege === "EXECUTE")
      throw new Error(`unsafe_rpc_grant:${grant.name}:${grant.grantee}`);
  }
  for (const rpc of protectedRpcs) {
    if (!inventory.routine_grants.some((grant) => grant.name === rpc && grant.grantee === "service_role" && grant.privilege === "EXECUTE"))
      throw new Error(`service_role_rpc_grant_missing:${rpc}`);
  }
  for (const grant of inventory.table_grants) {
    if (grant.table.startsWith("build_") && ["PUBLIC","anon"].includes(grant.grantee))
      throw new Error(`unsafe_build_table_grant:${grant.table}:${grant.grantee}`);
  }
  const authenticatedBuildGrants = inventory.table_grants.filter((grant) => grant.table.startsWith("build_") && grant.grantee === "authenticated");
  for (const grant of authenticatedBuildGrants) {
    if (!(grant.table === "build_recipient_notifications" && grant.privilege === "SELECT"))
      throw new Error(`unexpected_authenticated_build_grant:${grant.table}:${grant.privilege}`);
  }
  const hasGrant = (table, grantee, privilege) => inventory.table_grants.some((grant) => grant.table === table && grant.grantee === grantee && grant.privilege === privilege);
  for (const table of ["user_roles", "user_profiles", "clients"]) {
    if (!tables.get(table)?.rls) throw new Error(`session_table_rls_missing:${table}`);
    if (!hasGrant(table, "authenticated", "SELECT")) throw new Error(`authenticated_session_select_missing:${table}`);
    if (inventory.table_grants.some((grant) => grant.table === table && grant.grantee === "authenticated" && grant.privilege !== "SELECT"))
      throw new Error(`authenticated_session_grant_excessive:${table}`);
    if (inventory.table_grants.some((grant) => grant.table === table && ["anon", "PUBLIC"].includes(grant.grantee)))
      throw new Error(`anonymous_session_table_grant:${table}`);
  }
  for (const table of ["user_roles", "user_profiles", "clients", "onboarding_drafts", "workspace_memberships", "workspace_roles", "workspace_role_permissions", "workspace_statuses", "projects"]) {
    if (!hasGrant(table, "service_role", "SELECT")) throw new Error(`service_session_select_missing:${table}`);
  }
  const evidenceBucket = inventory.buckets.find((bucket) => bucket.id === "build-runtime-evidence");
  if (!evidenceBucket || evidenceBucket.public !== false || Number(evidenceBucket.file_size_limit) !== 52428800)
    throw new Error("build_evidence_bucket_invalid");
  const unsafeStoragePolicy = inventory.policies.find((policy) => policy.schema === "storage" && /build-runtime-evidence/i.test(`${policy.using ?? ""} ${policy.check ?? ""}`) && policy.roles?.some((role) => ["anon","authenticated","public"].includes(role.toLowerCase())));
  if (unsafeStoragePolicy) throw new Error(`unsafe_build_storage_policy:${unsafeStoragePolicy.name}`);
  if (inventory.migrations[0] !== representedMigrationVersions(resolve(import.meta.dirname, "../..")).at(0))
    throw new Error("migration_history_start_invalid");
  if (!inventory.migrations.includes(E1B_MIGRATION)) throw new Error("e1b_migration_not_applied");
  if (!inventory.migrations.includes(AUTHORIZATION_REPAIR_MIGRATION)) throw new Error("authorization_repair_migration_not_applied");
  if (!inventory.migrations.includes(E1C_FIELD_COORDINATOR_MIGRATION)) throw new Error("e1c_field_coordinator_migration_not_applied");
  if (inventory.migrations.at(-1) !== E1C_WORKSPACE_STATUS_PRIVILEGE_MIGRATION) throw new Error("e1c_workspace_status_privilege_migration_not_applied");
}

export function assertCanonicalLocalData(databaseUrl) {
  const counts = JSON.parse(psql(databaseUrl, `select jsonb_build_object(
    'clients',(select count(*) from public.clients),
    'projects',(select count(*) from public.projects),
    'drafts',(select count(*) from public.onboarding_drafts),
    'jobs',(select count(*) from public.provisioning_jobs),
    'stages',(select count(*) from public.deployment_stages),
    'retail_templates',(select count(*) from public.commercial_pricing_templates where id='6f6a0db0-0f4d-4f95-b66c-79f70ce48b60'),
    'retail_tiers',(select count(*) from public.commercial_pricing_tiers where pricing_template_id='6f6a0db0-0f4d-4f95-b66c-79f70ce48b60')
  )::text;`));
  for (const key of ["clients","projects","drafts","jobs"]) {
    if (Number(counts[key]) !== 0) throw new Error(`unexpected_fixture_rows:${key}`);
  }
  if (Number(counts.stages) !== 5 || Number(counts.retail_templates) !== 1 || Number(counts.retail_tiers) !== 5)
    throw new Error("canonical_reference_data_invalid");
}

export function assertTenantIsolationEnforced(databaseUrl) {
  psql(databaseUrl, String.raw`
begin;
insert into public.clients(id,name) values
  ('71000000-0000-4000-8000-000000000001','Disposable Tenant A'),
  ('71000000-0000-4000-8000-000000000002','Disposable Tenant B');
insert into public.projects(id,client_id,project_name,project_type)
values('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','Disposable Build Project','Construction');
do $block$
declare rejected boolean := false;
begin
  begin
    insert into public.build_sites(id,client_id,project_id,site_code,name)
    values('73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000001','X-TENANT','Forbidden Site');
  exception when others then
    rejected := true;
  end;
  if not rejected then raise exception 'tenant_isolation_probe_failed'; end if;
end
$block$;
rollback;`);
  const residue = Number(psql(databaseUrl, "select count(*) from public.clients where id in ('71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002');"));
  if (residue !== 0) throw new Error("tenant_isolation_probe_residue");
}

export function fingerprintInventory(inventory) {
  return createHash("sha256").update(JSON.stringify(inventory)).digest("hex");
}

export function baselineDigest(root) {
  return createHash("sha256")
    .update(readFileSync(resolve(root, "supabase/baselines/20260816020000_pre_core2a.sql")))
    .digest("hex");
}

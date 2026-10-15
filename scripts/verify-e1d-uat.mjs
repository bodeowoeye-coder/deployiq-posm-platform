import { assertE1DUatApplicationEnvironment, assertSafeSupabaseTarget } from "./lib/assert-safe-supabase-target.mjs";
import { assertCurrentSchema, fingerprintInventory, normalizedInventory, psql } from "./lib/local-baseline-recovery.mjs";

const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
if (!databaseUrl) throw new Error("supabase_db_url_missing");
assertE1DUatApplicationEnvironment(process.env);
const target = assertSafeSupabaseTarget({ operationClass: "read-only E1D UAT verification", databaseUrl });
if (target.environment !== "uat" || target.projectRef === "local") throw new Error("e1d_remote_uat_target_required");

const inventory = normalizedInventory(databaseUrl);
assertCurrentSchema(inventory);

const fixture = JSON.parse(psql(databaseUrl, `select jsonb_build_object(
  'synthetic_clients',(select count(*) from public.clients where id in ('e1c00000-0000-4000-8000-000000000001','e1c00000-0000-4000-8000-000000000002')),
  'synthetic_projects',(select count(*) from public.projects where id in ('e1c10000-0000-4000-8000-000000000001','e1c10000-0000-4000-8000-000000000002')),
  'sites',(select count(*) from public.build_sites where client_id='e1c00000-0000-4000-8000-000000000001'),
  'work_packages',(select count(*) from public.build_work_packages where client_id='e1c00000-0000-4000-8000-000000000001'),
  'activity_templates',(select count(*) from public.build_activity_templates where template_id='e1c30000-0000-4000-8000-000000000001'),
  'synthetic_auth_users',(select count(*) from auth.users where email like '%@e1c.deployiq.test'),
  'memberships',(select count(*) from public.workspace_memberships where client_id in ('e1c00000-0000-4000-8000-000000000001','e1c00000-0000-4000-8000-000000000002')),
  'duplicate_evidence_operations',(select count(*) from (
    select client_id,uploaded_by,mobile_operation_id from public.build_runtime_evidence
    where mobile_operation_id is not null group by client_id,uploaded_by,mobile_operation_id having count(*) > 1
  ) duplicates),
  'invalid_evidence_ancestry',(select count(*) from public.build_runtime_evidence evidence
    join public.build_runtime_activities activity on activity.id=evidence.runtime_activity_id
    where evidence.client_id is distinct from activity.client_id
       or evidence.project_id is distinct from activity.project_id
       or evidence.site_id is distinct from activity.site_id
       or evidence.work_package_id is distinct from activity.work_package_id)
)::text;`));

const expected = { synthetic_clients: 2, synthetic_projects: 2, sites: 1, work_packages: 4, activity_templates: 7, synthetic_auth_users: 10, memberships: 9 };
for (const [key, value] of Object.entries(expected)) if (Number(fixture[key]) !== value) throw new Error(`e1d_fixture_count_invalid:${key}`);
if (Number(fixture.duplicate_evidence_operations) !== 0) throw new Error("e1d_duplicate_evidence_operations_detected");
if (Number(fixture.invalid_evidence_ancestry) !== 0) throw new Error("e1d_invalid_evidence_ancestry_detected");

console.log(`E1D UAT project reference: ${target.projectRef}`);
console.log(`Schema fingerprint: ${fingerprintInventory(inventory)}`);
console.log("E1D UAT read-only verification passed.");

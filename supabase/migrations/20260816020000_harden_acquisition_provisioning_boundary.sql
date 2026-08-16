-- Bind each provisioned client to its immutable acquisition draft. Display
-- names are intentionally not tenant identity keys.
alter table public.clients
  add column if not exists acquisition_draft_id uuid references public.onboarding_drafts(id) on delete restrict;

-- Preserve identity for partially or fully provisioned workspaces created
-- before this immutable binding existed. Malformed legacy JSON is ignored,
-- and only a client with one unambiguous acquisition draft is linked.
with unambiguous_acquisition_clients as (
  select
    (job.result_data->>'organisationId')::uuid as client_id,
    (array_agg(distinct job.acquisition_draft_id))[1] as acquisition_draft_id
  from public.provisioning_jobs job
  where coalesce(job.result_data->>'organisationId', '')
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  group by (job.result_data->>'organisationId')::uuid
  having count(distinct job.acquisition_draft_id) = 1
)
update public.clients client
   set acquisition_draft_id = link.acquisition_draft_id
  from unambiguous_acquisition_clients link
 where client.id = link.client_id
   and client.acquisition_draft_id is null
   and not exists (
     select 1
       from public.clients claimed
      where claimed.acquisition_draft_id = link.acquisition_draft_id
   );

create unique index if not exists clients_acquisition_draft_id_uidx
  on public.clients (acquisition_draft_id)
  where acquisition_draft_id is not null;

-- A narrow database-backed lease prevents concurrent requests from executing
-- one acquisition job. A failed job remains eligible for an intentional retry.
alter table public.provisioning_jobs
  add column if not exists execution_lock_token uuid,
  add column if not exists execution_locked_at timestamptz;

create or replace function public.claim_acquisition_provisioning_job(p_job_id uuid, p_lock_token uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.provisioning_jobs
     set execution_lock_token = p_lock_token,
         execution_locked_at = now(),
         status = 'running',
         updated_at = now()
   where id = p_job_id
     and (
       status in ('queued', 'failed')
       or execution_locked_at < now() - interval '5 minutes'
     )
  returning true;
$$;

revoke all on function public.claim_acquisition_provisioning_job(uuid, uuid) from public;
revoke all on function public.claim_acquisition_provisioning_job(uuid, uuid) from anon;
revoke all on function public.claim_acquisition_provisioning_job(uuid, uuid) from authenticated;
grant execute on function public.claim_acquisition_provisioning_job(uuid, uuid) to service_role;

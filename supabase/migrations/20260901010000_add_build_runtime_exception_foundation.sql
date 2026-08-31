-- S3A-9B: durable Build runtime Exceptions and controlled corrective actions.

create table public.build_runtime_exceptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid not null references public.build_sites(id) on delete cascade,
  work_package_id uuid not null references public.build_work_packages(id) on delete cascade,
  work_plan_id uuid not null references public.build_work_plans(id) on delete cascade,
  runtime_activity_id uuid not null references public.build_runtime_activities(id) on delete cascade,
  runtime_inspection_id uuid not null references public.build_runtime_inspections(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null check (char_length(btrim(description)) between 1 and 4000),
  severity text not null check (severity in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','in_remediation','resolved','verified')),
  exception_owner_user_id uuid not null references auth.users(id) on delete restrict,
  due_at timestamptz,
  raised_by_user_id uuid not null references auth.users(id) on delete restrict,
  raised_at timestamptz not null default now(),
  remediation_started_by_user_id uuid references auth.users(id) on delete restrict,
  remediation_started_at timestamptz,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 4000),
  resolved_by_user_id uuid references auth.users(id) on delete restrict,
  resolved_at timestamptz,
  verified_by_user_id uuid references auth.users(id) on delete restrict,
  verified_at timestamptz,
  verification_note text check (verification_note is null or char_length(verification_note) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index build_runtime_exceptions_activity_idx on public.build_runtime_exceptions(runtime_activity_id,status,raised_at,id);
create index build_runtime_exceptions_inspection_idx on public.build_runtime_exceptions(runtime_inspection_id,raised_at,id);
create index build_runtime_exceptions_owner_idx on public.build_runtime_exceptions(client_id,exception_owner_user_id,status);
create unique index build_runtime_exceptions_submission_uidx
  on public.build_runtime_exceptions(runtime_inspection_id,lower(title),exception_owner_user_id);

alter table public.build_runtime_evidence_uploads
  add column runtime_exception_id uuid references public.build_runtime_exceptions(id) on delete restrict;
alter table public.build_runtime_evidence
  add column runtime_exception_id uuid references public.build_runtime_exceptions(id) on delete restrict;
create index build_runtime_evidence_exception_idx on public.build_runtime_evidence(runtime_exception_id,created_at)
  where archived_at is null and runtime_exception_id is not null;

alter table public.build_runtime_activity_events drop constraint if exists build_runtime_activity_events_event_type_check;
alter table public.build_runtime_activity_events add constraint build_runtime_activity_events_event_type_check check (event_type in (
  'responsibility_assigned','started','completed','blocked','resumed','checklist_passed','checklist_failed',
  'checklist_not_applicable','evidence_added','submitted_for_review','inspection_accepted','changes_required',
  'corrective_work_resumed','exception_created','exception_remediation_started','exception_resolved','exception_verified'
));

create function public.assert_build_exception_member(p_client_id uuid,p_user_id uuid,p_roles text[] default null)
returns text language plpgsql security definer set search_path=pg_catalog as $$
declare v_role text;
begin
  select membership.role_key into v_role from public.workspace_memberships membership
  left join public.workspace_roles role on role.id=membership.role_id and role.client_id=membership.client_id
  where membership.client_id=p_client_id and membership.user_id=p_user_id and membership.status='active'
    and (membership.role_id is null or role.status='active');
  if v_role is null or (p_roles is not null and not (v_role=any(p_roles))) then
    raise exception 'BUILD_EXCEPTION_MEMBER_INELIGIBLE';
  end if;
  return v_role;
end; $$;

create function public.validate_build_runtime_exception_ancestry()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if not exists (
    select 1 from public.build_runtime_inspections inspection
    join public.build_runtime_activities activity on activity.id=inspection.runtime_activity_id
    join public.build_work_plans plan on plan.id=activity.work_plan_id and plan.client_id=activity.client_id
    join public.projects project on project.id=activity.project_id and project.client_id=activity.client_id
    where inspection.id=new.runtime_inspection_id and inspection.runtime_activity_id=new.runtime_activity_id
      and activity.client_id=new.client_id and activity.project_id=new.project_id and activity.site_id=new.site_id
      and activity.work_package_id=new.work_package_id and activity.work_plan_id=new.work_plan_id
      and activity.archived_at is null and plan.archived_at is null and project.archived_at is null
      and project.project_type in ('Construction','Real Estate','Facility Management')
  ) then raise exception 'BUILD_EXCEPTION_INSPECTION_ANCESTRY_INVALID'; end if;
  perform public.assert_build_exception_member(new.client_id,new.exception_owner_user_id,null);
  return new;
end; $$;
create trigger trg_build_runtime_exceptions_ancestry before insert or update on public.build_runtime_exceptions
for each row execute function public.validate_build_runtime_exception_ancestry();

create function public.guard_build_runtime_exception_mutation()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if tg_op='DELETE' then raise exception 'BUILD_RUNTIME_EXCEPTION_DELETE_DENIED'; end if;
  if new.client_id is distinct from old.client_id or new.project_id is distinct from old.project_id
    or new.site_id is distinct from old.site_id or new.work_package_id is distinct from old.work_package_id
    or new.work_plan_id is distinct from old.work_plan_id or new.runtime_activity_id is distinct from old.runtime_activity_id
    or new.runtime_inspection_id is distinct from old.runtime_inspection_id
    or new.raised_by_user_id is distinct from old.raised_by_user_id or new.raised_at is distinct from old.raised_at
    or new.title is distinct from old.title or new.description is distinct from old.description
    or new.severity is distinct from old.severity or new.exception_owner_user_id is distinct from old.exception_owner_user_id
    or new.due_at is distinct from old.due_at or new.created_at is distinct from old.created_at
    then raise exception 'BUILD_RUNTIME_EXCEPTION_IDENTITY_IMMUTABLE'; end if;
  return new;
end; $$;
create trigger trg_build_runtime_exceptions_guard before update or delete on public.build_runtime_exceptions
for each row execute function public.guard_build_runtime_exception_mutation();

create function public.create_build_runtime_exception(p_runtime_activity_id uuid,p_runtime_inspection_id uuid,
  p_title text,p_description text,p_severity text,p_exception_owner_user_id uuid,p_due_at timestamptz,p_actor_user_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_activity public.build_runtime_activities%rowtype; v_id uuid; v_role text; v_now timestamptz:=now();
begin
  select activity.* into v_activity from public.build_runtime_activities activity
  join public.build_work_plans plan on plan.id=activity.work_plan_id and plan.client_id=activity.client_id
  join public.projects project on project.id=activity.project_id and project.client_id=activity.client_id
  where activity.id=p_runtime_activity_id and activity.archived_at is null and plan.archived_at is null
    and project.archived_at is null and project.project_type in ('Construction','Real Estate','Facility Management') for update of activity;
  if v_activity.id is null then raise exception 'BUILD_RUNTIME_ACTIVITY_UNAVAILABLE'; end if;
  v_role:=public.assert_build_exception_member(v_activity.client_id,p_actor_user_id,array['customer_admin','workspace_manager','project_manager','supervisor']);
  perform public.assert_build_exception_member(v_activity.client_id,p_exception_owner_user_id,null);
  if not exists(select 1 from public.build_runtime_inspections i where i.id=p_runtime_inspection_id and i.runtime_activity_id=v_activity.id)
    then raise exception 'BUILD_EXCEPTION_INSPECTION_ANCESTRY_INVALID'; end if;
  if nullif(btrim(p_title),'') is null or char_length(p_title)>200 then raise exception 'BUILD_EXCEPTION_TITLE_INVALID'; end if;
  if nullif(btrim(p_description),'') is null or char_length(p_description)>4000 then raise exception 'BUILD_EXCEPTION_DESCRIPTION_INVALID'; end if;
  if p_severity not in ('low','medium','high','critical') then raise exception 'BUILD_EXCEPTION_SEVERITY_INVALID'; end if;
  if p_due_at is not null and p_due_at<=v_now then raise exception 'BUILD_EXCEPTION_DUE_AT_INVALID'; end if;
  insert into public.build_runtime_exceptions(client_id,project_id,site_id,work_package_id,work_plan_id,runtime_activity_id,
    runtime_inspection_id,title,description,severity,exception_owner_user_id,due_at,raised_by_user_id,raised_at)
  values(v_activity.client_id,v_activity.project_id,v_activity.site_id,v_activity.work_package_id,v_activity.work_plan_id,v_activity.id,
    p_runtime_inspection_id,btrim(p_title),btrim(p_description),p_severity,p_exception_owner_user_id,p_due_at,p_actor_user_id,v_now)
  returning id into v_id;
  insert into public.build_runtime_activity_events(client_id,project_id,site_id,work_package_id,work_plan_id,runtime_activity_id,
    event_type,previous_status,resulting_status,actor_user_id,note,event_context,occurred_at)
  values(v_activity.client_id,v_activity.project_id,v_activity.site_id,v_activity.work_package_id,v_activity.work_plan_id,v_activity.id,
    'exception_created',v_activity.status,v_activity.status,p_actor_user_id,btrim(p_title),
    jsonb_build_object('exception_id',v_id,'inspection_id',p_runtime_inspection_id,'severity',p_severity,'owner_user_id',p_exception_owner_user_id),v_now);
  return v_id;
end; $$;

create function public.apply_build_runtime_exception_action(p_runtime_exception_id uuid,p_action text,p_actor_user_id uuid,
  p_note text default null) returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_exception public.build_runtime_exceptions%rowtype; v_activity public.build_runtime_activities%rowtype;
  v_role text; v_now timestamptz:=now(); v_next text; v_event text;
begin
  select * into v_exception from public.build_runtime_exceptions where id=p_runtime_exception_id for update;
  if v_exception.id is null then raise exception 'BUILD_RUNTIME_EXCEPTION_UNAVAILABLE'; end if;
  select * into v_activity from public.build_runtime_activities where id=v_exception.runtime_activity_id and archived_at is null;
  if v_activity.id is null then raise exception 'BUILD_RUNTIME_ACTIVITY_UNAVAILABLE'; end if;
  v_role:=public.assert_build_exception_member(v_exception.client_id,p_actor_user_id,null);
  if p_action='start_remediation' then
    if v_exception.status<>'open' then raise exception 'BUILD_EXCEPTION_STALE_STATE'; end if;
    if p_actor_user_id<>v_exception.exception_owner_user_id and v_role not in ('customer_admin','workspace_manager','project_manager')
      then raise exception 'BUILD_EXCEPTION_REMEDIATION_FORBIDDEN'; end if;
    v_next:='in_remediation'; v_event:='exception_remediation_started';
    update public.build_runtime_exceptions set status=v_next,remediation_started_by_user_id=p_actor_user_id,
      remediation_started_at=v_now,updated_at=v_now where id=v_exception.id;
  elsif p_action='resolve' then
    if v_exception.status<>'in_remediation' then raise exception 'BUILD_EXCEPTION_STALE_STATE'; end if;
    if p_actor_user_id<>v_exception.exception_owner_user_id and v_role not in ('customer_admin','workspace_manager','project_manager')
      then raise exception 'BUILD_EXCEPTION_RESOLUTION_FORBIDDEN'; end if;
    if nullif(btrim(p_note),'') is null or char_length(p_note)>4000 then raise exception 'BUILD_EXCEPTION_RESOLUTION_NOTE_REQUIRED'; end if;
    v_next:='resolved'; v_event:='exception_resolved';
    update public.build_runtime_exceptions set status=v_next,resolution_note=btrim(p_note),resolved_by_user_id=p_actor_user_id,
      resolved_at=v_now,updated_at=v_now where id=v_exception.id;
  elsif p_action='verify' then
    if v_exception.status<>'resolved' then raise exception 'BUILD_EXCEPTION_STALE_STATE'; end if;
    if p_actor_user_id=v_exception.exception_owner_user_id then raise exception 'BUILD_EXCEPTION_INDEPENDENT_VERIFIER_REQUIRED'; end if;
    if v_role not in ('customer_admin','workspace_manager','project_manager','supervisor')
      then raise exception 'BUILD_EXCEPTION_VERIFICATION_FORBIDDEN'; end if;
    if char_length(coalesce(p_note,''))>4000 then raise exception 'BUILD_EXCEPTION_VERIFICATION_NOTE_TOO_LONG'; end if;
    v_next:='verified'; v_event:='exception_verified';
    update public.build_runtime_exceptions set status=v_next,verification_note=nullif(btrim(p_note),''),
      verified_by_user_id=p_actor_user_id,verified_at=v_now,updated_at=v_now where id=v_exception.id;
  else raise exception 'BUILD_EXCEPTION_ACTION_INVALID'; end if;
  insert into public.build_runtime_activity_events(client_id,project_id,site_id,work_package_id,work_plan_id,runtime_activity_id,
    event_type,previous_status,resulting_status,actor_user_id,note,event_context,occurred_at)
  values(v_exception.client_id,v_exception.project_id,v_exception.site_id,v_exception.work_package_id,v_exception.work_plan_id,
    v_exception.runtime_activity_id,v_event,v_activity.status,v_activity.status,p_actor_user_id,nullif(btrim(p_note),''),
    jsonb_build_object('exception_id',v_exception.id,'exception_status',v_next),v_now);
  return v_exception.id;
end; $$;

-- Existing evidence remains authoritative; this validator adds an optional exact Exception association.
create or replace function public.validate_build_runtime_evidence_ancestry()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if not exists(select 1 from public.build_runtime_activities activity join public.build_work_plans plan on plan.id=activity.work_plan_id
    join public.projects project on project.id=activity.project_id and project.client_id=activity.client_id
    where activity.id=new.runtime_activity_id and activity.work_plan_id=new.work_plan_id and activity.client_id=new.client_id
      and activity.project_id=new.project_id and activity.site_id=new.site_id and activity.work_package_id=new.work_package_id
      and activity.archived_at is null and plan.archived_at is null and project.archived_at is null
      and project.project_type in ('Construction','Real Estate','Facility Management')
      and (new.runtime_checklist_item_id is null or exists(select 1 from public.build_runtime_checklist_items c where c.id=new.runtime_checklist_item_id
        and c.work_plan_id=activity.work_plan_id and c.runtime_activity_id=activity.id and c.archived_at is null))
      and (new.runtime_exception_id is null or exists(select 1 from public.build_runtime_exceptions e where e.id=new.runtime_exception_id
        and e.runtime_activity_id=activity.id and e.client_id=activity.client_id)))
    then raise exception 'BUILD_RUNTIME_EVIDENCE_ANCESTRY_INVALID'; end if;
  return new;
end; $$;

create function public.record_build_runtime_exception_evidence(p_runtime_exception_id uuid,p_upload_authorization_id uuid,
  p_evidence_type text,p_actor_user_id uuid,p_description text default null,p_note text default null,
  p_latitude double precision default null,p_longitude double precision default null)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_exception public.build_runtime_exceptions%rowtype; v_activity public.build_runtime_activities%rowtype;
  v_upload public.build_runtime_evidence_uploads%rowtype; v_role text; v_id uuid; v_now timestamptz:=now();
begin
  select * into v_exception from public.build_runtime_exceptions where id=p_runtime_exception_id for update;
  if v_exception.id is null or v_exception.status<>'in_remediation' then raise exception 'BUILD_EXCEPTION_EVIDENCE_STATE_INVALID'; end if;
  select * into v_activity from public.build_runtime_activities where id=v_exception.runtime_activity_id and archived_at is null;
  if v_activity.id is null then raise exception 'BUILD_RUNTIME_ACTIVITY_UNAVAILABLE'; end if;
  v_role:=public.assert_build_exception_member(v_exception.client_id,p_actor_user_id,null);
  if p_actor_user_id<>v_exception.exception_owner_user_id and v_role not in ('customer_admin','workspace_manager','project_manager')
    then raise exception 'BUILD_EXCEPTION_EVIDENCE_FORBIDDEN'; end if;
  if p_evidence_type='note' then
    if p_upload_authorization_id is not null or nullif(btrim(p_note),'') is null or char_length(p_note)>4000
      then raise exception 'BUILD_EVIDENCE_NOTE_INVALID'; end if;
    insert into public.build_runtime_evidence(client_id,project_id,site_id,work_package_id,work_plan_id,runtime_activity_id,
      runtime_exception_id,evidence_type,note,description,latitude,longitude,uploaded_by)
    values(v_exception.client_id,v_exception.project_id,v_exception.site_id,v_exception.work_package_id,v_exception.work_plan_id,
      v_exception.runtime_activity_id,v_exception.id,'note',btrim(p_note),nullif(btrim(p_description),''),p_latitude,p_longitude,p_actor_user_id)
    returning id into v_id;
  else
    select * into v_upload from public.build_runtime_evidence_uploads where id=p_upload_authorization_id
      and runtime_activity_id=v_exception.runtime_activity_id and runtime_exception_id=v_exception.id
      and runtime_checklist_item_id is null and evidence_type=p_evidence_type and authorized_by=p_actor_user_id
      and finalized_at is null and rejected_at is null and expires_at>v_now for update;
    if v_upload.id is null then raise exception 'BUILD_EVIDENCE_UPLOAD_AUTHORIZATION_INVALID'; end if;
    insert into public.build_runtime_evidence(client_id,project_id,site_id,work_package_id,work_plan_id,runtime_activity_id,
      runtime_exception_id,upload_authorization_id,evidence_type,storage_bucket,storage_path,original_filename,mime_type,
      file_size_bytes,description,latitude,longitude,uploaded_by)
    values(v_exception.client_id,v_exception.project_id,v_exception.site_id,v_exception.work_package_id,v_exception.work_plan_id,
      v_exception.runtime_activity_id,v_exception.id,v_upload.id,v_upload.evidence_type,v_upload.storage_bucket,v_upload.storage_path,
      v_upload.original_filename,v_upload.expected_mime_type,v_upload.expected_file_size_bytes,nullif(btrim(p_description),''),
      p_latitude,p_longitude,p_actor_user_id) returning id into v_id;
    update public.build_runtime_evidence_uploads set finalized_at=v_now where id=v_upload.id;
  end if;
  insert into public.build_runtime_activity_events(client_id,project_id,site_id,work_package_id,work_plan_id,runtime_activity_id,
    runtime_evidence_id,event_type,previous_status,resulting_status,actor_user_id,note,event_context,occurred_at)
  values(v_exception.client_id,v_exception.project_id,v_exception.site_id,v_exception.work_package_id,v_exception.work_plan_id,
    v_exception.runtime_activity_id,v_id,'evidence_added',v_activity.status,v_activity.status,p_actor_user_id,
    nullif(btrim(p_description),''),jsonb_build_object('evidence_type',p_evidence_type,'exception_id',v_exception.id),v_now);
  return v_id;
end; $$;

alter table public.build_runtime_exceptions enable row level security;
revoke all on table public.build_runtime_exceptions from public,anon,authenticated,service_role;
grant select on table public.build_runtime_exceptions to service_role;
revoke all on function public.assert_build_exception_member(uuid,uuid,text[]) from public,anon,authenticated,service_role;
revoke all on function public.validate_build_runtime_exception_ancestry() from public,anon,authenticated,service_role;
revoke all on function public.guard_build_runtime_exception_mutation() from public,anon,authenticated,service_role;
revoke all on function public.create_build_runtime_exception(uuid,uuid,text,text,text,uuid,timestamptz,uuid) from public,anon,authenticated,service_role;
revoke all on function public.apply_build_runtime_exception_action(uuid,text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.record_build_runtime_exception_evidence(uuid,uuid,text,uuid,text,text,double precision,double precision) from public,anon,authenticated,service_role;
grant execute on function public.create_build_runtime_exception(uuid,uuid,text,text,text,uuid,timestamptz,uuid) to service_role;
grant execute on function public.apply_build_runtime_exception_action(uuid,text,uuid,text) to service_role;
grant execute on function public.record_build_runtime_exception_evidence(uuid,uuid,text,uuid,text,text,double precision,double precision) to service_role;

comment on table public.build_runtime_exceptions is 'Controlled S3A-9B corrective issues raised from canonical Build inspections.';

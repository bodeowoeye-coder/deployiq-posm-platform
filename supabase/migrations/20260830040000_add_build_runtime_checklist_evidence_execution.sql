-- S3A-8: controlled Build runtime Checklist and Evidence execution.

do $$
begin
  if exists (
    select 1 from public.build_runtime_checklist_items
    where status not in ('not_started')
  ) then
    raise exception 'BUILD_CHECKLIST_LEGACY_STATE_REVIEW_REQUIRED';
  end if;
end;
$$;

alter table public.build_runtime_checklist_items
  drop constraint if exists build_runtime_checklist_items_status_check;

update public.build_runtime_checklist_items set status = 'pending' where status = 'not_started';

alter table public.build_runtime_checklist_items
  add column result_note text,
  add column resolved_by uuid references auth.users(id) on delete set null,
  add column resolved_at timestamptz,
  add column updated_at timestamptz not null default now(),
  add constraint build_runtime_checklist_items_status_check
    check (status in ('pending', 'passed', 'failed', 'not_applicable')),
  add constraint build_runtime_checklist_items_resolution_check check (
    (status = 'pending' and resolved_by is null and resolved_at is null)
    or
    (status <> 'pending' and resolved_by is not null and resolved_at is not null)
  ),
  add constraint build_runtime_checklist_items_reason_check check (
    status not in ('failed', 'not_applicable') or nullif(btrim(result_note), '') is not null
  ),
  add constraint build_runtime_checklist_items_note_length_check
    check (result_note is null or char_length(result_note) <= 2000);

alter table public.build_runtime_checklist_items alter column status set default 'pending';

create table public.build_runtime_evidence_uploads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid not null references public.build_sites(id) on delete cascade,
  work_package_id uuid not null references public.build_work_packages(id) on delete cascade,
  work_plan_id uuid not null references public.build_work_plans(id) on delete cascade,
  runtime_activity_id uuid not null references public.build_runtime_activities(id) on delete cascade,
  runtime_checklist_item_id uuid references public.build_runtime_checklist_items(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('photo', 'video', 'document')),
  storage_bucket text not null check (storage_bucket = 'build-runtime-evidence'),
  storage_path text not null unique,
  original_filename text not null,
  expected_mime_type text not null,
  expected_file_size_bytes bigint not null check (expected_file_size_bytes > 0),
  authorized_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  finalized_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  check (finalized_at is null or rejected_at is null),
  check (char_length(original_filename) between 1 and 240),
  check (
    (evidence_type = 'photo' and expected_mime_type in ('image/jpeg','image/png','image/webp') and expected_file_size_bytes <= 10485760)
    or (evidence_type = 'video' and expected_mime_type in ('video/mp4','video/quicktime','video/webm') and expected_file_size_bytes <= 52428800)
    or (evidence_type = 'document' and expected_mime_type in (
      'application/pdf','text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) and expected_file_size_bytes <= 20971520)
  )
);

create index build_runtime_evidence_uploads_expiry_idx
  on public.build_runtime_evidence_uploads(expires_at)
  where finalized_at is null and rejected_at is null;
create index build_runtime_evidence_uploads_activity_idx
  on public.build_runtime_evidence_uploads(runtime_activity_id, created_at);

create table public.build_runtime_evidence (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid not null references public.build_sites(id) on delete cascade,
  work_package_id uuid not null references public.build_work_packages(id) on delete cascade,
  work_plan_id uuid not null references public.build_work_plans(id) on delete cascade,
  runtime_activity_id uuid not null references public.build_runtime_activities(id) on delete cascade,
  runtime_checklist_item_id uuid references public.build_runtime_checklist_items(id) on delete restrict,
  upload_authorization_id uuid unique references public.build_runtime_evidence_uploads(id) on delete restrict,
  evidence_type text not null check (evidence_type in ('photo', 'video', 'document', 'note')),
  storage_bucket text,
  storage_path text unique,
  original_filename text,
  mime_type text,
  file_size_bytes bigint,
  note text,
  description text,
  latitude double precision,
  longitude double precision,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  check (
    (evidence_type = 'note' and storage_bucket is null and storage_path is null
      and original_filename is null and mime_type is null and file_size_bytes is null
      and nullif(btrim(note), '') is not null and char_length(note) <= 4000)
    or
    (evidence_type <> 'note' and storage_bucket = 'build-runtime-evidence'
      and storage_path is not null and original_filename is not null
      and mime_type is not null and file_size_bytes > 0 and note is null)
  ),
  check (
    (evidence_type = 'photo' and mime_type in ('image/jpeg','image/png','image/webp') and file_size_bytes <= 10485760)
    or (evidence_type = 'video' and mime_type in ('video/mp4','video/quicktime','video/webm') and file_size_bytes <= 52428800)
    or (evidence_type = 'document' and mime_type in (
      'application/pdf','text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) and file_size_bytes <= 20971520)
    or evidence_type = 'note'
  ),
  check ((latitude is null and longitude is null) or
    (latitude between -90 and 90 and longitude between -180 and 180)),
  check (description is null or char_length(description) <= 2000),
  check (original_filename is null or char_length(original_filename) between 1 and 240)
);

create index build_runtime_evidence_activity_idx
  on public.build_runtime_evidence(runtime_activity_id, created_at)
  where archived_at is null;
create index build_runtime_evidence_checklist_idx
  on public.build_runtime_evidence(runtime_checklist_item_id, created_at)
  where archived_at is null and runtime_checklist_item_id is not null;
create index build_runtime_evidence_project_idx
  on public.build_runtime_evidence(client_id, project_id, created_at)
  where archived_at is null;

alter table public.build_runtime_activity_events
  drop constraint if exists build_runtime_activity_events_event_type_check;
alter table public.build_runtime_activity_events
  add column runtime_checklist_item_id uuid references public.build_runtime_checklist_items(id) on delete restrict,
  add column runtime_evidence_id uuid references public.build_runtime_evidence(id) on delete restrict,
  add constraint build_runtime_activity_events_event_type_check check (event_type in (
    'responsibility_assigned','started','completed','blocked','resumed',
    'checklist_passed','checklist_failed','checklist_not_applicable','evidence_added'
  ));

create function public.validate_build_runtime_evidence_ancestry()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if not exists (
    select 1
    from public.build_runtime_activities activity
    join public.build_work_plans plan on plan.id = activity.work_plan_id
      and plan.client_id = activity.client_id and plan.project_id = activity.project_id
      and plan.site_id = activity.site_id and plan.work_package_id = activity.work_package_id
    join public.projects project on project.id = activity.project_id and project.client_id = activity.client_id
    where activity.id = new.runtime_activity_id and activity.work_plan_id = new.work_plan_id
      and activity.client_id = new.client_id and activity.project_id = new.project_id
      and activity.site_id = new.site_id and activity.work_package_id = new.work_package_id
      and activity.archived_at is null and plan.archived_at is null and project.archived_at is null
      and project.project_type in ('Construction','Real Estate','Facility Management')
      and (new.runtime_checklist_item_id is null or exists (
        select 1 from public.build_runtime_checklist_items checklist
        where checklist.id = new.runtime_checklist_item_id
          and checklist.work_plan_id = activity.work_plan_id
          and checklist.runtime_activity_id = activity.id
          and checklist.archived_at is null
      ))
  ) then raise exception 'BUILD_RUNTIME_EVIDENCE_ANCESTRY_INVALID'; end if;
  return new;
end;
$$;

create trigger trg_build_runtime_evidence_uploads_ancestry
before insert or update on public.build_runtime_evidence_uploads
for each row execute function public.validate_build_runtime_evidence_ancestry();
create trigger trg_build_runtime_evidence_ancestry
before insert or update on public.build_runtime_evidence
for each row execute function public.validate_build_runtime_evidence_ancestry();

create function public.assert_build_runtime_executor(p_runtime_activity_id uuid, p_actor_user_id uuid)
returns public.build_runtime_activities
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_activity public.build_runtime_activities%rowtype; v_role text;
begin
  select activity.* into v_activity
  from public.build_runtime_activities activity
  join public.build_work_plans plan on plan.id=activity.work_plan_id and plan.client_id=activity.client_id
  join public.projects project on project.id=activity.project_id and project.client_id=activity.client_id
  where activity.id=p_runtime_activity_id and activity.archived_at is null and plan.archived_at is null
    and project.archived_at is null and project.project_type in ('Construction','Real Estate','Facility Management');
  if v_activity.id is null then raise exception 'BUILD_RUNTIME_ACTIVITY_UNAVAILABLE'; end if;
  select membership.role_key into v_role
  from public.workspace_memberships membership
  left join public.workspace_roles role on role.id=membership.role_id and role.client_id=membership.client_id
  where membership.client_id=v_activity.client_id and membership.user_id=p_actor_user_id
    and membership.status='active' and (membership.role_id is null or role.status='active');
  if v_role is null then raise exception 'BUILD_ACTIVITY_ACTOR_INELIGIBLE'; end if;
  if p_actor_user_id<>v_activity.activity_owner_user_id
    and p_actor_user_id is distinct from v_activity.supervisor_user_id
    and v_role not in ('customer_admin','workspace_manager','project_manager')
    then raise exception 'BUILD_ACTIVITY_ACTION_FORBIDDEN'; end if;
  if v_activity.status not in ('in_progress','blocked') then raise exception 'BUILD_ACTIVITY_EXECUTION_STATE_INVALID'; end if;
  return v_activity;
end;
$$;

create function public.apply_build_runtime_checklist_result(
  p_runtime_checklist_item_id uuid,
  p_result text,
  p_actor_user_id uuid,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_checklist public.build_runtime_checklist_items%rowtype;
  v_activity public.build_runtime_activities%rowtype; v_now timestamptz := now(); v_event text;
begin
  select * into v_checklist from public.build_runtime_checklist_items
  where id=p_runtime_checklist_item_id and archived_at is null for update;
  if v_checklist.id is null then raise exception 'BUILD_RUNTIME_CHECKLIST_UNAVAILABLE'; end if;
  v_activity := public.assert_build_runtime_executor(v_checklist.runtime_activity_id,p_actor_user_id);
  if p_result not in ('passed','failed','not_applicable') then raise exception 'BUILD_CHECKLIST_RESULT_INVALID'; end if;
  if p_result in ('failed','not_applicable') and nullif(btrim(p_note),'') is null
    then raise exception 'BUILD_CHECKLIST_REASON_REQUIRED'; end if;
  if v_checklist.requires_comment and nullif(btrim(p_note),'') is null
    then raise exception 'BUILD_CHECKLIST_COMMENT_REQUIRED'; end if;
  if p_result='passed' and v_checklist.requires_photo and not exists (
    select 1 from public.build_runtime_evidence evidence
    where evidence.runtime_checklist_item_id=v_checklist.id and evidence.runtime_activity_id=v_activity.id
      and evidence.evidence_type='photo' and evidence.archived_at is null
  ) then raise exception 'BUILD_CHECKLIST_PHOTO_REQUIRED'; end if;
  update public.build_runtime_checklist_items set status=p_result,result_note=nullif(btrim(p_note),''),
    resolved_by=p_actor_user_id,resolved_at=v_now,updated_at=v_now where id=v_checklist.id;
  v_event := case p_result when 'passed' then 'checklist_passed' when 'failed' then 'checklist_failed'
    else 'checklist_not_applicable' end;
  insert into public.build_runtime_activity_events(client_id,project_id,site_id,work_package_id,work_plan_id,
    runtime_activity_id,runtime_checklist_item_id,event_type,previous_status,resulting_status,actor_user_id,note,occurred_at)
  values(v_activity.client_id,v_activity.project_id,v_activity.site_id,v_activity.work_package_id,v_activity.work_plan_id,
    v_activity.id,v_checklist.id,v_event,v_activity.status,v_activity.status,p_actor_user_id,nullif(btrim(p_note),''),v_now);
  return v_checklist.id;
end;
$$;

create function public.record_build_runtime_evidence(
  p_runtime_activity_id uuid, p_runtime_checklist_item_id uuid, p_upload_authorization_id uuid,
  p_evidence_type text, p_actor_user_id uuid, p_description text default null, p_note text default null,
  p_latitude double precision default null, p_longitude double precision default null
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_activity public.build_runtime_activities%rowtype; v_upload public.build_runtime_evidence_uploads%rowtype;
  v_evidence_id uuid; v_now timestamptz := now();
begin
  v_activity := public.assert_build_runtime_executor(p_runtime_activity_id,p_actor_user_id);
  if p_runtime_checklist_item_id is not null and not exists (
    select 1 from public.build_runtime_checklist_items checklist
    where checklist.id=p_runtime_checklist_item_id and checklist.runtime_activity_id=v_activity.id
      and checklist.work_plan_id=v_activity.work_plan_id and checklist.archived_at is null
  ) then raise exception 'BUILD_RUNTIME_CHECKLIST_ANCESTRY_INVALID'; end if;
  if p_evidence_type='note' then
    if p_upload_authorization_id is not null or nullif(btrim(p_note),'') is null or char_length(p_note)>4000
      then raise exception 'BUILD_EVIDENCE_NOTE_INVALID'; end if;
    insert into public.build_runtime_evidence(client_id,project_id,site_id,work_package_id,work_plan_id,
      runtime_activity_id,runtime_checklist_item_id,evidence_type,note,description,latitude,longitude,uploaded_by)
    values(v_activity.client_id,v_activity.project_id,v_activity.site_id,v_activity.work_package_id,v_activity.work_plan_id,
      v_activity.id,p_runtime_checklist_item_id,'note',btrim(p_note),nullif(btrim(p_description),''),p_latitude,p_longitude,p_actor_user_id)
    returning id into v_evidence_id;
  else
    select * into v_upload from public.build_runtime_evidence_uploads
    where id=p_upload_authorization_id and runtime_activity_id=v_activity.id
      and runtime_checklist_item_id is not distinct from p_runtime_checklist_item_id
      and evidence_type=p_evidence_type and authorized_by=p_actor_user_id
      and finalized_at is null and rejected_at is null and expires_at>v_now for update;
    if v_upload.id is null then raise exception 'BUILD_EVIDENCE_UPLOAD_AUTHORIZATION_INVALID'; end if;
    insert into public.build_runtime_evidence(client_id,project_id,site_id,work_package_id,work_plan_id,
      runtime_activity_id,runtime_checklist_item_id,upload_authorization_id,evidence_type,storage_bucket,storage_path,
      original_filename,mime_type,file_size_bytes,description,latitude,longitude,uploaded_by)
    values(v_activity.client_id,v_activity.project_id,v_activity.site_id,v_activity.work_package_id,v_activity.work_plan_id,
      v_activity.id,p_runtime_checklist_item_id,v_upload.id,v_upload.evidence_type,v_upload.storage_bucket,v_upload.storage_path,
      v_upload.original_filename,v_upload.expected_mime_type,v_upload.expected_file_size_bytes,
      nullif(btrim(p_description),''),p_latitude,p_longitude,p_actor_user_id)
    returning id into v_evidence_id;
    update public.build_runtime_evidence_uploads set finalized_at=v_now where id=v_upload.id;
  end if;
  insert into public.build_runtime_activity_events(client_id,project_id,site_id,work_package_id,work_plan_id,
    runtime_activity_id,runtime_checklist_item_id,runtime_evidence_id,event_type,previous_status,resulting_status,
    actor_user_id,note,event_context,occurred_at)
  values(v_activity.client_id,v_activity.project_id,v_activity.site_id,v_activity.work_package_id,v_activity.work_plan_id,
    v_activity.id,p_runtime_checklist_item_id,v_evidence_id,'evidence_added',v_activity.status,v_activity.status,
    p_actor_user_id,nullif(btrim(p_description),''),jsonb_build_object('evidence_type',p_evidence_type),v_now);
  return v_evidence_id;
end;
$$;

-- Completion requires every mandatory item to be resolved and every recorded failure to be cleared.
-- Untouched optional items remain Pending without creating an artificial result or history event.
create or replace function public.apply_build_runtime_activity_action(
  p_runtime_activity_id uuid, p_action text, p_actor_user_id uuid,
  p_activity_owner_user_id uuid default null, p_supervisor_user_id uuid default null, p_note text default null
) returns uuid
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_activity public.build_runtime_activities%rowtype; v_actor_role text; v_owner_role text;
  v_supervisor_role text; v_now timestamptz := now(); v_previous_status text; v_resulting_status text;
begin
  select activity.* into v_activity from public.build_runtime_activities activity
  join public.build_work_plans plan on plan.id=activity.work_plan_id and plan.client_id=activity.client_id
    and plan.project_id=activity.project_id and plan.site_id=activity.site_id and plan.work_package_id=activity.work_package_id
  join public.projects project on project.id=activity.project_id and project.client_id=activity.client_id
  where activity.id=p_runtime_activity_id and activity.archived_at is null and plan.archived_at is null
    and project.archived_at is null and project.project_type in ('Construction','Real Estate','Facility Management')
  for update of activity;
  if v_activity.id is null then raise exception 'BUILD_RUNTIME_ACTIVITY_UNAVAILABLE'; end if;
  select membership.role_key into v_actor_role from public.workspace_memberships membership
  left join public.workspace_roles role on role.id=membership.role_id and role.client_id=membership.client_id
  where membership.client_id=v_activity.client_id and membership.user_id=p_actor_user_id
    and membership.status='active' and (membership.role_id is null or role.status='active');
  if v_actor_role is null then raise exception 'BUILD_ACTIVITY_ACTOR_INELIGIBLE'; end if;
  v_previous_status := v_activity.status;
  if p_action='assign_responsibility' then
    if v_actor_role not in ('customer_admin','workspace_manager','project_manager') then raise exception 'BUILD_RESPONSIBILITY_ASSIGNMENT_FORBIDDEN'; end if;
    if p_activity_owner_user_id is null then raise exception 'BUILD_ACTIVITY_OWNER_REQUIRED'; end if;
    select membership.role_key into v_owner_role from public.workspace_memberships membership
      left join public.workspace_roles role on role.id=membership.role_id and role.client_id=membership.client_id
      where membership.client_id=v_activity.client_id and membership.user_id=p_activity_owner_user_id
        and membership.status='active' and (membership.role_id is null or role.status='active')
        and membership.role_key in ('customer_admin','workspace_manager','project_manager','supervisor','agency_manager','installer');
    if v_owner_role is null then raise exception 'BUILD_ACTIVITY_OWNER_INELIGIBLE'; end if;
    if p_supervisor_user_id is not null then
      select membership.role_key into v_supervisor_role from public.workspace_memberships membership
        left join public.workspace_roles role on role.id=membership.role_id and role.client_id=membership.client_id
        where membership.client_id=v_activity.client_id and membership.user_id=p_supervisor_user_id
          and membership.status='active' and (membership.role_id is null or role.status='active')
          and membership.role_key in ('customer_admin','workspace_manager','project_manager','supervisor');
      if v_supervisor_role is null then raise exception 'BUILD_ACTIVITY_SUPERVISOR_INELIGIBLE'; end if;
    end if;
    update public.build_runtime_activities set activity_owner_user_id=p_activity_owner_user_id,
      supervisor_user_id=p_supervisor_user_id,updated_at=v_now where id=v_activity.id;
    insert into public.build_runtime_activity_events(client_id,project_id,site_id,work_package_id,work_plan_id,runtime_activity_id,
      event_type,previous_status,resulting_status,actor_user_id,activity_owner_user_id,supervisor_user_id,event_context,occurred_at)
    values(v_activity.client_id,v_activity.project_id,v_activity.site_id,v_activity.work_package_id,v_activity.work_plan_id,v_activity.id,
      'responsibility_assigned',v_activity.status,v_activity.status,p_actor_user_id,p_activity_owner_user_id,p_supervisor_user_id,
      jsonb_build_object('previous_activity_owner_user_id',v_activity.activity_owner_user_id,'previous_supervisor_user_id',v_activity.supervisor_user_id),v_now);
    return v_activity.id;
  end if;
  if v_activity.activity_owner_user_id is null then raise exception 'BUILD_ACTIVITY_OWNER_REQUIRED'; end if;
  if p_actor_user_id<>v_activity.activity_owner_user_id and p_actor_user_id is distinct from v_activity.supervisor_user_id
    and v_actor_role not in ('customer_admin','workspace_manager','project_manager') then raise exception 'BUILD_ACTIVITY_ACTION_FORBIDDEN'; end if;
  if p_action='start' then
    if v_activity.status<>'not_started' then raise exception 'BUILD_ACTIVITY_INVALID_TRANSITION'; end if;
    if exists(select 1 from public.build_runtime_dependencies dependency
      join public.build_runtime_activities predecessor on predecessor.id=dependency.predecessor_runtime_activity_id
      where dependency.successor_runtime_activity_id=v_activity.id and dependency.dependency_type='FS' and predecessor.status<>'completed')
      then raise exception 'BUILD_ACTIVITY_FS_PREDECESSOR_INCOMPLETE'; end if;
    v_resulting_status := 'in_progress';
    update public.build_runtime_activities set status=v_resulting_status,started_at=v_now,started_by=p_actor_user_id,
      blocked_at=null,blocked_by=null,blocker_reason=null,updated_at=v_now where id=v_activity.id;
  elsif p_action='complete' then
    if v_activity.status<>'in_progress' then raise exception 'BUILD_ACTIVITY_INVALID_TRANSITION'; end if;
    if exists(select 1 from public.build_runtime_checklist_items checklist where checklist.runtime_activity_id=v_activity.id
      and checklist.archived_at is null and (
        (checklist.mandatory and checklist.status='pending') or checklist.status='failed'
      ))
      then raise exception 'BUILD_ACTIVITY_CHECKLIST_INCOMPLETE'; end if;
    if exists(select 1 from public.build_runtime_checklist_items checklist where checklist.runtime_activity_id=v_activity.id
      and checklist.archived_at is null and checklist.status='not_applicable' and nullif(btrim(checklist.result_note),'') is null)
      then raise exception 'BUILD_ACTIVITY_CHECKLIST_INCOMPLETE'; end if;
    if v_activity.requires_photo and not exists(select 1 from public.build_runtime_evidence evidence
      where evidence.runtime_activity_id=v_activity.id and evidence.evidence_type='photo' and evidence.archived_at is null)
      then raise exception 'BUILD_ACTIVITY_PHOTO_REQUIRED'; end if;
    v_resulting_status := 'completed';
    update public.build_runtime_activities set status=v_resulting_status,completed_at=v_now,completed_by=p_actor_user_id,updated_at=v_now where id=v_activity.id;
  elsif p_action='block' then
    if v_activity.status<>'in_progress' then raise exception 'BUILD_ACTIVITY_INVALID_TRANSITION'; end if;
    if nullif(btrim(p_note),'') is null then raise exception 'BUILD_ACTIVITY_BLOCKER_REASON_REQUIRED'; end if;
    v_resulting_status := 'blocked';
    update public.build_runtime_activities set status=v_resulting_status,blocked_at=v_now,blocked_by=p_actor_user_id,
      blocker_reason=btrim(p_note),updated_at=v_now where id=v_activity.id;
  elsif p_action='resume' then
    if v_activity.status<>'blocked' then raise exception 'BUILD_ACTIVITY_INVALID_TRANSITION'; end if;
    v_resulting_status := 'in_progress';
    update public.build_runtime_activities set status=v_resulting_status,blocked_at=null,blocked_by=null,blocker_reason=null,updated_at=v_now where id=v_activity.id;
  else raise exception 'BUILD_ACTIVITY_ACTION_UNSUPPORTED'; end if;
  insert into public.build_runtime_activity_events(client_id,project_id,site_id,work_package_id,work_plan_id,runtime_activity_id,
    event_type,previous_status,resulting_status,actor_user_id,activity_owner_user_id,supervisor_user_id,note,occurred_at)
  values(v_activity.client_id,v_activity.project_id,v_activity.site_id,v_activity.work_package_id,v_activity.work_plan_id,v_activity.id,
    case p_action when 'start' then 'started' when 'complete' then 'completed' when 'block' then 'blocked' else 'resumed' end,
    v_previous_status,v_resulting_status,p_actor_user_id,v_activity.activity_owner_user_id,v_activity.supervisor_user_id,
    case when p_action='block' then btrim(p_note) else null end,v_now);
  return v_activity.id;
end;
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('build-runtime-evidence','build-runtime-evidence',false,52428800,array[
  'image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm',
  'application/pdf','text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

alter table public.build_runtime_evidence_uploads enable row level security;
alter table public.build_runtime_evidence enable row level security;
revoke all on table public.build_runtime_evidence_uploads from public,anon,authenticated,service_role;
revoke all on table public.build_runtime_evidence from public,anon,authenticated,service_role;
grant select,insert,update on table public.build_runtime_evidence_uploads to service_role;
grant select,insert,update on table public.build_runtime_evidence to service_role;

revoke all on function public.validate_build_runtime_evidence_ancestry() from public,anon,authenticated,service_role;
revoke all on function public.assert_build_runtime_executor(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.apply_build_runtime_checklist_result(uuid,text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.record_build_runtime_evidence(uuid,uuid,uuid,text,uuid,text,text,double precision,double precision) from public,anon,authenticated,service_role;
grant execute on function public.apply_build_runtime_checklist_result(uuid,text,uuid,text) to service_role;
grant execute on function public.record_build_runtime_evidence(uuid,uuid,uuid,text,uuid,text,text,double precision,double precision) to service_role;

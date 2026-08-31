-- S3A-9A: durable Build runtime review and inspection foundation.
-- Existing runtime Activities use their snapshotted requires_approval flag:
-- false preserves direct completion; true uses the controlled review lifecycle.

alter table public.build_runtime_activities
  drop constraint if exists build_runtime_activities_status_check;
alter table public.build_runtime_activities
  add constraint build_runtime_activities_status_check check (status in (
    'not_started','in_progress','completed','blocked',
    'submitted_for_review','changes_required','approved'
  ));

create table public.build_runtime_inspections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid not null references public.build_sites(id) on delete cascade,
  work_package_id uuid not null references public.build_work_packages(id) on delete cascade,
  work_plan_id uuid not null references public.build_work_plans(id) on delete cascade,
  runtime_activity_id uuid not null references public.build_runtime_activities(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  outcome text not null check (outcome in ('accepted','changes_required')),
  comments text,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint build_runtime_inspections_comments_check check (
    (comments is null or char_length(comments) <= 4000)
    and (outcome <> 'changes_required' or nullif(btrim(comments), '') is not null)
  )
);

create index build_runtime_inspections_activity_idx
  on public.build_runtime_inspections(runtime_activity_id, reviewed_at, id);
create index build_runtime_inspections_tenant_idx
  on public.build_runtime_inspections(client_id, project_id, runtime_activity_id);

alter table public.build_runtime_activity_events
  drop constraint if exists build_runtime_activity_events_event_type_check;
alter table public.build_runtime_activity_events
  add constraint build_runtime_activity_events_event_type_check check (event_type in (
    'responsibility_assigned','started','completed','blocked','resumed',
    'checklist_passed','checklist_failed','checklist_not_applicable','evidence_added',
    'submitted_for_review','inspection_accepted','changes_required','corrective_work_resumed'
  ));
alter table public.build_runtime_activity_events
  drop constraint if exists build_runtime_activity_events_previous_status_check;
alter table public.build_runtime_activity_events
  add constraint build_runtime_activity_events_previous_status_check check (
    previous_status is null or previous_status in (
      'not_started','in_progress','completed','blocked',
      'submitted_for_review','changes_required','approved'
    )
  );
alter table public.build_runtime_activity_events
  drop constraint if exists build_runtime_activity_events_resulting_status_check;
alter table public.build_runtime_activity_events
  add constraint build_runtime_activity_events_resulting_status_check check (
    resulting_status is null or resulting_status in (
      'not_started','in_progress','completed','blocked',
      'submitted_for_review','changes_required','approved'
    )
  );

create function public.validate_build_runtime_inspection_ancestry()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if not exists (
    select 1
    from public.build_runtime_activities activity
    join public.build_work_plans plan
      on plan.id=activity.work_plan_id and plan.client_id=activity.client_id
      and plan.project_id=activity.project_id and plan.site_id=activity.site_id
      and plan.work_package_id=activity.work_package_id
    join public.projects project
      on project.id=activity.project_id and project.client_id=activity.client_id
    where activity.id=new.runtime_activity_id
      and activity.client_id=new.client_id and activity.project_id=new.project_id
      and activity.site_id=new.site_id and activity.work_package_id=new.work_package_id
      and activity.work_plan_id=new.work_plan_id
      and activity.archived_at is null and plan.archived_at is null
      and project.archived_at is null
      and project.project_type in ('Construction','Real Estate','Facility Management')
  ) then raise exception 'BUILD_RUNTIME_INSPECTION_ANCESTRY_INVALID'; end if;
  if not exists (
    select 1 from public.workspace_memberships membership
    left join public.workspace_roles role
      on role.id=membership.role_id and role.client_id=membership.client_id
    where membership.client_id=new.client_id and membership.user_id=new.reviewer_user_id
      and membership.status='active' and (membership.role_id is null or role.status='active')
      and membership.role_key in ('customer_admin','workspace_manager','project_manager','supervisor')
  ) then raise exception 'BUILD_INSPECTION_REVIEWER_INELIGIBLE'; end if;
  return new;
end;
$$;

create trigger trg_build_runtime_inspections_ancestry
before insert or update on public.build_runtime_inspections
for each row execute function public.validate_build_runtime_inspection_ancestry();

create function public.guard_build_runtime_inspection_immutability()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'BUILD_RUNTIME_INSPECTION_IMMUTABLE';
end;
$$;

create trigger trg_build_runtime_inspections_immutable
before update or delete on public.build_runtime_inspections
for each row execute function public.guard_build_runtime_inspection_immutability();

create function public.enforce_build_runtime_review_completion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if old.requires_approval and old.status <> 'completed' and new.status='completed'
    then raise exception 'BUILD_ACTIVITY_REVIEW_REQUIRED'; end if;
  if old.status in ('submitted_for_review','approved') and (
    new.activity_owner_user_id is distinct from old.activity_owner_user_id
    or new.supervisor_user_id is distinct from old.supervisor_user_id
  ) then raise exception 'BUILD_ACTIVITY_REVIEW_STATE_LOCKED'; end if;
  return new;
end;
$$;

create trigger trg_build_runtime_activities_review_completion
before update on public.build_runtime_activities
for each row execute function public.enforce_build_runtime_review_completion();

create function public.submit_build_runtime_activity_for_review(
  p_runtime_activity_id uuid,
  p_actor_user_id uuid
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_activity public.build_runtime_activities%rowtype;
  v_actor_role text;
  v_now timestamptz := now();
begin
  select activity.* into v_activity
  from public.build_runtime_activities activity
  join public.build_work_plans plan on plan.id=activity.work_plan_id
    and plan.client_id=activity.client_id and plan.project_id=activity.project_id
    and plan.site_id=activity.site_id and plan.work_package_id=activity.work_package_id
  join public.projects project on project.id=activity.project_id and project.client_id=activity.client_id
  where activity.id=p_runtime_activity_id and activity.archived_at is null and plan.archived_at is null
    and project.archived_at is null
    and project.project_type in ('Construction','Real Estate','Facility Management')
  for update of activity;
  if v_activity.id is null then raise exception 'BUILD_RUNTIME_ACTIVITY_UNAVAILABLE'; end if;
  select membership.role_key into v_actor_role
  from public.workspace_memberships membership
  left join public.workspace_roles role on role.id=membership.role_id and role.client_id=membership.client_id
  where membership.client_id=v_activity.client_id and membership.user_id=p_actor_user_id
    and membership.status='active' and (membership.role_id is null or role.status='active');
  if v_actor_role is null then raise exception 'BUILD_ACTIVITY_ACTOR_INELIGIBLE'; end if;
  if p_actor_user_id<>v_activity.activity_owner_user_id
    and p_actor_user_id is distinct from v_activity.supervisor_user_id
    and v_actor_role not in ('customer_admin','workspace_manager','project_manager')
    then raise exception 'BUILD_ACTIVITY_ACTION_FORBIDDEN'; end if;
  if not v_activity.requires_approval then raise exception 'BUILD_ACTIVITY_REVIEW_NOT_REQUIRED'; end if;
  if v_activity.status<>'in_progress' then raise exception 'BUILD_ACTIVITY_REVIEW_STATE_INVALID'; end if;
  if exists (
    select 1 from public.build_runtime_checklist_items checklist
    where checklist.runtime_activity_id=v_activity.id and checklist.archived_at is null
      and ((checklist.mandatory and checklist.status='pending') or checklist.status='failed')
  ) then raise exception 'BUILD_ACTIVITY_CHECKLIST_INCOMPLETE'; end if;
  if exists (
    select 1 from public.build_runtime_checklist_items checklist
    where checklist.runtime_activity_id=v_activity.id and checklist.archived_at is null
      and checklist.requires_comment and checklist.status<>'pending'
      and nullif(btrim(checklist.result_note),'') is null
  ) then raise exception 'BUILD_CHECKLIST_COMMENT_REQUIRED'; end if;
  if exists (
    select 1 from public.build_runtime_checklist_items checklist
    where checklist.runtime_activity_id=v_activity.id and checklist.archived_at is null
      and checklist.requires_photo and checklist.status='passed'
      and not exists (
        select 1 from public.build_runtime_evidence evidence
        where evidence.runtime_activity_id=v_activity.id
          and evidence.runtime_checklist_item_id=checklist.id
          and evidence.evidence_type='photo' and evidence.archived_at is null
      )
  ) then raise exception 'BUILD_CHECKLIST_PHOTO_REQUIRED'; end if;
  if v_activity.requires_photo and not exists (
    select 1 from public.build_runtime_evidence evidence
    where evidence.runtime_activity_id=v_activity.id and evidence.evidence_type='photo'
      and evidence.archived_at is null
  ) then raise exception 'BUILD_ACTIVITY_PHOTO_REQUIRED'; end if;
  update public.build_runtime_activities
    set status='submitted_for_review',updated_at=v_now
    where id=v_activity.id;
  insert into public.build_runtime_activity_events(
    client_id,project_id,site_id,work_package_id,work_plan_id,runtime_activity_id,
    event_type,previous_status,resulting_status,actor_user_id,
    activity_owner_user_id,supervisor_user_id,occurred_at
  ) values (
    v_activity.client_id,v_activity.project_id,v_activity.site_id,v_activity.work_package_id,
    v_activity.work_plan_id,v_activity.id,'submitted_for_review',v_activity.status,
    'submitted_for_review',p_actor_user_id,v_activity.activity_owner_user_id,
    v_activity.supervisor_user_id,v_now
  );
  return v_activity.id;
end;
$$;

create function public.record_build_runtime_inspection(
  p_runtime_activity_id uuid,
  p_outcome text,
  p_actor_user_id uuid,
  p_comments text default null
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_activity public.build_runtime_activities%rowtype;
  v_actor_role text;
  v_inspection_id uuid;
  v_resulting_status text;
  v_event_type text;
  v_now timestamptz := now();
begin
  select activity.* into v_activity
  from public.build_runtime_activities activity
  join public.build_work_plans plan on plan.id=activity.work_plan_id
    and plan.client_id=activity.client_id and plan.project_id=activity.project_id
    and plan.site_id=activity.site_id and plan.work_package_id=activity.work_package_id
  join public.projects project on project.id=activity.project_id and project.client_id=activity.client_id
  where activity.id=p_runtime_activity_id and activity.archived_at is null and plan.archived_at is null
    and project.archived_at is null
    and project.project_type in ('Construction','Real Estate','Facility Management')
  for update of activity;
  if v_activity.id is null then raise exception 'BUILD_RUNTIME_ACTIVITY_UNAVAILABLE'; end if;
  select membership.role_key into v_actor_role
  from public.workspace_memberships membership
  left join public.workspace_roles role on role.id=membership.role_id and role.client_id=membership.client_id
  where membership.client_id=v_activity.client_id and membership.user_id=p_actor_user_id
    and membership.status='active' and (membership.role_id is null or role.status='active');
  if v_actor_role is null then raise exception 'BUILD_ACTIVITY_ACTOR_INELIGIBLE'; end if;
  if p_actor_user_id is distinct from v_activity.supervisor_user_id
    and v_actor_role not in ('customer_admin','workspace_manager','project_manager')
    then raise exception 'BUILD_INSPECTION_REVIEW_FORBIDDEN'; end if;
  if v_activity.status<>'submitted_for_review' then raise exception 'BUILD_INSPECTION_STALE_ACTIVITY_STATE'; end if;
  if p_outcome not in ('accepted','changes_required') then raise exception 'BUILD_INSPECTION_OUTCOME_INVALID'; end if;
  if p_outcome='changes_required' and nullif(btrim(p_comments),'') is null
    then raise exception 'BUILD_INSPECTION_COMMENT_REQUIRED'; end if;
  if char_length(coalesce(p_comments,'')) > 4000
    then raise exception 'BUILD_INSPECTION_COMMENT_TOO_LONG'; end if;
  v_resulting_status := case p_outcome when 'accepted' then 'approved' else 'changes_required' end;
  v_event_type := case p_outcome when 'accepted' then 'inspection_accepted' else 'changes_required' end;
  insert into public.build_runtime_inspections(
    client_id,project_id,site_id,work_package_id,work_plan_id,runtime_activity_id,
    reviewer_user_id,outcome,comments,reviewed_at
  ) values (
    v_activity.client_id,v_activity.project_id,v_activity.site_id,v_activity.work_package_id,
    v_activity.work_plan_id,v_activity.id,p_actor_user_id,p_outcome,
    nullif(btrim(p_comments),''),v_now
  ) returning id into v_inspection_id;
  update public.build_runtime_activities
    set status=v_resulting_status,
      completed_at=case when p_outcome='accepted' then v_now else completed_at end,
      completed_by=case when p_outcome='accepted' then p_actor_user_id else completed_by end,
      updated_at=v_now
    where id=v_activity.id;
  insert into public.build_runtime_activity_events(
    client_id,project_id,site_id,work_package_id,work_plan_id,runtime_activity_id,
    event_type,previous_status,resulting_status,actor_user_id,
    activity_owner_user_id,supervisor_user_id,note,event_context,occurred_at
  ) values (
    v_activity.client_id,v_activity.project_id,v_activity.site_id,v_activity.work_package_id,
    v_activity.work_plan_id,v_activity.id,v_event_type,v_activity.status,v_resulting_status,
    p_actor_user_id,v_activity.activity_owner_user_id,v_activity.supervisor_user_id,
    nullif(btrim(p_comments),''),jsonb_build_object('inspection_id',v_inspection_id,'outcome',p_outcome),v_now
  );
  return v_inspection_id;
end;
$$;

create function public.resume_build_runtime_activity_corrections(
  p_runtime_activity_id uuid,
  p_actor_user_id uuid
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_activity public.build_runtime_activities%rowtype;
  v_actor_role text;
  v_now timestamptz := now();
begin
  select activity.* into v_activity
  from public.build_runtime_activities activity
  join public.build_work_plans plan on plan.id=activity.work_plan_id and plan.client_id=activity.client_id
  join public.projects project on project.id=activity.project_id and project.client_id=activity.client_id
  where activity.id=p_runtime_activity_id and activity.archived_at is null and plan.archived_at is null
    and project.archived_at is null
    and project.project_type in ('Construction','Real Estate','Facility Management')
  for update of activity;
  if v_activity.id is null then raise exception 'BUILD_RUNTIME_ACTIVITY_UNAVAILABLE'; end if;
  select membership.role_key into v_actor_role
  from public.workspace_memberships membership
  left join public.workspace_roles role on role.id=membership.role_id and role.client_id=membership.client_id
  where membership.client_id=v_activity.client_id and membership.user_id=p_actor_user_id
    and membership.status='active' and (membership.role_id is null or role.status='active');
  if v_actor_role is null then raise exception 'BUILD_ACTIVITY_ACTOR_INELIGIBLE'; end if;
  if p_actor_user_id<>v_activity.activity_owner_user_id
    and p_actor_user_id is distinct from v_activity.supervisor_user_id
    and v_actor_role not in ('customer_admin','workspace_manager','project_manager')
    then raise exception 'BUILD_ACTIVITY_ACTION_FORBIDDEN'; end if;
  if v_activity.status<>'changes_required' then raise exception 'BUILD_ACTIVITY_REVIEW_STATE_INVALID'; end if;
  update public.build_runtime_activities set status='in_progress',updated_at=v_now where id=v_activity.id;
  insert into public.build_runtime_activity_events(
    client_id,project_id,site_id,work_package_id,work_plan_id,runtime_activity_id,
    event_type,previous_status,resulting_status,actor_user_id,
    activity_owner_user_id,supervisor_user_id,occurred_at
  ) values (
    v_activity.client_id,v_activity.project_id,v_activity.site_id,v_activity.work_package_id,
    v_activity.work_plan_id,v_activity.id,'corrective_work_resumed',v_activity.status,
    'in_progress',p_actor_user_id,v_activity.activity_owner_user_id,
    v_activity.supervisor_user_id,v_now
  );
  return v_activity.id;
end;
$$;

alter table public.build_runtime_inspections enable row level security;
revoke all on table public.build_runtime_inspections from public,anon,authenticated,service_role;
grant select,insert on table public.build_runtime_inspections to service_role;

revoke all on function public.validate_build_runtime_inspection_ancestry() from public,anon,authenticated,service_role;
revoke all on function public.guard_build_runtime_inspection_immutability() from public,anon,authenticated,service_role;
revoke all on function public.enforce_build_runtime_review_completion() from public,anon,authenticated,service_role;
revoke all on function public.submit_build_runtime_activity_for_review(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.record_build_runtime_inspection(uuid,text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.resume_build_runtime_activity_corrections(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.submit_build_runtime_activity_for_review(uuid,uuid) to service_role;
grant execute on function public.record_build_runtime_inspection(uuid,text,uuid,text) to service_role;
grant execute on function public.resume_build_runtime_activity_corrections(uuid,uuid) to service_role;

comment on table public.build_runtime_inspections is
  'Append-only S3A-9A review decisions for canonical Build runtime Activities.';

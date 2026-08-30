-- S3A-7: controlled Build runtime Activity responsibility and execution history.

alter table public.build_runtime_activities
  add column activity_owner_user_id uuid references auth.users(id) on delete set null,
  add column supervisor_user_id uuid references auth.users(id) on delete set null,
  add column started_at timestamptz,
  add column started_by uuid references auth.users(id) on delete set null,
  add column completed_at timestamptz,
  add column completed_by uuid references auth.users(id) on delete set null,
  add column blocked_at timestamptz,
  add column blocked_by uuid references auth.users(id) on delete set null,
  add column blocker_reason text;

create index build_runtime_activities_owner_idx on public.build_runtime_activities(client_id, activity_owner_user_id) where archived_at is null;
create index build_runtime_activities_supervisor_idx on public.build_runtime_activities(client_id, supervisor_user_id) where archived_at is null;

create table public.build_runtime_activity_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid not null references public.build_sites(id) on delete cascade,
  work_package_id uuid not null references public.build_work_packages(id) on delete cascade,
  work_plan_id uuid not null references public.build_work_plans(id) on delete cascade,
  runtime_activity_id uuid not null references public.build_runtime_activities(id) on delete cascade,
  event_type text not null check (event_type in ('responsibility_assigned','started','completed','blocked','resumed')),
  previous_status text check (previous_status is null or previous_status in ('not_started','in_progress','completed','blocked')),
  resulting_status text check (resulting_status is null or resulting_status in ('not_started','in_progress','completed','blocked')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  activity_owner_user_id uuid references auth.users(id) on delete set null,
  supervisor_user_id uuid references auth.users(id) on delete set null,
  note text,
  event_context jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  foreign key (project_id, client_id) references public.projects(id, client_id),
  foreign key (site_id, project_id, client_id) references public.build_sites(id, project_id, client_id)
);
create index build_runtime_activity_events_timeline_idx on public.build_runtime_activity_events(runtime_activity_id, occurred_at, id);
alter table public.build_runtime_activity_events enable row level security;
revoke all on table public.build_runtime_activity_events from public, anon, authenticated, service_role;
grant select, insert on table public.build_runtime_activity_events to service_role;

create function public.prevent_build_runtime_activity_event_mutation()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin raise exception 'BUILD_ACTIVITY_EVENT_IMMUTABLE'; end;
$$;
create trigger trg_build_runtime_activity_events_immutable
before update or delete on public.build_runtime_activity_events
for each row execute function public.prevent_build_runtime_activity_event_mutation();
revoke all on function public.prevent_build_runtime_activity_event_mutation() from public, anon, authenticated;

create function public.apply_build_runtime_activity_action(
  p_runtime_activity_id uuid,
  p_action text,
  p_actor_user_id uuid,
  p_activity_owner_user_id uuid default null,
  p_supervisor_user_id uuid default null,
  p_note text default null
) returns uuid
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_activity public.build_runtime_activities%rowtype;
  v_actor_role text;
  v_owner_role text;
  v_supervisor_role text;
  v_now timestamptz := now();
  v_previous_status text;
  v_resulting_status text;
begin
  select activity.* into v_activity
  from public.build_runtime_activities activity
  join public.build_work_plans plan on plan.id=activity.work_plan_id and plan.client_id=activity.client_id
    and plan.project_id=activity.project_id and plan.site_id=activity.site_id and plan.work_package_id=activity.work_package_id
  join public.projects project on project.id=activity.project_id and project.client_id=activity.client_id
  where activity.id=p_runtime_activity_id and activity.archived_at is null and plan.archived_at is null
    and project.archived_at is null and project.project_type in ('Construction','Real Estate','Facility Management')
  for update of activity;
  if v_activity.id is null then raise exception 'BUILD_RUNTIME_ACTIVITY_UNAVAILABLE'; end if;

  select membership.role_key into v_actor_role
  from public.workspace_memberships membership
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
      supervisor_user_id=p_supervisor_user_id, updated_at=v_now where id=v_activity.id;
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
      and checklist.archived_at is null and checklist.status<>'completed') then raise exception 'BUILD_ACTIVITY_CHECKLIST_INCOMPLETE'; end if;
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

revoke all on function public.apply_build_runtime_activity_action(uuid,text,uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.apply_build_runtime_activity_action(uuid,text,uuid,uuid,uuid,text) to service_role;

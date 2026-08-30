-- S3A-6: durable Build Work Plans instantiated from reusable definitions.
-- Definition rows remain reusable and are never treated as execution history.

create table public.build_work_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid not null references public.build_sites(id) on delete cascade,
  work_package_id uuid not null references public.build_work_packages(id) on delete cascade,
  source_template_id uuid not null references public.build_work_package_templates(id) on delete restrict,
  source_template_code text not null,
  source_template_name text not null,
  source_template_version integer not null,
  source_fingerprint text not null,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed', 'blocked', 'archived')),
  instantiated_at timestamptz not null default now(),
  instantiated_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, client_id) references public.projects(id, client_id),
  foreign key (site_id, project_id, client_id) references public.build_sites(id, project_id, client_id)
);

create unique index build_work_plans_active_work_package_uidx
  on public.build_work_plans(work_package_id) where archived_at is null;
create index build_work_plans_project_idx on public.build_work_plans(client_id, project_id, site_id);

create table public.build_runtime_activities (
  id uuid primary key default gen_random_uuid(),
  work_plan_id uuid not null references public.build_work_plans(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid not null references public.build_sites(id) on delete cascade,
  work_package_id uuid not null references public.build_work_packages(id) on delete cascade,
  source_activity_template_id uuid not null references public.build_activity_templates(id) on delete restrict,
  source_category_id uuid not null references public.build_activity_categories(id) on delete restrict,
  category_code text not null,
  category_name text not null,
  sequence integer not null check (sequence > 0),
  code text not null,
  name text not null,
  description text,
  planned_duration integer check (planned_duration is null or planned_duration >= 0),
  duration_unit text not null check (duration_unit in ('hours', 'days', 'weeks')),
  mandatory boolean not null,
  requires_photo boolean not null,
  requires_gps boolean not null,
  requires_approval boolean not null,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed', 'blocked')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_plan_id, source_activity_template_id),
  unique (work_plan_id, sequence)
);
create index build_runtime_activities_plan_idx on public.build_runtime_activities(work_plan_id, sequence);

create table public.build_runtime_checklist_items (
  id uuid primary key default gen_random_uuid(),
  work_plan_id uuid not null references public.build_work_plans(id) on delete cascade,
  runtime_activity_id uuid not null references public.build_runtime_activities(id) on delete cascade,
  source_checklist_template_id uuid not null references public.build_checklist_templates(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  item text not null,
  description text,
  mandatory boolean not null,
  requires_photo boolean not null,
  requires_comment boolean not null,
  acceptance_type text,
  status text not null default 'not_started' check (status in ('not_started', 'completed', 'blocked')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (work_plan_id, source_checklist_template_id),
  unique (runtime_activity_id, sequence)
);
create index build_runtime_checklist_activity_idx on public.build_runtime_checklist_items(runtime_activity_id, sequence);

create table public.build_runtime_dependencies (
  id uuid primary key default gen_random_uuid(),
  work_plan_id uuid not null references public.build_work_plans(id) on delete cascade,
  predecessor_runtime_activity_id uuid not null references public.build_runtime_activities(id) on delete cascade,
  successor_runtime_activity_id uuid not null references public.build_runtime_activities(id) on delete cascade,
  source_dependency_id uuid not null references public.build_activity_template_dependencies(id) on delete restrict,
  dependency_type public.build_activity_dependency_type not null,
  lag_value integer not null check (lag_value >= 0),
  lag_unit public.build_activity_dependency_lag_unit not null,
  mandatory boolean not null,
  created_at timestamptz not null default now(),
  check (predecessor_runtime_activity_id <> successor_runtime_activity_id),
  unique (work_plan_id, source_dependency_id),
  unique (work_plan_id, predecessor_runtime_activity_id, successor_runtime_activity_id)
);
create index build_runtime_dependencies_plan_idx on public.build_runtime_dependencies(work_plan_id);

create table public.build_runtime_resource_requirements (
  id uuid primary key default gen_random_uuid(),
  work_plan_id uuid not null references public.build_work_plans(id) on delete cascade,
  runtime_activity_id uuid references public.build_runtime_activities(id) on delete cascade,
  source_requirement_id uuid not null references public.build_template_resource_requirements(id) on delete restrict,
  resource_id uuid not null references public.build_resources(id) on delete restrict,
  resource_code text not null,
  resource_name text not null,
  resource_type public.build_resource_type not null,
  sequence integer not null check (sequence > 0),
  quantity numeric(14,2) not null check (quantity > 0),
  unit_of_measure text,
  requirement_type public.build_resource_requirement_type not null,
  required_stage text,
  mandatory boolean not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (work_plan_id, source_requirement_id)
);
create index build_runtime_resource_requirements_plan_idx on public.build_runtime_resource_requirements(work_plan_id);
create index build_runtime_resource_requirements_activity_idx on public.build_runtime_resource_requirements(runtime_activity_id);

alter table public.build_work_plans enable row level security;
alter table public.build_runtime_activities enable row level security;
alter table public.build_runtime_checklist_items enable row level security;
alter table public.build_runtime_dependencies enable row level security;
alter table public.build_runtime_resource_requirements enable row level security;

revoke all on table public.build_work_plans from public, anon, authenticated;
revoke all on table public.build_runtime_activities from public, anon, authenticated;
revoke all on table public.build_runtime_checklist_items from public, anon, authenticated;
revoke all on table public.build_runtime_dependencies from public, anon, authenticated;
revoke all on table public.build_runtime_resource_requirements from public, anon, authenticated;
grant all on table public.build_work_plans to service_role;
grant all on table public.build_runtime_activities to service_role;
grant all on table public.build_runtime_checklist_items to service_role;
grant all on table public.build_runtime_dependencies to service_role;
grant all on table public.build_runtime_resource_requirements to service_role;

create or replace function public.create_build_work_plan(
  p_project_id uuid,
  p_site_id uuid,
  p_work_package_id uuid,
  p_instantiated_by uuid
)
returns uuid
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_plan_id uuid;
  v_client_id uuid;
  v_template_id uuid;
  v_template_code text;
  v_template_name text;
  v_template_version integer;
  v_fingerprint text;
begin
  perform 1 from public.build_work_packages wp where wp.id = p_work_package_id for update;

  select existing.id into v_plan_id
  from public.build_work_plans existing
  where existing.work_package_id = p_work_package_id and existing.archived_at is null;
  if v_plan_id is not null then return v_plan_id; end if;

  select p.client_id, wp.template_id, t.code, t.name, t.version
    into v_client_id, v_template_id, v_template_code, v_template_name, v_template_version
  from public.projects p
  join public.build_sites s on s.project_id = p.id and s.client_id = p.client_id
  join public.build_work_packages wp on wp.site_id = s.id and wp.project_id = p.id and wp.client_id = p.client_id
  join public.build_work_package_templates t on t.id = wp.template_id
  where p.id = p_project_id
    and s.id = p_site_id
    and wp.id = p_work_package_id
    and p.project_type in ('Construction', 'Real Estate', 'Facility Management')
    and p.archived_at is null
    and s.archived_at is null and s.status <> 'archived'
    and wp.archived_at is null and wp.status <> 'archived'
    and t.archived_at is null and t.status = 'active'
    and ((t.is_global and t.client_id is null) or (not t.is_global and t.client_id = p.client_id));

  if v_template_id is null then raise exception 'WORK_PLAN_SOURCE_NOT_ELIGIBLE'; end if;

  if exists (
    select 1 from public.build_activity_templates a
    left join public.build_activity_categories c on c.id = a.activity_category_id
    where a.template_id = v_template_id and a.archived_at is null
      and (c.id is null or c.template_id <> v_template_id or c.status = 'archived')
  ) then raise exception 'WORK_PLAN_INVALID_ACTIVITY_ANCESTRY'; end if;

  if exists (
    select 1 from public.build_checklist_templates c
    left join public.build_activity_templates a on a.id = c.activity_template_id
    where c.archived_at is null and a.template_id = v_template_id
      and (a.archived_at is not null or a.template_id <> v_template_id)
  ) then raise exception 'WORK_PLAN_INVALID_CHECKLIST_ANCESTRY'; end if;

  if exists (
    select 1 from public.build_activity_template_dependencies d
    left join public.build_activity_templates predecessor on predecessor.id = d.predecessor_activity_template_id
    left join public.build_activity_templates successor on successor.id = d.successor_activity_template_id
    where d.template_id = v_template_id and d.archived_at is null
      and (predecessor.id is null or successor.id is null or predecessor.template_id <> v_template_id
        or successor.template_id <> v_template_id or predecessor.id = successor.id)
  ) then raise exception 'WORK_PLAN_INVALID_DEPENDENCY_ANCESTRY'; end if;

  if exists (
    with recursive paths(origin, current_id, visited) as (
      select d.predecessor_activity_template_id, d.successor_activity_template_id,
             array[d.predecessor_activity_template_id, d.successor_activity_template_id]
      from public.build_activity_template_dependencies d
      where d.template_id = v_template_id and d.archived_at is null
      union all
      select paths.origin, d.successor_activity_template_id, paths.visited || d.successor_activity_template_id
      from paths
      join public.build_activity_template_dependencies d on d.predecessor_activity_template_id = paths.current_id
      where d.template_id = v_template_id and d.archived_at is null
        and not d.successor_activity_template_id = any(paths.visited)
    )
    select 1 from paths
    join public.build_activity_template_dependencies d on d.predecessor_activity_template_id = paths.current_id
    where d.template_id = v_template_id and d.archived_at is null and d.successor_activity_template_id = paths.origin
  ) then raise exception 'WORK_PLAN_DEPENDENCY_CYCLE'; end if;

  if exists (
    select 1 from public.build_template_resource_requirements requirement
    left join public.build_resources resource on resource.id = requirement.resource_id
    left join public.build_activity_templates activity on activity.id = requirement.activity_template_id
    left join public.build_activity_categories category on category.id = requirement.activity_category_id
    where requirement.template_id = v_template_id and requirement.archived_at is null
      and (resource.id is null or resource.archived_at is not null or resource.status <> 'active'
        or not ((resource.is_global and resource.client_id is null) or (not resource.is_global and resource.client_id = v_client_id))
        or (requirement.activity_template_id is not null and (activity.id is null or activity.template_id <> v_template_id))
        or (requirement.activity_category_id is not null and (category.id is null or category.template_id <> v_template_id)))
  ) then raise exception 'WORK_PLAN_INVALID_RESOURCE_REQUIREMENT'; end if;

  select md5(concat_ws('|', t.id, t.version, t.updated_at,
    (select jsonb_agg(to_jsonb(c) order by c.sequence) from public.build_activity_categories c where c.template_id=t.id and c.status <> 'archived'),
    (select jsonb_agg(to_jsonb(a) order by a.sequence) from public.build_activity_templates a where a.template_id=t.id and a.archived_at is null),
    (select jsonb_agg(to_jsonb(d) order by d.id) from public.build_activity_template_dependencies d where d.template_id=t.id and d.archived_at is null),
    (select jsonb_agg(to_jsonb(r) order by r.sequence) from public.build_template_resource_requirements r where r.template_id=t.id and r.archived_at is null)
  )) into v_fingerprint from public.build_work_package_templates t where t.id = v_template_id;

  insert into public.build_work_plans (client_id, project_id, site_id, work_package_id, source_template_id,
    source_template_code, source_template_name, source_template_version, source_fingerprint, instantiated_by)
  values (v_client_id, p_project_id, p_site_id, p_work_package_id, v_template_id,
    v_template_code, v_template_name, v_template_version, v_fingerprint, p_instantiated_by)
  returning id into v_plan_id;

  insert into public.build_runtime_activities (work_plan_id, client_id, project_id, site_id, work_package_id,
    source_activity_template_id, source_category_id, category_code, category_name, sequence, code, name,
    description, planned_duration, duration_unit, mandatory, requires_photo, requires_gps, requires_approval)
  select v_plan_id, v_client_id, p_project_id, p_site_id, p_work_package_id,
    a.id, c.id, c.code, c.name, a.sequence, a.code, a.name, a.description, a.estimated_duration,
    a.duration_unit, a.mandatory, a.requires_photo, a.requires_gps, a.requires_approval
  from public.build_activity_templates a
  join public.build_activity_categories c on c.id = a.activity_category_id and c.template_id = a.template_id
  where a.template_id = v_template_id and a.archived_at is null and a.status = 'active' and c.status = 'active'
  order by a.sequence;

  insert into public.build_runtime_checklist_items (work_plan_id, runtime_activity_id, source_checklist_template_id,
    sequence, item, description, mandatory, requires_photo, requires_comment, acceptance_type)
  select v_plan_id, runtime.id, checklist.id, checklist.sequence, checklist.item, checklist.description,
    checklist.mandatory, checklist.requires_photo, checklist.requires_comment, checklist.acceptance_type
  from public.build_checklist_templates checklist
  join public.build_runtime_activities runtime on runtime.work_plan_id = v_plan_id
    and runtime.source_activity_template_id = checklist.activity_template_id
  where checklist.archived_at is null;

  insert into public.build_runtime_dependencies (work_plan_id, predecessor_runtime_activity_id,
    successor_runtime_activity_id, source_dependency_id, dependency_type, lag_value, lag_unit, mandatory)
  select v_plan_id, predecessor.id, successor.id, dependency.id, dependency.dependency_type,
    dependency.lag_value, dependency.lag_unit, dependency.mandatory
  from public.build_activity_template_dependencies dependency
  join public.build_runtime_activities predecessor on predecessor.work_plan_id = v_plan_id
    and predecessor.source_activity_template_id = dependency.predecessor_activity_template_id
  join public.build_runtime_activities successor on successor.work_plan_id = v_plan_id
    and successor.source_activity_template_id = dependency.successor_activity_template_id
  where dependency.template_id = v_template_id and dependency.archived_at is null;

  insert into public.build_runtime_resource_requirements (work_plan_id, runtime_activity_id,
    source_requirement_id, resource_id, resource_code, resource_name, resource_type, sequence, quantity,
    unit_of_measure, requirement_type, required_stage, mandatory, notes)
  select v_plan_id, runtime.id, requirement.id, resource.id, resource.code, resource.name,
    resource.resource_type, requirement.sequence, requirement.quantity, requirement.unit_of_measure,
    requirement.requirement_type, requirement.required_stage, requirement.mandatory, requirement.notes
  from public.build_template_resource_requirements requirement
  join public.build_resources resource on resource.id = requirement.resource_id
  left join public.build_runtime_activities runtime on runtime.work_plan_id = v_plan_id
    and runtime.source_activity_template_id = requirement.activity_template_id
  where requirement.template_id = v_template_id and requirement.archived_at is null;

  return v_plan_id;
end;
$$;

revoke all on function public.create_build_work_plan(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_build_work_plan(uuid, uuid, uuid, uuid) to service_role;

comment on function public.create_build_work_plan(uuid, uuid, uuid, uuid)
  is 'Atomically creates or reuses the single active Build Work Plan for an eligible Work Package.';

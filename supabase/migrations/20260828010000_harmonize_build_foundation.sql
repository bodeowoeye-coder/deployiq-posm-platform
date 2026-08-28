-- ---------------------------------------------------------------------------
-- DeployIQ Build harmonisation foundation (BH-1B)
-- ---------------------------------------------------------------------------
-- Forward-only reconstruction of the accumulated historical Build schema for
-- canonical environments where the historical migration versions may be
-- recorded while their Build objects are absent.
--
-- This migration is deliberately additive. It does not drop Build tables or
-- data. Known legacy uniqueness on template code is replaced with tenant/global
-- scoped uniqueness so separate tenants may use the same code safely.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'build_activity_category_type') then
    create type public.build_activity_category_type as enum
      ('preparation', 'execution', 'inspection', 'testing', 'commissioning', 'close_out', 'general');
  end if;
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'build_resource_type') then
    create type public.build_resource_type as enum
      ('labour', 'material', 'equipment', 'vehicle', 'contractor', 'service');
  end if;
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'build_resource_requirement_type') then
    create type public.build_resource_requirement_type as enum ('estimated', 'mandatory', 'optional');
  end if;
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'build_activity_dependency_type') then
    create type public.build_activity_dependency_type as enum ('FS', 'SS', 'FF', 'SF');
  end if;
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'build_activity_dependency_lag_unit') then
    create type public.build_activity_dependency_lag_unit as enum ('hours', 'days', 'weeks');
  end if;
end
$$;

create unique index if not exists projects_id_client_id_uidx
  on public.projects (id, client_id);

create table if not exists public.build_sites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  site_code text not null,
  name text not null,
  description text,
  site_type text,
  address text,
  state text,
  lga text,
  latitude double precision,
  longitude double precision,
  status text not null default 'planned' check (status in ('planned', 'active', 'on_hold', 'completed', 'archived')),
  planned_start_date date,
  planned_end_date date,
  actual_start_date date,
  actual_end_date date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (project_id, site_code)
);

create unique index if not exists build_sites_identity_tenant_uidx
  on public.build_sites (id, project_id, client_id);
create index if not exists idx_build_sites_client_id on public.build_sites(client_id);
create index if not exists idx_build_sites_project_id on public.build_sites(project_id);
create index if not exists idx_build_sites_status on public.build_sites(status);
create index if not exists idx_build_sites_archived_at on public.build_sites(archived_at);

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.build_sites'::regclass and conname = 'build_sites_project_client_fkey') then
    alter table public.build_sites
      add constraint build_sites_project_client_fkey
      foreign key (project_id, client_id) references public.projects(id, client_id)
      on delete cascade not valid;
  end if;
end
$$;

create table if not exists public.build_work_package_templates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  work_package_type text,
  category text,
  version integer not null default 1 check (version > 0),
  is_global boolean not null default false,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((is_global = true and client_id is null) or (is_global = false and client_id is not null))
);

-- Historical versions used UNIQUE(code), which incorrectly made tenant codes
-- global. Remove only that obsolete constraint; no table or data is removed.
do $$
declare
  constraint_name name;
begin
  select c.conname into constraint_name
  from pg_constraint c
  where c.conrelid = 'public.build_work_package_templates'::regclass
    and c.contype = 'u'
    and array(
      select a.attname::text
      from unnest(c.conkey) with ordinality k(attnum, ord)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      order by k.ord
    ) = array['code']::text[]
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.build_work_package_templates drop constraint %I', constraint_name);
  end if;
end
$$;

create unique index if not exists uq_build_wp_templates_global_code
  on public.build_work_package_templates (code)
  where is_global = true and client_id is null;
create unique index if not exists uq_build_wp_templates_tenant_code
  on public.build_work_package_templates (client_id, code)
  where is_global = false and client_id is not null;
create index if not exists idx_build_wp_templates_client_id on public.build_work_package_templates(client_id);
create index if not exists idx_build_wp_templates_global on public.build_work_package_templates(is_global);
create index if not exists idx_build_wp_templates_status on public.build_work_package_templates(status);
create index if not exists idx_build_wp_templates_archived_at on public.build_work_package_templates(archived_at);

create table if not exists public.build_work_packages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid not null references public.build_sites(id) on delete cascade,
  template_id uuid references public.build_work_package_templates(id) on delete set null,
  code text not null,
  name text not null,
  description text,
  work_package_type text,
  contractor text,
  planned_start date,
  planned_finish date,
  actual_start date,
  actual_finish date,
  status text not null default 'planned' check (status in ('planned', 'active', 'on_hold', 'completed', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (site_id, code)
);

alter table public.build_work_packages
  add column if not exists template_id uuid references public.build_work_package_templates(id) on delete set null;

create index if not exists idx_build_work_packages_client_id on public.build_work_packages(client_id);
create index if not exists idx_build_work_packages_project_id on public.build_work_packages(project_id);
create index if not exists idx_build_work_packages_site_id on public.build_work_packages(site_id);
create index if not exists idx_build_work_packages_template_id on public.build_work_packages(template_id);
create index if not exists idx_build_work_packages_status on public.build_work_packages(status);
create index if not exists idx_build_work_packages_archived_at on public.build_work_packages(archived_at);

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.build_work_packages'::regclass and conname = 'build_work_packages_project_client_fkey') then
    alter table public.build_work_packages
      add constraint build_work_packages_project_client_fkey
      foreign key (project_id, client_id) references public.projects(id, client_id)
      on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.build_work_packages'::regclass and conname = 'build_work_packages_site_project_client_fkey') then
    alter table public.build_work_packages
      add constraint build_work_packages_site_project_client_fkey
      foreign key (site_id, project_id, client_id)
      references public.build_sites(id, project_id, client_id)
      on delete cascade not valid;
  end if;
end
$$;

create table if not exists public.build_activity_categories (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.build_work_package_templates(id) on delete cascade,
  sequence integer not null default 1 check (sequence > 0),
  code text not null,
  name text not null,
  description text,
  category_type public.build_activity_category_type not null default 'general',
  estimated_duration integer check (estimated_duration is null or estimated_duration >= 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, sequence),
  unique (template_id, code)
);

create index if not exists idx_build_activity_categories_template_id on public.build_activity_categories(template_id);
create index if not exists idx_build_activity_categories_status on public.build_activity_categories(status);

create table if not exists public.build_activity_templates (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.build_work_package_templates(id) on delete cascade,
  activity_category_id uuid references public.build_activity_categories(id) on delete restrict,
  sequence integer not null default 1 check (sequence > 0),
  code text not null,
  name text not null,
  description text,
  estimated_duration integer check (estimated_duration is null or estimated_duration >= 0),
  duration_unit text not null default 'days' check (duration_unit in ('hours', 'days', 'weeks')),
  mandatory boolean not null default true,
  requires_photo boolean not null default false,
  requires_gps boolean not null default false,
  requires_approval boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (template_id, code),
  unique (template_id, sequence)
);

alter table public.build_activity_templates
  add column if not exists activity_category_id uuid references public.build_activity_categories(id) on delete restrict,
  add column if not exists duration_unit text not null default 'days',
  add column if not exists status text not null default 'draft',
  add column if not exists notes text,
  add column if not exists archived_at timestamptz;

create index if not exists idx_build_activity_templates_template_id on public.build_activity_templates(template_id);
create index if not exists idx_build_activity_templates_activity_category_id on public.build_activity_templates(activity_category_id);
create index if not exists idx_build_activity_templates_category_sequence on public.build_activity_templates(activity_category_id, sequence);
create index if not exists idx_build_activity_templates_status on public.build_activity_templates(status);
create index if not exists idx_build_activity_templates_archived_at on public.build_activity_templates(archived_at);

create table if not exists public.build_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  activity_template_id uuid not null references public.build_activity_templates(id) on delete cascade,
  sequence integer not null default 1 check (sequence > 0),
  item text not null,
  description text,
  mandatory boolean not null default true,
  requires_photo boolean not null default false,
  requires_comment boolean not null default false,
  acceptance_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (activity_template_id, sequence)
);

alter table public.build_checklist_templates
  add column if not exists description text,
  add column if not exists requires_photo boolean not null default false,
  add column if not exists requires_comment boolean not null default false,
  add column if not exists acceptance_type text,
  add column if not exists archived_at timestamptz;

create index if not exists idx_build_checklist_templates_activity_id on public.build_checklist_templates(activity_template_id);
create index if not exists idx_build_checklist_templates_activity_sequence on public.build_checklist_templates(activity_template_id, sequence);
create index if not exists idx_build_checklist_templates_archived_at on public.build_checklist_templates(archived_at);

create table if not exists public.build_inspection_templates (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.build_work_package_templates(id) on delete cascade,
  sequence integer not null default 1 check (sequence > 0),
  inspection_type text not null,
  inspector_role text,
  frequency text,
  acceptance_criteria text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, sequence)
);

create table if not exists public.build_safety_templates (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.build_work_package_templates(id) on delete cascade,
  sequence integer not null default 1 check (sequence > 0),
  task_name text not null,
  ppe_required boolean not null default false,
  permit_required boolean not null default false,
  toolbox_talk_required boolean not null default false,
  hazard_assessment_required boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, sequence)
);

create table if not exists public.build_supply_templates (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.build_work_package_templates(id) on delete cascade,
  sequence integer not null default 1 check (sequence > 0),
  material text not null,
  quantity numeric(14,2),
  unit text,
  preferred_supplier text,
  delivery_stage text,
  consumption_stage text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, sequence)
);

create table if not exists public.build_equipment_templates (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.build_work_package_templates(id) on delete cascade,
  sequence integer not null default 1 check (sequence > 0),
  equipment_name text not null,
  quantity numeric(14,2),
  unit text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, sequence)
);

create index if not exists idx_build_inspection_templates_template_id on public.build_inspection_templates(template_id);
create index if not exists idx_build_safety_templates_template_id on public.build_safety_templates(template_id);
create index if not exists idx_build_supply_templates_template_id on public.build_supply_templates(template_id);
create index if not exists idx_build_equipment_templates_template_id on public.build_equipment_templates(template_id);

create table if not exists public.build_resources (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  resource_type public.build_resource_type not null,
  category text,
  unit_of_measure text,
  specification text,
  default_rate numeric(14,2),
  currency text,
  is_global boolean not null default false,
  status text not null default 'active' check (status in ('draft', 'active', 'inactive', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((is_global = true and client_id is null) or (is_global = false and client_id is not null))
);

create unique index if not exists uq_build_resources_global_code
  on public.build_resources (code) where is_global = true and client_id is null;
create unique index if not exists uq_build_resources_tenant_code
  on public.build_resources (client_id, code) where is_global = false and client_id is not null;
create index if not exists idx_build_resources_client_id on public.build_resources(client_id);
create index if not exists idx_build_resources_type on public.build_resources(resource_type);
create index if not exists idx_build_resources_status on public.build_resources(status);
create index if not exists idx_build_resources_archived_at on public.build_resources(archived_at);
create index if not exists idx_build_resources_global on public.build_resources(is_global);

create table if not exists public.build_template_resource_requirements (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.build_work_package_templates(id) on delete cascade,
  activity_category_id uuid references public.build_activity_categories(id) on delete cascade,
  activity_template_id uuid references public.build_activity_templates(id) on delete cascade,
  resource_id uuid not null references public.build_resources(id) on delete restrict,
  sequence integer not null default 1 check (sequence > 0),
  quantity numeric(14,2) not null check (quantity > 0),
  unit_of_measure text,
  requirement_type public.build_resource_requirement_type not null default 'estimated',
  required_stage text,
  mandatory boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index if not exists uq_build_template_resource_req_scope_seq
  on public.build_template_resource_requirements (
    template_id,
    coalesce(activity_category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(activity_template_id, '00000000-0000-0000-0000-000000000000'::uuid),
    sequence
  ) where archived_at is null;
create index if not exists idx_build_template_resource_req_template_id on public.build_template_resource_requirements(template_id);
create index if not exists idx_build_template_resource_req_category_id on public.build_template_resource_requirements(activity_category_id);
create index if not exists idx_build_template_resource_req_activity_template_id on public.build_template_resource_requirements(activity_template_id);
create index if not exists idx_build_template_resource_req_resource_id on public.build_template_resource_requirements(resource_id);
create index if not exists idx_build_template_resource_req_archived_at on public.build_template_resource_requirements(archived_at);

create table if not exists public.build_activity_template_dependencies (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.build_work_package_templates(id) on delete cascade,
  predecessor_activity_template_id uuid not null references public.build_activity_templates(id) on delete cascade,
  successor_activity_template_id uuid not null references public.build_activity_templates(id) on delete cascade,
  dependency_type public.build_activity_dependency_type not null default 'FS',
  lag_value integer not null default 0 check (lag_value >= 0),
  lag_unit public.build_activity_dependency_lag_unit not null default 'days',
  mandatory boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (predecessor_activity_template_id <> successor_activity_template_id)
);

create unique index if not exists uq_build_activity_dependency_pair
  on public.build_activity_template_dependencies
    (template_id, predecessor_activity_template_id, successor_activity_template_id)
  where archived_at is null;
create index if not exists idx_build_activity_dependency_template_id on public.build_activity_template_dependencies(template_id);
create index if not exists idx_build_activity_dependency_predecessor on public.build_activity_template_dependencies(predecessor_activity_template_id);
create index if not exists idx_build_activity_dependency_successor on public.build_activity_template_dependencies(successor_activity_template_id);
create index if not exists idx_build_activity_dependency_archived_at on public.build_activity_template_dependencies(archived_at);

-- One non-definer touch function is sufficient for the complete Build family.
create or replace function public.touch_build_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.validate_build_site_authority()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  authoritative_client_id uuid;
  authoritative_project_type text;
begin
  select p.client_id, p.project_type
    into authoritative_client_id, authoritative_project_type
  from public.projects p where p.id = new.project_id;

  if authoritative_client_id is null then
    raise exception 'project_id does not reference an existing project';
  end if;
  if authoritative_client_id <> new.client_id then
    raise exception 'Build site client must match its project client';
  end if;
  if authoritative_project_type not in ('Construction', 'Real Estate', 'Facility Management') then
    raise exception 'Build sites require an explicit Build-compatible project type';
  end if;
  return new;
end;
$$;

create or replace function public.validate_build_work_package_template_assignment()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  template_client_id uuid;
  template_is_global boolean;
begin
  if new.template_id is null then return new; end if;
  select t.client_id, t.is_global into template_client_id, template_is_global
  from public.build_work_package_templates t
  where t.id = new.template_id and t.archived_at is null;

  if template_is_global is null then
    raise exception 'template_id does not reference an active template';
  end if;
  if template_is_global = false and template_client_id <> new.client_id then
    raise exception 'work package template is not visible to this tenant';
  end if;
  if template_is_global = true and template_client_id is not null then
    raise exception 'global template ownership is invalid';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_build_template_scope_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.client_id is distinct from old.client_id or new.is_global is distinct from old.is_global then
    raise exception 'Build template tenant/global ownership is immutable';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_build_resource_scope_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.client_id is distinct from old.client_id or new.is_global is distinct from old.is_global then
    raise exception 'Build resource tenant/global ownership is immutable';
  end if;
  return new;
end;
$$;

create or replace function public.validate_build_activity_template_category()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare category_template_id uuid;
begin
  if tg_op = 'UPDATE' and new.template_id is distinct from old.template_id then
    raise exception 'activity template ownership is immutable';
  end if;
  if new.activity_category_id is null then
    raise exception 'activity_category_id is required for activity templates';
  end if;
  select c.template_id into category_template_id
  from public.build_activity_categories c where c.id = new.activity_category_id;
  if category_template_id is null or category_template_id <> new.template_id then
    raise exception 'activity category must belong to the same template as the activity template';
  end if;
  if tg_op = 'UPDATE' and new.activity_category_id is distinct from old.activity_category_id
     and exists (
       select 1 from public.build_template_resource_requirements r
       where r.activity_template_id = new.id
         and r.activity_category_id is not null
         and r.activity_category_id <> new.activity_category_id
     ) then
    raise exception 'activity category change would invalidate resource requirement ancestry';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_build_category_template_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.template_id is distinct from old.template_id then
    raise exception 'activity category template ownership is immutable';
  end if;
  return new;
end;
$$;

create or replace function public.validate_build_template_resource_requirement()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  template_client_id uuid;
  template_is_global boolean;
  category_template_id uuid;
  activity_parent_template_id uuid;
  activity_parent_category_id uuid;
  resource_client_id uuid;
  resource_is_global boolean;
  resource_unit text;
begin
  select t.client_id, t.is_global into template_client_id, template_is_global
  from public.build_work_package_templates t where t.id = new.template_id;
  if template_is_global is null then raise exception 'template_id does not reference a valid template'; end if;

  if new.activity_category_id is not null then
    select c.template_id into category_template_id
    from public.build_activity_categories c where c.id = new.activity_category_id;
    if category_template_id is null or category_template_id <> new.template_id then
      raise exception 'activity_category_id must belong to the same template';
    end if;
  end if;

  if new.activity_template_id is not null then
    select a.template_id, a.activity_category_id into activity_parent_template_id, activity_parent_category_id
    from public.build_activity_templates a where a.id = new.activity_template_id;
    if activity_parent_template_id is null or activity_parent_template_id <> new.template_id then
      raise exception 'activity_template_id must belong to the same template';
    end if;
    if new.activity_category_id is not null and activity_parent_category_id <> new.activity_category_id then
      raise exception 'activity_template_id category must match activity_category_id';
    end if;
  end if;

  select r.client_id, r.is_global, r.unit_of_measure
    into resource_client_id, resource_is_global, resource_unit
  from public.build_resources r where r.id = new.resource_id and r.archived_at is null;
  if resource_is_global is null then raise exception 'resource_id does not reference an active resource'; end if;
  if template_is_global = true and resource_is_global <> true then
    raise exception 'global templates may only reference global resources';
  end if;
  if template_is_global = false and not (resource_is_global = true or resource_client_id = template_client_id) then
    raise exception 'resource_id is not visible to template tenant';
  end if;

  if (new.unit_of_measure is null or btrim(new.unit_of_measure) = '') and coalesce(btrim(resource_unit), '') <> '' then
    new.unit_of_measure = resource_unit;
  end if;
  if coalesce(btrim(new.unit_of_measure), '') = '' then
    raise exception 'unit_of_measure is required or must be resolvable from resource';
  end if;
  return new;
end;
$$;

create or replace function public.validate_build_activity_template_dependency()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare predecessor_template_id uuid; successor_template_id uuid;
begin
  if new.predecessor_activity_template_id = new.successor_activity_template_id then
    raise exception 'activity template dependency cannot reference itself';
  end if;
  select a.template_id into predecessor_template_id from public.build_activity_templates a
    where a.id = new.predecessor_activity_template_id;
  select a.template_id into successor_template_id from public.build_activity_templates a
    where a.id = new.successor_activity_template_id;
  if predecessor_template_id is null or successor_template_id is null
     or predecessor_template_id <> new.template_id or successor_template_id <> new.template_id then
    raise exception 'dependency activities must belong to the same template';
  end if;
  return new;
end;
$$;

-- Replace only trigger definitions; this does not alter stored Build data.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'build_sites', 'build_work_packages', 'build_work_package_templates',
    'build_activity_categories', 'build_activity_templates', 'build_checklist_templates',
    'build_inspection_templates', 'build_safety_templates', 'build_supply_templates',
    'build_equipment_templates', 'build_resources',
    'build_template_resource_requirements', 'build_activity_template_dependencies'
  ] loop
    execute format('drop trigger if exists trg_bh1b_touch_updated_at on public.%I', table_name);
    execute format(
      'create trigger trg_bh1b_touch_updated_at before update on public.%I for each row execute function public.touch_build_updated_at()',
      table_name
    );
  end loop;
end
$$;

drop trigger if exists trg_bh1b_validate_site_authority on public.build_sites;
create trigger trg_bh1b_validate_site_authority
before insert or update of client_id, project_id on public.build_sites
for each row execute function public.validate_build_site_authority();

drop trigger if exists trg_bh1b_validate_template_assignment on public.build_work_packages;
create trigger trg_bh1b_validate_template_assignment
before insert or update of client_id, template_id on public.build_work_packages
for each row execute function public.validate_build_work_package_template_assignment();

drop trigger if exists trg_bh1b_prevent_template_scope_change on public.build_work_package_templates;
create trigger trg_bh1b_prevent_template_scope_change
before update of client_id, is_global on public.build_work_package_templates
for each row execute function public.prevent_build_template_scope_change();

drop trigger if exists trg_bh1b_prevent_resource_scope_change on public.build_resources;
create trigger trg_bh1b_prevent_resource_scope_change
before update of client_id, is_global on public.build_resources
for each row execute function public.prevent_build_resource_scope_change();

drop trigger if exists trg_bh1b_prevent_category_template_change on public.build_activity_categories;
create trigger trg_bh1b_prevent_category_template_change
before update of template_id on public.build_activity_categories
for each row execute function public.prevent_build_category_template_change();

drop trigger if exists trg_validate_build_activity_template_category on public.build_activity_templates;
create trigger trg_validate_build_activity_template_category
before insert or update of template_id, activity_category_id on public.build_activity_templates
for each row execute function public.validate_build_activity_template_category();

drop trigger if exists trg_validate_build_template_resource_requirement on public.build_template_resource_requirements;
create trigger trg_validate_build_template_resource_requirement
before insert or update on public.build_template_resource_requirements
for each row execute function public.validate_build_template_resource_requirement();

drop trigger if exists trg_validate_build_activity_template_dependency on public.build_activity_template_dependencies;
create trigger trg_validate_build_activity_template_dependency
before insert or update on public.build_activity_template_dependencies
for each row execute function public.validate_build_activity_template_dependency();

-- Browser roles remain default-denied. Existing policies are removed before
-- privileges are revoked so partially-created schemas cannot retain broad CRUD.
do $$
declare table_name text; policy_name text;
begin
  foreach table_name in array array[
    'build_sites', 'build_work_packages', 'build_work_package_templates',
    'build_activity_categories', 'build_activity_templates', 'build_checklist_templates',
    'build_inspection_templates', 'build_safety_templates', 'build_supply_templates',
    'build_equipment_templates', 'build_resources',
    'build_template_resource_requirements', 'build_activity_template_dependencies'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all privileges on table public.%I from anon, authenticated', table_name);
    execute format('grant all privileges on table public.%I to service_role', table_name);
    for policy_name in
      select p.policyname from pg_policies p where p.schemaname = 'public' and p.tablename = table_name
    loop
      execute format('drop policy %I on public.%I', policy_name, table_name);
    end loop;
  end loop;
end
$$;

revoke all on function public.touch_build_updated_at() from public, anon, authenticated;
revoke all on function public.validate_build_site_authority() from public, anon, authenticated;
revoke all on function public.validate_build_work_package_template_assignment() from public, anon, authenticated;
revoke all on function public.prevent_build_template_scope_change() from public, anon, authenticated;
revoke all on function public.prevent_build_resource_scope_change() from public, anon, authenticated;
revoke all on function public.validate_build_activity_template_category() from public, anon, authenticated;
revoke all on function public.prevent_build_category_template_change() from public, anon, authenticated;
revoke all on function public.validate_build_template_resource_requirement() from public, anon, authenticated;
revoke all on function public.validate_build_activity_template_dependency() from public, anon, authenticated;

comment on table public.build_sites is 'Build sites constrained to the authoritative client and an explicit Build-compatible canonical project.';
comment on table public.build_work_package_templates is 'Tenant-owned templates use client_id; global templates are represented by is_global=true and client_id=null.';
comment on table public.build_resources is 'Tenant-owned resources use client_id; global resources are represented by is_global=true and client_id=null.';

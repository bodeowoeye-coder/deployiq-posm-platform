create extension if not exists "pgcrypto";

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  can_review boolean not null default false,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now()
);

create table if not exists public.client_profiles (
  client_id uuid primary key references public.clients(id) on delete cascade,
  contact_person text,
  email text,
  phone text,
  industry_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients
add column if not exists status text not null default 'Active'
check (status in ('Active', 'Inactive'));

alter table public.client_profiles
add column if not exists industry_category text;

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  brand_name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  project_name text not null,
  campaign_name text,
  project_type text not null default 'Retail Deployment' check (project_type in ('Retail Deployment', 'Construction', 'Real Estate', 'Facility Management')),
  project_code text,
  client_project_reference text,
  project_manager text,
  site_supervisor text,
  consultant text,
  contractor text,
  start_date date,
  end_date date,
  planned_completion date,
  actual_completion date,
  budget numeric,
  currency text,
  target_quantity integer not null default 0 check (target_quantity >= 0),
  status text not null default 'Planning' check (status in ('Planning', 'Active', 'On Hold', 'Completed', 'Not Started', 'In Progress', 'Delayed', 'Cancelled')),
  primary_target_region text,
  primary_target_state text,
  regions_covered text[] not null default '{}',
  assigned_installers text[] not null default '{}',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (client_id, project_name)
);

alter table public.projects
add column if not exists project_type text not null default 'Retail Deployment'
check (project_type in ('Retail Deployment', 'Construction', 'Real Estate', 'Facility Management'));

alter table public.projects add column if not exists project_code text;
alter table public.projects add column if not exists client_project_reference text;
alter table public.projects add column if not exists project_manager text;
alter table public.projects add column if not exists site_supervisor text;
alter table public.projects add column if not exists consultant text;
alter table public.projects add column if not exists contractor text;
alter table public.projects add column if not exists planned_completion date;
alter table public.projects add column if not exists actual_completion date;
alter table public.projects add column if not exists primary_target_region text;
alter table public.projects add column if not exists primary_target_state text;
alter table public.projects add column if not exists budget numeric;
alter table public.projects add column if not exists currency text;

create table if not exists public.business_units (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (client_id, code)
);

create table if not exists public.project_portfolios (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  business_unit_id uuid references public.business_units(id) on delete set null,
  code text not null,
  name text not null,
  description text,
  portfolio_type text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  planned_start_date date,
  planned_end_date date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (client_id, code)
);

alter table public.projects add column if not exists business_unit_id uuid references public.business_units(id) on delete set null;
alter table public.projects add column if not exists portfolio_id uuid references public.project_portfolios(id) on delete set null;

create index if not exists idx_business_units_client_id on public.business_units(client_id);
create index if not exists idx_business_units_status on public.business_units(status);
create index if not exists idx_business_units_archived_at on public.business_units(archived_at);

create index if not exists idx_project_portfolios_client_id on public.project_portfolios(client_id);
create index if not exists idx_project_portfolios_business_unit_id on public.project_portfolios(business_unit_id);
create index if not exists idx_project_portfolios_status on public.project_portfolios(status);
create index if not exists idx_project_portfolios_archived_at on public.project_portfolios(archived_at);

create index if not exists idx_projects_business_unit_id on public.projects(business_unit_id);
create index if not exists idx_projects_portfolio_id on public.projects(portfolio_id);

create or replace function public.touch_business_units_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_business_units_updated_at on public.business_units;
create trigger trg_touch_business_units_updated_at
before update on public.business_units
for each row execute function public.touch_business_units_updated_at();

create or replace function public.touch_project_portfolios_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_project_portfolios_updated_at on public.project_portfolios;
create trigger trg_touch_project_portfolios_updated_at
before update on public.project_portfolios
for each row execute function public.touch_project_portfolios_updated_at();

create table if not exists public.project_targets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  installer_name text,
  installer_user_id uuid references auth.users(id) on delete set null,
  agency_name text,
  region text,
  state text,
  target_quantity integer not null default 0 check (target_quantity >= 0),
  deployment_timeline_start date,
  deployment_timeline_end date,
  created_at timestamptz not null default now()
);

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

create index if not exists idx_build_sites_client_id on public.build_sites(client_id);
create index if not exists idx_build_sites_project_id on public.build_sites(project_id);
create index if not exists idx_build_sites_status on public.build_sites(status);
create index if not exists idx_build_sites_archived_at on public.build_sites(archived_at);

create or replace function public.touch_build_sites_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_build_sites_updated_at on public.build_sites;
create trigger trg_touch_build_sites_updated_at
before update on public.build_sites
for each row execute function public.touch_build_sites_updated_at();

create table if not exists public.build_work_packages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid not null references public.build_sites(id) on delete cascade,
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

create index if not exists idx_build_work_packages_client_id on public.build_work_packages(client_id);
create index if not exists idx_build_work_packages_project_id on public.build_work_packages(project_id);
create index if not exists idx_build_work_packages_site_id on public.build_work_packages(site_id);
create index if not exists idx_build_work_packages_status on public.build_work_packages(status);
create index if not exists idx_build_work_packages_archived_at on public.build_work_packages(archived_at);

create or replace function public.touch_build_work_packages_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_build_work_packages_updated_at on public.build_work_packages;
create trigger trg_touch_build_work_packages_updated_at
before update on public.build_work_packages
for each row execute function public.touch_build_work_packages_updated_at();

create table if not exists public.build_work_package_templates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  code text not null unique,
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

create index if not exists idx_build_wp_templates_client_id on public.build_work_package_templates(client_id);
create index if not exists idx_build_wp_templates_global on public.build_work_package_templates(is_global);
create index if not exists idx_build_wp_templates_status on public.build_work_package_templates(status);
create index if not exists idx_build_wp_templates_archived_at on public.build_work_package_templates(archived_at);

do $$
begin
  if not exists (select 1 from pg_type where typname = 'build_activity_category_type') then
    create type public.build_activity_category_type as enum (
      'preparation',
      'execution',
      'inspection',
      'testing',
      'commissioning',
      'close_out',
      'general'
    );
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

create index if not exists idx_build_activity_templates_template_id on public.build_activity_templates(template_id);
create index if not exists idx_build_activity_templates_status on public.build_activity_templates(status);
create index if not exists idx_build_activity_templates_archived_at on public.build_activity_templates(archived_at);

alter table public.build_activity_templates
  add column if not exists activity_category_id uuid references public.build_activity_categories(id) on delete restrict;

create index if not exists idx_build_activity_templates_activity_category_id
  on public.build_activity_templates(activity_category_id);

create index if not exists idx_build_activity_templates_category_sequence
  on public.build_activity_templates(activity_category_id, sequence);

create or replace function public.validate_build_activity_template_category()
returns trigger
language plpgsql
as $$
declare
  category_template_id uuid;
begin
  if new.activity_category_id is null then
    raise exception 'activity_category_id is required for activity templates';
  end if;

  select template_id into category_template_id
  from public.build_activity_categories
  where id = new.activity_category_id;

  if category_template_id is null then
    raise exception 'activity_category_id does not reference an existing category';
  end if;

  if category_template_id <> new.template_id then
    raise exception 'activity category must belong to the same template as the activity template';
  end if;

  return new;
end;
$$;

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

create index if not exists idx_build_checklist_templates_activity_id on public.build_checklist_templates(activity_template_id);
create index if not exists idx_build_checklist_templates_archived_at on public.build_checklist_templates(archived_at);
create index if not exists idx_build_checklist_templates_activity_sequence
  on public.build_checklist_templates(activity_template_id, sequence);

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

create index if not exists idx_build_inspection_templates_template_id on public.build_inspection_templates(template_id);

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

create index if not exists idx_build_safety_templates_template_id on public.build_safety_templates(template_id);

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

create index if not exists idx_build_supply_templates_template_id on public.build_supply_templates(template_id);

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

create index if not exists idx_build_equipment_templates_template_id on public.build_equipment_templates(template_id);

do $$
begin
  if not exists (select 1 from pg_type where typname = 'build_resource_type') then
    create type public.build_resource_type as enum (
      'labour',
      'material',
      'equipment',
      'vehicle',
      'contractor',
      'service'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'build_resource_requirement_type') then
    create type public.build_resource_requirement_type as enum (
      'estimated',
      'mandatory',
      'optional'
    );
  end if;
end
$$;

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
  on public.build_resources (code)
  where is_global = true;

create unique index if not exists uq_build_resources_tenant_code
  on public.build_resources (client_id, code)
  where is_global = false and client_id is not null;

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
  )
  where archived_at is null;

create index if not exists idx_build_template_resource_req_template_id
  on public.build_template_resource_requirements(template_id);
create index if not exists idx_build_template_resource_req_category_id
  on public.build_template_resource_requirements(activity_category_id);
create index if not exists idx_build_template_resource_req_activity_template_id
  on public.build_template_resource_requirements(activity_template_id);
create index if not exists idx_build_template_resource_req_resource_id
  on public.build_template_resource_requirements(resource_id);
create index if not exists idx_build_template_resource_req_archived_at
  on public.build_template_resource_requirements(archived_at);

do $$
begin
  if not exists (select 1 from pg_type where typname = 'build_activity_dependency_type') then
    create type public.build_activity_dependency_type as enum ('FS', 'SS', 'FF', 'SF');
  end if;

  if not exists (select 1 from pg_type where typname = 'build_activity_dependency_lag_unit') then
    create type public.build_activity_dependency_lag_unit as enum ('hours', 'days', 'weeks');
  end if;
end
$$;

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
  on public.build_activity_template_dependencies (
    template_id,
    predecessor_activity_template_id,
    successor_activity_template_id
  )
  where archived_at is null;

create index if not exists idx_build_activity_dependency_template_id
  on public.build_activity_template_dependencies(template_id);
create index if not exists idx_build_activity_dependency_predecessor
  on public.build_activity_template_dependencies(predecessor_activity_template_id);
create index if not exists idx_build_activity_dependency_successor
  on public.build_activity_template_dependencies(successor_activity_template_id);
create index if not exists idx_build_activity_dependency_archived_at
  on public.build_activity_template_dependencies(archived_at);

alter table public.build_work_packages
  add column if not exists template_id uuid references public.build_work_package_templates(id) on delete set null;

create index if not exists idx_build_work_packages_template_id on public.build_work_packages(template_id);

create or replace function public.touch_build_work_package_templates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.touch_build_activity_templates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.touch_build_activity_categories_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.touch_build_checklist_templates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.touch_build_inspection_templates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.touch_build_safety_templates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.touch_build_supply_templates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.touch_build_equipment_templates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.touch_build_resources_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.touch_build_template_resource_requirements_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.validate_build_template_resource_requirement()
returns trigger
language plpgsql
as $$
declare
  template_client_id uuid;
  template_is_global boolean;
  category_template_id uuid;
  activity_template_template_id uuid;
  activity_template_category_id uuid;
  resource_client_id uuid;
  resource_is_global boolean;
  resource_unit text;
begin
  select client_id, is_global
    into template_client_id, template_is_global
  from public.build_work_package_templates
  where id = new.template_id;

  if template_client_id is null and coalesce(template_is_global, false) = false then
    raise exception 'template_id does not reference a valid template';
  end if;

  if new.activity_category_id is not null then
    select template_id
      into category_template_id
    from public.build_activity_categories
    where id = new.activity_category_id;

    if category_template_id is null then
      raise exception 'activity_category_id does not reference an existing category';
    end if;

    if category_template_id <> new.template_id then
      raise exception 'activity_category_id must belong to the same template';
    end if;
  end if;

  if new.activity_template_id is not null then
    select template_id, activity_category_id
      into activity_template_template_id, activity_template_category_id
    from public.build_activity_templates
    where id = new.activity_template_id;

    if activity_template_template_id is null then
      raise exception 'activity_template_id does not reference an existing activity template';
    end if;

    if activity_template_template_id <> new.template_id then
      raise exception 'activity_template_id must belong to the same template';
    end if;

    if new.activity_category_id is not null and activity_template_category_id <> new.activity_category_id then
      raise exception 'activity_template_id category must match activity_category_id when both are provided';
    end if;
  end if;

  select client_id, is_global, unit_of_measure
    into resource_client_id, resource_is_global, resource_unit
  from public.build_resources
  where id = new.resource_id;

  if resource_is_global is null then
    raise exception 'resource_id does not reference an existing resource';
  end if;

  if template_is_global = true then
    if resource_is_global <> true then
      raise exception 'global templates may only reference global resources';
    end if;
  else
    if not (resource_is_global = true or resource_client_id = template_client_id) then
      raise exception 'resource_id is not visible to template tenant';
    end if;
  end if;

  if (new.unit_of_measure is null or btrim(new.unit_of_measure) = '') and resource_unit is not null and btrim(resource_unit) <> '' then
    new.unit_of_measure = resource_unit;
  end if;

  if new.unit_of_measure is null or btrim(new.unit_of_measure) = '' then
    raise exception 'unit_of_measure is required or must be resolvable from resource';
  end if;

  return new;
end;
$$;

create or replace function public.touch_build_activity_template_dependencies_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.validate_build_activity_template_dependency()
returns trigger
language plpgsql
as $$
declare
  predecessor_template_id uuid;
  successor_template_id uuid;
begin
  select template_id into predecessor_template_id
  from public.build_activity_templates
  where id = new.predecessor_activity_template_id;

  if predecessor_template_id is null then
    raise exception 'predecessor_activity_template_id does not reference an existing activity template';
  end if;

  select template_id into successor_template_id
  from public.build_activity_templates
  where id = new.successor_activity_template_id;

  if successor_template_id is null then
    raise exception 'successor_activity_template_id does not reference an existing activity template';
  end if;

  if predecessor_template_id <> new.template_id or successor_template_id <> new.template_id then
    raise exception 'dependency activities must belong to the same template';
  end if;

  if new.predecessor_activity_template_id = new.successor_activity_template_id then
    raise exception 'activity template dependency cannot reference itself';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_touch_build_work_package_templates_updated_at on public.build_work_package_templates;
create trigger trg_touch_build_work_package_templates_updated_at
before update on public.build_work_package_templates
for each row execute function public.touch_build_work_package_templates_updated_at();

drop trigger if exists trg_touch_build_activity_templates_updated_at on public.build_activity_templates;
create trigger trg_touch_build_activity_templates_updated_at
before update on public.build_activity_templates
for each row execute function public.touch_build_activity_templates_updated_at();

drop trigger if exists trg_validate_build_activity_template_category on public.build_activity_templates;
create trigger trg_validate_build_activity_template_category
before insert or update on public.build_activity_templates
for each row execute function public.validate_build_activity_template_category();

drop trigger if exists trg_touch_build_activity_categories_updated_at on public.build_activity_categories;
create trigger trg_touch_build_activity_categories_updated_at
before update on public.build_activity_categories
for each row execute function public.touch_build_activity_categories_updated_at();

drop trigger if exists trg_touch_build_checklist_templates_updated_at on public.build_checklist_templates;
create trigger trg_touch_build_checklist_templates_updated_at
before update on public.build_checklist_templates
for each row execute function public.touch_build_checklist_templates_updated_at();

drop trigger if exists trg_touch_build_inspection_templates_updated_at on public.build_inspection_templates;
create trigger trg_touch_build_inspection_templates_updated_at
before update on public.build_inspection_templates
for each row execute function public.touch_build_inspection_templates_updated_at();

drop trigger if exists trg_touch_build_safety_templates_updated_at on public.build_safety_templates;
create trigger trg_touch_build_safety_templates_updated_at
before update on public.build_safety_templates
for each row execute function public.touch_build_safety_templates_updated_at();

drop trigger if exists trg_touch_build_supply_templates_updated_at on public.build_supply_templates;
create trigger trg_touch_build_supply_templates_updated_at
before update on public.build_supply_templates
for each row execute function public.touch_build_supply_templates_updated_at();

drop trigger if exists trg_touch_build_equipment_templates_updated_at on public.build_equipment_templates;
create trigger trg_touch_build_equipment_templates_updated_at
before update on public.build_equipment_templates
for each row execute function public.touch_build_equipment_templates_updated_at();

drop trigger if exists trg_touch_build_resources_updated_at on public.build_resources;
create trigger trg_touch_build_resources_updated_at
before update on public.build_resources
for each row execute function public.touch_build_resources_updated_at();

drop trigger if exists trg_touch_build_template_resource_requirements_updated_at on public.build_template_resource_requirements;
create trigger trg_touch_build_template_resource_requirements_updated_at
before update on public.build_template_resource_requirements
for each row execute function public.touch_build_template_resource_requirements_updated_at();

drop trigger if exists trg_validate_build_template_resource_requirement on public.build_template_resource_requirements;
create trigger trg_validate_build_template_resource_requirement
before insert or update on public.build_template_resource_requirements
for each row execute function public.validate_build_template_resource_requirement();

drop trigger if exists trg_touch_build_activity_template_dependencies_updated_at on public.build_activity_template_dependencies;
create trigger trg_touch_build_activity_template_dependencies_updated_at
before update on public.build_activity_template_dependencies
for each row execute function public.touch_build_activity_template_dependencies_updated_at();

drop trigger if exists trg_validate_build_activity_template_dependency on public.build_activity_template_dependencies;
create trigger trg_validate_build_activity_template_dependency
before insert or update on public.build_activity_template_dependencies
for each row execute function public.validate_build_activity_template_dependency();

create table if not exists public.deployment_stages (
  id uuid primary key default gen_random_uuid(),
  stage_code text not null unique check (stage_code in ('production', 'warehouse', 'in_transit', 'installed', 'approved')),
  stage_name text not null,
  sort_order integer not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.deployment_progress (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_code text not null references public.deployment_stages(stage_code) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (project_id, stage_code)
);

create table if not exists public.installer_performance (
  installer_name text primary key,
  total_submissions integer not null default 0,
  approved_submissions integer not null default 0,
  rejected_submissions integer not null default 0,
  flagged_submissions integer not null default 0,
  duplicate_submissions integer not null default 0,
  mismatch_submissions integer not null default 0,
  average_turnaround_hours numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  agency_name text not null unique,
  contact_person text,
  email text,
  phone text,
  assigned_regions text[] not null default '{}',
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now()
);

create table if not exists public.installers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  installer_name text not null unique,
  agency_id uuid references public.agencies(id) on delete set null,
  assigned_regions text[] not null default '{}',
  assigned_states text[] not null default '{}',
  assigned_project_ids uuid[] not null default '{}',
  access_status text not null default 'Active' check (access_status in ('Active', 'Suspended', 'Inactive')),
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now()
);

create table if not exists public.client_projects (
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, project_id)
);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  client_id uuid references public.clients(id) on delete cascade,
  phase_name text,
  destination text,
  quantity integer,
  title text not null,
  message text not null,
  status text not null default 'unread',
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'client', 'installer')),
  client_id uuid references public.clients(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null unique,
  phone text,
  agency_id uuid references public.agencies(id) on delete set null,
  assigned_project_ids uuid[] not null default '{}',
  assigned_regions text[] not null default '{}',
  assigned_states text[] not null default '{}',
  status text not null default 'Active' check (status in ('Active', 'Inactive', 'Suspended', 'Archived')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action_type text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.onboarding_drafts (
  id uuid primary key default gen_random_uuid(),
  resume_token text not null unique,
  email text,
  status text not null default 'started',
  current_step text not null default 'welcome',
  draft_data jsonb not null default '{}'::jsonb,
  selected_product text,
  pricing_snapshot_id uuid,
  authenticated_user_id uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  last_updated_at timestamptz not null default now(),
  completed_at timestamptz,
  abandoned_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.commercial_pricing_templates (
  id uuid primary key default gen_random_uuid(),
  product_key text not null check (length(trim(product_key)) > 0),
  name text not null,
  description text,
  currency text not null check (length(trim(currency)) > 0),
  country text,
  region text,
  customer_segment text,
  campaign_type text,
  pricing_metric text not null check (length(trim(pricing_metric)) > 0),
  pricing_method text not null check (length(trim(pricing_method)) > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'archived')),
  is_default boolean not null default false,
  effective_from timestamptz,
  effective_to timestamptz,
  quotation_validity_days integer,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  activated_by uuid,
  activated_at timestamptz,
  deactivated_by uuid,
  deactivated_at timestamptz,
  archived_by uuid,
  archived_at timestamptz,
  constraint commercial_pricing_templates_effective_range_chk check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint commercial_pricing_templates_quotation_validity_chk check (quotation_validity_days is null or quotation_validity_days >= 0)
);

create table if not exists public.commercial_pricing_tiers (
  id uuid primary key default gen_random_uuid(),
  pricing_template_id uuid not null references public.commercial_pricing_templates(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  minimum_quantity integer not null check (minimum_quantity > 0),
  maximum_quantity integer,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  fixed_charge numeric(12,2) default 0 check (fixed_charge is null or fixed_charge >= 0),
  calculation_type text not null default 'progressive' check (calculation_type in ('progressive')),
  enterprise_action text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint commercial_pricing_tiers_maximum_quantity_chk check (maximum_quantity is null or maximum_quantity >= minimum_quantity),
  constraint commercial_pricing_tiers_enterprise_action_chk check (enterprise_action is null or enterprise_action in ('request_quotation', 'no_automatic_checkout', 'custom_rate'))
);

create table if not exists public.commercial_pricing_snapshots (
  id uuid primary key default gen_random_uuid(),
  onboarding_draft_id uuid references public.onboarding_drafts(id) on delete set null,
  organisation_id uuid,
  product_key text not null,
  pricing_template_id uuid not null references public.commercial_pricing_templates(id) on delete restrict,
  pricing_template_name text not null,
  template_version text not null,
  market text,
  currency text not null,
  pricing_metric text not null,
  pricing_method text not null,
  quantity integer not null check (quantity > 0),
  tier_breakdown jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  included_admin_users integer not null default 0,
  requires_enterprise_review boolean not null default false,
  calculated_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'calculated' check (status in ('calculated', 'accepted', 'expired', 'superseded', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists commercial_pricing_templates_product_key_idx on public.commercial_pricing_templates (product_key);
create index if not exists commercial_pricing_templates_status_idx on public.commercial_pricing_templates (status);
create index if not exists commercial_pricing_templates_currency_idx on public.commercial_pricing_templates (currency);
create index if not exists commercial_pricing_templates_country_idx on public.commercial_pricing_templates (country);
create index if not exists commercial_pricing_templates_is_default_idx on public.commercial_pricing_templates (is_default);
create index if not exists commercial_pricing_templates_effective_dates_idx on public.commercial_pricing_templates (effective_from, effective_to);
create unique index if not exists commercial_pricing_templates_active_default_scope_idx on public.commercial_pricing_templates (
  product_key,
  currency,
  coalesce(country, ''),
  coalesce(region, ''),
  coalesce(customer_segment, ''),
  coalesce(campaign_type, '')
)
where status = 'active' and is_default = true and archived_at is null;
create index if not exists commercial_pricing_templates_updated_by_idx on public.commercial_pricing_templates (updated_by);
create index if not exists commercial_pricing_templates_activated_by_idx on public.commercial_pricing_templates (activated_by);
create index if not exists commercial_pricing_templates_archived_by_idx on public.commercial_pricing_templates (archived_by);
create unique index if not exists commercial_pricing_tiers_template_sequence_idx on public.commercial_pricing_tiers (pricing_template_id, sequence);
create index if not exists commercial_pricing_tiers_pricing_template_id_idx on public.commercial_pricing_tiers (pricing_template_id);
create index if not exists commercial_pricing_tiers_status_idx on public.commercial_pricing_tiers (status);
create index if not exists commercial_pricing_snapshots_onboarding_draft_id_idx on public.commercial_pricing_snapshots (onboarding_draft_id);
create index if not exists commercial_pricing_snapshots_status_idx on public.commercial_pricing_snapshots (status);
create index if not exists commercial_pricing_snapshots_pricing_template_id_idx on public.commercial_pricing_snapshots (pricing_template_id);

create table if not exists public.deployment_locations (
  id uuid primary key default gen_random_uuid(),
  state text not null,
  outlet_name text not null,
  owner_name text,
  address text,
  brand_type text,
  outlet_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  local_submission_id text,
  installer_name text,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  brand_id uuid references public.brands(id) on delete set null,
  project_name text,
  brand_name text,
  detected_brand_name text,
  brand_match_status text,
  mismatch_reason text,
  ai_review_note text,
  ai_confidence_score numeric,
  ai_confidence_level text,
  auto_approved boolean not null default false,
  duplicate_status text not null default 'Unique',
  duplicate_reason text,
  image_fingerprint text,
  salon_name text,
  address text,
  phone text,
  gps_latitude double precision,
  gps_longitude double precision,
  installer_state text,
  installer_region text,
  installer_lga text,
  resolved_address text,
  resolved_street text,
  resolved_neighbourhood text,
  resolved_lga text,
  resolved_city text,
  resolved_state text,
  resolved_country text,
  deployment_stage_code text references public.deployment_stages(stage_code) on delete set null,
  state_region text,
  status text not null default 'Pending' check (status in ('Pending', 'Flagged', 'Approved', 'Rejected')),
  image_url text not null,
  image_path text not null,
  ocr_text text,
  ocr_salon_name text,
  ocr_address text,
  ocr_brand_name text,
  ocr_phone text,
  ocr_raw_text text,
  ocr_confidence text,
  ocr_note text,
  approval_comments text,
  rejection_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  ai_raw_text text,
  captured_at timestamptz,
  installation_date date,
  installation_time time,
  submitted_at timestamptz not null default now()
);

create table if not exists public.submission_status_history (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  previous_status text,
  new_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.alert_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.submissions(id) on delete cascade,
  alert_type text not null,
  severity text not null,
  recipient_role text not null default 'admin',
  payload jsonb not null,
  delivery_channel text not null default 'email',
  delivery_status text not null default 'ready',
  created_at timestamptz not null default now()
);

alter table public.submissions add column if not exists installer_name text;
alter table public.submissions add column if not exists installer_email text;
alter table public.submissions add column if not exists local_submission_id text;
alter table public.submissions add column if not exists installer_user_id uuid references auth.users(id) on delete set null;
alter table public.submissions add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.submissions add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.submissions add column if not exists brand_id uuid references public.brands(id) on delete set null;
alter table public.submissions add column if not exists project_name text;
alter table public.submissions add column if not exists brand_name text;
alter table public.submissions add column if not exists detected_brand_name text;
alter table public.submissions add column if not exists brand_match_status text;
alter table public.submissions add column if not exists mismatch_reason text;
alter table public.submissions add column if not exists ai_review_note text;
alter table public.submissions add column if not exists ai_confidence_score numeric;
alter table public.submissions add column if not exists ai_confidence_level text;
alter table public.submissions add column if not exists auto_approved boolean not null default false;
alter table public.submissions add column if not exists duplicate_status text not null default 'Unique';
alter table public.submissions add column if not exists duplicate_reason text;
alter table public.submissions add column if not exists image_fingerprint text;
alter table public.submissions add column if not exists image_url text;
alter table public.submissions add column if not exists image_path text;
alter table public.submissions add column if not exists gps_latitude double precision;
alter table public.submissions add column if not exists gps_longitude double precision;
alter table public.submissions add column if not exists installer_state text;
alter table public.submissions add column if not exists installer_region text;
alter table public.submissions add column if not exists installer_lga text;
alter table public.submissions add column if not exists resolved_address text;
alter table public.submissions add column if not exists resolved_street text;
alter table public.submissions add column if not exists resolved_neighbourhood text;
alter table public.submissions add column if not exists resolved_lga text;
alter table public.submissions add column if not exists resolved_city text;
alter table public.submissions add column if not exists resolved_state text;
alter table public.submissions add column if not exists resolved_country text;
alter table public.submissions add column if not exists deployment_stage_code text references public.deployment_stages(stage_code) on delete set null;
alter table public.submissions add column if not exists captured_at timestamptz;
alter table public.submissions add column if not exists installation_date date;
alter table public.submissions add column if not exists installation_time time;
alter table public.submissions add column if not exists ocr_text text;
alter table public.submissions add column if not exists ocr_salon_name text;
alter table public.submissions add column if not exists ocr_address text;
alter table public.submissions add column if not exists ocr_brand_name text;
alter table public.submissions add column if not exists ocr_phone text;
alter table public.submissions add column if not exists ocr_raw_text text;
alter table public.submissions add column if not exists ocr_confidence text;
alter table public.submissions add column if not exists ocr_note text;
alter table public.submissions add column if not exists approval_comments text;
alter table public.submissions add column if not exists rejection_reason text;
alter table public.submissions add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.submissions add column if not exists reviewed_at timestamptz;
alter table public.submissions add column if not exists ai_raw_text text;
alter table public.submissions add column if not exists selected_outlet_id uuid;
alter table public.submissions add column if not exists selected_outlet_code text;
alter table public.submissions add column if not exists selected_outlet_name text;
alter table public.submissions add column if not exists selected_outlet_address text;
alter table public.submissions add column if not exists selected_outlet_brand_type text;
alter table public.submissions add column if not exists selected_outlet_state text;
alter table public.submissions add column if not exists outlet_match_status text;
alter table public.submissions add column if not exists outlet_match_notes text;
alter table public.submissions add column if not exists archived_at timestamptz;
alter table public.submissions add column if not exists archived_by uuid references auth.users(id) on delete set null;
alter table public.submissions add column if not exists archive_reason text;
alter table public.submissions add column if not exists salon_name text;
alter table public.submissions add column if not exists address text;
alter table public.submissions add column if not exists phone text;
alter table public.submissions add column if not exists state_region text;
alter table public.submissions add column if not exists status text not null default 'Pending';
alter table public.projects add column if not exists brand_id uuid references public.brands(id) on delete set null;
alter table public.projects add column if not exists archived_at timestamptz;
alter table public.agencies add column if not exists contact_person text;
alter table public.agencies add column if not exists email text;
alter table public.agencies add column if not exists phone text;
alter table public.installers add column if not exists user_id uuid unique references auth.users(id) on delete set null;
alter table public.installers add column if not exists assigned_states text[] not null default '{}';
alter table public.installers add column if not exists access_status text not null default 'Active';
alter table public.deployment_locations add column if not exists state text;
alter table public.deployment_locations add column if not exists outlet_name text;
alter table public.deployment_locations add column if not exists owner_name text;
alter table public.deployment_locations add column if not exists address text;
alter table public.deployment_locations add column if not exists brand_type text;
alter table public.deployment_locations add column if not exists outlet_code text;
alter table public.deployment_locations add column if not exists created_at timestamptz not null default now();
alter table public.deployment_locations add column if not exists updated_at timestamptz not null default now();

update public.submissions
set status = case
  when status = 'Submitted' then 'Pending'
  when status = 'Needs Review' then 'Pending'
  when status not in ('Pending', 'Flagged', 'Approved', 'Rejected') then 'Pending'
  else status
end;

alter table public.submissions alter column status set default 'Pending';
alter table public.submissions drop constraint if exists submissions_status_check;
alter table public.submissions add constraint submissions_status_check check (status in ('Pending', 'Flagged', 'Approved', 'Rejected', 'Correction Requested'));

insert into public.clients (name)
values
  ('Godrej Nigeria Ltd'),
  ('Monetium Nigeria Ltd'),
  ('NNFEMS Industries Ltd'),
  ('Evans Industries Ltd'),
  ('Octoplus Marketing Agency Ltd'),
  ('Trade Depot Ltd')
on conflict (name) do nothing;

insert into public.brands (client_id, brand_name)
select clients.id, brand_names.brand_name
from public.clients
cross join (
  values ('Darling'), ('MegaGrowth'), ('TURA'), ('FreshGlow'), ('GK')
) as brand_names(brand_name)
where clients.name = 'Godrej Nigeria Ltd'
on conflict (brand_name) do nothing;

update public.submissions
set client_id = brands.client_id
from public.brands
where submissions.client_id is null
  and submissions.brand_name = brands.brand_name;

insert into public.deployment_stages (stage_code, stage_name, sort_order)
values
  ('production', 'Production', 1),
  ('warehouse', 'Warehouse', 2),
  ('in_transit', 'In Transit', 3),
  ('installed', 'Installed', 4),
  ('approved', 'Approved', 5)
on conflict (stage_code) do nothing;

insert into public.projects (client_id, brand_id, project_name, campaign_name, target_quantity, status, regions_covered, assigned_installers)
select clients.id, null, 'Salon Dealer Board for Godrej', 'Salon Dealer Board', 0, 'Active', '{}', '{}'
from public.clients
where clients.name = 'Godrej Nigeria Ltd'
on conflict (client_id, project_name) do nothing;

insert into public.client_projects (client_id, project_id)
select projects.client_id, projects.id
from public.projects
on conflict (client_id, project_id) do nothing;

update public.submissions
set project_id = projects.id
from public.projects
where submissions.project_id is null
  and submissions.client_id = projects.client_id
  and submissions.project_name = projects.project_name;

update public.submissions
set deployment_stage_code = case
  when status = 'Approved' then 'approved'
  else 'installed'
end
where deployment_stage_code is null;

create index if not exists submissions_submitted_at_idx on public.submissions (submitted_at desc);
create index if not exists submissions_state_region_idx on public.submissions (state_region);
create index if not exists submissions_installer_state_idx on public.submissions (installer_state);
create index if not exists submissions_installer_region_idx on public.submissions (installer_region);
create index if not exists submissions_installer_name_idx on public.submissions (installer_name);
create index if not exists submissions_installer_user_id_idx on public.submissions (installer_user_id);
create unique index if not exists submissions_installer_local_submission_unique_idx
  on public.submissions (installer_user_id, local_submission_id)
  where local_submission_id is not null;
create index if not exists submissions_brand_name_idx on public.submissions (brand_name);
create index if not exists submissions_brand_id_idx on public.submissions (brand_id);
create index if not exists submissions_client_id_idx on public.submissions (client_id);
create index if not exists submissions_project_id_idx on public.submissions (project_id);
create unique index if not exists submissions_project_outlet_id_active_uidx
  on public.submissions (project_id, selected_outlet_id)
  where project_id is not null
    and selected_outlet_id is not null
    and lower(status) in ('submitted', 'pending', 'approved');
create unique index if not exists submissions_project_outlet_code_active_uidx
  on public.submissions (project_id, lower(selected_outlet_code))
  where project_id is not null
    and selected_outlet_id is null
    and selected_outlet_code is not null
    and selected_outlet_code <> ''
    and lower(status) in ('submitted', 'pending', 'approved');
create index if not exists submissions_project_name_idx on public.submissions (project_name);
create index if not exists submissions_status_idx on public.submissions (status);
create index if not exists submissions_archived_at_idx on public.submissions (archived_at);
create index if not exists submissions_image_fingerprint_idx on public.submissions (image_fingerprint);
create index if not exists submissions_duplicate_status_idx on public.submissions (duplicate_status);
create index if not exists submissions_outlet_match_status_idx on public.submissions (outlet_match_status);
create index if not exists brands_client_id_idx on public.brands (client_id);
create index if not exists projects_client_id_idx on public.projects (client_id);
create index if not exists projects_brand_id_idx on public.projects (brand_id);
create index if not exists project_targets_project_id_idx on public.project_targets (project_id);
create index if not exists deployment_progress_project_id_idx on public.deployment_progress (project_id);
create index if not exists notification_events_client_id_idx on public.notification_events (client_id);
create index if not exists notification_events_project_id_idx on public.notification_events (project_id);
create index if not exists notification_events_unread_idx on public.notification_events (client_id, read_at);
create index if not exists installers_agency_id_idx on public.installers (agency_id);
create index if not exists user_profiles_agency_id_idx on public.user_profiles (agency_id);
create index if not exists user_profiles_status_idx on public.user_profiles (status);
create unique index if not exists user_profiles_email_unique_idx on public.user_profiles (lower(email));
create unique index if not exists installers_user_id_unique_idx on public.installers (user_id) where user_id is not null;
create index if not exists audit_logs_target_user_id_idx on public.audit_logs (target_user_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists submission_status_history_submission_id_idx on public.submission_status_history (submission_id, created_at desc);
create index if not exists alert_events_submission_id_idx on public.alert_events (submission_id, created_at desc);
create index if not exists deployment_locations_state_idx on public.deployment_locations (state);
create index if not exists deployment_locations_outlet_name_idx on public.deployment_locations (outlet_name);

alter table public.submissions enable row level security;
alter table public.clients enable row level security;
alter table public.client_profiles enable row level security;
alter table public.brands enable row level security;
alter table public.projects enable row level security;
alter table public.project_targets enable row level security;
alter table public.deployment_stages enable row level security;
alter table public.deployment_progress enable row level security;
alter table public.installer_performance enable row level security;
alter table public.agencies enable row level security;
alter table public.installers enable row level security;
alter table public.client_projects enable row level security;
alter table public.notification_events enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_profiles enable row level security;
alter table public.audit_logs enable row level security;
alter table public.deployment_locations enable row level security;
alter table public.submission_status_history enable row level security;
alter table public.alert_events enable row level security;

drop policy if exists "Service role can manage deployment locations" on public.deployment_locations;
create policy "Service role can manage deployment locations"
on public.deployment_locations
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Admin service role can manage submissions" on public.submissions;
create policy "Admin service role can manage submissions"
on public.submissions
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Users can read their own role" on public.user_roles;
create policy "Users can read their own role"
on public.user_roles
for select
using (auth.uid() = user_id);

drop policy if exists "Users can read their own profile" on public.user_profiles;
create policy "Users can read their own profile"
on public.user_profiles
for select
using (auth.uid() = user_id);

drop policy if exists "Clients can read own profile" on public.client_profiles;
create policy "Clients can read own profile"
on public.client_profiles
for select
using (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = auth.uid()
      and user_roles.client_id = client_profiles.client_id
  )
);

drop policy if exists "Clients can read their own client row" on public.clients;
create policy "Clients can read their own client row"
on public.clients
for select
using (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = auth.uid()
      and user_roles.client_id = clients.id
  )
);

drop policy if exists "Clients can read their brands" on public.brands;
create policy "Clients can read their brands"
on public.brands
for select
using (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = auth.uid()
      and user_roles.client_id = brands.client_id
  )
);

drop policy if exists "Clients can read linked submissions" on public.submissions;
create policy "Clients can read linked submissions"
on public.submissions
for select
using (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = auth.uid()
      and user_roles.role = 'client'
      and user_roles.client_id = submissions.client_id
  )
);

drop policy if exists "Clients can read linked projects" on public.projects;
create policy "Clients can read linked projects"
on public.projects
for select
using (
  exists (
    select 1
    from public.client_projects
    join public.user_roles on user_roles.client_id = client_projects.client_id
    where client_projects.project_id = projects.id
      and user_roles.user_id = auth.uid()
      and user_roles.role = 'client'
  )
);

drop policy if exists "Clients can read linked project targets" on public.project_targets;
create policy "Clients can read linked project targets"
on public.project_targets
for select
using (
  exists (
    select 1
    from public.projects
    join public.client_projects on client_projects.project_id = projects.id
    join public.user_roles on user_roles.client_id = client_projects.client_id
    where projects.id = project_targets.project_id
      and user_roles.user_id = auth.uid()
      and user_roles.role = 'client'
  )
);

drop policy if exists "Clients can read deployment stages" on public.deployment_stages;
create policy "Clients can read deployment stages"
on public.deployment_stages
for select
using (auth.uid() is not null);

drop policy if exists "Clients can read linked deployment progress" on public.deployment_progress;
create policy "Clients can read linked deployment progress"
on public.deployment_progress
for select
using (
  exists (
    select 1
    from public.projects
    join public.client_projects on client_projects.project_id = projects.id
    join public.user_roles on user_roles.client_id = client_projects.client_id
    where projects.id = deployment_progress.project_id
      and user_roles.user_id = auth.uid()
      and user_roles.role = 'client'
  )
);

drop policy if exists "Admins can manage notification events" on public.notification_events;
create policy "Admins can manage notification events"
on public.notification_events
for all
using (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = auth.uid()
      and user_roles.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = auth.uid()
      and user_roles.role = 'admin'
  )
);

drop policy if exists "Clients can read own notification events" on public.notification_events;
create policy "Clients can read own notification events"
on public.notification_events
for select
using (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = auth.uid()
      and user_roles.role = 'client'
      and user_roles.client_id = notification_events.client_id
  )
);

drop policy if exists "Clients can mark own notification events read" on public.notification_events;
create policy "Clients can mark own notification events read"
on public.notification_events
for update
using (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = auth.uid()
      and user_roles.role = 'client'
      and user_roles.client_id = notification_events.client_id
  )
)
with check (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = auth.uid()
      and user_roles.role = 'client'
      and user_roles.client_id = notification_events.client_id
  )
);

drop policy if exists "Clients can read linked status history" on public.submission_status_history;
create policy "Clients can read linked status history"
on public.submission_status_history
for select
using (
  exists (
    select 1
    from public.submissions
    join public.user_roles on user_roles.client_id = submissions.client_id
    where submissions.id = submission_status_history.submission_id
      and user_roles.user_id = auth.uid()
      and user_roles.role = 'client'
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'installation-images',
  'installation-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view installation images" on storage.objects;
create policy "Public can view installation images"
on storage.objects
for select
using (bucket_id = 'installation-images');

drop policy if exists "Service role can upload installation images" on storage.objects;
create policy "Service role can upload installation images"
on storage.objects
for insert
with check (bucket_id = 'installation-images' and auth.role() = 'service_role');

drop policy if exists "Service role can update installation images" on storage.objects;
create policy "Service role can update installation images"
on storage.objects
for update
using (bucket_id = 'installation-images' and auth.role() = 'service_role')
with check (bucket_id = 'installation-images' and auth.role() = 'service_role');

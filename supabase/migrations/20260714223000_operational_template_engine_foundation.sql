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

create table if not exists public.build_activity_templates (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.build_work_package_templates(id) on delete cascade,
  sequence integer not null default 1 check (sequence > 0),
  code text not null,
  name text not null,
  description text,
  estimated_duration integer check (estimated_duration is null or estimated_duration >= 0),
  mandatory boolean not null default true,
  requires_photo boolean not null default false,
  requires_gps boolean not null default false,
  requires_approval boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, code),
  unique (template_id, sequence)
);

create index if not exists idx_build_activity_templates_template_id on public.build_activity_templates(template_id);

create table if not exists public.build_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  activity_template_id uuid not null references public.build_activity_templates(id) on delete cascade,
  sequence integer not null default 1 check (sequence > 0),
  item text not null,
  mandatory boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (activity_template_id, sequence)
);

create index if not exists idx_build_checklist_templates_activity_id on public.build_checklist_templates(activity_template_id);

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

drop trigger if exists trg_touch_build_work_package_templates_updated_at on public.build_work_package_templates;
create trigger trg_touch_build_work_package_templates_updated_at
before update on public.build_work_package_templates
for each row execute function public.touch_build_work_package_templates_updated_at();

drop trigger if exists trg_touch_build_activity_templates_updated_at on public.build_activity_templates;
create trigger trg_touch_build_activity_templates_updated_at
before update on public.build_activity_templates
for each row execute function public.touch_build_activity_templates_updated_at();

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

comment on table public.build_work_package_templates is 'Reusable operational templates for Build work packages.';
comment on table public.build_activity_templates is 'Activity templates generated from work package templates.';
comment on table public.build_checklist_templates is 'Checklist items attached to activity templates.';
comment on table public.build_inspection_templates is 'Inspection template definition scaffold for future implementation.';
comment on table public.build_safety_templates is 'Safety template scaffold for future implementation.';
comment on table public.build_supply_templates is 'Supply template scaffold for future implementation.';
comment on table public.build_equipment_templates is 'Equipment template scaffold for future implementation.';

-- Rollback notes:
-- 1) drop trigger if exists trg_touch_build_equipment_templates_updated_at on public.build_equipment_templates;
-- 2) drop trigger if exists trg_touch_build_supply_templates_updated_at on public.build_supply_templates;
-- 3) drop trigger if exists trg_touch_build_safety_templates_updated_at on public.build_safety_templates;
-- 4) drop trigger if exists trg_touch_build_inspection_templates_updated_at on public.build_inspection_templates;
-- 5) drop trigger if exists trg_touch_build_checklist_templates_updated_at on public.build_checklist_templates;
-- 6) drop trigger if exists trg_touch_build_activity_templates_updated_at on public.build_activity_templates;
-- 7) drop trigger if exists trg_touch_build_work_package_templates_updated_at on public.build_work_package_templates;
-- 8) alter table public.build_work_packages drop column if exists template_id;
-- 9) drop table if exists public.build_equipment_templates;
-- 10) drop table if exists public.build_supply_templates;
-- 11) drop table if exists public.build_safety_templates;
-- 12) drop table if exists public.build_inspection_templates;
-- 13) drop table if exists public.build_checklist_templates;
-- 14) drop table if exists public.build_activity_templates;
-- 15) drop table if exists public.build_work_package_templates;
-- 16) drop function if exists public.touch_build_equipment_templates_updated_at();
-- 17) drop function if exists public.touch_build_supply_templates_updated_at();
-- 18) drop function if exists public.touch_build_safety_templates_updated_at();
-- 19) drop function if exists public.touch_build_inspection_templates_updated_at();
-- 20) drop function if exists public.touch_build_checklist_templates_updated_at();
-- 21) drop function if exists public.touch_build_activity_templates_updated_at();
-- 22) drop function if exists public.touch_build_work_package_templates_updated_at();

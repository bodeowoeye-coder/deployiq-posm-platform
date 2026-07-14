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

comment on table public.build_resources is 'Shared Build resource catalogue for labour, materials, equipment, vehicles, contractors, and services.';
comment on table public.build_template_resource_requirements is 'Template-scoped resource requirements for template/category/activity-template levels.';
comment on column public.build_template_resource_requirements.resource_id is 'References resource catalogue identity; transactional values remain execution-time records.';

-- Rollback notes:
-- 1) drop trigger if exists trg_validate_build_template_resource_requirement on public.build_template_resource_requirements;
-- 2) drop trigger if exists trg_touch_build_template_resource_requirements_updated_at on public.build_template_resource_requirements;
-- 3) drop trigger if exists trg_touch_build_resources_updated_at on public.build_resources;
-- 4) drop function if exists public.validate_build_template_resource_requirement();
-- 5) drop function if exists public.touch_build_template_resource_requirements_updated_at();
-- 6) drop function if exists public.touch_build_resources_updated_at();
-- 7) drop table if exists public.build_template_resource_requirements;
-- 8) drop table if exists public.build_resources;
-- 9) drop type if exists public.build_resource_requirement_type;
-- 10) drop type if exists public.build_resource_type;

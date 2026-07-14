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

drop trigger if exists trg_touch_build_activity_template_dependencies_updated_at on public.build_activity_template_dependencies;
create trigger trg_touch_build_activity_template_dependencies_updated_at
before update on public.build_activity_template_dependencies
for each row execute function public.touch_build_activity_template_dependencies_updated_at();

drop trigger if exists trg_validate_build_activity_template_dependency on public.build_activity_template_dependencies;
create trigger trg_validate_build_activity_template_dependency
before insert or update on public.build_activity_template_dependencies
for each row execute function public.validate_build_activity_template_dependency();

comment on table public.build_activity_template_dependencies is 'Template-level activity dependency graph edges for execution sequencing foundation.';
comment on column public.build_activity_template_dependencies.dependency_type is 'Supports FS, SS, FF, SF dependency semantics. Scheduling is deferred.';
comment on column public.build_activity_template_dependencies.lag_value is 'Non-negative lag amount for future scheduler use.';
comment on column public.build_activity_template_dependencies.lag_unit is 'Lag unit for future scheduler use (hours/days/weeks).';

-- Rollback notes:
-- 1) drop trigger if exists trg_validate_build_activity_template_dependency on public.build_activity_template_dependencies;
-- 2) drop trigger if exists trg_touch_build_activity_template_dependencies_updated_at on public.build_activity_template_dependencies;
-- 3) drop function if exists public.validate_build_activity_template_dependency();
-- 4) drop function if exists public.touch_build_activity_template_dependencies_updated_at();
-- 5) drop table if exists public.build_activity_template_dependencies;
-- 6) drop type if exists public.build_activity_dependency_lag_unit;
-- 7) drop type if exists public.build_activity_dependency_type;

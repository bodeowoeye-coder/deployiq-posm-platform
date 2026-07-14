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

alter table public.build_activity_templates
  add column if not exists activity_category_id uuid references public.build_activity_categories(id) on delete restrict;

create index if not exists idx_build_activity_templates_activity_category_id
  on public.build_activity_templates(activity_category_id);

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

drop trigger if exists trg_validate_build_activity_template_category on public.build_activity_templates;
create trigger trg_validate_build_activity_template_category
before insert or update on public.build_activity_templates
for each row execute function public.validate_build_activity_template_category();

create or replace function public.touch_build_activity_categories_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_build_activity_categories_updated_at on public.build_activity_categories;
create trigger trg_touch_build_activity_categories_updated_at
before update on public.build_activity_categories
for each row execute function public.touch_build_activity_categories_updated_at();

comment on table public.build_activity_categories is 'Activity category hierarchy beneath operational templates.';
comment on column public.build_activity_templates.activity_category_id is 'Required in application validation: links activity template to one category in the same template.';

-- Rollback notes:
-- 1) drop trigger if exists trg_touch_build_activity_categories_updated_at on public.build_activity_categories;
-- 2) drop function if exists public.touch_build_activity_categories_updated_at();
-- 3) drop trigger if exists trg_validate_build_activity_template_category on public.build_activity_templates;
-- 4) drop function if exists public.validate_build_activity_template_category();
-- 5) drop index if exists idx_build_activity_templates_activity_category_id;
-- 6) alter table public.build_activity_templates drop column if exists activity_category_id;
-- 7) drop table if exists public.build_activity_categories;
-- 8) drop type if exists public.build_activity_category_type;

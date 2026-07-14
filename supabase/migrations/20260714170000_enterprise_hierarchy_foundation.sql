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

alter table public.projects
  add column if not exists business_unit_id uuid references public.business_units(id) on delete set null,
  add column if not exists portfolio_id uuid references public.project_portfolios(id) on delete set null;

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

comment on table public.business_units is 'Tenant-scoped business unit hierarchy node beneath clients.';
comment on table public.project_portfolios is 'Tenant-scoped portfolio hierarchy node beneath clients and optional business units.';

-- Rollback notes:
-- 1) drop trigger if exists trg_touch_project_portfolios_updated_at on public.project_portfolios;
-- 2) drop trigger if exists trg_touch_business_units_updated_at on public.business_units;
-- 3) drop function if exists public.touch_project_portfolios_updated_at();
-- 4) drop function if exists public.touch_business_units_updated_at();
-- 5) alter table public.projects drop column if exists portfolio_id;
-- 6) alter table public.projects drop column if exists business_unit_id;
-- 7) drop table if exists public.project_portfolios;
-- 8) drop table if exists public.business_units;

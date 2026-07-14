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

comment on table public.build_work_packages is 'Operational work package grouping beneath build sites.';
comment on column public.build_work_packages.code is 'Human-readable work package identifier unique within site.';

-- Rollback notes:
-- 1) drop trigger if exists trg_touch_build_work_packages_updated_at on public.build_work_packages;
-- 2) drop function if exists public.touch_build_work_packages_updated_at();
-- 3) drop table if exists public.build_work_packages;

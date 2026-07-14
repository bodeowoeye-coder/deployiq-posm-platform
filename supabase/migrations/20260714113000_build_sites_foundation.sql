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

comment on table public.build_sites is 'Foundation table for Build project sites beneath projects. Retail projects must not create records here via API policy.';
comment on column public.build_sites.site_code is 'Human-readable stable site identifier. Unique within project.';

-- Rollback notes:
-- 1) drop trigger if exists trg_touch_build_sites_updated_at on public.build_sites;
-- 2) drop function if exists public.touch_build_sites_updated_at();
-- 3) drop table if exists public.build_sites;

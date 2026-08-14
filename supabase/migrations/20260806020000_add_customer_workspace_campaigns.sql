create table if not exists public.workspace_campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  campaign_name text not null,
  brand_name text not null,
  description text,
  deployment_type text not null,
  states text[] not null default '{}',
  regions text[] not null default '{}',
  cities text[] not null default '{}',
  start_date date not null,
  end_date date not null,
  launch_date date,
  target_quantity integer not null,
  target_unit text not null default 'deployments',
  state_targets jsonb not null default '{}'::jsonb,
  deployment_location_ids uuid[] not null default '{}',
  campaign_manager_user_id uuid,
  agency_name text,
  field_team_name text,
  status text not null default 'draft',
  created_by uuid,
  launched_at timestamptz,
  archived_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_campaigns_status_check check (status in ('draft', 'scheduled', 'active', 'paused', 'completed', 'archived')),
  constraint workspace_campaigns_target_quantity_check check (target_quantity > 0),
  constraint workspace_campaigns_date_order_check check (end_date >= start_date),
  constraint workspace_campaigns_name_not_blank check (length(trim(campaign_name)) > 0),
  constraint workspace_campaigns_brand_not_blank check (length(trim(brand_name)) > 0),
  constraint workspace_campaigns_deployment_type_not_blank check (length(trim(deployment_type)) > 0)
);

create index if not exists workspace_campaigns_client_idx
  on public.workspace_campaigns(client_id);

create index if not exists workspace_campaigns_project_idx
  on public.workspace_campaigns(project_id);

create index if not exists workspace_campaigns_client_status_idx
  on public.workspace_campaigns(client_id, status);

create index if not exists workspace_campaigns_client_dates_idx
  on public.workspace_campaigns(client_id, start_date, end_date);

create index if not exists workspace_campaigns_client_updated_idx
  on public.workspace_campaigns(client_id, updated_at desc);

create unique index if not exists projects_id_client_id_uidx
  on public.projects(id, client_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_campaigns_project_client_fk'
      and conrelid = 'public.workspace_campaigns'::regclass
  ) then
    alter table public.workspace_campaigns
      add constraint workspace_campaigns_project_client_fk
      foreign key (project_id, client_id)
      references public.projects(id, client_id)
      on delete restrict;
  end if;
end $$;

create table if not exists public.workspace_campaign_locations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workspace_id uuid not null references public.clients(id) on delete cascade,
  product_key text not null,
  campaign_id uuid not null references public.workspace_campaigns(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  deployment_location_id uuid not null references public.deployment_locations(id) on delete restrict,
  target_quantity integer not null default 1,
  assignment_status text not null default 'assigned',
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id) on delete set null,
  exclusion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_campaign_locations_client_workspace_match_check check (client_id = workspace_id),
  constraint workspace_campaign_locations_target_quantity_check check (target_quantity > 0),
  constraint workspace_campaign_locations_status_check check (assignment_status in ('assigned', 'ready', 'in_progress', 'completed', 'excluded'))
);

create unique index if not exists workspace_campaigns_id_client_project_uidx
  on public.workspace_campaigns(id, client_id, project_id);

create unique index if not exists deployment_locations_id_scope_uidx
  on public.deployment_locations(id, client_id, workspace_id, product_key);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workspace_campaign_locations'::regclass
      and conname = 'workspace_campaign_locations_campaign_scope_fk'
  ) then
    alter table public.workspace_campaign_locations
      add constraint workspace_campaign_locations_campaign_scope_fk
      foreign key (campaign_id, client_id, project_id)
      references public.workspace_campaigns(id, client_id, project_id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workspace_campaign_locations'::regclass
      and conname = 'workspace_campaign_locations_project_scope_fk'
  ) then
    alter table public.workspace_campaign_locations
      add constraint workspace_campaign_locations_project_scope_fk
      foreign key (project_id, client_id)
      references public.projects(id, client_id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workspace_campaign_locations'::regclass
      and conname = 'workspace_campaign_locations_location_scope_fk'
  ) then
    alter table public.workspace_campaign_locations
      add constraint workspace_campaign_locations_location_scope_fk
      foreign key (deployment_location_id, client_id, workspace_id, product_key)
      references public.deployment_locations(id, client_id, workspace_id, product_key)
      on delete restrict;
  end if;
end $$;

create unique index if not exists workspace_campaign_locations_campaign_location_uidx
  on public.workspace_campaign_locations(campaign_id, deployment_location_id);

create index if not exists workspace_campaign_locations_client_campaign_idx
  on public.workspace_campaign_locations(client_id, campaign_id);

create index if not exists workspace_campaign_locations_project_idx
  on public.workspace_campaign_locations(client_id, project_id);

create index if not exists workspace_campaign_locations_location_idx
  on public.workspace_campaign_locations(client_id, deployment_location_id);

create index if not exists workspace_campaign_locations_status_idx
  on public.workspace_campaign_locations(client_id, assignment_status);

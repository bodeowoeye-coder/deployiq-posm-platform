begin;

alter table public.agencies add column if not exists client_id uuid references public.clients(id) on delete cascade;
alter table public.agencies add column if not exists workspace_id uuid references public.clients(id) on delete cascade;
alter table public.agencies add column if not exists office_address text;
alter table public.agencies add column if not exists states_covered text[] not null default '{}';
alter table public.agencies add column if not exists regions_covered text[] not null default '{}';
alter table public.agencies add column if not exists cities_covered text[] not null default '{}';
alter table public.agencies add column if not exists notes text;
alter table public.agencies add column if not exists archived_at timestamptz;
alter table public.agencies add column if not exists suspended_at timestamptz;
alter table public.agencies add column if not exists updated_at timestamptz not null default now();

alter table public.installers add column if not exists client_id uuid references public.clients(id) on delete cascade;
alter table public.installers add column if not exists workspace_id uuid references public.clients(id) on delete cascade;
alter table public.installers add column if not exists phone text;
alter table public.installers add column if not exists email text;
alter table public.installers add column if not exists state text;
alter table public.installers add column if not exists region text;
alter table public.installers add column if not exists city text;
alter table public.installers add column if not exists skills text[] not null default '{}';
alter table public.installers add column if not exists vehicle text;
alter table public.installers add column if not exists team text;
alter table public.installers add column if not exists notes text;
alter table public.installers add column if not exists profile_photo_url text;
alter table public.installers add column if not exists availability_status text not null default 'available';
alter table public.installers add column if not exists archived_at timestamptz;
alter table public.installers add column if not exists deactivated_at timestamptz;
alter table public.installers add column if not exists updated_at timestamptz not null default now();

alter table public.agencies drop constraint if exists agencies_status_check;
alter table public.installers drop constraint if exists installers_status_check;
alter table public.installers drop constraint if exists installers_access_status_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'agencies_client_workspace_match_chk'
  ) then
    alter table public.agencies add constraint agencies_client_workspace_match_chk check (
      (client_id is null and workspace_id is null) or client_id = workspace_id
    );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'installers_client_workspace_match_chk'
  ) then
    alter table public.installers add constraint installers_client_workspace_match_chk check (
      (client_id is null and workspace_id is null) or client_id = workspace_id
    );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'agencies_workspace_status_chk'
  ) then
    alter table public.agencies add constraint agencies_workspace_status_chk check (
      status in ('Active', 'Inactive', 'Suspended', 'Archived')
    );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'installers_availability_status_chk'
  ) then
    alter table public.installers add constraint installers_availability_status_chk check (
      availability_status in ('available', 'busy', 'on_leave', 'inactive', 'archived')
    );
  end if;
end $$;

create unique index if not exists agencies_id_client_workspace_uidx
  on public.agencies (id, client_id, workspace_id)
  where client_id is not null and workspace_id is not null;

create unique index if not exists installers_id_client_workspace_uidx
  on public.installers (id, client_id, workspace_id)
  where client_id is not null and workspace_id is not null;

create unique index if not exists agencies_workspace_name_uidx
  on public.agencies (client_id, lower(trim(agency_name)))
  where client_id is not null and trim(coalesce(agency_name, '')) <> '';

create unique index if not exists installers_workspace_phone_uidx
  on public.installers (client_id, regexp_replace(coalesce(phone, ''), '\s+', '', 'g'))
  where client_id is not null and trim(coalesce(phone, '')) <> '';

create index if not exists agencies_workspace_status_idx on public.agencies (client_id, status);
create index if not exists installers_workspace_status_idx on public.installers (client_id, availability_status);
create index if not exists installers_workspace_agency_idx on public.installers (client_id, agency_id);

create unique index if not exists workspace_campaign_locations_id_scope_uidx
  on public.workspace_campaign_locations (id, client_id, workspace_id, campaign_id, project_id, deployment_location_id);

create table if not exists public.workspace_field_assignments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workspace_id uuid not null references public.clients(id) on delete cascade,
  product_key text not null,
  campaign_id uuid not null,
  project_id uuid not null,
  campaign_location_id uuid,
  deployment_location_id uuid,
  agency_id uuid,
  installer_id uuid,
  supervisor_id uuid,
  coordinator_id uuid,
  assignment_type text not null default 'installer',
  assignment_status text not null default 'assigned',
  target_quantity integer not null default 1 check (target_quantity >= 0),
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id) on delete set null,
  removed_at timestamptz,
  removal_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_field_assignments_client_workspace_chk check (client_id = workspace_id),
  constraint workspace_field_assignments_status_chk check (assignment_status in ('assigned', 'ready', 'in_progress', 'completed', 'removed')),
  constraint workspace_field_assignments_type_chk check (assignment_type in ('agency', 'installer', 'supervisor', 'coordinator', 'team'))
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workspace_field_assignments_campaign_scope_fk'
  ) then
    alter table public.workspace_field_assignments
      add constraint workspace_field_assignments_campaign_scope_fk
      foreign key (campaign_id, client_id, project_id)
      references public.workspace_campaigns (id, client_id, project_id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'workspace_field_assignments_campaign_location_scope_fk'
  ) then
    alter table public.workspace_field_assignments
      add constraint workspace_field_assignments_campaign_location_scope_fk
      foreign key (campaign_location_id, client_id, workspace_id, campaign_id, project_id, deployment_location_id)
      references public.workspace_campaign_locations (id, client_id, workspace_id, campaign_id, project_id, deployment_location_id)
      on delete cascade;
  end if;
end $$;

create unique index if not exists workspace_field_assignments_campaign_location_installer_uidx
  on public.workspace_field_assignments (campaign_id, deployment_location_id, installer_id)
  where removed_at is null and deployment_location_id is not null and installer_id is not null;

create unique index if not exists workspace_field_assignments_campaign_agency_uidx
  on public.workspace_field_assignments (campaign_id, agency_id)
  where removed_at is null and assignment_type = 'agency' and agency_id is not null and deployment_location_id is null;

create index if not exists workspace_field_assignments_workspace_idx on public.workspace_field_assignments (client_id, campaign_id, assignment_status);
create index if not exists workspace_field_assignments_installer_idx on public.workspace_field_assignments (client_id, installer_id, assignment_status);
create index if not exists workspace_field_assignments_agency_idx on public.workspace_field_assignments (client_id, agency_id, assignment_status);
create index if not exists workspace_field_assignments_location_idx on public.workspace_field_assignments (client_id, deployment_location_id);

commit;

begin;

alter table public.submissions add column if not exists workspace_id uuid references public.clients(id) on delete set null;
alter table public.submissions add column if not exists campaign_id uuid references public.workspace_campaigns(id) on delete set null;
alter table public.submissions add column if not exists campaign_location_id uuid references public.workspace_campaign_locations(id) on delete set null;
alter table public.submissions add column if not exists field_assignment_id uuid references public.workspace_field_assignments(id) on delete set null;
alter table public.submissions add column if not exists agency_id uuid references public.agencies(id) on delete set null;
alter table public.submissions add column if not exists installer_id uuid references public.installers(id) on delete set null;
alter table public.submissions add column if not exists evidence_payload jsonb not null default '{}'::jsonb;
alter table public.submissions add column if not exists gps_status text not null default 'Unavailable';
alter table public.submissions add column if not exists gps_distance_meters numeric;
alter table public.submissions add column if not exists offline_sync_status text not null default 'synced';
alter table public.submissions add column if not exists correction_requested_at timestamptz;
alter table public.submissions add column if not exists correction_notes text;
alter table public.submissions add column if not exists deployment_started_at timestamptz;
alter table public.submissions add column if not exists deployment_completed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'submissions_workspace_client_match_chk'
  ) then
    alter table public.submissions add constraint submissions_workspace_client_match_chk check (
      (client_id is null and workspace_id is null) or client_id = workspace_id
    );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'submissions_gps_status_chk'
  ) then
    alter table public.submissions add constraint submissions_gps_status_chk check (
      gps_status in ('Verified', 'Approximate', 'Unavailable')
    );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'submissions_offline_sync_status_chk'
  ) then
    alter table public.submissions add constraint submissions_offline_sync_status_chk check (
      offline_sync_status in ('queued', 'syncing', 'synced', 'failed')
    );
  end if;
end $$;

alter table public.submissions drop constraint if exists submissions_status_check;
alter table public.submissions add constraint submissions_status_check check (
  status in ('Pending', 'Flagged', 'Approved', 'Rejected', 'Correction Requested')
);

create index if not exists submissions_workspace_execution_idx on public.submissions (client_id, campaign_id, status, submitted_at desc);
create index if not exists submissions_workspace_installer_execution_idx on public.submissions (client_id, installer_id, status, submitted_at desc);
create index if not exists submissions_workspace_assignment_idx on public.submissions (client_id, field_assignment_id);
create index if not exists submissions_workspace_location_idx on public.submissions (client_id, selected_outlet_id);
create index if not exists submissions_workspace_gps_idx on public.submissions (client_id, gps_status);

commit;

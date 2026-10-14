-- DeployIQ canonical PRE-CORE-2A bootstrap
-- Boundary: 20260816020000_harden_acquisition_provisioning_boundary.sql
-- Fresh non-production databases only. Not a production migration.
-- Contains schema/configuration only: no customer, auth, acquisition, job, or storage-object rows.
-- Historical Build foundations and CORE-2A authority objects are intentionally excluded.

create extension if not exists "pgcrypto";

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  can_review boolean not null default false,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now()
);

create table if not exists public.client_profiles (
  client_id uuid primary key references public.clients(id) on delete cascade,
  contact_person text,
  email text,
  phone text,
  industry_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients
add column if not exists status text not null default 'Active'
check (status in ('Active', 'Inactive'));

alter table public.client_profiles
add column if not exists industry_category text;

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  brand_name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  project_name text not null,
  campaign_name text,
  project_type text not null default 'Retail Deployment' check (project_type in ('Retail Deployment', 'Construction', 'Real Estate', 'Facility Management')),
  project_code text,
  client_project_reference text,
  project_manager text,
  site_supervisor text,
  consultant text,
  contractor text,
  start_date date,
  end_date date,
  planned_completion date,
  actual_completion date,
  budget numeric,
  currency text,
  target_quantity integer not null default 0 check (target_quantity >= 0),
  status text not null default 'Planning' check (status in ('Planning', 'Active', 'On Hold', 'Completed', 'Not Started', 'In Progress', 'Delayed', 'Cancelled')),
  primary_target_region text,
  primary_target_state text,
  regions_covered text[] not null default '{}',
  assigned_installers text[] not null default '{}',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (client_id, project_name)
);

alter table public.projects
add column if not exists project_type text not null default 'Retail Deployment'
check (project_type in ('Retail Deployment', 'Construction', 'Real Estate', 'Facility Management'));

alter table public.projects add column if not exists project_code text;
alter table public.projects add column if not exists client_project_reference text;
alter table public.projects add column if not exists project_manager text;
alter table public.projects add column if not exists site_supervisor text;
alter table public.projects add column if not exists consultant text;
alter table public.projects add column if not exists contractor text;
alter table public.projects add column if not exists planned_completion date;
alter table public.projects add column if not exists actual_completion date;
alter table public.projects add column if not exists primary_target_region text;
alter table public.projects add column if not exists primary_target_state text;
alter table public.projects add column if not exists budget numeric;
alter table public.projects add column if not exists currency text;

create table if not exists public.project_targets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  installer_name text,
  installer_user_id uuid references auth.users(id) on delete set null,
  agency_name text,
  region text,
  state text,
  target_quantity integer not null default 0 check (target_quantity >= 0),
  deployment_timeline_start date,
  deployment_timeline_end date,
  created_at timestamptz not null default now()
);

create table if not exists public.deployment_stages (
  id uuid primary key default gen_random_uuid(),
  stage_code text not null unique check (stage_code in ('production', 'warehouse', 'in_transit', 'installed', 'approved')),
  stage_name text not null,
  sort_order integer not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.deployment_progress (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_code text not null references public.deployment_stages(stage_code) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (project_id, stage_code)
);

create table if not exists public.installer_performance (
  installer_name text primary key,
  total_submissions integer not null default 0,
  approved_submissions integer not null default 0,
  rejected_submissions integer not null default 0,
  flagged_submissions integer not null default 0,
  duplicate_submissions integer not null default 0,
  mismatch_submissions integer not null default 0,
  average_turnaround_hours numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  agency_name text not null unique,
  contact_person text,
  email text,
  phone text,
  assigned_regions text[] not null default '{}',
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now()
);

create table if not exists public.installers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  installer_name text not null unique,
  agency_id uuid references public.agencies(id) on delete set null,
  assigned_regions text[] not null default '{}',
  assigned_states text[] not null default '{}',
  assigned_project_ids uuid[] not null default '{}',
  access_status text not null default 'Active' check (access_status in ('Active', 'Suspended', 'Inactive')),
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now()
);

create table if not exists public.client_projects (
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, project_id)
);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  client_id uuid references public.clients(id) on delete cascade,
  phase_name text,
  destination text,
  quantity integer,
  title text not null,
  message text not null,
  status text not null default 'unread',
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'client', 'installer')),
  client_id uuid references public.clients(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null unique,
  phone text,
  agency_id uuid references public.agencies(id) on delete set null,
  assigned_project_ids uuid[] not null default '{}',
  assigned_regions text[] not null default '{}',
  assigned_states text[] not null default '{}',
  status text not null default 'Active' check (status in ('Active', 'Inactive', 'Suspended', 'Archived')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action_type text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.onboarding_drafts (
  id uuid primary key default gen_random_uuid(),
  resume_token text not null unique,
  email text,
  status text not null default 'started',
  current_step text not null default 'welcome',
  draft_data jsonb not null default '{}'::jsonb,
  selected_product text,
  pricing_snapshot_id uuid,
  authenticated_user_id uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  last_updated_at timestamptz not null default now(),
  completed_at timestamptz,
  abandoned_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.commercial_pricing_templates (
  id uuid primary key default gen_random_uuid(),
  product_key text not null check (length(trim(product_key)) > 0),
  name text not null,
  description text,
  currency text not null check (length(trim(currency)) > 0),
  country text,
  region text,
  customer_segment text,
  campaign_type text,
  pricing_metric text not null check (length(trim(pricing_metric)) > 0),
  pricing_method text not null check (length(trim(pricing_method)) > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'archived')),
  is_default boolean not null default false,
  effective_from timestamptz,
  effective_to timestamptz,
  quotation_validity_days integer,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  activated_by uuid,
  activated_at timestamptz,
  deactivated_by uuid,
  deactivated_at timestamptz,
  archived_by uuid,
  archived_at timestamptz,
  constraint commercial_pricing_templates_effective_range_chk check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint commercial_pricing_templates_quotation_validity_chk check (quotation_validity_days is null or quotation_validity_days >= 0)
);

create table if not exists public.commercial_pricing_tiers (
  id uuid primary key default gen_random_uuid(),
  pricing_template_id uuid not null references public.commercial_pricing_templates(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  minimum_quantity integer not null check (minimum_quantity > 0),
  maximum_quantity integer,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  fixed_charge numeric(12,2) default 0 check (fixed_charge is null or fixed_charge >= 0),
  calculation_type text not null default 'progressive' check (calculation_type in ('progressive')),
  enterprise_action text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint commercial_pricing_tiers_maximum_quantity_chk check (maximum_quantity is null or maximum_quantity >= minimum_quantity),
  constraint commercial_pricing_tiers_enterprise_action_chk check (enterprise_action is null or enterprise_action in ('request_quotation', 'no_automatic_checkout', 'custom_rate'))
);

create table if not exists public.commercial_pricing_snapshots (
  id uuid primary key default gen_random_uuid(),
  onboarding_draft_id uuid references public.onboarding_drafts(id) on delete set null,
  organisation_id uuid,
  product_key text not null,
  pricing_template_id uuid not null references public.commercial_pricing_templates(id) on delete restrict,
  pricing_template_name text not null,
  template_version text not null,
  market text,
  currency text not null,
  pricing_metric text not null,
  pricing_method text not null,
  quantity integer not null check (quantity > 0),
  tier_breakdown jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  included_admin_users integer not null default 0,
  requires_enterprise_review boolean not null default false,
  calculated_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'calculated' check (status in ('calculated', 'accepted', 'expired', 'superseded', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists commercial_pricing_templates_product_key_idx on public.commercial_pricing_templates (product_key);
create index if not exists commercial_pricing_templates_status_idx on public.commercial_pricing_templates (status);
create index if not exists commercial_pricing_templates_currency_idx on public.commercial_pricing_templates (currency);
create index if not exists commercial_pricing_templates_country_idx on public.commercial_pricing_templates (country);
create index if not exists commercial_pricing_templates_is_default_idx on public.commercial_pricing_templates (is_default);
create index if not exists commercial_pricing_templates_effective_dates_idx on public.commercial_pricing_templates (effective_from, effective_to);
create unique index if not exists commercial_pricing_templates_active_default_scope_idx on public.commercial_pricing_templates (
  product_key,
  currency,
  coalesce(country, ''),
  coalesce(region, ''),
  coalesce(customer_segment, ''),
  coalesce(campaign_type, '')
)
where status = 'active' and is_default = true and archived_at is null;
create index if not exists commercial_pricing_templates_updated_by_idx on public.commercial_pricing_templates (updated_by);
create index if not exists commercial_pricing_templates_activated_by_idx on public.commercial_pricing_templates (activated_by);
create index if not exists commercial_pricing_templates_archived_by_idx on public.commercial_pricing_templates (archived_by);
create unique index if not exists commercial_pricing_tiers_template_sequence_idx on public.commercial_pricing_tiers (pricing_template_id, sequence);
create index if not exists commercial_pricing_tiers_pricing_template_id_idx on public.commercial_pricing_tiers (pricing_template_id);
create index if not exists commercial_pricing_tiers_status_idx on public.commercial_pricing_tiers (status);
create index if not exists commercial_pricing_snapshots_onboarding_draft_id_idx on public.commercial_pricing_snapshots (onboarding_draft_id);
create index if not exists commercial_pricing_snapshots_status_idx on public.commercial_pricing_snapshots (status);
create index if not exists commercial_pricing_snapshots_pricing_template_id_idx on public.commercial_pricing_snapshots (pricing_template_id);

create table if not exists public.deployment_locations (
  id uuid primary key default gen_random_uuid(),
  state text not null,
  outlet_name text not null,
  owner_name text,
  address text,
  brand_type text,
  outlet_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  local_submission_id text,
  installer_name text,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  brand_id uuid references public.brands(id) on delete set null,
  project_name text,
  brand_name text,
  detected_brand_name text,
  brand_match_status text,
  mismatch_reason text,
  ai_review_note text,
  ai_confidence_score numeric,
  ai_confidence_level text,
  auto_approved boolean not null default false,
  duplicate_status text not null default 'Unique',
  duplicate_reason text,
  image_fingerprint text,
  salon_name text,
  address text,
  phone text,
  gps_latitude double precision,
  gps_longitude double precision,
  installer_state text,
  installer_region text,
  installer_lga text,
  resolved_address text,
  resolved_street text,
  resolved_neighbourhood text,
  resolved_lga text,
  resolved_city text,
  resolved_state text,
  resolved_country text,
  deployment_stage_code text references public.deployment_stages(stage_code) on delete set null,
  state_region text,
  status text not null default 'Pending' check (status in ('Pending', 'Flagged', 'Approved', 'Rejected')),
  image_url text not null,
  image_path text not null,
  ocr_text text,
  ocr_salon_name text,
  ocr_address text,
  ocr_brand_name text,
  ocr_phone text,
  ocr_raw_text text,
  ocr_confidence text,
  ocr_note text,
  approval_comments text,
  rejection_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  ai_raw_text text,
  captured_at timestamptz,
  installation_date date,
  installation_time time,
  submitted_at timestamptz not null default now()
);

create table if not exists public.submission_status_history (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  previous_status text,
  new_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.alert_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.submissions(id) on delete cascade,
  alert_type text not null,
  severity text not null,
  recipient_role text not null default 'admin',
  payload jsonb not null,
  delivery_channel text not null default 'email',
  delivery_status text not null default 'ready',
  created_at timestamptz not null default now()
);

alter table public.submissions add column if not exists installer_name text;
alter table public.submissions add column if not exists installer_email text;
alter table public.submissions add column if not exists local_submission_id text;
alter table public.submissions add column if not exists installer_user_id uuid references auth.users(id) on delete set null;
alter table public.submissions add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.submissions add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.submissions add column if not exists brand_id uuid references public.brands(id) on delete set null;
alter table public.submissions add column if not exists project_name text;
alter table public.submissions add column if not exists brand_name text;
alter table public.submissions add column if not exists detected_brand_name text;
alter table public.submissions add column if not exists brand_match_status text;
alter table public.submissions add column if not exists mismatch_reason text;
alter table public.submissions add column if not exists ai_review_note text;
alter table public.submissions add column if not exists ai_confidence_score numeric;
alter table public.submissions add column if not exists ai_confidence_level text;
alter table public.submissions add column if not exists auto_approved boolean not null default false;
alter table public.submissions add column if not exists duplicate_status text not null default 'Unique';
alter table public.submissions add column if not exists duplicate_reason text;
alter table public.submissions add column if not exists image_fingerprint text;
alter table public.submissions add column if not exists image_url text;
alter table public.submissions add column if not exists image_path text;
alter table public.submissions add column if not exists gps_latitude double precision;
alter table public.submissions add column if not exists gps_longitude double precision;
alter table public.submissions add column if not exists installer_state text;
alter table public.submissions add column if not exists installer_region text;
alter table public.submissions add column if not exists installer_lga text;
alter table public.submissions add column if not exists resolved_address text;
alter table public.submissions add column if not exists resolved_street text;
alter table public.submissions add column if not exists resolved_neighbourhood text;
alter table public.submissions add column if not exists resolved_lga text;
alter table public.submissions add column if not exists resolved_city text;
alter table public.submissions add column if not exists resolved_state text;
alter table public.submissions add column if not exists resolved_country text;
alter table public.submissions add column if not exists deployment_stage_code text references public.deployment_stages(stage_code) on delete set null;
alter table public.submissions add column if not exists captured_at timestamptz;
alter table public.submissions add column if not exists installation_date date;
alter table public.submissions add column if not exists installation_time time;
alter table public.submissions add column if not exists ocr_text text;
alter table public.submissions add column if not exists ocr_salon_name text;
alter table public.submissions add column if not exists ocr_address text;
alter table public.submissions add column if not exists ocr_brand_name text;
alter table public.submissions add column if not exists ocr_phone text;
alter table public.submissions add column if not exists ocr_raw_text text;
alter table public.submissions add column if not exists ocr_confidence text;
alter table public.submissions add column if not exists ocr_note text;
alter table public.submissions add column if not exists approval_comments text;
alter table public.submissions add column if not exists rejection_reason text;
alter table public.submissions add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.submissions add column if not exists reviewed_at timestamptz;
alter table public.submissions add column if not exists ai_raw_text text;
alter table public.submissions add column if not exists selected_outlet_id uuid;
alter table public.submissions add column if not exists selected_outlet_code text;
alter table public.submissions add column if not exists selected_outlet_name text;
alter table public.submissions add column if not exists selected_outlet_address text;
alter table public.submissions add column if not exists selected_outlet_brand_type text;
alter table public.submissions add column if not exists selected_outlet_state text;
alter table public.submissions add column if not exists outlet_match_status text;
alter table public.submissions add column if not exists outlet_match_notes text;
alter table public.submissions add column if not exists archived_at timestamptz;
alter table public.submissions add column if not exists archived_by uuid references auth.users(id) on delete set null;
alter table public.submissions add column if not exists archive_reason text;
alter table public.submissions add column if not exists salon_name text;
alter table public.submissions add column if not exists address text;
alter table public.submissions add column if not exists phone text;
alter table public.submissions add column if not exists state_region text;
alter table public.submissions add column if not exists status text not null default 'Pending';
alter table public.projects add column if not exists brand_id uuid references public.brands(id) on delete set null;
alter table public.projects add column if not exists archived_at timestamptz;
alter table public.agencies add column if not exists contact_person text;
alter table public.agencies add column if not exists email text;
alter table public.agencies add column if not exists phone text;
alter table public.installers add column if not exists user_id uuid unique references auth.users(id) on delete set null;
alter table public.installers add column if not exists assigned_states text[] not null default '{}';
alter table public.installers add column if not exists access_status text not null default 'Active';
alter table public.deployment_locations add column if not exists state text;
alter table public.deployment_locations add column if not exists outlet_name text;
alter table public.deployment_locations add column if not exists owner_name text;
alter table public.deployment_locations add column if not exists address text;
alter table public.deployment_locations add column if not exists brand_type text;
alter table public.deployment_locations add column if not exists outlet_code text;
alter table public.deployment_locations add column if not exists created_at timestamptz not null default now();
alter table public.deployment_locations add column if not exists updated_at timestamptz not null default now();

alter table public.submissions alter column status set default 'Pending';
alter table public.submissions drop constraint if exists submissions_status_check;
alter table public.submissions add constraint submissions_status_check check (status in ('Pending', 'Flagged', 'Approved', 'Rejected', 'Correction Requested'));

create index if not exists submissions_submitted_at_idx on public.submissions (submitted_at desc);
create index if not exists submissions_state_region_idx on public.submissions (state_region);
create index if not exists submissions_installer_state_idx on public.submissions (installer_state);
create index if not exists submissions_installer_region_idx on public.submissions (installer_region);
create index if not exists submissions_installer_name_idx on public.submissions (installer_name);
create index if not exists submissions_installer_user_id_idx on public.submissions (installer_user_id);
create unique index if not exists submissions_installer_local_submission_unique_idx
  on public.submissions (installer_user_id, local_submission_id)
  where local_submission_id is not null;
create index if not exists submissions_brand_name_idx on public.submissions (brand_name);
create index if not exists submissions_brand_id_idx on public.submissions (brand_id);
create index if not exists submissions_client_id_idx on public.submissions (client_id);
create index if not exists submissions_project_id_idx on public.submissions (project_id);
create unique index if not exists submissions_project_outlet_id_active_uidx
  on public.submissions (project_id, selected_outlet_id)
  where project_id is not null
    and selected_outlet_id is not null
    and lower(status) in ('submitted', 'pending', 'approved');
create unique index if not exists submissions_project_outlet_code_active_uidx
  on public.submissions (project_id, lower(selected_outlet_code))
  where project_id is not null
    and selected_outlet_id is null
    and selected_outlet_code is not null
    and selected_outlet_code <> ''
    and lower(status) in ('submitted', 'pending', 'approved');
create index if not exists submissions_project_name_idx on public.submissions (project_name);
create index if not exists submissions_status_idx on public.submissions (status);
create index if not exists submissions_archived_at_idx on public.submissions (archived_at);
create index if not exists submissions_image_fingerprint_idx on public.submissions (image_fingerprint);
create index if not exists submissions_duplicate_status_idx on public.submissions (duplicate_status);
create index if not exists submissions_outlet_match_status_idx on public.submissions (outlet_match_status);
create index if not exists brands_client_id_idx on public.brands (client_id);
create index if not exists projects_client_id_idx on public.projects (client_id);
create index if not exists projects_brand_id_idx on public.projects (brand_id);
create index if not exists project_targets_project_id_idx on public.project_targets (project_id);
create index if not exists deployment_progress_project_id_idx on public.deployment_progress (project_id);
create index if not exists notification_events_client_id_idx on public.notification_events (client_id);
create index if not exists notification_events_project_id_idx on public.notification_events (project_id);
create index if not exists notification_events_unread_idx on public.notification_events (client_id, read_at);
create index if not exists installers_agency_id_idx on public.installers (agency_id);
create index if not exists user_profiles_agency_id_idx on public.user_profiles (agency_id);
create index if not exists user_profiles_status_idx on public.user_profiles (status);
create unique index if not exists user_profiles_email_unique_idx on public.user_profiles (lower(email));
create unique index if not exists installers_user_id_unique_idx on public.installers (user_id) where user_id is not null;
create index if not exists audit_logs_target_user_id_idx on public.audit_logs (target_user_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists submission_status_history_submission_id_idx on public.submission_status_history (submission_id, created_at desc);
create index if not exists alert_events_submission_id_idx on public.alert_events (submission_id, created_at desc);
create index if not exists deployment_locations_state_idx on public.deployment_locations (state);
create index if not exists deployment_locations_outlet_name_idx on public.deployment_locations (outlet_name);

alter table public.submissions enable row level security;
alter table public.clients enable row level security;
alter table public.client_profiles enable row level security;
alter table public.brands enable row level security;
alter table public.projects enable row level security;
alter table public.project_targets enable row level security;
alter table public.deployment_stages enable row level security;
alter table public.deployment_progress enable row level security;
alter table public.installer_performance enable row level security;
alter table public.agencies enable row level security;
alter table public.installers enable row level security;
alter table public.client_projects enable row level security;
alter table public.notification_events enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_profiles enable row level security;
alter table public.audit_logs enable row level security;
alter table public.deployment_locations enable row level security;
alter table public.submission_status_history enable row level security;
alter table public.alert_events enable row level security;

drop policy if exists "Service role can manage deployment locations" on public.deployment_locations;
create policy "Service role can manage deployment locations"
on public.deployment_locations
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Admin service role can manage submissions" on public.submissions;
create policy "Admin service role can manage submissions"
on public.submissions
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Users can read their own role" on public.user_roles;
create policy "Users can read their own role"
on public.user_roles
for select
using (auth.uid() = user_id);

drop policy if exists "Users can read their own profile" on public.user_profiles;
create policy "Users can read their own profile"
on public.user_profiles
for select
using (auth.uid() = user_id);

drop policy if exists "Clients can read own profile" on public.client_profiles;
create policy "Clients can read own profile"
on public.client_profiles
for select
using (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = auth.uid()
      and user_roles.client_id = client_profiles.client_id
  )
);

drop policy if exists "Clients can read their own client row" on public.clients;
create policy "Clients can read their own client row"
on public.clients
for select
using (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = auth.uid()
      and user_roles.client_id = clients.id
  )
);

drop policy if exists "Clients can read their brands" on public.brands;
create policy "Clients can read their brands"
on public.brands
for select
using (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = auth.uid()
      and user_roles.client_id = brands.client_id
  )
);

drop policy if exists "Clients can read linked submissions" on public.submissions;
create policy "Clients can read linked submissions"
on public.submissions
for select
using (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = auth.uid()
      and user_roles.role = 'client'
      and user_roles.client_id = submissions.client_id
  )
);

drop policy if exists "Clients can read linked projects" on public.projects;
create policy "Clients can read linked projects"
on public.projects
for select
using (
  exists (
    select 1
    from public.client_projects
    join public.user_roles on user_roles.client_id = client_projects.client_id
    where client_projects.project_id = projects.id
      and user_roles.user_id = auth.uid()
      and user_roles.role = 'client'
  )
);

drop policy if exists "Clients can read linked project targets" on public.project_targets;
create policy "Clients can read linked project targets"
on public.project_targets
for select
using (
  exists (
    select 1
    from public.projects
    join public.client_projects on client_projects.project_id = projects.id
    join public.user_roles on user_roles.client_id = client_projects.client_id
    where projects.id = project_targets.project_id
      and user_roles.user_id = auth.uid()
      and user_roles.role = 'client'
  )
);

drop policy if exists "Clients can read deployment stages" on public.deployment_stages;
create policy "Clients can read deployment stages"
on public.deployment_stages
for select
using (auth.uid() is not null);

drop policy if exists "Clients can read linked deployment progress" on public.deployment_progress;
create policy "Clients can read linked deployment progress"
on public.deployment_progress
for select
using (
  exists (
    select 1
    from public.projects
    join public.client_projects on client_projects.project_id = projects.id
    join public.user_roles on user_roles.client_id = client_projects.client_id
    where projects.id = deployment_progress.project_id
      and user_roles.user_id = auth.uid()
      and user_roles.role = 'client'
  )
);

drop policy if exists "Admins can manage notification events" on public.notification_events;
create policy "Admins can manage notification events"
on public.notification_events
for all
using (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = auth.uid()
      and user_roles.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = auth.uid()
      and user_roles.role = 'admin'
  )
);

drop policy if exists "Clients can read own notification events" on public.notification_events;
create policy "Clients can read own notification events"
on public.notification_events
for select
using (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = auth.uid()
      and user_roles.role = 'client'
      and user_roles.client_id = notification_events.client_id
  )
);

drop policy if exists "Clients can mark own notification events read" on public.notification_events;
create policy "Clients can mark own notification events read"
on public.notification_events
for update
using (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = auth.uid()
      and user_roles.role = 'client'
      and user_roles.client_id = notification_events.client_id
  )
)
with check (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = auth.uid()
      and user_roles.role = 'client'
      and user_roles.client_id = notification_events.client_id
  )
);

drop policy if exists "Clients can read linked status history" on public.submission_status_history;
create policy "Clients can read linked status history"
on public.submission_status_history
for select
using (
  exists (
    select 1
    from public.submissions
    join public.user_roles on user_roles.client_id = submissions.client_id
    where submissions.id = submission_status_history.submission_id
      and user_roles.user_id = auth.uid()
      and user_roles.role = 'client'
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'installation-images',
  'installation-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view installation images" on storage.objects;
create policy "Public can view installation images"
on storage.objects
for select
using (bucket_id = 'installation-images');

drop policy if exists "Service role can upload installation images" on storage.objects;
create policy "Service role can upload installation images"
on storage.objects
for insert
with check (bucket_id = 'installation-images' and auth.role() = 'service_role');

drop policy if exists "Service role can update installation images" on storage.objects;
create policy "Service role can update installation images"
on storage.objects
for update
using (bucket_id = 'installation-images' and auth.role() = 'service_role')
with check (bucket_id = 'installation-images' and auth.role() = 'service_role');

-- Reconciled final-state patch represented by 20260625000000_archive_workflow.sql
alter table public.submissions
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archive_reason text,
  add column if not exists correction_requested boolean not null default false,
  add column if not exists correction_reason text,
  add column if not exists correction_requested_at timestamptz,
  add column if not exists correction_requested_by uuid references auth.users(id) on delete set null;

create index if not exists submissions_archived_at_idx on public.submissions (archived_at);
create index if not exists submissions_correction_requested_at_idx on public.submissions (correction_requested_at);


-- Reconciled final-state patch represented by 20260714090000_project_type_foundation.sql
alter table public.projects
  add column if not exists project_type text not null default 'Retail Deployment'
  check (project_type in ('Retail Deployment', 'Construction', 'Real Estate', 'Facility Management'));

alter table public.projects add column if not exists project_code text;
alter table public.projects add column if not exists client_project_reference text;
alter table public.projects add column if not exists project_manager text;
alter table public.projects add column if not exists site_supervisor text;
alter table public.projects add column if not exists consultant text;
alter table public.projects add column if not exists contractor text;
alter table public.projects add column if not exists planned_completion date;
alter table public.projects add column if not exists actual_completion date;
alter table public.projects add column if not exists budget numeric;
alter table public.projects add column if not exists currency text;

alter table public.projects
  alter column project_type set default 'Retail Deployment',
  alter column project_type set not null;

alter table public.projects
  alter column currency set default 'NGN';

do $$
declare
  status_constraint text;
begin
  for status_constraint in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'projects'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
      and pg_get_constraintdef(c.oid) ilike '%Planning%'
  loop
    execute format('alter table public.projects drop constraint if exists %I', status_constraint);
  end loop;

  alter table public.projects
    add constraint projects_status_check
    check (status in ('Planning', 'Active', 'On Hold', 'Completed', 'Not Started', 'In Progress', 'Delayed', 'Cancelled'));
end $$;


-- Reconciled final-state patch represented by 20260729120000_commercial_onboarding_foundation.sql
create table if not exists public.onboarding_drafts (
  id uuid primary key default gen_random_uuid(),
  resume_token text not null unique,
  email text,
  status text not null default 'started',
  current_step text not null default 'welcome',
  draft_data jsonb not null default '{}'::jsonb,
  selected_product text,
  pricing_snapshot_id uuid,
  authenticated_user_id uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  last_updated_at timestamptz not null default now(),
  completed_at timestamptz,
  abandoned_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now()
);

create index if not exists onboarding_drafts_resume_token_idx on public.onboarding_drafts (resume_token);
create index if not exists onboarding_drafts_email_idx on public.onboarding_drafts (email);

alter table public.onboarding_drafts enable row level security;


-- Reconciled final-state patch represented by 20260730120000_commercial_pricing_engine.sql
create table if not exists public.commercial_pricing_templates (
  id uuid primary key default gen_random_uuid(),
  product_key text not null check (length(trim(product_key)) > 0),
  name text not null,
  description text,
  currency text not null check (length(trim(currency)) > 0),
  country text,
  region text,
  customer_segment text,
  campaign_type text,
  pricing_metric text not null check (length(trim(pricing_metric)) > 0),
  pricing_method text not null check (length(trim(pricing_method)) > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'archived')),
  is_default boolean not null default false,
  effective_from timestamptz,
  effective_to timestamptz,
  quotation_validity_days integer,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint commercial_pricing_templates_effective_range_chk check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint commercial_pricing_templates_quotation_validity_chk check (quotation_validity_days is null or quotation_validity_days >= 0),
  constraint commercial_pricing_templates_active_archive_chk check (status <> 'archived' or archived_at is not null),
  constraint commercial_pricing_templates_default_archive_chk check (status <> 'active' or archived_at is null)
);

create index if not exists commercial_pricing_templates_product_key_idx on public.commercial_pricing_templates (product_key);
create index if not exists commercial_pricing_templates_status_idx on public.commercial_pricing_templates (status);
create index if not exists commercial_pricing_templates_currency_idx on public.commercial_pricing_templates (currency);
create index if not exists commercial_pricing_templates_country_idx on public.commercial_pricing_templates (country);
create index if not exists commercial_pricing_templates_is_default_idx on public.commercial_pricing_templates (is_default);
create index if not exists commercial_pricing_templates_effective_dates_idx on public.commercial_pricing_templates (effective_from, effective_to);
create unique index if not exists commercial_pricing_templates_active_default_scope_idx on public.commercial_pricing_templates (
  product_key,
  currency,
  coalesce(country, ''),
  coalesce(region, ''),
  coalesce(customer_segment, ''),
  coalesce(campaign_type, '')
)
where status = 'active' and is_default = true and archived_at is null;

create table if not exists public.commercial_pricing_tiers (
  id uuid primary key default gen_random_uuid(),
  pricing_template_id uuid not null references public.commercial_pricing_templates(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  minimum_quantity integer not null check (minimum_quantity > 0),
  maximum_quantity integer,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  fixed_charge numeric(12,2) default 0 check (fixed_charge is null or fixed_charge >= 0),
  calculation_type text not null default 'progressive' check (calculation_type in ('progressive')),
  enterprise_action text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint commercial_pricing_tiers_maximum_quantity_chk check (maximum_quantity is null or maximum_quantity >= minimum_quantity),
  constraint commercial_pricing_tiers_archive_chk check (status <> 'archived' or archived_at is not null),
  constraint commercial_pricing_tiers_enterprise_action_chk check (enterprise_action is null or enterprise_action in ('request_quotation', 'no_automatic_checkout', 'custom_rate'))
);

create unique index if not exists commercial_pricing_tiers_template_sequence_idx on public.commercial_pricing_tiers (pricing_template_id, sequence);
create index if not exists commercial_pricing_tiers_pricing_template_id_idx on public.commercial_pricing_tiers (pricing_template_id);
create index if not exists commercial_pricing_tiers_status_idx on public.commercial_pricing_tiers (status);

create table if not exists public.commercial_pricing_snapshots (
  id uuid primary key default gen_random_uuid(),
  onboarding_draft_id uuid references public.onboarding_drafts(id) on delete set null,
  organisation_id uuid,
  product_key text not null,
  pricing_template_id uuid not null references public.commercial_pricing_templates(id) on delete restrict,
  pricing_template_name text not null,
  template_version text not null,
  market text,
  currency text not null,
  pricing_metric text not null,
  pricing_method text not null,
  quantity integer not null check (quantity > 0),
  tier_breakdown jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  included_admin_users integer not null default 0,
  requires_enterprise_review boolean not null default false,
  calculated_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'calculated' check (status in ('calculated', 'accepted', 'expired', 'superseded', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists commercial_pricing_snapshots_onboarding_draft_id_idx on public.commercial_pricing_snapshots (onboarding_draft_id);
create index if not exists commercial_pricing_snapshots_status_idx on public.commercial_pricing_snapshots (status);
create index if not exists commercial_pricing_snapshots_pricing_template_id_idx on public.commercial_pricing_snapshots (pricing_template_id);

comment on table public.commercial_pricing_templates is 'Stores active or inactive commercial pricing templates for future products and markets.';
comment on table public.commercial_pricing_tiers is 'Stores progressive and other pricing tiers for commercial pricing templates.';
comment on table public.commercial_pricing_snapshots is 'Stores immutable historical pricing calculations for onboarding and commercial workflows.';


-- Reconciled final-state patch represented by 20260731000000_add_project_lifecycle_columns.sql
-- Additive migration: add project lifecycle columns that were defined in
-- supabase/schema.sql but not yet applied to the live database.
--
-- All statements use ADD COLUMN IF NOT EXISTS so running this migration
-- against a database that already has some of these columns is safe and
-- existing project rows are unaffected (every column is nullable).

-- Completion-date lifecycle fields (referenced in project creation and PATCH)
alter table public.projects add column if not exists planned_completion date;
alter table public.projects add column if not exists actual_completion date;

-- Primary-target scope fields (sent in the project creation payload and used
-- for project-level reporting; the same values are also written to project_targets)
alter table public.projects add column if not exists primary_target_region text;
alter table public.projects add column if not exists primary_target_state text;


-- Reconciled final-state patch represented by 20260801000000_add_commercial_pricing_lifecycle_columns.sql
-- Add missing lifecycle tracking columns to commercial_pricing_templates
-- These columns are used by the pricing service for audit trails and state transitions

ALTER TABLE public.commercial_pricing_templates
ADD COLUMN IF NOT EXISTS updated_by uuid,
ADD COLUMN IF NOT EXISTS activated_by uuid,
ADD COLUMN IF NOT EXISTS activated_at timestamptz,
ADD COLUMN IF NOT EXISTS deactivated_by uuid,
ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
ADD COLUMN IF NOT EXISTS archived_by uuid;

-- Add indexes for efficient lookups on lifecycle fields
CREATE INDEX IF NOT EXISTS commercial_pricing_templates_updated_by_idx ON public.commercial_pricing_templates (updated_by);
CREATE INDEX IF NOT EXISTS commercial_pricing_templates_activated_by_idx ON public.commercial_pricing_templates (activated_by);
CREATE INDEX IF NOT EXISTS commercial_pricing_templates_archived_by_idx ON public.commercial_pricing_templates (archived_by);


-- Reconciled final-state patch represented by 20260804000000_add_commercial_model_fields.sql
-- ---------------------------------------------------------------------------
-- Add commercial model, billing behaviour and payment eligibility to templates
-- ---------------------------------------------------------------------------
-- All columns are nullable with safe defaults for backward compatibility.
-- Legacy templates (null commercial_model) are treated as one_time_programme
-- in the application layer for deterministic fallback.
-- ---------------------------------------------------------------------------

ALTER TABLE public.commercial_pricing_templates
  ADD COLUMN IF NOT EXISTS commercial_model text
    CONSTRAINT commercial_pricing_templates_commercial_model_chk
    CHECK (commercial_model IS NULL OR commercial_model IN (
      'one_time_programme',
      'monthly_subscription',
      'annual_subscription',
      'enterprise_contract'
    )),

  ADD COLUMN IF NOT EXISTS billing_behaviour text
    CONSTRAINT commercial_pricing_templates_billing_behaviour_chk
    CHECK (billing_behaviour IS NULL OR billing_behaviour IN (
      'single_payment',
      'monthly',
      'annual',
      'contract'
    )),

  ADD COLUMN IF NOT EXISTS renewal_required boolean NOT NULL DEFAULT false,

  -- JSON array of permitted payment method identifiers, e.g. ["card","bank_transfer"]
  ADD COLUMN IF NOT EXISTS allowed_payment_methods jsonb;

-- Index for filtering by commercial model (useful for admin queries)
CREATE INDEX IF NOT EXISTS commercial_pricing_templates_commercial_model_idx
  ON public.commercial_pricing_templates (commercial_model);

-- ---------------------------------------------------------------------------
-- Backfill: active Retail Nigeria Standard Pricing template
-- commercial_model = one_time_programme — confirmed by product design.
-- All other existing templates are left NULL (treated as one_time_programme
-- by the application layer until an admin explicitly configures them).
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN public.commercial_pricing_templates.commercial_model IS
  'The commercial engagement model: one_time_programme | monthly_subscription | annual_subscription | enterprise_contract';
COMMENT ON COLUMN public.commercial_pricing_templates.billing_behaviour IS
  'How the customer is charged: single_payment | monthly | annual | contract';
COMMENT ON COLUMN public.commercial_pricing_templates.renewal_required IS
  'Whether this commercial model auto-renews. false for one-time programmes.';
COMMENT ON COLUMN public.commercial_pricing_templates.allowed_payment_methods IS
  'JSON array of permitted payment method codes. NULL means all methods permitted.';


-- Reconciled final-state patch represented by 20260804010000_add_acquisition_provisioning_jobs.sql
-- ---------------------------------------------------------------------------
-- CO-1D acquisition provisioning jobs and events
-- ---------------------------------------------------------------------------
-- Existing tenant model remains public.clients + related product resources.
-- This migration only adds an idempotent provisioning control plane.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provisioning_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acquisition_draft_id uuid NOT NULL REFERENCES public.onboarding_drafts(id) ON DELETE CASCADE,
  commercial_reference text NOT NULL,
  product_key text NOT NULL,
  workspace_slug text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  current_stage text NOT NULL DEFAULT 'queued'
    CHECK (current_stage IN (
      'queued',
      'validating',
      'reserving_workspace',
      'creating_organisation',
      'creating_workspace',
      'configuring_product',
      'creating_administrator',
      'creating_permissions',
      'seeding_workspace',
      'running_post_checks',
      'completed',
      'failed'
    )),
  progress_percent integer NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  failure_code text,
  failure_message text,
  result_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS provisioning_jobs_acquisition_draft_id_uidx
  ON public.provisioning_jobs (acquisition_draft_id);

CREATE UNIQUE INDEX IF NOT EXISTS provisioning_jobs_commercial_reference_uidx
  ON public.provisioning_jobs (commercial_reference);

CREATE UNIQUE INDEX IF NOT EXISTS provisioning_jobs_workspace_slug_uidx
  ON public.provisioning_jobs (workspace_slug);

CREATE INDEX IF NOT EXISTS provisioning_jobs_status_idx
  ON public.provisioning_jobs (status, current_stage);

CREATE TABLE IF NOT EXISTS public.provisioning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provisioning_job_id uuid NOT NULL REFERENCES public.provisioning_jobs(id) ON DELETE CASCADE,
  stage text NOT NULL,
  event_type text NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provisioning_events_job_created_idx
  ON public.provisioning_events (provisioning_job_id, created_at);


-- Reconciled final-state patch represented by 20260805000000_add_retail_workspace_reference_foundation.sql
-- ---------------------------------------------------------------------------
-- CO-1D DeployIQ Retail workspace reference provisioning foundation
-- ---------------------------------------------------------------------------
-- Reuses public.clients as the workspace/client identity and adds durable
-- product-scoped configuration interpreted from retail_workspace_manifest.
-- No GCPL pilot data is copied by this migration.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workspace_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  workspace_display_name text NOT NULL,
  workspace_slug text NOT NULL UNIQUE,
  product_key text NOT NULL,
  product_name text NOT NULL,
  provisioning_manifest_key text NOT NULL,
  manifest_version text NOT NULL,
  country text,
  timezone text NOT NULL DEFAULT 'Africa/Lagos',
  currency text NOT NULL DEFAULT 'NGN',
  language text NOT NULL DEFAULT 'en-NG',
  date_format text NOT NULL DEFAULT 'DD MMM YYYY',
  commercial_reference text,
  pricing_template_id uuid REFERENCES public.commercial_pricing_templates(id) ON DELETE SET NULL,
  programme_quantity integer NOT NULL DEFAULT 0 CHECK (programme_quantity >= 0),
  selected_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  commercial_model text,
  enabled_modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  terminology jsonb NOT NULL DEFAULT '{}'::jsonb,
  dashboard_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  provisioned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  product_key text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
  acquisition_draft_id uuid REFERENCES public.onboarding_drafts(id) ON DELETE SET NULL,
  commercial_reference text,
  pricing_template_id uuid REFERENCES public.commercial_pricing_templates(id) ON DELETE SET NULL,
  programme_quantity integer NOT NULL DEFAULT 0 CHECK (programme_quantity >= 0),
  enabled_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  activation_date timestamptz NOT NULL DEFAULT now(),
  commercial_model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, product_key)
);

CREATE TABLE IF NOT EXISTS public.workspace_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  role_key text NOT NULL,
  label text NOT NULL,
  description text,
  app_role text NOT NULL CHECK (app_role IN ('admin', 'client', 'installer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, role_key)
);

CREATE TABLE IF NOT EXISTS public.workspace_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.workspace_roles(id) ON DELETE CASCADE,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, permission)
);

CREATE TABLE IF NOT EXISTS public.workspace_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid REFERENCES public.workspace_roles(id) ON DELETE SET NULL,
  role_key text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'invited')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.workspace_navigation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  label text NOT NULL,
  module_key text NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  required_permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  capability text,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, item_key)
);

CREATE TABLE IF NOT EXISTS public.workspace_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  category text NOT NULL,
  status_key text NOT NULL,
  label text NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  terminal boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, category, status_key)
);

CREATE TABLE IF NOT EXISTS public.workspace_onboarding_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  manifest_key text NOT NULL,
  manifest_version text NOT NULL,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_onboarding_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.workspace_onboarding_checklists(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  label text NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (checklist_id, item_key)
);

CREATE TABLE IF NOT EXISTS public.workspace_report_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  report_key text NOT NULL,
  label text NOT NULL,
  empty_state text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  generated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, report_key)
);

CREATE TABLE IF NOT EXISTS public.workspace_notification_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  label text NOT NULL,
  channel text NOT NULL DEFAULT 'in_app',
  enabled boolean NOT NULL DEFAULT true,
  send_external_email boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, event_key)
);

CREATE TABLE IF NOT EXISTS public.workspace_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  product_identity text NOT NULL,
  organisation_display_name text NOT NULL,
  workspace_initials text NOT NULL,
  logo_placeholder text NOT NULL,
  theme text NOT NULL,
  accent_colour text NOT NULL,
  notification_display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_settings_product_key_idx ON public.workspace_settings(product_key);
CREATE INDEX IF NOT EXISTS product_entitlements_product_key_idx ON public.product_entitlements(product_key, status);
CREATE INDEX IF NOT EXISTS workspace_roles_client_id_idx ON public.workspace_roles(client_id);
CREATE INDEX IF NOT EXISTS workspace_memberships_user_id_idx ON public.workspace_memberships(user_id);
CREATE INDEX IF NOT EXISTS workspace_navigation_client_id_idx ON public.workspace_navigation(client_id, sequence);
CREATE INDEX IF NOT EXISTS workspace_statuses_client_id_idx ON public.workspace_statuses(client_id, category);


-- Reconciled final-state patch represented by 20260806000000_add_workspace_activation_notifications.sql
-- ---------------------------------------------------------------------------
-- CO-1D workspace activation notification requests
-- ---------------------------------------------------------------------------
-- Stores customer requests to be emailed when a provisioning job becomes ready.
-- No credentials, OTPs, auth session tokens, or temporary passwords are stored.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workspace_activation_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authenticated_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  onboarding_draft_id uuid NOT NULL REFERENCES public.onboarding_drafts(id) ON DELETE CASCADE,
  provisioning_job_id uuid NOT NULL REFERENCES public.provisioning_jobs(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  commercial_reference text NOT NULL,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'sending', 'sent', 'failed', 'cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  failure_reason_safe text,
  continuation_token_hash text,
  continuation_token_expires_at timestamptz,
  continuation_token_used_at timestamptz,
  delivery_mode text,
  development_delivery_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_activation_notifications_active_uidx
  ON public.workspace_activation_notifications (provisioning_job_id, lower(recipient_email))
  WHERE status IN ('requested', 'sending', 'failed');

CREATE INDEX IF NOT EXISTS workspace_activation_notifications_job_status_idx
  ON public.workspace_activation_notifications (provisioning_job_id, status);

CREATE INDEX IF NOT EXISTS workspace_activation_notifications_token_hash_idx
  ON public.workspace_activation_notifications (continuation_token_hash)
  WHERE continuation_token_hash IS NOT NULL;

ALTER TABLE public.workspace_activation_notifications ENABLE ROW LEVEL SECURITY;


-- Reconciled final-state patch represented by 20260806010000_add_tenant_scoped_directory_imports.sql
-- ---------------------------------------------------------------------------
-- Customer Workspace Phase 2 Module 1: tenant-scoped directory imports
-- Runtime-safe package for a partially migrated Supabase database.
-- ---------------------------------------------------------------------------
-- Current expected runtime state:
-- - public.workspace_directory_import_batches may already exist and may contain data.
-- - public.deployment_locations may not yet have tenant/directory columns.
-- - public.commit_workspace_directory_import(...) may be missing.
--
-- This script is intentionally additive and idempotent:
-- - it does not drop or recreate populated tables;
-- - it does not rewrite or backfill legacy deployment_locations rows;
-- - it preserves legacy rows whose tenant fields remain NULL;
-- - it restricts Customer Workspace imports to trusted server/service-role calls.
-- ---------------------------------------------------------------------------

ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS product_key text;
ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS directory_record_type text;
ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS latitude numeric;
ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS longitude numeric;
ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS import_batch_id uuid;
ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS import_source text;
ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS imported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS imported_at timestamptz;
ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS raw_data jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.workspace_directory_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  product_key text,
  directory_label text,
  source text,
  status text DEFAULT 'completed',
  imported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at timestamptz DEFAULT now(),
  records_imported integer DEFAULT 0,
  duplicate_count integer DEFAULT 0,
  error_count integer DEFAULT 0,
  warning_count integer DEFAULT 0,
  summary jsonb DEFAULT '{}'::jsonb,
  error_report jsonb DEFAULT '[]'::jsonb,
  idempotency_key text,
  source_file_hash text,
  preview_token_hash text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS product_key text;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS directory_label text;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed';
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS imported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS imported_at timestamptz DEFAULT now();
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS records_imported integer DEFAULT 0;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS duplicate_count integer DEFAULT 0;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS error_count integer DEFAULT 0;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS warning_count integer DEFAULT 0;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS summary jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS error_report jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS source_file_hash text;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS preview_token_hash text;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE public.workspace_directory_import_batches ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.workspace_directory_import_batches ALTER COLUMN status SET DEFAULT 'completed';
ALTER TABLE public.workspace_directory_import_batches ALTER COLUMN imported_at SET DEFAULT now();
ALTER TABLE public.workspace_directory_import_batches ALTER COLUMN records_imported SET DEFAULT 0;
ALTER TABLE public.workspace_directory_import_batches ALTER COLUMN duplicate_count SET DEFAULT 0;
ALTER TABLE public.workspace_directory_import_batches ALTER COLUMN error_count SET DEFAULT 0;
ALTER TABLE public.workspace_directory_import_batches ALTER COLUMN warning_count SET DEFAULT 0;
ALTER TABLE public.workspace_directory_import_batches ALTER COLUMN summary SET DEFAULT '{}'::jsonb;
ALTER TABLE public.workspace_directory_import_batches ALTER COLUMN error_report SET DEFAULT '[]'::jsonb;
ALTER TABLE public.workspace_directory_import_batches ALTER COLUMN created_at SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.deployment_locations'::regclass
      AND conname = 'deployment_locations_client_workspace_match_check'
  ) THEN
    ALTER TABLE public.deployment_locations
      ADD CONSTRAINT deployment_locations_client_workspace_match_check
      CHECK (
        (client_id IS NULL AND workspace_id IS NULL)
        OR client_id = workspace_id
      )
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.workspace_directory_import_batches'::regclass
      AND conname = 'workspace_directory_import_batches_client_workspace_match_check'
  ) THEN
    ALTER TABLE public.workspace_directory_import_batches
      ADD CONSTRAINT workspace_directory_import_batches_client_workspace_match_check
      CHECK (
        (client_id IS NULL AND workspace_id IS NULL)
        OR client_id = workspace_id
      )
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.workspace_directory_import_batches'::regclass
      AND conname = 'workspace_directory_import_batches_status_check'
  ) THEN
    ALTER TABLE public.workspace_directory_import_batches
      ADD CONSTRAINT workspace_directory_import_batches_status_check
      CHECK (status IN ('previewed', 'completed', 'failed', 'rolled_back'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.workspace_directory_import_batches'::regclass
      AND conname = 'workspace_directory_import_batches_records_imported_check'
  ) THEN
    ALTER TABLE public.workspace_directory_import_batches
      ADD CONSTRAINT workspace_directory_import_batches_records_imported_check
      CHECK (records_imported >= 0)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.workspace_directory_import_batches'::regclass
      AND conname = 'workspace_directory_import_batches_duplicate_count_check'
  ) THEN
    ALTER TABLE public.workspace_directory_import_batches
      ADD CONSTRAINT workspace_directory_import_batches_duplicate_count_check
      CHECK (duplicate_count >= 0)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.workspace_directory_import_batches'::regclass
      AND conname = 'workspace_directory_import_batches_error_count_check'
  ) THEN
    ALTER TABLE public.workspace_directory_import_batches
      ADD CONSTRAINT workspace_directory_import_batches_error_count_check
      CHECK (error_count >= 0)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.workspace_directory_import_batches'::regclass
      AND conname = 'workspace_directory_import_batches_warning_count_check'
  ) THEN
    ALTER TABLE public.workspace_directory_import_batches
      ADD CONSTRAINT workspace_directory_import_batches_warning_count_check
      CHECK (warning_count >= 0)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.deployment_locations'::regclass
      AND conname = 'deployment_locations_import_batch_id_fkey'
  ) THEN
    ALTER TABLE public.deployment_locations
      ADD CONSTRAINT deployment_locations_import_batch_id_fkey
      FOREIGN KEY (import_batch_id)
      REFERENCES public.workspace_directory_import_batches(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS deployment_locations_client_id_idx ON public.deployment_locations(client_id);
CREATE INDEX IF NOT EXISTS deployment_locations_workspace_product_idx ON public.deployment_locations(workspace_id, product_key);
CREATE INDEX IF NOT EXISTS deployment_locations_import_batch_id_idx ON public.deployment_locations(import_batch_id);
CREATE INDEX IF NOT EXISTS deployment_locations_external_id_idx ON public.deployment_locations(client_id, product_key, external_id);
CREATE INDEX IF NOT EXISTS workspace_directory_import_batches_client_id_idx ON public.workspace_directory_import_batches(client_id, imported_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS deployment_locations_workspace_product_external_id_uidx
ON public.deployment_locations (
  client_id,
  workspace_id,
  product_key,
  lower(btrim(external_id))
)
WHERE client_id IS NOT NULL
  AND workspace_id IS NOT NULL
  AND product_key IS NOT NULL
  AND NULLIF(btrim(external_id), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS workspace_directory_import_batches_idempotency_uidx
ON public.workspace_directory_import_batches (
  client_id,
  workspace_id,
  product_key,
  idempotency_key
)
WHERE client_id IS NOT NULL
  AND workspace_id IS NOT NULL
  AND product_key IS NOT NULL
  AND idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS workspace_directory_import_batches_batch_scope_uidx
ON public.workspace_directory_import_batches (
  id,
  client_id,
  workspace_id,
  product_key
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.deployment_locations'::regclass
      AND conname = 'deployment_locations_import_batch_scope_fkey'
  ) THEN
    ALTER TABLE public.deployment_locations
      ADD CONSTRAINT deployment_locations_import_batch_scope_fkey
      FOREIGN KEY (import_batch_id, client_id, workspace_id, product_key)
      REFERENCES public.workspace_directory_import_batches(id, client_id, workspace_id, product_key)
      NOT VALID;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.commit_workspace_directory_import(
  uuid,
  uuid,
  text,
  text,
  uuid,
  text,
  jsonb,
  jsonb,
  jsonb
);

CREATE OR REPLACE FUNCTION public.commit_workspace_directory_import(
  p_client_id uuid,
  p_workspace_id uuid,
  p_product_key text,
  p_directory_label text,
  p_imported_by uuid,
  p_import_source text,
  p_rows jsonb,
  p_summary jsonb,
  p_error_report jsonb,
  p_idempotency_key text DEFAULT NULL,
  p_source_file_hash text DEFAULT NULL,
  p_preview_token_hash text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id uuid;
  v_records integer := COALESCE(jsonb_array_length(p_rows), 0);
  v_duplicates integer := COALESCE((p_summary->>'duplicateCount')::integer, 0);
  v_errors integer := COALESCE((p_summary->>'errorCount')::integer, 0);
  v_warnings integer := COALESCE((p_summary->>'warningCount')::integer, 0);
  v_import_source text := COALESCE(NULLIF(btrim(p_import_source), ''), 'upload');
  v_idempotency_key text := NULLIF(btrim(p_idempotency_key), '');
BEGIN
  IF p_client_id IS NULL OR p_workspace_id IS NULL OR p_imported_by IS NULL THEN
    RAISE EXCEPTION 'Tenant-scoped import requires client, workspace and importing user.';
  END IF;

  IF p_client_id <> p_workspace_id THEN
    RAISE EXCEPTION 'Directory import client/workspace mismatch.';
  END IF;

  IF NULLIF(btrim(COALESCE(p_product_key, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Directory import requires a product key.';
  END IF;

  IF v_errors > 0 THEN
    RAISE EXCEPTION 'Cannot commit a directory import with validation errors.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_memberships membership
    WHERE membership.client_id = p_client_id
      AND membership.user_id = p_imported_by
      AND membership.status = 'active'
      AND membership.role_key IN ('customer_admin', 'workspace_owner', 'workspace_administrator')
  ) THEN
    RAISE EXCEPTION 'Directory import requires an active workspace administrator.';
  END IF;

  IF v_idempotency_key IS NOT NULL THEN
    SELECT batch.id
    INTO v_batch_id
    FROM public.workspace_directory_import_batches batch
    WHERE batch.client_id = p_client_id
      AND batch.workspace_id = p_workspace_id
      AND batch.product_key = p_product_key
      AND batch.idempotency_key = v_idempotency_key
    LIMIT 1;

    IF v_batch_id IS NOT NULL THEN
      RETURN v_batch_id;
    END IF;
  END IF;

  BEGIN

  EXCEPTION WHEN unique_violation THEN
    IF v_idempotency_key IS NULL THEN
      RAISE;
    END IF;

    SELECT batch.id
    INTO v_batch_id
    FROM public.workspace_directory_import_batches batch
    WHERE batch.client_id = p_client_id
      AND batch.workspace_id = p_workspace_id
      AND batch.product_key = p_product_key
      AND batch.idempotency_key = v_idempotency_key
    LIMIT 1;

    IF v_batch_id IS NOT NULL THEN
      RETURN v_batch_id;
    END IF;

    RAISE;
  END;

  RETURN v_batch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_workspace_directory_import(
  uuid,
  uuid,
  text,
  text,
  uuid,
  text,
  jsonb,
  jsonb,
  jsonb,
  text,
  text,
  text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_workspace_directory_import(
  uuid,
  uuid,
  text,
  text,
  uuid,
  text,
  jsonb,
  jsonb,
  jsonb,
  text,
  text,
  text
) FROM anon;
REVOKE ALL ON FUNCTION public.commit_workspace_directory_import(
  uuid,
  uuid,
  text,
  text,
  uuid,
  text,
  jsonb,
  jsonb,
  jsonb,
  text,
  text,
  text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.commit_workspace_directory_import(
  uuid,
  uuid,
  text,
  text,
  uuid,
  text,
  jsonb,
  jsonb,
  jsonb,
  text,
  text,
  text
) TO service_role;


-- Reconciled final-state patch represented by 20260806020000_add_customer_workspace_campaigns.sql
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


-- Reconciled final-state patch represented by 20260806030000_add_campaign_location_assignments.sql
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


-- Reconciled final-state patch represented by 20260806040000_add_workspace_field_resources.sql
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


-- Reconciled final-state patch represented by 20260806050000_add_workspace_deployment_execution.sql
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


-- Reconciled final-state patch represented by 20260815000000_add_project_resource_and_region_columns.sql
-- Project-level canonical resources and multi-region geography.
-- Additive only: no existing column is altered, renamed or rewritten.
-- workspace_field_assignments stays campaign-scoped; campaign_id remains NOT NULL.

alter table public.projects
  add column if not exists agency_id uuid references public.agencies(id) on delete set null;

alter table public.projects
  add column if not exists lead_installer_id uuid references public.installers(id) on delete set null;

alter table public.projects
  add column if not exists project_regions text[] not null default '{}';

create index if not exists projects_agency_id_idx on public.projects (agency_id);
create index if not exists projects_lead_installer_id_idx on public.projects (lead_installer_id);

comment on column public.projects.agency_id is 'Project-level Assigned Agency. Campaign/field-resource assignments remain in workspace_field_assignments.';
comment on column public.projects.lead_installer_id is 'Project-level Lead Installer. Must reference an installer linked to an active workspace membership.';
comment on column public.projects.project_regions is 'All selected canonical Regions. Legacy projects fall back to primary_target_region and the regions implied by regions_covered (which stores States).';


-- Reconciled final-state patch represented by 20260815010000_add_workspace_support_sessions.sql
-- Auditable Core Admin support access to a customer workspace.
-- Additive only. No customer data is modified and no existing table is altered.
-- The platform administrator remains the actor; this table only authorises a scoped, expiring context.

create table if not exists public.workspace_support_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  reason text not null check (length(trim(reason)) > 0),
  status text not null default 'active' check (status in ('active', 'ended', 'expired')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  initiated_from text,
  last_activity_at timestamptz,
  created_at timestamptz not null default now()
);

-- Support-session validation runs on workspace requests, so keep the active lookup covered.
create index if not exists workspace_support_sessions_active_idx
  on public.workspace_support_sessions (admin_user_id, status, expires_at desc);
create index if not exists workspace_support_sessions_client_idx
  on public.workspace_support_sessions (client_id, status);

alter table public.workspace_support_sessions enable row level security;

comment on table public.workspace_support_sessions is
  'Auditable, expiring authorisation for a DeployIQ platform administrator to enter one customer workspace in Support Mode. Never stores customer credentials or tokens.';


-- Reconciled final-state patch represented by 20260816020000_harden_acquisition_provisioning_boundary.sql
-- Bind each provisioned client to its immutable acquisition draft. Display
-- names are intentionally not tenant identity keys.
alter table public.clients
  add column if not exists acquisition_draft_id uuid references public.onboarding_drafts(id) on delete restrict;

-- Preserve identity for partially or fully provisioned workspaces created
-- before this immutable binding existed. Malformed legacy JSON is ignored,
-- and only a client with one unambiguous acquisition draft is linked.
with unambiguous_acquisition_clients as (
  select
    (job.result_data->>'organisationId')::uuid as client_id,
    (array_agg(distinct job.acquisition_draft_id))[1] as acquisition_draft_id
  from public.provisioning_jobs job
  where coalesce(job.result_data->>'organisationId', '')
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  group by (job.result_data->>'organisationId')::uuid
  having count(distinct job.acquisition_draft_id) = 1
)
update public.clients client
   set acquisition_draft_id = link.acquisition_draft_id
  from unambiguous_acquisition_clients link
 where client.id = link.client_id
   and client.acquisition_draft_id is null
   and not exists (
     select 1
       from public.clients claimed
      where claimed.acquisition_draft_id = link.acquisition_draft_id
   );

create unique index if not exists clients_acquisition_draft_id_uidx
  on public.clients (acquisition_draft_id)
  where acquisition_draft_id is not null;

-- A narrow database-backed lease prevents concurrent requests from executing
-- one acquisition job. A failed job remains eligible for an intentional retry.
alter table public.provisioning_jobs
  add column if not exists execution_lock_token uuid,
  add column if not exists execution_locked_at timestamptz;

create or replace function public.claim_acquisition_provisioning_job(p_job_id uuid, p_lock_token uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.provisioning_jobs
     set execution_lock_token = p_lock_token,
         execution_locked_at = now(),
         status = 'running',
         updated_at = now()
   where id = p_job_id
     and (
       status in ('queued', 'failed')
       or execution_locked_at < now() - interval '5 minutes'
     )
  returning true;
$$;

revoke all on function public.claim_acquisition_provisioning_job(uuid, uuid) from public;
revoke all on function public.claim_acquisition_provisioning_job(uuid, uuid) from anon;
revoke all on function public.claim_acquisition_provisioning_job(uuid, uuid) from authenticated;
grant execute on function public.claim_acquisition_provisioning_job(uuid, uuid) to service_role;

-- Browser session resolution reads only the authenticated user's own role,
-- profile and tenant row through the RLS policies above. This block remains at
-- the canonical boundary end so every server session table already exists.
revoke all privileges on table public.user_roles, public.user_profiles, public.clients from anon;
revoke all privileges on table public.user_roles, public.user_profiles, public.clients from authenticated;
grant select on table public.user_roles, public.user_profiles, public.clients to authenticated;

grant all privileges on table
  public.user_roles,
  public.user_profiles,
  public.clients,
  public.onboarding_drafts,
  public.provisioning_jobs,
  public.workspace_memberships,
  public.workspace_roles,
  public.workspace_role_permissions,
  public.workspace_settings,
  public.product_entitlements,
  public.projects,
  public.installers
to service_role;

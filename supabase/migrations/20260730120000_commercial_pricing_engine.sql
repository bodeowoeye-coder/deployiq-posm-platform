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

insert into public.commercial_pricing_templates (
  id,
  product_key,
  name,
  description,
  currency,
  country,
  region,
  customer_segment,
  campaign_type,
  pricing_metric,
  pricing_method,
  status,
  is_default,
  effective_from,
  effective_to,
  quotation_validity_days,
  created_by
)
values (
  '6f6a0db0-0f4d-4f95-b66c-79f70ce48b60',
  'retail',
  'DeployIQ Retail Nigeria Standard Pricing',
  'Initial active retail pricing template',
  'NGN',
  'Nigeria',
  null,
  null,
  null,
  'deployment_location',
  'progressive_tiered',
  'active',
  true,
  now(),
  null,
  14,
  null
)
on conflict (id) do nothing;

insert into public.commercial_pricing_tiers (
  id,
  pricing_template_id,
  sequence,
  minimum_quantity,
  maximum_quantity,
  unit_price,
  fixed_charge,
  calculation_type,
  enterprise_action,
  status
)
values
  ('4f1f6d4f-45f6-4de3-b441-f4dc59f85fd8', '6f6a0db0-0f4d-4f95-b66c-79f70ce48b60', 1, 1, 5000, 500, 0, 'progressive', null, 'active'),
  ('0d3d1142-3d9d-4ce6-8c8d-59d311c8ec7a', '6f6a0db0-0f4d-4f95-b66c-79f70ce48b60', 2, 5001, 10000, 475, 0, 'progressive', null, 'active'),
  ('2d7602f0-f9b2-418f-9062-aa6839b2eb55', '6f6a0db0-0f4d-4f95-b66c-79f70ce48b60', 3, 10001, 25000, 450, 0, 'progressive', null, 'active'),
  ('2198f5b9-aae7-4fd9-b74f-c1df720d9baa', '6f6a0db0-0f4d-4f95-b66c-79f70ce48b60', 4, 25001, 50000, 425, 0, 'progressive', null, 'active'),
  ('76a40cb1-608b-4ec5-9fbc-c1a7b3e3c173', '6f6a0db0-0f4d-4f95-b66c-79f70ce48b60', 5, 50001, null, 0, 0, 'progressive', 'request_quotation', 'active')
on conflict (id) do nothing;

comment on table public.commercial_pricing_templates is 'Stores active or inactive commercial pricing templates for future products and markets.';
comment on table public.commercial_pricing_tiers is 'Stores progressive and other pricing tiers for commercial pricing templates.';
comment on table public.commercial_pricing_snapshots is 'Stores immutable historical pricing calculations for onboarding and commercial workflows.';
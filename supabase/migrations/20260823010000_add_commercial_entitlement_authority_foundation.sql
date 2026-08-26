-- ---------------------------------------------------------------------------
-- CORE-2A Phase 2A: additive commercial-entitlement authority foundation
-- ---------------------------------------------------------------------------
-- This migration does not cut provisioning over to entitlement authority.
-- Existing Retail rows remain operational; historical authority is promoted
-- only when the complete persisted Retail chain agrees.
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.commercial_payment_records (
  id uuid primary key default gen_random_uuid(),
  acquisition_draft_id uuid not null references public.onboarding_drafts(id) on delete restrict,
  authenticated_user_id uuid not null references auth.users(id) on delete restrict,
  pricing_snapshot_id uuid not null references public.commercial_pricing_snapshots(id) on delete restrict,
  product_key text not null,
  payment_reference text not null,
  provider_reference text,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null,
  status text not null check (status in ('pending', 'succeeded', 'failed', 'cancelled', 'refunded')),
  payment_provider text not null,
  payment_method text not null,
  succeeded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint commercial_payment_records_success_time_chk
    check (status <> 'succeeded' or succeeded_at is not null)
);

create unique index if not exists commercial_payment_records_payment_reference_uidx
  on public.commercial_payment_records (payment_reference);
create unique index if not exists commercial_payment_records_provider_reference_uidx
  on public.commercial_payment_records (payment_provider, provider_reference)
  where provider_reference is not null;
create index if not exists commercial_payment_records_draft_status_idx
  on public.commercial_payment_records (acquisition_draft_id, status);
create index if not exists commercial_payment_records_snapshot_idx
  on public.commercial_payment_records (pricing_snapshot_id);

create table if not exists public.commercial_approvals (
  id uuid primary key default gen_random_uuid(),
  acquisition_draft_id uuid not null references public.onboarding_drafts(id) on delete restrict,
  authenticated_user_id uuid not null references auth.users(id) on delete restrict,
  product_key text not null,
  pricing_snapshot_id uuid references public.commercial_pricing_snapshots(id) on delete restrict,
  commercial_reference text not null,
  programme_quantity integer not null check (programme_quantity > 0),
  licensed_metric text not null,
  currency text,
  approved_capabilities jsonb not null default '[]'::jsonb,
  commercial_model text not null,
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'revoked', 'superseded')),
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  approval_reference text not null,
  revoked_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_approvals_approved_state_chk
    check (approval_status <> 'approved' or (approved_at is not null and approved_by is not null)),
  constraint commercial_approvals_revoked_state_chk
    check (approval_status <> 'revoked' or revoked_at is not null),
  constraint commercial_approvals_superseded_state_chk
    check (approval_status <> 'superseded' or superseded_at is not null)
);

create unique index if not exists commercial_approvals_reference_uidx
  on public.commercial_approvals (approval_reference);
create index if not exists commercial_approvals_draft_status_idx
  on public.commercial_approvals (acquisition_draft_id, approval_status);
create index if not exists commercial_approvals_product_status_idx
  on public.commercial_approvals (product_key, approval_status);

-- A verified entitlement can exist before deterministic tenant creation. Its
-- acquisition draft and authenticated owner remain mandatory authority in that
-- pre-client state.
alter table public.product_entitlements
  alter column client_id drop not null;

alter table public.product_entitlements
  add column if not exists authenticated_user_id uuid references auth.users(id) on delete restrict,
  add column if not exists pricing_snapshot_id uuid references public.commercial_pricing_snapshots(id) on delete restrict,
  add column if not exists commercial_approval_id uuid references public.commercial_approvals(id) on delete restrict,
  add column if not exists commercial_payment_record_id uuid references public.commercial_payment_records(id) on delete restrict,
  add column if not exists authority_status text not null default 'legacy_unverified',
  add column if not exists authority_source text not null default 'legacy_manual',
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references auth.users(id) on delete restrict,
  add column if not exists currency text,
  add column if not exists licensed_metric text,
  add column if not exists provisioning_manifest_key text,
  add column if not exists compatible_manifest_version text,
  add column if not exists supersedes_entitlement_id uuid references public.product_entitlements(id) on delete restrict,
  add column if not exists superseded_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references auth.users(id) on delete restrict,
  add column if not exists revocation_reason_safe text,
  add column if not exists client_bound_at timestamptz,
  add column if not exists authority_metadata jsonb not null default '{}'::jsonb;

alter table public.product_entitlements
  drop constraint if exists product_entitlements_authority_status_chk,
  drop constraint if exists product_entitlements_authority_source_chk,
  drop constraint if exists product_entitlements_owner_chk,
  drop constraint if exists product_entitlements_verified_state_chk,
  drop constraint if exists product_entitlements_revoked_state_chk,
  drop constraint if exists product_entitlements_superseded_state_chk,
  drop constraint if exists product_entitlements_self_service_evidence_chk,
  drop constraint if exists product_entitlements_assisted_evidence_chk;

alter table public.product_entitlements
  add constraint product_entitlements_authority_status_chk
    check (authority_status in ('pending', 'verified', 'revoked', 'superseded', 'legacy_unverified')),
  add constraint product_entitlements_authority_source_chk
    check (authority_source in ('self_service_payment', 'sales_assisted_approval', 'enterprise_commercial_approval', 'legacy_reconciled', 'legacy_manual')),
  add constraint product_entitlements_owner_chk
    check (client_id is not null or (acquisition_draft_id is not null and authenticated_user_id is not null)),
  add constraint product_entitlements_verified_state_chk
    check (authority_status <> 'verified' or verified_at is not null),
  add constraint product_entitlements_revoked_state_chk
    check (authority_status <> 'revoked' or revoked_at is not null),
  add constraint product_entitlements_superseded_state_chk
    check (authority_status <> 'superseded' or superseded_at is not null),
  add constraint product_entitlements_self_service_evidence_chk
    check (authority_status <> 'verified' or authority_source <> 'self_service_payment' or commercial_payment_record_id is not null),
  add constraint product_entitlements_assisted_evidence_chk
    check (authority_status <> 'verified' or authority_source not in ('sales_assisted_approval', 'enterprise_commercial_approval') or commercial_approval_id is not null);

-- Keep the existing UNIQUE (client_id, product_key) constraint during Phase A.
-- The current Retail writer depends on PostgREST ON CONFLICT (client_id,
-- product_key), which cannot infer a replacement partial index without its
-- predicate. Client-bound entitlement history is enabled in Phase B only after
-- that writer is cut over to immutable entitlement IDs.

create unique index if not exists product_entitlements_current_preclient_draft_product_uidx
  on public.product_entitlements (acquisition_draft_id, product_key)
  where client_id is null
    and acquisition_draft_id is not null
    and authority_status in ('pending', 'verified', 'legacy_unverified')
    and status in ('active', 'suspended');

create unique index if not exists product_entitlements_payment_record_uidx
  on public.product_entitlements (commercial_payment_record_id)
  where commercial_payment_record_id is not null;
create unique index if not exists product_entitlements_approval_uidx
  on public.product_entitlements (commercial_approval_id)
  where commercial_approval_id is not null;
create index if not exists product_entitlements_owner_authority_idx
  on public.product_entitlements (authenticated_user_id, authority_status);
create index if not exists product_entitlements_draft_authority_idx
  on public.product_entitlements (acquisition_draft_id, authority_status);
create index if not exists product_entitlements_supersedes_idx
  on public.product_entitlements (supersedes_entitlement_id);

alter table public.provisioning_jobs
  add column if not exists commercial_entitlement_id uuid references public.product_entitlements(id) on delete restrict;
create index if not exists provisioning_jobs_commercial_entitlement_id_idx
  on public.provisioning_jobs (commercial_entitlement_id);

alter table public.workspace_settings
  add column if not exists commercial_entitlement_id uuid references public.product_entitlements(id) on delete restrict;
create unique index if not exists workspace_settings_commercial_entitlement_id_uidx
  on public.workspace_settings (commercial_entitlement_id)
  where commercial_entitlement_id is not null;

-- Classify every historical row conservatively before promoting any authority.
update public.product_entitlements entitlement
   set authority_status = 'legacy_unverified',
       authority_source = 'legacy_manual',
       authority_metadata = coalesce(entitlement.authority_metadata, '{}'::jsonb)
         || jsonb_build_object(
           'legacyClassification', case when entitlement.acquisition_draft_id is null then 'LEGACY_MANUAL' else 'AMBIGUOUS' end,
           'classifiedAt', now()
         )
 where entitlement.authority_status = 'legacy_unverified';

-- Promote only the fully agreeing historical Retail chain. No display-name
-- matching is used, and malformed JSON values are excluded by guarded CASEs.
with unambiguous_retail as (
  select
    entitlement.id as entitlement_id,
    draft.authenticated_user_id,
    snapshot.id as pricing_snapshot_id,
    snapshot.currency,
    snapshot.pricing_metric,
    workspace.provisioning_manifest_key,
    workspace.manifest_version,
    coalesce(job.completed_at, entitlement.activation_date, entitlement.created_at) as verified_at
  from public.product_entitlements entitlement
  join public.onboarding_drafts draft
    on draft.id = entitlement.acquisition_draft_id
  join public.clients client
    on client.id = entitlement.client_id
   and client.acquisition_draft_id = draft.id
  join public.commercial_pricing_snapshots snapshot
    on snapshot.id = draft.pricing_snapshot_id
   and snapshot.onboarding_draft_id = draft.id
   and snapshot.status = 'accepted'
  join public.provisioning_jobs job
    on job.acquisition_draft_id = draft.id
   and job.status = 'completed'
   and job.current_stage = 'completed'
  join public.workspace_settings workspace
    on workspace.client_id = client.id
   and workspace.status = 'active'
  where entitlement.authority_status = 'legacy_unverified'
    and entitlement.product_key = 'retail'
    and draft.authenticated_user_id is not null
    and draft.selected_product = 'retail'
    and snapshot.product_key = 'retail'
    and job.product_key = 'retail'
    and workspace.product_key = 'retail'
    and workspace.provisioning_manifest_key = 'retail_workspace_manifest'
    and coalesce(job.result_data->'manifest'->>'productKey', 'retail') = 'retail'
    and job.result_data->'manifest'->>'manifestKey' = workspace.provisioning_manifest_key
    and job.result_data->'manifest'->>'manifestVersion' = workspace.manifest_version
    and job.result_data->>'healthChecksPassed' = 'true'
    and draft.draft_data->>'paymentStatus' = 'succeeded'
    and draft.draft_data->>'commercialStatus' = 'payment_verified'
    and draft.draft_data->>'readyForProvisioning' = 'true'
    and draft.draft_data->'confirmedQuotation'->>'productKey' = 'retail'
    and draft.draft_data->'confirmedQuotation'->>'pricingTemplateId' = entitlement.pricing_template_id::text
    and snapshot.pricing_template_id = entitlement.pricing_template_id
    and workspace.pricing_template_id = entitlement.pricing_template_id
    and case
      when coalesce(draft.draft_data->'confirmedQuotation'->>'quantity', '') ~ '^[0-9]+$'
      then (draft.draft_data->'confirmedQuotation'->>'quantity')::integer
      else null
    end = entitlement.programme_quantity
    and snapshot.quantity = entitlement.programme_quantity
    and workspace.programme_quantity = entitlement.programme_quantity
    and draft.draft_data->'confirmedQuotation'->>'currency' = snapshot.currency
    and workspace.currency = snapshot.currency
    and case
      when coalesce(draft.draft_data->'confirmedQuotation'->>'estimatedTotal', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then (draft.draft_data->'confirmedQuotation'->>'estimatedTotal')::numeric
      else null
    end = snapshot.total
    and draft.draft_data->'confirmedQuotation'->>'commercialModel' = entitlement.commercial_model
    and workspace.commercial_model = entitlement.commercial_model
    and coalesce(draft.draft_data->'capabilities', '[]'::jsonb) = entitlement.enabled_capabilities
    and workspace.selected_capabilities = entitlement.enabled_capabilities
    and entitlement.commercial_reference = job.commercial_reference
    and workspace.commercial_reference = entitlement.commercial_reference
)
update public.product_entitlements entitlement
   set authenticated_user_id = proof.authenticated_user_id,
       pricing_snapshot_id = proof.pricing_snapshot_id,
       authority_status = 'verified',
       authority_source = 'legacy_reconciled',
       verified_at = proof.verified_at,
       currency = proof.currency,
       licensed_metric = proof.pricing_metric,
       provisioning_manifest_key = proof.provisioning_manifest_key,
       compatible_manifest_version = proof.manifest_version,
       client_bound_at = coalesce(entitlement.client_bound_at, entitlement.activation_date, entitlement.created_at),
       authority_metadata = coalesce(entitlement.authority_metadata, '{}'::jsonb)
         || jsonb_build_object('legacyClassification', 'UNAMBIGUOUS', 'reconciledAt', now())
  from unambiguous_retail proof
 where entitlement.id = proof.entitlement_id;

-- Commercial authority is server-owned. Existing server/service-role paths
-- continue to work; browser roles receive no direct mutation authority.
alter table public.product_entitlements enable row level security;
alter table public.commercial_payment_records enable row level security;
alter table public.commercial_approvals enable row level security;

revoke insert, update, delete, truncate, references, trigger
  on public.product_entitlements from anon, authenticated;
revoke all on public.commercial_payment_records from anon, authenticated;
revoke all on public.commercial_approvals from anon, authenticated;

commit;

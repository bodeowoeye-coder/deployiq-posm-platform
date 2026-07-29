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

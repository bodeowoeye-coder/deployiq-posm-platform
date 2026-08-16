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

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

create index if not exists notification_events_client_id_idx
  on public.notification_events (client_id);

create index if not exists notification_events_project_id_idx
  on public.notification_events (project_id);

create index if not exists notification_events_unread_idx
  on public.notification_events (client_id, read_at);

alter table public.notification_events enable row level security;

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

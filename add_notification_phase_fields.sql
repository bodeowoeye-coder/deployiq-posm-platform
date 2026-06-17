alter table public.notification_events
add column if not exists phase_name text,
add column if not exists destination text,
add column if not exists quantity integer;

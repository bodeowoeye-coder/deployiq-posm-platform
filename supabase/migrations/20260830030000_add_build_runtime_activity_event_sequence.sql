-- S3A-7 remediation: authoritative ordering for rapidly-created runtime Activity events.
-- Existing rows deliberately remain unsequenced because their original cross-Activity
-- ordering cannot be reconstructed reliably from equal timestamps or UUID values.

alter table public.build_runtime_activity_events
  add column event_sequence bigint;

create sequence public.build_runtime_activity_event_sequence;

create unique index build_runtime_activity_events_sequence_uidx
  on public.build_runtime_activity_events(event_sequence)
  where event_sequence is not null;

create function public.assign_build_runtime_activity_event_sequence()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  -- Always overwrite caller input: sequence is database authority only.
  new.event_sequence := nextval('public.build_runtime_activity_event_sequence');
  return new;
end;
$$;

create trigger trg_build_runtime_activity_events_assign_sequence
before insert on public.build_runtime_activity_events
for each row execute function public.assign_build_runtime_activity_event_sequence();

revoke all on sequence public.build_runtime_activity_event_sequence from public, anon, authenticated, service_role;
grant usage, select on sequence public.build_runtime_activity_event_sequence to service_role;
revoke all on function public.assign_build_runtime_activity_event_sequence() from public, anon, authenticated, service_role;
grant execute on function public.assign_build_runtime_activity_event_sequence() to service_role;

comment on column public.build_runtime_activity_events.event_sequence is
  'Database-authoritative global creation order. NULL identifies events recorded before deterministic sequencing was introduced.';

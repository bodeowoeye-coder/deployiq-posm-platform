-- E1B additive mobile-evidence metadata and idempotency foundation.
-- Device values remain reported context; created_at remains server-authoritative.
alter table public.build_runtime_evidence_uploads
  add column if not exists mobile_operation_id uuid;

alter table public.build_runtime_evidence
  add column if not exists mobile_operation_id uuid,
  add column if not exists device_captured_at timestamptz,
  add column if not exists device_timezone_offset_minutes integer,
  add column if not exists gps_accuracy_metres double precision,
  add column if not exists gps_captured_at timestamptz,
  add column if not exists gps_source text,
  add column if not exists location_status text;

alter table public.build_runtime_evidence
  drop constraint if exists build_runtime_evidence_device_timezone_check,
  add constraint build_runtime_evidence_device_timezone_check check (
    device_timezone_offset_minutes is null or device_timezone_offset_minutes between -840 and 840
  ),
  drop constraint if exists build_runtime_evidence_gps_accuracy_check,
  add constraint build_runtime_evidence_gps_accuracy_check check (
    gps_accuracy_metres is null or (gps_accuracy_metres >= 0 and gps_accuracy_metres <= 100000)
  ),
  drop constraint if exists build_runtime_evidence_gps_source_check,
  add constraint build_runtime_evidence_gps_source_check check (
    gps_source is null or gps_source in ('device_geolocation','unavailable')
  ),
  drop constraint if exists build_runtime_evidence_location_status_check,
  add constraint build_runtime_evidence_location_status_check check (
    location_status is null or location_status in ('granted','denied','prompt','unavailable','error')
  );

create unique index if not exists build_runtime_evidence_mobile_operation_uidx
  on public.build_runtime_evidence(client_id, uploaded_by, mobile_operation_id)
  where mobile_operation_id is not null;

create unique index if not exists build_runtime_evidence_uploads_active_mobile_operation_uidx
  on public.build_runtime_evidence_uploads(client_id, authorized_by, mobile_operation_id)
  where mobile_operation_id is not null and rejected_at is null;

comment on column public.build_runtime_evidence.device_captured_at is
  'Device-reported capture time; never authoritative for lifecycle ordering.';
comment on column public.build_runtime_evidence.gps_accuracy_metres is
  'Device-reported accuracy radius; not a verified site-location assertion.';

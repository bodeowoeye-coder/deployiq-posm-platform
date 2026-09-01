-- S3A-10A: durable nullable schedule baseline foundation.
-- Existing Work Plans retain an explicitly unavailable schedule until a later
-- controlled baselining workflow records authoritative timestamps.

alter table public.build_runtime_activities
  add column planned_start_at timestamptz,
  add column planned_finish_at timestamptz,
  add constraint build_runtime_activities_planned_schedule_order_check check (
    planned_finish_at is null
    or planned_start_at is null
    or planned_finish_at >= planned_start_at
  );

alter table public.build_work_plans
  add column schedule_baselined_at timestamptz;

comment on column public.build_runtime_activities.planned_start_at is
  'Durable authoritative planned start. NULL means no schedule baseline is available.';
comment on column public.build_runtime_activities.planned_finish_at is
  'Durable authoritative planned finish. NULL means no schedule baseline is available.';
comment on column public.build_work_plans.schedule_baselined_at is
  'Time the Work Plan received its durable Activity schedule baseline. NULL means unavailable.';

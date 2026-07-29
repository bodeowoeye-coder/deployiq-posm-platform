-- Sprint 2F: Activity Template Authoring Foundation
-- Additive migration only. No destructive schema changes.
-- Rollback notes:
-- 1) This migration adds nullable columns and non-destructive check constraints.
-- 2) To rollback manually, drop newly added indexes/constraints first, then drop added columns if no data depends on them.
-- 3) Do not rollback in production without data export because activity/checklist authoring records may use these columns.

alter table public.build_activity_templates
  add column if not exists duration_unit text not null default 'days',
  add column if not exists status text not null default 'draft',
  add column if not exists notes text,
  add column if not exists archived_at timestamptz;

alter table public.build_activity_templates
  drop constraint if exists build_activity_templates_duration_unit_check;

alter table public.build_activity_templates
  add constraint build_activity_templates_duration_unit_check
  check (duration_unit in ('hours', 'days', 'weeks'));

alter table public.build_activity_templates
  drop constraint if exists build_activity_templates_status_check;

alter table public.build_activity_templates
  add constraint build_activity_templates_status_check
  check (status in ('draft', 'active', 'inactive', 'archived'));

create index if not exists idx_build_activity_templates_status
  on public.build_activity_templates(status);

create index if not exists idx_build_activity_templates_archived_at
  on public.build_activity_templates(archived_at);

create index if not exists idx_build_activity_templates_category_sequence
  on public.build_activity_templates(activity_category_id, sequence);

alter table public.build_checklist_templates
  add column if not exists description text,
  add column if not exists requires_photo boolean not null default false,
  add column if not exists requires_comment boolean not null default false,
  add column if not exists acceptance_type text,
  add column if not exists archived_at timestamptz;

create index if not exists idx_build_checklist_templates_archived_at
  on public.build_checklist_templates(archived_at);

create index if not exists idx_build_checklist_templates_activity_sequence
  on public.build_checklist_templates(activity_template_id, sequence);

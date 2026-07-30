-- Additive migration: add project lifecycle columns that were defined in
-- supabase/schema.sql but not yet applied to the live database.
--
-- All statements use ADD COLUMN IF NOT EXISTS so running this migration
-- against a database that already has some of these columns is safe and
-- existing project rows are unaffected (every column is nullable).

-- Completion-date lifecycle fields (referenced in project creation and PATCH)
alter table public.projects add column if not exists planned_completion date;
alter table public.projects add column if not exists actual_completion date;

-- Primary-target scope fields (sent in the project creation payload and used
-- for project-level reporting; the same values are also written to project_targets)
alter table public.projects add column if not exists primary_target_region text;
alter table public.projects add column if not exists primary_target_state text;

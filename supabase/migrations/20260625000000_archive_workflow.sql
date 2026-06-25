alter table public.submissions
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archive_reason text,
  add column if not exists correction_requested boolean not null default false,
  add column if not exists correction_reason text,
  add column if not exists correction_requested_at timestamptz,
  add column if not exists correction_requested_by uuid references auth.users(id) on delete set null;

create index if not exists submissions_archived_at_idx on public.submissions (archived_at);
create index if not exists submissions_correction_requested_at_idx on public.submissions (correction_requested_at);

create extension if not exists "pgcrypto";

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  can_review boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  brand_name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'client', 'installer')),
  client_id uuid references public.clients(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  installer_name text,
  client_id uuid references public.clients(id) on delete set null,
  project_name text,
  brand_name text,
  detected_brand_name text,
  brand_match_status text,
  mismatch_reason text,
  ai_review_note text,
  ai_confidence_score numeric,
  ai_confidence_level text,
  auto_approved boolean not null default false,
  duplicate_status text not null default 'Unique',
  duplicate_reason text,
  image_fingerprint text,
  salon_name text,
  address text,
  phone text,
  gps_latitude double precision,
  gps_longitude double precision,
  installer_state text,
  installer_region text,
  installer_lga text,
  state_region text,
  status text not null default 'Pending' check (status in ('Pending', 'Flagged', 'Approved', 'Rejected')),
  image_url text not null,
  image_path text not null,
  ocr_text text,
  ocr_salon_name text,
  ocr_address text,
  ocr_brand_name text,
  ocr_phone text,
  ocr_raw_text text,
  ocr_confidence text,
  ocr_note text,
  approval_comments text,
  rejection_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  ai_raw_text text,
  captured_at timestamptz,
  installation_date date,
  installation_time time,
  submitted_at timestamptz not null default now()
);

create table if not exists public.submission_status_history (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  previous_status text,
  new_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.alert_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.submissions(id) on delete cascade,
  alert_type text not null,
  severity text not null,
  recipient_role text not null default 'admin',
  payload jsonb not null,
  delivery_channel text not null default 'email',
  delivery_status text not null default 'ready',
  created_at timestamptz not null default now()
);

alter table public.submissions add column if not exists installer_name text;
alter table public.submissions add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.submissions add column if not exists project_name text;
alter table public.submissions add column if not exists brand_name text;
alter table public.submissions add column if not exists detected_brand_name text;
alter table public.submissions add column if not exists brand_match_status text;
alter table public.submissions add column if not exists mismatch_reason text;
alter table public.submissions add column if not exists ai_review_note text;
alter table public.submissions add column if not exists ai_confidence_score numeric;
alter table public.submissions add column if not exists ai_confidence_level text;
alter table public.submissions add column if not exists auto_approved boolean not null default false;
alter table public.submissions add column if not exists duplicate_status text not null default 'Unique';
alter table public.submissions add column if not exists duplicate_reason text;
alter table public.submissions add column if not exists image_fingerprint text;
alter table public.submissions add column if not exists image_url text;
alter table public.submissions add column if not exists image_path text;
alter table public.submissions add column if not exists gps_latitude double precision;
alter table public.submissions add column if not exists gps_longitude double precision;
alter table public.submissions add column if not exists installer_state text;
alter table public.submissions add column if not exists installer_region text;
alter table public.submissions add column if not exists installer_lga text;
alter table public.submissions add column if not exists captured_at timestamptz;
alter table public.submissions add column if not exists installation_date date;
alter table public.submissions add column if not exists installation_time time;
alter table public.submissions add column if not exists ocr_text text;
alter table public.submissions add column if not exists ocr_salon_name text;
alter table public.submissions add column if not exists ocr_address text;
alter table public.submissions add column if not exists ocr_brand_name text;
alter table public.submissions add column if not exists ocr_phone text;
alter table public.submissions add column if not exists ocr_raw_text text;
alter table public.submissions add column if not exists ocr_confidence text;
alter table public.submissions add column if not exists ocr_note text;
alter table public.submissions add column if not exists approval_comments text;
alter table public.submissions add column if not exists rejection_reason text;
alter table public.submissions add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.submissions add column if not exists reviewed_at timestamptz;
alter table public.submissions add column if not exists ai_raw_text text;
alter table public.submissions add column if not exists salon_name text;
alter table public.submissions add column if not exists address text;
alter table public.submissions add column if not exists phone text;
alter table public.submissions add column if not exists state_region text;
alter table public.submissions add column if not exists status text not null default 'Pending';

update public.submissions
set status = case
  when status = 'Submitted' then 'Pending'
  when status = 'Needs Review' then 'Pending'
  when status not in ('Pending', 'Flagged', 'Approved', 'Rejected') then 'Pending'
  else status
end;

alter table public.submissions alter column status set default 'Pending';
alter table public.submissions drop constraint if exists submissions_status_check;
alter table public.submissions add constraint submissions_status_check check (status in ('Pending', 'Flagged', 'Approved', 'Rejected'));

insert into public.clients (name)
values ('Godrej Nigeria Ltd')
on conflict (name) do nothing;

insert into public.brands (client_id, brand_name)
select clients.id, brand_names.brand_name
from public.clients
cross join (
  values ('Darling'), ('MegaGrowth'), ('TURA'), ('FreshGlow'), ('GK')
) as brand_names(brand_name)
where clients.name = 'Godrej Nigeria Ltd'
on conflict (brand_name) do nothing;

update public.submissions
set client_id = brands.client_id
from public.brands
where submissions.client_id is null
  and submissions.brand_name = brands.brand_name;

create index if not exists submissions_submitted_at_idx on public.submissions (submitted_at desc);
create index if not exists submissions_state_region_idx on public.submissions (state_region);
create index if not exists submissions_installer_state_idx on public.submissions (installer_state);
create index if not exists submissions_installer_region_idx on public.submissions (installer_region);
create index if not exists submissions_installer_name_idx on public.submissions (installer_name);
create index if not exists submissions_brand_name_idx on public.submissions (brand_name);
create index if not exists submissions_client_id_idx on public.submissions (client_id);
create index if not exists submissions_project_name_idx on public.submissions (project_name);
create index if not exists submissions_status_idx on public.submissions (status);
create index if not exists submissions_image_fingerprint_idx on public.submissions (image_fingerprint);
create index if not exists submissions_duplicate_status_idx on public.submissions (duplicate_status);
create index if not exists brands_client_id_idx on public.brands (client_id);
create index if not exists submission_status_history_submission_id_idx on public.submission_status_history (submission_id, created_at desc);
create index if not exists alert_events_submission_id_idx on public.alert_events (submission_id, created_at desc);

alter table public.submissions enable row level security;
alter table public.clients enable row level security;
alter table public.brands enable row level security;
alter table public.user_roles enable row level security;
alter table public.submission_status_history enable row level security;
alter table public.alert_events enable row level security;

drop policy if exists "Admin service role can manage submissions" on public.submissions;
create policy "Admin service role can manage submissions"
on public.submissions
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Users can read their own role" on public.user_roles;
create policy "Users can read their own role"
on public.user_roles
for select
using (auth.uid() = user_id);

drop policy if exists "Clients can read their own client row" on public.clients;
create policy "Clients can read their own client row"
on public.clients
for select
using (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = auth.uid()
      and user_roles.client_id = clients.id
  )
);

drop policy if exists "Clients can read their brands" on public.brands;
create policy "Clients can read their brands"
on public.brands
for select
using (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = auth.uid()
      and user_roles.client_id = brands.client_id
  )
);

drop policy if exists "Clients can read linked submissions" on public.submissions;
create policy "Clients can read linked submissions"
on public.submissions
for select
using (
  exists (
    select 1
    from public.user_roles
    where user_roles.user_id = auth.uid()
      and user_roles.role = 'client'
      and user_roles.client_id = submissions.client_id
  )
);

drop policy if exists "Clients can read linked status history" on public.submission_status_history;
create policy "Clients can read linked status history"
on public.submission_status_history
for select
using (
  exists (
    select 1
    from public.submissions
    join public.user_roles on user_roles.client_id = submissions.client_id
    where submissions.id = submission_status_history.submission_id
      and user_roles.user_id = auth.uid()
      and user_roles.role = 'client'
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'installation-images',
  'installation-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view installation images" on storage.objects;
create policy "Public can view installation images"
on storage.objects
for select
using (bucket_id = 'installation-images');

drop policy if exists "Service role can upload installation images" on storage.objects;
create policy "Service role can upload installation images"
on storage.objects
for insert
with check (bucket_id = 'installation-images' and auth.role() = 'service_role');

drop policy if exists "Service role can update installation images" on storage.objects;
create policy "Service role can update installation images"
on storage.objects
for update
using (bucket_id = 'installation-images' and auth.role() = 'service_role')
with check (bucket_id = 'installation-images' and auth.role() = 'service_role');

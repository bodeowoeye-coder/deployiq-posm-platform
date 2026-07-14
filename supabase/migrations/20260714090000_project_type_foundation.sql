alter table public.projects
  add column if not exists project_type text not null default 'Retail Deployment'
  check (project_type in ('Retail Deployment', 'Construction', 'Real Estate', 'Facility Management'));

alter table public.projects add column if not exists project_code text;
alter table public.projects add column if not exists client_project_reference text;
alter table public.projects add column if not exists project_manager text;
alter table public.projects add column if not exists site_supervisor text;
alter table public.projects add column if not exists consultant text;
alter table public.projects add column if not exists contractor text;
alter table public.projects add column if not exists planned_completion date;
alter table public.projects add column if not exists actual_completion date;
alter table public.projects add column if not exists budget numeric;
alter table public.projects add column if not exists currency text;

update public.projects
set project_type = 'Retail Deployment'
where project_type is null;

update public.projects
set currency = 'NGN'
where currency is null;

alter table public.projects
  alter column project_type set default 'Retail Deployment',
  alter column project_type set not null;

alter table public.projects
  alter column currency set default 'NGN';

do $$
declare
  status_constraint text;
begin
  for status_constraint in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'projects'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
      and pg_get_constraintdef(c.oid) ilike '%Planning%'
  loop
    execute format('alter table public.projects drop constraint if exists %I', status_constraint);
  end loop;

  alter table public.projects
    add constraint projects_status_check
    check (status in ('Planning', 'Active', 'On Hold', 'Completed', 'Not Started', 'In Progress', 'Delayed', 'Cancelled'));
end $$;

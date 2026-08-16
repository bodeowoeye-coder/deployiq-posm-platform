-- Project-level canonical resources and multi-region geography.
-- Additive only: no existing column is altered, renamed or rewritten.
-- workspace_field_assignments stays campaign-scoped; campaign_id remains NOT NULL.

alter table public.projects
  add column if not exists agency_id uuid references public.agencies(id) on delete set null;

alter table public.projects
  add column if not exists lead_installer_id uuid references public.installers(id) on delete set null;

alter table public.projects
  add column if not exists project_regions text[] not null default '{}';

create index if not exists projects_agency_id_idx on public.projects (agency_id);
create index if not exists projects_lead_installer_id_idx on public.projects (lead_installer_id);

comment on column public.projects.agency_id is 'Project-level Assigned Agency. Campaign/field-resource assignments remain in workspace_field_assignments.';
comment on column public.projects.lead_installer_id is 'Project-level Lead Installer. Must reference an installer linked to an active workspace membership.';
comment on column public.projects.project_regions is 'All selected canonical Regions. Legacy projects fall back to primary_target_region and the regions implied by regions_covered (which stores States).';

-- Installer attribution audit report.
-- This is read-only. It identifies submissions where the saved free-text installer
-- name differs from the canonical installer/profile name linked by installer_user_id.

select
  s.id as submission_id,
  s.submitted_at,
  s.installer_user_id,
  s.installer_name as submission_installer_name,
  coalesce(i.installer_name, up.full_name) as canonical_installer_name,
  up.email as installer_email,
  s.brand_name,
  s.project_name,
  s.status
from public.submissions s
left join public.installers i
  on i.user_id = s.installer_user_id
left join public.user_profiles up
  on up.user_id = s.installer_user_id
where s.installer_user_id is not null
  and coalesce(nullif(trim(s.installer_name), ''), '') <> coalesce(nullif(trim(coalesce(i.installer_name, up.full_name)), ''), '')
order by s.submitted_at desc;

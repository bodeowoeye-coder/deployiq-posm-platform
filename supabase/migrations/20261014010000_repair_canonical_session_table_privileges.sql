-- Restore the explicit table privileges assumed by the existing Global Auth
-- architecture. RLS remains the browser-facing row authority; service_role is
-- used only by server-side session and authoritative-destination resolution.
revoke all privileges on table public.user_roles, public.user_profiles, public.clients from anon;
revoke all privileges on table public.user_roles, public.user_profiles, public.clients from authenticated;
grant select on table public.user_roles, public.user_profiles, public.clients to authenticated;

grant all privileges on table
  public.user_roles,
  public.user_profiles,
  public.clients,
  public.onboarding_drafts,
  public.provisioning_jobs,
  public.workspace_memberships,
  public.workspace_roles,
  public.workspace_role_permissions,
  public.workspace_settings,
  public.product_entitlements,
  public.projects,
  public.installers
to service_role;

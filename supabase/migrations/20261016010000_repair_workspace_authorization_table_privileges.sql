-- Workspace membership, role, and permission resolution is server-authoritative.
-- Legacy default privileges exposed these unprotected authority tables directly
-- to browser database roles. Remove that access without changing RLS, policies,
-- rows, role definitions, or the service-side authorization contract.
revoke all privileges on table
  public.workspace_memberships,
  public.workspace_roles,
  public.workspace_role_permissions
from anon;

revoke all privileges on table
  public.workspace_memberships,
  public.workspace_roles,
  public.workspace_role_permissions
from authenticated;

grant all privileges on table
  public.workspace_memberships,
  public.workspace_roles,
  public.workspace_role_permissions
to service_role;

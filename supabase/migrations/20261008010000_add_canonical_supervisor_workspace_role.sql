-- E1A.2A: provision the distinct canonical Supervisor role without changing
-- historical memberships or established/customized role permissions.

do $$
declare
  conflicting_role record;
begin
  for conflicting_role in
    select id, client_id, label, app_role, status
      from public.workspace_roles
     where role_key = 'supervisor'
       and (
         label is distinct from 'Supervisor'
         or app_role is distinct from 'client'
         or status is distinct from 'active'
       )
  loop
    raise warning 'E1A.2A preserved conflicting supervisor role id=% client_id=% label=% app_role=% status=%',
      conflicting_role.id,
      conflicting_role.client_id,
      conflicting_role.label,
      conflicting_role.app_role,
      conflicting_role.status;
  end loop;
end
$$;

with qualifying_workspaces as (
  select client_id from public.workspace_roles
  union
  select client_id from public.workspace_memberships
  union
  select client_id from public.workspace_settings
),
inserted_supervisor_roles as (
  insert into public.workspace_roles (
    client_id,
    role_key,
    label,
    description,
    app_role,
    status
  )
  select
    workspace.client_id,
    'supervisor',
    'Supervisor',
    'Reviews submissions and coordinates assigned field activity.',
    'client',
    'active'
  from qualifying_workspaces workspace
  on conflict (client_id, role_key) do nothing
  returning id
)
insert into public.workspace_role_permissions (role_id, permission)
select role.id, permission.key
from inserted_supervisor_roles role
cross join (
  values
    ('projects.view'),
    ('campaigns.view'),
    ('submissions.review'),
    ('deployment_locations.view'),
    ('reports.view'),
    ('notifications.view')
) as permission(key)
on conflict (role_id, permission) do nothing;

comment on column public.workspace_roles.role_key is
  'Tenant-scoped canonical role key. supervisor is distinct from workspace_manager; historical memberships are not inferred or rewritten.';

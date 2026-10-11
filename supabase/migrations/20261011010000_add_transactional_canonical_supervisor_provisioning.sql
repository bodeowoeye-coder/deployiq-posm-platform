-- E1A.2C: atomically create the canonical Supervisor role and its defaults.
-- Existing roles are diagnostic-only and are never rewritten or reseeded.

create or replace function public.ensure_canonical_supervisor_role(
  p_client_id uuid,
  p_actor_user_id uuid default null
) returns table (
  role_id uuid,
  outcome text,
  permission_count integer,
  missing_permissions text[],
  unexpected_permissions text[]
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_role public.workspace_roles%rowtype;
  v_inserted boolean := false;
  v_permissions text[];
  v_approved constant text[] := array[
    'projects.view',
    'campaigns.view',
    'submissions.review',
    'deployment_locations.view',
    'reports.view',
    'notifications.view'
  ]::text[];
begin
  if p_client_id is null or not exists (
    select 1 from public.clients client where client.id = p_client_id
  ) then
    raise exception 'CANONICAL_SUPERVISOR_TENANT_INVALID';
  end if;

  -- A supplied actor denotes an interactive Team Management request and must
  -- already be the active Customer Admin for this exact tenant. A null actor
  -- is reserved for the service-only deterministic provisioning path.
  if p_actor_user_id is not null and not exists (
    select 1
    from public.workspace_memberships membership
    left join public.workspace_roles member_role
      on member_role.id = membership.role_id
     and member_role.client_id = membership.client_id
    where membership.client_id = p_client_id
      and membership.user_id = p_actor_user_id
      and membership.status = 'active'
      and membership.role_key = 'customer_admin'
      and (membership.role_id is null or member_role.status = 'active')
  ) then
    raise exception 'CANONICAL_SUPERVISOR_CALLER_UNAUTHORIZED';
  end if;

  -- Serialize this tenant/key without locking unrelated tenants. The unique
  -- constraint remains the final identity boundary.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_client_id::text || ':supervisor', 0)
  );

  select role.* into v_role
  from public.workspace_roles role
  where role.client_id = p_client_id and role.role_key = 'supervisor'
  for update;

  if v_role.id is null then
    insert into public.workspace_roles (
      client_id, role_key, label, description, app_role, status
    ) values (
      p_client_id,
      'supervisor',
      'Supervisor',
      'Reviews submissions and coordinates assigned field activity.',
      'client',
      'active'
    )
    returning * into v_role;
    v_inserted := true;

    insert into public.workspace_role_permissions (role_id, permission)
    select v_role.id, approved_permission
    from unnest(v_approved) approved_permission;
  end if;

  select coalesce(array_agg(permission.permission order by permission.permission), '{}'::text[])
    into v_permissions
  from public.workspace_role_permissions permission
  where permission.role_id = v_role.id;

  role_id := v_role.id;
  permission_count := cardinality(v_permissions);
  select coalesce(array_agg(required_permission order by required_permission), '{}'::text[])
    into missing_permissions
  from unnest(v_approved) required_permission
  where not required_permission = any(v_permissions);
  select coalesce(array_agg(actual_permission order by actual_permission), '{}'::text[])
    into unexpected_permissions
  from unnest(v_permissions) actual_permission
  where not actual_permission = any(v_approved);

  outcome := case
    when v_inserted then 'created'
    when v_role.label is distinct from 'Supervisor'
      or v_role.app_role is distinct from 'client'
      or v_role.status is distinct from 'active' then 'existing_conflicting'
    when cardinality(missing_permissions) > 0 then 'existing_incomplete'
    when cardinality(unexpected_permissions) > 0 then 'existing_customized'
    else 'existing_complete'
  end;
  return next;
end
$$;

revoke all on function public.ensure_canonical_supervisor_role(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.ensure_canonical_supervisor_role(uuid, uuid)
  to service_role;

comment on function public.ensure_canonical_supervisor_role(uuid, uuid) is
  'Service-only atomic creation of the tenant canonical Supervisor role. Existing definitions and permissions are diagnostic-only.';

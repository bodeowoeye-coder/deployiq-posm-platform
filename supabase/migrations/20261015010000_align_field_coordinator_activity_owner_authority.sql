-- Align the runtime Activity-owner allowlist with the committed operational
-- workspace contract. Field Coordinators gain no management or review role:
-- they can only execute work after an authorized manager assigns them as the
-- exact Activity owner.
do $migration$
declare
  current_definition text;
  amended_definition text;
  owner_allowlist text := $$membership.role_key in ('customer_admin','workspace_manager','project_manager','supervisor','agency_manager','installer')$$;
begin
  select pg_get_functiondef(
    'public.apply_build_runtime_activity_action(uuid,text,uuid,uuid,uuid,text)'::regprocedure
  ) into current_definition;

  if current_definition is null
    or position(owner_allowlist in current_definition) = 0
    or position('field_coordinator' in current_definition) > 0
  then
    raise exception 'BUILD_FIELD_COORDINATOR_AUTHORITY_SOURCE_UNEXPECTED';
  end if;

  amended_definition := replace(
    current_definition,
    owner_allowlist,
    $$membership.role_key in ('customer_admin','workspace_manager','project_manager','supervisor','agency_manager','installer','field_coordinator')$$
  );
  execute amended_definition;
end
$migration$;

revoke all on function public.apply_build_runtime_activity_action(uuid,text,uuid,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.apply_build_runtime_activity_action(uuid,text,uuid,uuid,uuid,text)
  to service_role;

comment on function public.apply_build_runtime_activity_action(uuid,text,uuid,uuid,uuid,text)
  is 'Server-only Build Activity lifecycle boundary; Field Coordinators act only as an explicitly assigned Activity owner.';

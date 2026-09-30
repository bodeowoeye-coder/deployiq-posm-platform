-- S3A-11D.5B: atomic, server-authorized project notification governance.

create or replace function public.read_build_notification_governance_context(
  p_project_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
stable
as $$
declare v_client_id uuid; v_can_manage boolean;
begin
  select p.client_id into v_client_id from public.projects p
  where p.id=p_project_id and p.archived_at is null
    and p.project_type in ('Construction','Real Estate','Facility Management');
  if v_client_id is null then raise exception 'BUILD_NOTIFICATION_PROJECT_INVALID'; end if;
  select exists(
    select 1 from public.workspace_memberships m
    left join public.workspace_role_permissions rp on rp.role_id=m.role_id and rp.permission='notifications.manage'
    where m.client_id=v_client_id and m.user_id=p_actor_user_id and m.status='active'
      and (rp.id is not null or (m.role_id is null and m.role_key='customer_admin'))
  ) into v_can_manage;
  return jsonb_build_object(
    'canManage',v_can_manage,
    'eligibleRecipients',case when v_can_manage then coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId',m.user_id,
        'displayName',coalesce(nullif(btrim(up.full_name),''),nullif(btrim(up.email),''),'Workspace member'),
        'roleLabel',coalesce(nullif(btrim(wr.label),''),m.role_key),
        'email',nullif(btrim(up.email),'')
      ) order by coalesce(nullif(btrim(up.full_name),''),nullif(btrim(up.email),''),'Workspace member'))
      from public.workspace_memberships m
      join public.user_profiles up on up.user_id=m.user_id and up.status='Active'
      left join public.workspace_roles wr on wr.id=m.role_id
      where m.client_id=v_client_id and m.status='active'
        and (wr.id is null or wr.status='active')
        and (coalesce(wr.app_role,'client')<>'installer' or p_project_id=any(coalesce(up.assigned_project_ids,'{}'::uuid[])))
    ),'[]'::jsonb) else '[]'::jsonb end
  );
end $$;

revoke all on function public.read_build_notification_governance_context(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_build_notification_governance_context(uuid,uuid) to service_role;

create or replace function public.validate_build_notification_rule_scope() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if not exists(select 1 from public.projects p where p.id=new.project_id and p.client_id=new.client_id and p.archived_at is null and p.project_type in ('Construction','Real Estate','Facility Management')) then raise exception 'BUILD_NOTIFICATION_PROJECT_INVALID'; end if;
  if not exists(
    select 1 from public.workspace_memberships m
    left join public.workspace_role_permissions rp on rp.role_id=m.role_id and rp.permission='notifications.manage'
    where m.client_id=new.client_id and m.user_id=new.updated_by and m.status='active'
      and (rp.id is not null or (m.role_id is null and m.role_key='customer_admin'))
  ) then raise exception 'BUILD_NOTIFICATION_RULE_AUTHORITY_INVALID'; end if;
  if tg_op='UPDATE' then new.version:=old.version+1; new.updated_at:=now(); end if;
  return new;
end $$;

create or replace function public.configure_build_notification_settings(
  p_project_id uuid,
  p_actor_user_id uuid,
  p_preferences jsonb
) returns void
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  v_client_id uuid;
  v_preference jsonb;
  v_category text;
  v_enabled boolean;
  v_expected_version integer;
  v_rule public.build_notification_rules%rowtype;
  v_recipient text;
  v_desired_recipients uuid[];
  v_current_recipients uuid[];
  v_changed boolean;
begin
  if p_actor_user_id is null or jsonb_typeof(p_preferences) <> 'array' or jsonb_array_length(p_preferences) <> 4 then
    raise exception 'BUILD_NOTIFICATION_SETTINGS_INVALID';
  end if;

  select p.client_id into v_client_id
  from public.projects p
  where p.id=p_project_id and p.archived_at is null
    and p.project_type in ('Construction','Real Estate','Facility Management')
  for update;
  if v_client_id is null then raise exception 'BUILD_NOTIFICATION_PROJECT_INVALID'; end if;

  if not exists (
    select 1
    from public.workspace_memberships m
    left join public.workspace_role_permissions rp
      on rp.role_id=m.role_id and rp.permission='notifications.manage'
    where m.client_id=v_client_id and m.user_id=p_actor_user_id and m.status='active'
      and (rp.id is not null or (m.role_id is null and m.role_key='customer_admin'))
  ) then raise exception 'BUILD_NOTIFICATION_RULE_AUTHORITY_INVALID'; end if;

  if (select count(distinct value->>'category') from jsonb_array_elements(p_preferences)) <> 4 then
    raise exception 'BUILD_NOTIFICATION_SETTINGS_INVALID';
  end if;

  for v_preference in select value from jsonb_array_elements(p_preferences) loop
    v_category:=v_preference->>'category';
    if v_category is null or v_category not in ('execution_block','changes_required','review_pending','exception')
      or jsonb_typeof(v_preference->'enabled') is distinct from 'boolean'
      or jsonb_typeof(v_preference->'recipientUserIds') is distinct from 'array'
    then raise exception 'BUILD_NOTIFICATION_SETTINGS_INVALID'; end if;
    v_enabled:=(v_preference->>'enabled')::boolean;
    v_expected_version:=nullif(v_preference->>'expectedVersion','')::integer;
    select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}'::uuid[])
      into v_desired_recipients from jsonb_array_elements_text(v_preference->'recipientUserIds');
    if v_enabled and cardinality(v_desired_recipients)=0 then raise exception 'BUILD_NOTIFICATION_RECIPIENT_REQUIRED'; end if;
    if exists (
      select 1 from unnest(v_desired_recipients) recipient_id
      where not exists (
        select 1 from public.workspace_memberships m
        join public.user_profiles up on up.user_id=m.user_id
        left join public.workspace_roles wr on wr.id=m.role_id
        where m.client_id=v_client_id and m.user_id=recipient_id and m.status='active'
          and up.status='Active' and (wr.id is null or wr.status='active')
          and (coalesce(wr.app_role,'client')<>'installer' or p_project_id=any(coalesce(up.assigned_project_ids,'{}'::uuid[])))
      )
    ) then raise exception 'BUILD_NOTIFICATION_RECIPIENT_INVALID'; end if;

    select * into v_rule from public.build_notification_rules
      where client_id=v_client_id and project_id=p_project_id and category=v_category and channel='in_app'
      for update;
    if found then
      if v_expected_version is null or v_expected_version<>v_rule.version then raise exception 'BUILD_NOTIFICATION_SETTINGS_STALE'; end if;
      select coalesce(array_agg(recipient_user_id order by recipient_user_id),'{}'::uuid[]) into v_current_recipients
      from public.build_notification_rule_recipients where rule_id=v_rule.id and removed_at is null;
      v_changed:=v_rule.enabled is distinct from v_enabled or v_current_recipients is distinct from v_desired_recipients;
      if v_changed then
        update public.build_notification_rules set enabled=v_enabled,updated_by=p_actor_user_id where id=v_rule.id returning * into v_rule;
      end if;
    else
      if v_expected_version is not null then raise exception 'BUILD_NOTIFICATION_SETTINGS_STALE'; end if;
      if not v_enabled and cardinality(v_desired_recipients)=0 then continue; end if;
      insert into public.build_notification_rules(client_id,project_id,category,channel,enabled,created_by,updated_by)
      values(v_client_id,p_project_id,v_category,'in_app',v_enabled,p_actor_user_id,p_actor_user_id) returning * into v_rule;
    end if;

    update public.build_notification_rule_recipients
      set removed_at=now(),removed_by=p_actor_user_id
      where rule_id=v_rule.id and removed_at is null and not (recipient_user_id=any(v_desired_recipients));
    for v_recipient in select unnest(v_desired_recipients)::text loop
      insert into public.build_notification_rule_recipients(rule_id,client_id,project_id,recipient_user_id,created_by)
      values(v_rule.id,v_client_id,p_project_id,v_recipient::uuid,p_actor_user_id)
      on conflict(rule_id,recipient_user_id) do update
        set removed_at=null,removed_by=null,created_by=p_actor_user_id
        where public.build_notification_rule_recipients.removed_at is not null;
    end loop;
  end loop;
end $$;

revoke all on function public.configure_build_notification_settings(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.configure_build_notification_settings(uuid,uuid,jsonb) to service_role;
comment on function public.read_build_notification_governance_context(uuid,uuid) is 'Server-only capability and project-recipient eligibility read boundary.';
comment on function public.configure_build_notification_settings(uuid,uuid,jsonb) is 'Atomic compare-and-swap for server-authorized Build project notification governance.';

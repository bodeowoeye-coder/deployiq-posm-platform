-- S3A-11D: align delivery-time recipient eligibility with project governance.

create or replace function public.reconcile_build_notifications(
  p_client_id uuid,
  p_project_id uuid,
  p_candidates jsonb,
  p_evaluated_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  c jsonb;
  v_condition uuid;
  v_episode uuid;
  v_rule record;
  v_recipient record;
  v_episode_number integer;
  v_active boolean;
  v_project_status text;
  v_materialized integer:=0;
  v_activated integer:=0;
  v_resolved integer:=0;
  v_path text;
  v_title text;
  v_summary text;
begin
  if p_evaluated_at is null or jsonb_typeof(p_candidates)<>'array' then raise exception 'BUILD_NOTIFICATION_RECONCILIATION_INVALID'; end if;
  select status into v_project_status from public.projects where id=p_project_id and client_id=p_client_id and archived_at is null and project_type in ('Construction','Real Estate','Facility Management') for update;
  if v_project_status is null then raise exception 'BUILD_NOTIFICATION_PROJECT_INVALID'; end if;
  if v_project_status in ('Completed','Cancelled') then p_candidates:='[]'::jsonb; end if;
  for c in select value from jsonb_array_elements(p_candidates) loop
    if (c->>'category') not in ('execution_block','changes_required','review_pending','exception') or (c->>'sourceEntityType') not in ('runtime_activity','runtime_exception') or (c->>'sourceEntityId') is null or c->>'discriminator' is null then raise exception 'BUILD_NOTIFICATION_CANDIDATE_INVALID'; end if;
    if not (((c->>'category')='execution_block' and (c->>'sourceEntityType')='runtime_activity' and (c->>'discriminator')='blocked')
      or ((c->>'category')='changes_required' and (c->>'sourceEntityType')='runtime_activity' and (c->>'discriminator')='changes_required')
      or ((c->>'category')='review_pending' and (c->>'sourceEntityType')='runtime_activity' and (c->>'discriminator')='submitted_for_review')
      or ((c->>'category')='exception' and (c->>'sourceEntityType')='runtime_exception' and (c->>'discriminator')='active')) then raise exception 'BUILD_NOTIFICATION_CANDIDATE_CONTRACT_INVALID'; end if;
    if (c->>'projectId')::uuid<>p_project_id or (c->>'clientId')::uuid<>p_client_id then raise exception 'BUILD_NOTIFICATION_CANDIDATE_ANCESTRY_INVALID'; end if;
    if c->>'sourceEntityType'='runtime_activity' and not exists(select 1 from public.build_runtime_activities a where a.id=(c->>'sourceEntityId')::uuid and a.client_id=p_client_id and a.project_id=p_project_id and a.archived_at is null) then raise exception 'BUILD_NOTIFICATION_SOURCE_INVALID'; end if;
    if c->>'sourceEntityType'='runtime_exception' and not exists(select 1 from public.build_runtime_exceptions e where e.id=(c->>'sourceEntityId')::uuid and e.client_id=p_client_id and e.project_id=p_project_id) then raise exception 'BUILD_NOTIFICATION_SOURCE_INVALID'; end if;
    v_active:=coalesce((c->>'active')::boolean,false);
    insert into public.build_notification_conditions(client_id,project_id,category,source_entity_type,source_entity_id,condition_discriminator)
    values(p_client_id,p_project_id,c->>'category',c->>'sourceEntityType',(c->>'sourceEntityId')::uuid,c->>'discriminator') on conflict(client_id,project_id,category,source_entity_type,source_entity_id,condition_discriminator) do update set category=excluded.category returning id into v_condition;
    select id into v_episode from public.build_notification_episodes where condition_id=v_condition and resolved_at is null for update;
    if v_active and v_episode is null and v_project_status not in ('On Hold','Completed','Cancelled') then
      select coalesce(max(episode_number),0)+1 into v_episode_number from public.build_notification_episodes where condition_id=v_condition;
      insert into public.build_notification_episodes(client_id,project_id,condition_id,episode_number,activated_at,first_observed_at,last_evaluated_at,source_entity_type,source_entity_id,authoritative_transition_at)
      values(p_client_id,p_project_id,v_condition,v_episode_number,nullif(c->>'authoritativeAt','')::timestamptz,p_evaluated_at,p_evaluated_at,c->>'sourceEntityType',(c->>'sourceEntityId')::uuid,nullif(c->>'authoritativeAt','')::timestamptz) returning id into v_episode;
      v_activated:=v_activated+1;
      insert into public.build_notification_audit_events(client_id,project_id,event_type,transition_key,category,condition_id,episode_id,source_entity_type,source_entity_id,prior_state,resulting_state,evaluated_at)
      values(p_client_id,p_project_id,'episode_activated','episode:'||v_episode||':activated',c->>'category',v_condition,v_episode,c->>'sourceEntityType',(c->>'sourceEntityId')::uuid,'inactive','active',p_evaluated_at) on conflict(transition_key) do nothing;
    elsif v_active and v_episode is not null then update public.build_notification_episodes set last_evaluated_at=p_evaluated_at where id=v_episode;
    elsif not v_active and v_episode is not null then
      update public.build_notification_episodes set resolved_at=p_evaluated_at,last_evaluated_at=p_evaluated_at where id=v_episode and resolved_at is null;
      update public.build_recipient_notifications set resolved_at=p_evaluated_at where episode_id=v_episode and resolved_at is null;
      v_resolved:=v_resolved+1;
      insert into public.build_notification_audit_events(client_id,project_id,event_type,transition_key,category,condition_id,episode_id,source_entity_type,source_entity_id,prior_state,resulting_state,evaluated_at)
      values(p_client_id,p_project_id,'episode_resolved','episode:'||v_episode||':resolved',c->>'category',v_condition,v_episode,c->>'sourceEntityType',(c->>'sourceEntityId')::uuid,'active','resolved',p_evaluated_at) on conflict(transition_key) do nothing;
    end if;
    if v_active and v_episode is not null and v_project_status<>'On Hold' then
      for v_recipient in
        select n.*,case when rr.removed_at is not null then 'recipient_removed' else 'recipient_unauthorized' end as reason
        from public.build_recipient_notifications n
        join public.build_notification_rule_recipients rr on rr.rule_id=n.rule_id and rr.recipient_user_id=n.recipient_user_id
        where n.episode_id=v_episode and n.suppression_state='visible'
          and (rr.removed_at is not null or not exists(
            select 1
            from public.workspace_memberships m
            join public.user_profiles up on up.user_id=m.user_id and up.status='Active'
            left join public.workspace_roles wr on wr.id=m.role_id
            where m.client_id=n.client_id and m.user_id=n.recipient_user_id and m.status='active'
              and (wr.id is null or wr.status='active')
              and (coalesce(wr.app_role,'client')<>'installer' or n.project_id=any(coalesce(up.assigned_project_ids,'{}'::uuid[])))
          ))
      loop
        update public.build_recipient_notifications set suppression_state='suppressed',suppression_reason=v_recipient.reason,evaluated_at=p_evaluated_at where id=v_recipient.id and suppression_state='visible';
        insert into public.build_notification_audit_events(client_id,project_id,event_type,transition_key,rule_id,rule_version,category,episode_id,recipient_user_id,prior_state,resulting_state,suppression_reason,evaluated_at)
        values(p_client_id,p_project_id,case when v_recipient.reason='recipient_unauthorized' then 'recipient_access_revoked' else 'notification_suppressed' end,
          'notification:'||v_recipient.id||':suppressed:'||v_recipient.reason,v_recipient.rule_id,v_recipient.rule_version,v_recipient.category,v_episode,v_recipient.recipient_user_id,'visible','suppressed',v_recipient.reason,p_evaluated_at)
        on conflict(transition_key) do nothing;
      end loop;
      for v_rule in select * from public.build_notification_rules r where r.client_id=p_client_id and r.project_id=p_project_id and r.category=c->>'category' and r.channel='in_app' and r.enabled loop
        for v_recipient in
          select rr.*
          from public.build_notification_rule_recipients rr
          join public.workspace_memberships m on m.client_id=rr.client_id and m.user_id=rr.recipient_user_id and m.status='active'
          join public.user_profiles up on up.user_id=m.user_id and up.status='Active'
          left join public.workspace_roles wr on wr.id=m.role_id
          where rr.rule_id=v_rule.id and rr.removed_at is null
            and (wr.id is null or wr.status='active')
            and (coalesce(wr.app_role,'client')<>'installer' or p_project_id=any(coalesce(up.assigned_project_ids,'{}'::uuid[])))
        loop
          v_path:=c->>'destinationPath';
          if v_path is null or v_path not like '/workspace/admin/projects/'||p_project_id::text||'/%' then raise exception 'BUILD_NOTIFICATION_DESTINATION_INVALID'; end if;
          v_title:=case c->>'category' when 'execution_block' then 'Activity blocked' when 'changes_required' then 'Changes required' when 'review_pending' then 'Activity awaiting review' else 'Exception requires attention' end;
          v_summary:=case c->>'category' when 'execution_block' then 'A Build Activity is blocked and requires attention.' when 'changes_required' then 'A Build Activity requires corrective work.' when 'review_pending' then 'A Build Activity is awaiting review.' else 'A Build Exception remains active.' end;
          insert into public.build_recipient_notifications(client_id,project_id,rule_id,rule_version,episode_id,recipient_user_id,category,channel,template_key,title,summary,destination_type,destination_path,trigger_at,evaluated_at)
          values(p_client_id,p_project_id,v_rule.id,v_rule.version,v_episode,v_recipient.recipient_user_id,c->>'category','in_app','build.'||(c->>'category')||'.v1',v_title,v_summary,c->>'destinationType',v_path,nullif(c->>'authoritativeAt','')::timestamptz,p_evaluated_at)
          on conflict(episode_id,rule_id,recipient_user_id,channel) do nothing;
          if found then
            v_materialized:=v_materialized+1;
            insert into public.build_notification_audit_events(client_id,project_id,event_type,transition_key,rule_id,rule_version,category,condition_id,episode_id,recipient_user_id,source_entity_type,source_entity_id,prior_state,resulting_state,evaluated_at)
            values(p_client_id,p_project_id,'notification_materialized','notification:'||v_episode||':'||v_rule.id||':'||v_recipient.recipient_user_id,v_rule.id,v_rule.version,c->>'category',v_condition,v_episode,v_recipient.recipient_user_id,c->>'sourceEntityType',(c->>'sourceEntityId')::uuid,'eligible','visible',p_evaluated_at) on conflict(transition_key) do nothing;
          end if;
        end loop;
      end loop;
    end if;
  end loop;
  return jsonb_build_object('activated',v_activated,'resolved',v_resolved,'materialized',v_materialized);
end $$;

revoke all on function public.reconcile_build_notifications(uuid,uuid,jsonb,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.reconcile_build_notifications(uuid,uuid,jsonb,timestamptz) to service_role;
comment on function public.reconcile_build_notifications(uuid,uuid,jsonb,timestamptz) is 'Reconciles deterministic Build conditions using the canonical governed recipient eligibility contract.';

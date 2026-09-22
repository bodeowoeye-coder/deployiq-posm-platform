-- S3A-11D.3: recipient-specific, deterministic Build executive notifications.

create table public.build_notification_rules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category text not null check (category in ('execution_block','changes_required','review_pending','exception')),
  channel text not null default 'in_app' check (channel='in_app'),
  enabled boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id,project_id,category,channel),
  foreign key(project_id,client_id) references public.projects(id,client_id)
);

create table public.build_notification_rule_recipients (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.build_notification_rules(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references auth.users(id) on delete restrict,
  unique(rule_id,recipient_user_id),
  foreign key(project_id,client_id) references public.projects(id,client_id)
);

create table public.build_notification_conditions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category text not null check (category in ('execution_block','changes_required','review_pending','exception')),
  source_entity_type text not null check (source_entity_type in ('runtime_activity','runtime_exception')),
  source_entity_id uuid not null,
  condition_discriminator text not null check (condition_discriminator in ('blocked','changes_required','submitted_for_review','active')),
  condition_key text generated always as (client_id::text||':'||project_id::text||':'||category||':'||source_entity_type||':'||source_entity_id::text||':'||condition_discriminator) stored,
  created_at timestamptz not null default now(),
  unique(client_id,project_id,category,source_entity_type,source_entity_id,condition_discriminator),
  unique(condition_key),
  foreign key(project_id,client_id) references public.projects(id,client_id)
);

create table public.build_notification_episodes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  condition_id uuid not null references public.build_notification_conditions(id) on delete cascade,
  episode_number integer not null check (episode_number > 0),
  activated_at timestamptz,
  first_observed_at timestamptz not null,
  last_evaluated_at timestamptz not null,
  resolved_at timestamptz,
  source_entity_type text not null,
  source_entity_id uuid not null,
  authoritative_transition_at timestamptz,
  created_at timestamptz not null default now(),
  unique(condition_id,episode_number),
  foreign key(project_id,client_id) references public.projects(id,client_id)
);
create unique index build_notification_episodes_active_uidx on public.build_notification_episodes(condition_id) where resolved_at is null;

create table public.build_recipient_notifications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  rule_id uuid not null references public.build_notification_rules(id) on delete restrict,
  rule_version integer not null check(rule_version > 0),
  episode_id uuid not null references public.build_notification_episodes(id) on delete restrict,
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  category text not null check (category in ('execution_block','changes_required','review_pending','exception')),
  channel text not null check(channel='in_app'),
  template_key text not null,
  template_version integer not null default 1 check(template_version=1),
  title text not null check(char_length(title) between 1 and 120),
  summary text not null check(char_length(summary) between 1 and 280),
  destination_type text not null check(destination_type in ('activity_execution','activity_inspection','activity_exceptions')),
  destination_path text not null check(destination_path like '/workspace/admin/projects/%'),
  materialized_at timestamptz not null default now(),
  read_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete restrict,
  suppression_state text not null default 'visible' check(suppression_state in ('visible','suppressed')),
  suppression_reason text check(suppression_reason is null or suppression_reason in ('rule_disabled','recipient_removed','recipient_unauthorized','project_ineligible','condition_resolved_before_materialization','duplicate_active_episode','invalid_rule','invalid_source','invalid_destination')),
  trigger_at timestamptz,
  evaluated_at timestamptz not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(episode_id,rule_id,recipient_user_id,channel),
  foreign key(project_id,client_id) references public.projects(id,client_id),
  check((acknowledged_at is null and acknowledged_by is null) or (acknowledged_at is not null and acknowledged_by=recipient_user_id)),
  check((suppression_state='visible' and suppression_reason is null) or (suppression_state='suppressed' and suppression_reason is not null))
);

create table public.build_notification_audit_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  event_type text not null check(event_type in ('rule_created','rule_changed','rule_enabled','rule_disabled','recipient_added','recipient_removed','episode_activated','episode_resolved','notification_materialized','notification_suppressed','recipient_access_revoked','notification_read','notification_acknowledged')),
  transition_key text not null unique,
  actor_user_id uuid references auth.users(id) on delete restrict,
  rule_id uuid references public.build_notification_rules(id) on delete restrict,
  rule_version integer,
  category text check(category is null or category in ('execution_block','changes_required','review_pending','exception')),
  condition_id uuid references public.build_notification_conditions(id) on delete restrict,
  episode_id uuid references public.build_notification_episodes(id) on delete restrict,
  recipient_user_id uuid references auth.users(id) on delete restrict,
  source_entity_type text,
  source_entity_id uuid,
  prior_state text,
  resulting_state text,
  suppression_reason text,
  evaluated_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key(project_id,client_id) references public.projects(id,client_id)
);

create index build_notification_rules_scope_idx on public.build_notification_rules(client_id,project_id,enabled,category);
create index build_notification_rule_recipients_user_idx on public.build_notification_rule_recipients(client_id,recipient_user_id) where removed_at is null;
create index build_notification_conditions_source_idx on public.build_notification_conditions(client_id,project_id,category,source_entity_type,source_entity_id);
create index build_notification_episodes_scope_idx on public.build_notification_episodes(client_id,project_id,last_evaluated_at desc);
create index build_recipient_notifications_feed_idx on public.build_recipient_notifications(recipient_user_id,materialized_at desc);
create index build_recipient_notifications_unread_idx on public.build_recipient_notifications(recipient_user_id,materialized_at desc) where read_at is null and suppression_state='visible';
create index build_recipient_notifications_unack_idx on public.build_recipient_notifications(recipient_user_id,materialized_at desc) where acknowledged_at is null and suppression_state='visible';
create index build_notification_audit_episode_idx on public.build_notification_audit_events(episode_id,created_at);
create index build_notification_audit_rule_idx on public.build_notification_audit_events(rule_id,created_at);

create function public.validate_build_notification_rule_scope() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if not exists(select 1 from public.projects p where p.id=new.project_id and p.client_id=new.client_id and p.archived_at is null and p.project_type in ('Construction','Real Estate','Facility Management')) then raise exception 'BUILD_NOTIFICATION_PROJECT_INVALID'; end if;
  if not exists(select 1 from public.workspace_memberships m where m.client_id=new.client_id and m.user_id=new.updated_by and m.status='active' and m.role_key in ('customer_admin','workspace_owner','workspace_manager','workspace_administrator')) then raise exception 'BUILD_NOTIFICATION_RULE_AUTHORITY_INVALID'; end if;
  if tg_op='UPDATE' then new.version:=old.version+1; new.updated_at:=now(); end if;
  return new;
end $$;
create trigger trg_build_notification_rules_scope before insert or update on public.build_notification_rules for each row execute function public.validate_build_notification_rule_scope();

create function public.validate_build_notification_recipient_scope() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if not exists(select 1 from public.build_notification_rules r where r.id=new.rule_id and r.client_id=new.client_id and r.project_id=new.project_id) then raise exception 'BUILD_NOTIFICATION_RULE_ANCESTRY_INVALID'; end if;
  if new.removed_at is null and not exists(select 1 from public.workspace_memberships m where m.client_id=new.client_id and m.user_id=new.recipient_user_id and m.status='active') then raise exception 'BUILD_NOTIFICATION_RECIPIENT_INVALID'; end if;
  if tg_op='UPDATE' and old.removed_at is not null and new.removed_at is null then new.created_at:=now(); end if;
  return new;
end $$;
create trigger trg_build_notification_recipients_scope before insert or update on public.build_notification_rule_recipients for each row execute function public.validate_build_notification_recipient_scope();

create function public.audit_build_notification_rule_configuration() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_event text;
begin
  v_event:=case when tg_op='INSERT' then 'rule_created' when old.enabled is distinct from new.enabled then case when new.enabled then 'rule_enabled' else 'rule_disabled' end else 'rule_changed' end;
  insert into public.build_notification_audit_events(client_id,project_id,event_type,transition_key,actor_user_id,rule_id,rule_version,category,prior_state,resulting_state,evaluated_at)
  values(new.client_id,new.project_id,v_event,'rule:'||new.id||':version:'||new.version||':'||v_event,new.updated_by,new.id,new.version,new.category,
    case when tg_op='INSERT' then null else case when old.enabled then 'enabled' else 'disabled' end end,
    case when new.enabled then 'enabled' else 'disabled' end,new.updated_at);
  return new;
end $$;
create trigger trg_build_notification_rules_audit after insert or update on public.build_notification_rules for each row execute function public.audit_build_notification_rule_configuration();

create function public.audit_build_notification_recipient_configuration() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_event text; v_actor uuid; v_time timestamptz;
begin
  if tg_op='INSERT' then v_event:='recipient_added'; v_actor:=new.created_by; v_time:=new.created_at;
  elsif old.removed_at is null and new.removed_at is not null then v_event:='recipient_removed'; v_actor:=new.removed_by; v_time:=new.removed_at;
  elsif old.removed_at is not null and new.removed_at is null then v_event:='recipient_added'; v_actor:=new.created_by; v_time:=now();
  else return new; end if;
  insert into public.build_notification_audit_events(client_id,project_id,event_type,transition_key,actor_user_id,rule_id,rule_version,category,recipient_user_id,prior_state,resulting_state,evaluated_at)
  select new.client_id,new.project_id,v_event,'recipient:'||new.id||':'||v_event||':'||coalesce(new.removed_at,new.created_at)::text,v_actor,r.id,r.version,r.category,new.recipient_user_id,
    case when v_event='recipient_added' then 'absent' else 'configured' end,case when v_event='recipient_added' then 'configured' else 'removed' end,v_time
  from public.build_notification_rules r where r.id=new.rule_id;
  return new;
end $$;
create trigger trg_build_notification_recipients_audit after insert or update on public.build_notification_rule_recipients for each row execute function public.audit_build_notification_recipient_configuration();

create function public.guard_build_notification_audit() returns trigger language plpgsql set search_path=pg_catalog as $$ begin raise exception 'BUILD_NOTIFICATION_AUDIT_IMMUTABLE'; end $$;
create trigger trg_build_notification_audit_guard before update or delete on public.build_notification_audit_events for each row execute function public.guard_build_notification_audit();

create function public.reconcile_build_notifications(p_client_id uuid,p_project_id uuid,p_candidates jsonb,p_evaluated_at timestamptz)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare c jsonb; v_condition uuid; v_episode uuid; v_rule record; v_recipient record; v_episode_number integer; v_active boolean; v_project_status text; v_materialized integer:=0; v_activated integer:=0; v_resolved integer:=0; v_path text; v_title text; v_summary text;
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
          and (rr.removed_at is not null or not exists(select 1 from public.workspace_memberships m where m.client_id=n.client_id and m.user_id=n.recipient_user_id and m.status='active'))
      loop
        update public.build_recipient_notifications set suppression_state='suppressed',suppression_reason=v_recipient.reason,evaluated_at=p_evaluated_at where id=v_recipient.id and suppression_state='visible';
        insert into public.build_notification_audit_events(client_id,project_id,event_type,transition_key,rule_id,rule_version,category,episode_id,recipient_user_id,prior_state,resulting_state,suppression_reason,evaluated_at)
        values(p_client_id,p_project_id,case when v_recipient.reason='recipient_unauthorized' then 'recipient_access_revoked' else 'notification_suppressed' end,
          'notification:'||v_recipient.id||':suppressed:'||v_recipient.reason,v_recipient.rule_id,v_recipient.rule_version,v_recipient.category,v_episode,v_recipient.recipient_user_id,'visible','suppressed',v_recipient.reason,p_evaluated_at)
        on conflict(transition_key) do nothing;
      end loop;
      for v_rule in select * from public.build_notification_rules r where r.client_id=p_client_id and r.project_id=p_project_id and r.category=c->>'category' and r.channel='in_app' and r.enabled loop
        for v_recipient in select rr.* from public.build_notification_rule_recipients rr join public.workspace_memberships m on m.client_id=rr.client_id and m.user_id=rr.recipient_user_id and m.status='active' where rr.rule_id=v_rule.id and rr.removed_at is null loop
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

alter table public.build_notification_rules enable row level security;
alter table public.build_notification_rule_recipients enable row level security;
alter table public.build_notification_conditions enable row level security;
alter table public.build_notification_episodes enable row level security;
alter table public.build_recipient_notifications enable row level security;
alter table public.build_notification_audit_events enable row level security;
revoke all on table public.build_notification_rules,public.build_notification_rule_recipients,public.build_notification_conditions,public.build_notification_episodes,public.build_recipient_notifications,public.build_notification_audit_events from public,anon,authenticated,service_role;
grant all on table public.build_notification_rules,public.build_notification_rule_recipients,public.build_notification_conditions,public.build_notification_episodes,public.build_recipient_notifications,public.build_notification_audit_events to service_role;
grant select on table public.build_recipient_notifications to authenticated;
create policy "Recipients read own Build notifications" on public.build_recipient_notifications for select to authenticated using(
  recipient_user_id=auth.uid() and suppression_state='visible'
  and exists(select 1 from public.workspace_memberships m where m.client_id=build_recipient_notifications.client_id and m.user_id=auth.uid() and m.status='active')
  and exists(select 1 from public.build_notification_rule_recipients rr where rr.rule_id=build_recipient_notifications.rule_id and rr.recipient_user_id=auth.uid() and rr.removed_at is null)
  and exists(select 1 from public.projects p where p.id=build_recipient_notifications.project_id and p.client_id=build_recipient_notifications.client_id and p.archived_at is null)
);
revoke all on function public.validate_build_notification_rule_scope(),public.validate_build_notification_recipient_scope(),public.audit_build_notification_rule_configuration(),public.audit_build_notification_recipient_configuration(),public.guard_build_notification_audit(),public.reconcile_build_notifications(uuid,uuid,jsonb,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.reconcile_build_notifications(uuid,uuid,jsonb,timestamptz) to service_role;

comment on table public.build_recipient_notifications is 'Recipient-specific, deterministic in-app Build executive notifications; isolated from legacy notification_events.';

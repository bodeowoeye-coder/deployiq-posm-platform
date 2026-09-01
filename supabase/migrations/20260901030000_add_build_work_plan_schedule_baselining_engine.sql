-- S3A-10A.2: deterministic one-time Work Plan schedule baselining.
-- V1 uses continuous calendar time and the canonical hours/days/weeks units.

create or replace function public.baseline_build_work_plan_schedule(
  p_work_plan_id uuid,
  p_baseline_start timestamptz,
  p_persist boolean default false
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_plan public.build_work_plans%rowtype;
  v_activity_count integer;
  v_written_count integer;
  v_has_cycle boolean;
  v_schedule jsonb;
  v_baselined_at timestamptz;
begin
  if p_work_plan_id is null or p_baseline_start is null then
    raise exception 'BUILD_SCHEDULE_BASELINE_INPUT_REQUIRED';
  end if;

  select plan.* into v_plan
  from public.build_work_plans plan
  join public.projects project
    on project.id = plan.project_id and project.client_id = plan.client_id
  join public.build_sites site
    on site.id = plan.site_id and site.project_id = plan.project_id and site.client_id = plan.client_id
  join public.build_work_packages work_package
    on work_package.id = plan.work_package_id and work_package.site_id = plan.site_id
   and work_package.project_id = plan.project_id and work_package.client_id = plan.client_id
  where plan.id = p_work_plan_id
    and plan.archived_at is null
    and project.archived_at is null
    and project.project_type in ('Construction', 'Real Estate', 'Facility Management')
    and site.archived_at is null and site.status <> 'archived'
    and work_package.archived_at is null and work_package.status <> 'archived'
  for update of plan;

  if not found then raise exception 'BUILD_SCHEDULE_WORK_PLAN_NOT_ELIGIBLE'; end if;
  if v_plan.schedule_baselined_at is not null then raise exception 'BUILD_SCHEDULE_ALREADY_BASELINED'; end if;

  if exists (
    select 1 from public.build_runtime_activities activity
    where activity.work_plan_id = v_plan.id and activity.archived_at is null
      and (activity.planned_start_at is not null or activity.planned_finish_at is not null)
  ) then raise exception 'BUILD_SCHEDULE_PARTIAL_BASELINE_STATE'; end if;

  select count(*) into v_activity_count
  from public.build_runtime_activities activity
  where activity.work_plan_id = v_plan.id and activity.archived_at is null;
  if v_activity_count = 0 then raise exception 'BUILD_SCHEDULE_NO_ACTIVE_ACTIVITIES'; end if;

  if exists (
    select 1 from public.build_runtime_activities activity
    where activity.work_plan_id = v_plan.id and activity.archived_at is null
      and (activity.planned_duration is null or activity.planned_duration < 0
        or activity.duration_unit not in ('hours', 'days', 'weeks'))
  ) then raise exception 'BUILD_SCHEDULE_ACTIVITY_DURATION_INVALID'; end if;

  if exists (
    select 1
    from public.build_runtime_dependencies dependency
    left join public.build_runtime_activities predecessor
      on predecessor.id = dependency.predecessor_runtime_activity_id
      and predecessor.work_plan_id = v_plan.id and predecessor.archived_at is null
    left join public.build_runtime_activities successor
      on successor.id = dependency.successor_runtime_activity_id
      and successor.work_plan_id = v_plan.id and successor.archived_at is null
    where dependency.work_plan_id = v_plan.id
      and (predecessor.id is null or successor.id is null)
  ) then raise exception 'BUILD_SCHEDULE_DEPENDENCY_ANCESTRY_INVALID'; end if;

  if exists (
    select 1 from public.build_runtime_dependencies dependency
    where dependency.work_plan_id = v_plan.id
      and dependency.predecessor_runtime_activity_id = dependency.successor_runtime_activity_id
  ) then raise exception 'BUILD_SCHEDULE_SELF_DEPENDENCY'; end if;

  if exists (
    select 1 from public.build_runtime_dependencies dependency
    where dependency.work_plan_id = v_plan.id
      and (dependency.dependency_type::text not in ('FS', 'SS', 'FF', 'SF')
        or dependency.lag_value < 0
        or dependency.lag_unit::text not in ('hours', 'days', 'weeks'))
  ) then raise exception 'BUILD_SCHEDULE_DEPENDENCY_VALUE_INVALID'; end if;

  if exists (
    select 1 from public.build_runtime_dependencies dependency
    where dependency.work_plan_id = v_plan.id
    group by dependency.predecessor_runtime_activity_id, dependency.successor_runtime_activity_id
    having count(*) > 1
  ) then raise exception 'BUILD_SCHEDULE_DUPLICATE_DEPENDENCY'; end if;

  with recursive walk(current_id, visited, cycle) as (
    select dependency.successor_runtime_activity_id,
      array[dependency.predecessor_runtime_activity_id, dependency.successor_runtime_activity_id],
      dependency.predecessor_runtime_activity_id = dependency.successor_runtime_activity_id
    from public.build_runtime_dependencies dependency
    where dependency.work_plan_id = v_plan.id
    union all
    select dependency.successor_runtime_activity_id,
      walk.visited || dependency.successor_runtime_activity_id,
      dependency.successor_runtime_activity_id = any(walk.visited)
    from walk
    join public.build_runtime_dependencies dependency
      on dependency.work_plan_id = v_plan.id
     and dependency.predecessor_runtime_activity_id = walk.current_id
    where not walk.cycle
  )
  select coalesce(bool_or(cycle), false) into v_has_cycle from walk;
  if v_has_cycle then raise exception 'BUILD_SCHEDULE_DEPENDENCY_CYCLE'; end if;

  with recursive activity_duration as (
    select activity.id, activity.sequence,
      case activity.duration_unit
        when 'hours' then make_interval(hours => activity.planned_duration)
        when 'days' then make_interval(days => activity.planned_duration)
        when 'weeks' then make_interval(days => activity.planned_duration * 7)
      end as duration
    from public.build_runtime_activities activity
    where activity.work_plan_id = v_plan.id and activity.archived_at is null
  ), paths(activity_id, candidate_start, visited) as (
    select activity.id, p_baseline_start, array[activity.id]
    from activity_duration activity
    union all
    select successor.id,
      greatest(p_baseline_start, paths.candidate_start +
        case dependency.dependency_type::text
          when 'FS' then predecessor.duration +
            case dependency.lag_unit::text when 'hours' then make_interval(hours => dependency.lag_value) when 'days' then make_interval(days => dependency.lag_value) when 'weeks' then make_interval(days => dependency.lag_value * 7) end
          when 'SS' then
            case dependency.lag_unit::text when 'hours' then make_interval(hours => dependency.lag_value) when 'days' then make_interval(days => dependency.lag_value) when 'weeks' then make_interval(days => dependency.lag_value * 7) end
          when 'FF' then predecessor.duration +
            case dependency.lag_unit::text when 'hours' then make_interval(hours => dependency.lag_value) when 'days' then make_interval(days => dependency.lag_value) when 'weeks' then make_interval(days => dependency.lag_value * 7) end - successor.duration
          when 'SF' then
            case dependency.lag_unit::text when 'hours' then make_interval(hours => dependency.lag_value) when 'days' then make_interval(days => dependency.lag_value) when 'weeks' then make_interval(days => dependency.lag_value * 7) end - successor.duration
        end),
      paths.visited || successor.id
    from paths
    join public.build_runtime_dependencies dependency
      on dependency.work_plan_id = v_plan.id
     and dependency.predecessor_runtime_activity_id = paths.activity_id
    join activity_duration predecessor on predecessor.id = dependency.predecessor_runtime_activity_id
    join activity_duration successor on successor.id = dependency.successor_runtime_activity_id
    where not successor.id = any(paths.visited)
  ), scheduled as (
    select activity.id, activity.sequence, max(paths.candidate_start) as planned_start_at, activity.duration
    from activity_duration activity
    join paths on paths.activity_id = activity.id
    group by activity.id, activity.sequence, activity.duration
  )
  select jsonb_agg(jsonb_build_object(
    'activity_id', scheduled.id,
    'planned_start_at', scheduled.planned_start_at,
    'planned_finish_at', scheduled.planned_start_at + scheduled.duration
  ) order by scheduled.sequence, scheduled.id)
  into v_schedule from scheduled;

  if v_schedule is null or jsonb_array_length(v_schedule) <> v_activity_count then
    raise exception 'BUILD_SCHEDULE_INCOMPLETE';
  end if;

  if p_persist then
    update public.build_runtime_activities activity
    set planned_start_at = schedule.planned_start_at,
        planned_finish_at = schedule.planned_finish_at,
        updated_at = now()
    from jsonb_to_recordset(v_schedule) as schedule(
      activity_id uuid, planned_start_at timestamptz, planned_finish_at timestamptz
    )
    where activity.id = schedule.activity_id
      and activity.work_plan_id = v_plan.id and activity.archived_at is null;
    get diagnostics v_written_count = row_count;
    if v_written_count <> v_activity_count then raise exception 'BUILD_SCHEDULE_ATOMIC_WRITE_INCOMPLETE'; end if;

    v_baselined_at := clock_timestamp();
    update public.build_work_plans
    set schedule_baselined_at = v_baselined_at, updated_at = now()
    where id = v_plan.id and schedule_baselined_at is null;
    if not found then raise exception 'BUILD_SCHEDULE_ALREADY_BASELINED'; end if;
  end if;

  return jsonb_build_object(
    'work_plan_id', v_plan.id,
    'baseline_start', p_baseline_start,
    'schedule_baselined_at', v_baselined_at,
    'persisted', p_persist,
    'activities', v_schedule
  );
end;
$$;

revoke all on function public.baseline_build_work_plan_schedule(uuid, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.baseline_build_work_plan_schedule(uuid, timestamptz, boolean)
  to service_role;

comment on function public.baseline_build_work_plan_schedule(uuid, timestamptz, boolean)
  is 'Previews or atomically establishes the immutable V1 calendar-time schedule baseline for one eligible Build Work Plan.';

-- S3A-8: normalize hosted privilege drift for the trigger-only history guard.
revoke execute on function public.prevent_build_runtime_activity_event_mutation()
  from public, anon, authenticated, service_role;

-- BH-3A: normalize trigger-function invocation privileges across Supabase runtimes.
--
-- Some hosted projects grant service_role EXECUTE on newly created public
-- functions through an environment-level default ACL. These functions are
-- invoked by PostgreSQL triggers and do not require direct service_role EXECUTE.

REVOKE EXECUTE ON FUNCTION public.prevent_build_category_template_change() FROM service_role;
REVOKE EXECUTE ON FUNCTION public.prevent_build_resource_scope_change() FROM service_role;
REVOKE EXECUTE ON FUNCTION public.prevent_build_template_scope_change() FROM service_role;
REVOKE EXECUTE ON FUNCTION public.touch_build_updated_at() FROM service_role;
REVOKE EXECUTE ON FUNCTION public.validate_build_activity_template_category() FROM service_role;
REVOKE EXECUTE ON FUNCTION public.validate_build_activity_template_dependency() FROM service_role;
REVOKE EXECUTE ON FUNCTION public.validate_build_site_authority() FROM service_role;
REVOKE EXECUTE ON FUNCTION public.validate_build_template_resource_requirement() FROM service_role;
REVOKE EXECUTE ON FUNCTION public.validate_build_work_package_template_assignment() FROM service_role;

-- Customer Workspace context resolution reads the tenant's workspace status
-- through the server-only Supabase client. The canonical service-role grant
-- omitted this table, causing an otherwise valid authenticated workspace to
-- fail closed before downstream Build reports or intelligence could load.
--
-- Browser-facing roles receive no additional privilege. Existing RLS and
-- tenant boundaries remain unchanged.
grant select on table public.workspace_statuses to service_role;

revoke all privileges on table public.workspace_statuses from anon;

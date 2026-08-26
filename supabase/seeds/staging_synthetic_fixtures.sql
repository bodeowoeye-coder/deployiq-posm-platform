-- Synthetic PRE-CORE-2A staging fixtures. Never use in production.
-- The authenticated test user must be created through Supabase Auth first and
-- supplied by psql: -v synthetic_admin_user_id=<uuid>

insert into public.clients (id, name, status)
values ('10000000-0000-4000-8000-000000000001', 'Example Retail Operations Ltd', 'Active')
on conflict (id) do update set name = excluded.name, status = excluded.status;

insert into public.client_profiles (client_id, contact_person, email, industry_category)
values ('10000000-0000-4000-8000-000000000001', 'Staging Administrator', 'admin@retail.example', 'Retail')
on conflict (client_id) do update set contact_person = excluded.contact_person, email = excluded.email;

insert into public.onboarding_drafts (
  id, resume_token, email, status, current_step, selected_product,
  authenticated_user_id, draft_data, expires_at
)
values
  ('20000000-0000-4000-8000-000000000001','staging-self-service-retail','admin@retail.example','provisioning_pending','provisioning','retail',:'synthetic_admin_user_id',
   '{"organisationName":"Example Retail Operations Ltd","country":"Nigeria","quantity":120,"paymentStatus":"succeeded","commercialStatus":"payment_verified","readyForProvisioning":true}'::jsonb, now() + interval '30 days'),
  ('20000000-0000-4000-8000-000000000002','staging-assisted-retail','admin@enterprise.example','quotation','commercial','retail',null,
   '{"organisationName":"Example Enterprise Distribution Ltd","country":"Nigeria","quantity":60000,"commercialStatus":"approval_required","readyForProvisioning":false}'::jsonb, now() + interval '30 days')
on conflict (id) do update set draft_data = excluded.draft_data, status = excluded.status, current_step = excluded.current_step;

insert into public.commercial_pricing_snapshots (
  id, onboarding_draft_id, product_key, pricing_template_id, pricing_template_name,
  template_version, market, currency, pricing_metric, pricing_method, quantity,
  tier_breakdown, subtotal, total, included_admin_users, status
)
values ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','retail',
  '6f6a0db0-0f4d-4f95-b66c-79f70ce48b60','DeployIQ Retail Nigeria Standard Pricing','staging-v1',
  'Nigeria','NGN','deployment_location','progressive_tiered',120,'[]'::jsonb,60000,60000,1,'accepted')
on conflict (id) do update set status = excluded.status, total = excluded.total;

insert into public.workspace_settings (
  id, client_id, workspace_display_name, workspace_slug, product_key, product_name,
  provisioning_manifest_key, manifest_version, country, programme_quantity,
  commercial_reference, selected_capabilities, enabled_modules, provisioned_at
)
values ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  'Example Retail Operations','example-retail-operations','retail','DeployIQ Retail','retail_workspace_manifest','staging-v1',
  'Nigeria',120,'STAGING-SIMULATED-001','["fieldEvidence"]'::jsonb,'["campaigns","evidence"]'::jsonb,now())
on conflict (id) do update set programme_quantity = excluded.programme_quantity;

insert into public.product_entitlements (id, client_id, product_key, acquisition_draft_id, commercial_reference, programme_quantity)
values ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','retail',
  '20000000-0000-4000-8000-000000000001','STAGING-SIMULATED-001',120)
on conflict (client_id, product_key) do update set programme_quantity = excluded.programme_quantity;

insert into public.deployment_locations (id,state,outlet_name,outlet_code,client_id,workspace_id,product_key,directory_record_type,external_id)
values
 ('60000000-0000-4000-8000-000000000001','Lagos','Example Outlet One','EX-001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','retail','outlet','EX-001'),
 ('60000000-0000-4000-8000-000000000002','Abuja','Example Outlet Two','EX-002','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','retail','outlet','EX-002'),
 ('60000000-0000-4000-8000-000000000003','Kano','Example Outlet Three','EX-003','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','retail','outlet','EX-003')
on conflict (id) do update set outlet_name = excluded.outlet_name;

-- Campaign, resource and evidence fixtures are intentionally deferred to the
-- guarded application fixture runner so their required cross-table scope can
-- be validated transactionally. No CORE-2A payment/approval authority rows are used.

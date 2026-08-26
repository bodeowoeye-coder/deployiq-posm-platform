-- Canonical non-customer reference data for a PRE-CORE-2A DeployIQ database.

insert into public.deployment_stages (stage_code, stage_name, sort_order)
values
  ('production', 'Production', 1),
  ('warehouse', 'Warehouse', 2),
  ('in_transit', 'In Transit', 3),
  ('installed', 'Installed', 4),
  ('approved', 'Approved', 5)
on conflict (stage_code) do update
set stage_name = excluded.stage_name,
    sort_order = excluded.sort_order;

insert into public.commercial_pricing_templates (
  id, product_key, name, description, currency, country, region,
  customer_segment, campaign_type, pricing_metric, pricing_method, status,
  is_default, effective_from, quotation_validity_days, commercial_model,
  billing_behaviour, renewal_required, allowed_payment_methods
)
values (
  '6f6a0db0-0f4d-4f95-b66c-79f70ce48b60', 'retail',
  'DeployIQ Retail Nigeria Standard Pricing', 'Canonical Retail pricing configuration',
  'NGN', 'Nigeria', null, null, null, 'deployment_location',
  'progressive_tiered', 'active', true, '2026-01-01T00:00:00Z', 14,
  'one_time_programme', 'single_payment', false,
  '["card","bank_transfer"]'::jsonb
)
on conflict (id) do update set
  name = excluded.name, description = excluded.description,
  status = excluded.status, is_default = excluded.is_default,
  commercial_model = excluded.commercial_model,
  billing_behaviour = excluded.billing_behaviour,
  renewal_required = excluded.renewal_required,
  allowed_payment_methods = excluded.allowed_payment_methods;

insert into public.commercial_pricing_tiers (
  id, pricing_template_id, sequence, minimum_quantity, maximum_quantity,
  unit_price, fixed_charge, calculation_type, enterprise_action, status
)
values
  ('4f1f6d4f-45f6-4de3-b441-f4dc59f85fd8','6f6a0db0-0f4d-4f95-b66c-79f70ce48b60',1,1,5000,500,0,'progressive',null,'active'),
  ('0d3d1142-3d9d-4ce6-8c8d-59d311c8ec7a','6f6a0db0-0f4d-4f95-b66c-79f70ce48b60',2,5001,10000,475,0,'progressive',null,'active'),
  ('2d7602f0-f9b2-418f-9062-aa6839b2eb55','6f6a0db0-0f4d-4f95-b66c-79f70ce48b60',3,10001,25000,450,0,'progressive',null,'active'),
  ('2198f5b9-aae7-4fd9-b74f-c1df720d9baa','6f6a0db0-0f4d-4f95-b66c-79f70ce48b60',4,25001,50000,425,0,'progressive',null,'active'),
  ('76a40cb1-608b-4ec5-9fbc-c1a7b3e3c173','6f6a0db0-0f4d-4f95-b66c-79f70ce48b60',5,50001,null,0,0,'progressive','request_quotation','active')
on conflict (id) do update set
  minimum_quantity = excluded.minimum_quantity,
  maximum_quantity = excluded.maximum_quantity,
  unit_price = excluded.unit_price,
  fixed_charge = excluded.fixed_charge,
  enterprise_action = excluded.enterprise_action,
  status = excluded.status;

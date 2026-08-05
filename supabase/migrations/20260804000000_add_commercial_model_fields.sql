-- ---------------------------------------------------------------------------
-- Add commercial model, billing behaviour and payment eligibility to templates
-- ---------------------------------------------------------------------------
-- All columns are nullable with safe defaults for backward compatibility.
-- Legacy templates (null commercial_model) are treated as one_time_programme
-- in the application layer for deterministic fallback.
-- ---------------------------------------------------------------------------

ALTER TABLE public.commercial_pricing_templates
  ADD COLUMN IF NOT EXISTS commercial_model text
    CONSTRAINT commercial_pricing_templates_commercial_model_chk
    CHECK (commercial_model IS NULL OR commercial_model IN (
      'one_time_programme',
      'monthly_subscription',
      'annual_subscription',
      'enterprise_contract'
    )),

  ADD COLUMN IF NOT EXISTS billing_behaviour text
    CONSTRAINT commercial_pricing_templates_billing_behaviour_chk
    CHECK (billing_behaviour IS NULL OR billing_behaviour IN (
      'single_payment',
      'monthly',
      'annual',
      'contract'
    )),

  ADD COLUMN IF NOT EXISTS renewal_required boolean NOT NULL DEFAULT false,

  -- JSON array of permitted payment method identifiers, e.g. ["card","bank_transfer"]
  ADD COLUMN IF NOT EXISTS allowed_payment_methods jsonb;

-- Index for filtering by commercial model (useful for admin queries)
CREATE INDEX IF NOT EXISTS commercial_pricing_templates_commercial_model_idx
  ON public.commercial_pricing_templates (commercial_model);

-- ---------------------------------------------------------------------------
-- Backfill: active Retail Nigeria Standard Pricing template
-- commercial_model = one_time_programme — confirmed by product design.
-- All other existing templates are left NULL (treated as one_time_programme
-- by the application layer until an admin explicitly configures them).
-- ---------------------------------------------------------------------------
UPDATE public.commercial_pricing_templates
SET
  commercial_model          = 'one_time_programme',
  billing_behaviour         = 'single_payment',
  renewal_required          = false,
  allowed_payment_methods   = '["card","bank_transfer"]'::jsonb
WHERE id = '6f6a0db0-0f4d-4f95-b66c-79f70ce48b60'
  AND status = 'active';

COMMENT ON COLUMN public.commercial_pricing_templates.commercial_model IS
  'The commercial engagement model: one_time_programme | monthly_subscription | annual_subscription | enterprise_contract';
COMMENT ON COLUMN public.commercial_pricing_templates.billing_behaviour IS
  'How the customer is charged: single_payment | monthly | annual | contract';
COMMENT ON COLUMN public.commercial_pricing_templates.renewal_required IS
  'Whether this commercial model auto-renews. false for one-time programmes.';
COMMENT ON COLUMN public.commercial_pricing_templates.allowed_payment_methods IS
  'JSON array of permitted payment method codes. NULL means all methods permitted.';

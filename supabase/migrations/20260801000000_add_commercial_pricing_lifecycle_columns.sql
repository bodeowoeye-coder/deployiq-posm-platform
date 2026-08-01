-- Add missing lifecycle tracking columns to commercial_pricing_templates
-- These columns are used by the pricing service for audit trails and state transitions

ALTER TABLE public.commercial_pricing_templates
ADD COLUMN IF NOT EXISTS updated_by uuid,
ADD COLUMN IF NOT EXISTS activated_by uuid,
ADD COLUMN IF NOT EXISTS activated_at timestamptz,
ADD COLUMN IF NOT EXISTS deactivated_by uuid,
ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
ADD COLUMN IF NOT EXISTS archived_by uuid;

-- Add indexes for efficient lookups on lifecycle fields
CREATE INDEX IF NOT EXISTS commercial_pricing_templates_updated_by_idx ON public.commercial_pricing_templates (updated_by);
CREATE INDEX IF NOT EXISTS commercial_pricing_templates_activated_by_idx ON public.commercial_pricing_templates (activated_by);
CREATE INDEX IF NOT EXISTS commercial_pricing_templates_archived_by_idx ON public.commercial_pricing_templates (archived_by);

/**
 * Canonical product keys. All new code must use these values.
 * Legacy aliases (assets, audit, survey) are handled in catalogue.ts.
 */
export type OnboardingProductKey =
  | "retail"
  | "build"
  | "location_audit"
  | "assets_audit"
  | "fleet"
  | "field_operations"
  // Legacy aliases — maintained for backward compatibility only
  | "assets"
  | "audit"
  | "survey";
export type OnboardingStep = "welcome" | "organisation" | "product" | "retail-setup" | "capacity" | "pricing" | "account" | "review" | "provisioning" | "success";
export type OnboardingDraftStatus =
  | "started"
  | "organisation_details_complete"
  | "product_selected"
  | "product_setup_complete"
  | "capacity_complete"
  | "pricing_complete"
  | "account_pending"
  | "account_created"
  | "provisioning_pending"
  | "provisioned"
  | "completed"
  | "abandoned"
  | "failed";

export type CommercialProduct = {
  product_key: OnboardingProductKey;
  product_name: string;
  description: string;
  status: "available" | "coming_soon" | "private_beta" | "inactive" | "archived";
  availability: "available" | "coming_soon";
  display_sequence: number;
  icon: string;
  pricing_model_key: string;
  provisioning_service_key: string;
  onboarding_configuration_reference?: string | null;
};

export type OnboardingDraft = {
  id: string;
  resume_token: string;
  email: string | null;
  status: OnboardingDraftStatus;
  current_step: OnboardingStep;
  draft_data: Record<string, unknown>;
  selected_product: OnboardingProductKey | null;
  pricing_snapshot_id: string | null;
  authenticated_user_id: string | null;
  expires_at: string | null;
  last_updated_at: string | null;
  completed_at: string | null;
  abandoned_at: string | null;
  failure_reason: string | null;
  created_at: string;
};

export type PricingSnapshotStatus = "calculated" | "accepted" | "expired" | "superseded" | "cancelled";

export type PricingTier = {
  id?: string;
  sequence: number;
  minimum_quantity: number;
  maximum_quantity: number | null;
  unit_price: number;
  fixed_charge: number | null;
  calculation_type: "progressive";
  status: "active" | "inactive" | "archived";
};

export type PricingTemplate = {
  id?: string;
  product_key: OnboardingProductKey;
  name: string;
  description: string | null;
  currency: string;
  country: string | null;
  region: string | null;
  customer_segment: string | null;
  campaign_type: string | null;
  pricing_metric: string;
  pricing_method: string;
  status: "draft" | "active" | "inactive" | "archived";
  is_default: boolean;
  effective_from: string | null;
  effective_to: string | null;
  quotation_validity_days: number | null;
  tiers: PricingTier[];
};

export type PricingCalculationResult = {
  pricing_template_id: string | null;
  pricing_template_name: string | null;
  product_key: string;
  country: string | null;
  currency: string;
  pricing_metric: string;
  pricing_method: string;
  quantity: number;
  tier_breakdown: Array<{ label: string; quantity: number; unit_price: number; subtotal: number }>;
  subtotal: number;
  discount: number;
  tax_placeholder: number;
  total: number;
  included_admin_users: number;
  quotation_status: "calculated" | "request_quotation";
  quotation_expiry: string | null;
  requires_enterprise_review: boolean;
  calculated_at: string;
};

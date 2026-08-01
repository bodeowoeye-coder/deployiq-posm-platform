export type PricingTemplateStatus = "draft" | "active" | "inactive" | "archived";
export type PricingTierStatus = "active" | "inactive" | "archived";
export type PricingCalculationMethod = "progressive_tiered" | "volume_tiered" | "flat_rate";
export type PricingMetric = "deployment_location";
export type PricingEnterpriseAction = "request_quotation" | "no_automatic_checkout" | "custom_rate" | null;

export type PricingScope = {
  product_key: string;
  currency: string;
  country: string | null;
  region: string | null;
  customer_segment: string | null;
  campaign_type: string | null;
};

export type PricingTemplateRecord = {
  id: string | null;
  product_key: string;
  name: string;
  description: string | null;
  currency: string;
  country: string | null;
  region: string | null;
  customer_segment: string | null;
  campaign_type: string | null;
  pricing_metric: PricingMetric;
  pricing_method: PricingCalculationMethod;
  status: PricingTemplateStatus;
  is_default: boolean;
  effective_from: string | null;
  effective_to: string | null;
  quotation_validity_days: number | null;
  created_by: string | null;
  updated_by: string | null;
  activated_by: string | null;
  activated_at: string | null;
  deactivated_by: string | null;
  deactivated_at: string | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type PricingTierRecord = {
  id: string | null;
  pricing_template_id: string | null;
  sequence: number;
  minimum_quantity: number;
  maximum_quantity: number | null;
  unit_price: number;
  fixed_charge: number | null;
  calculation_type: string;
  enterprise_action: PricingEnterpriseAction;
  status: PricingTierStatus;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type PricingTier = {
  id: string | null;
  pricing_template_id: string | null;
  sequence: number;
  minimum_quantity: number;
  maximum_quantity: number | null;
  unit_price: number;
  fixed_charge: number | null;
  calculation_type: "progressive";
  enterprise_action: PricingEnterpriseAction;
  status: PricingTierStatus;
  created_at?: string;
  updated_at?: string;
  archived_at?: string | null;
};

export type PricingTemplate = PricingTemplateRecord & {
  tiers: PricingTier[];
};

export type PricingCalculationRequest = {
  productKey: string;
  quantity: number;
  country: string | null;
  currency: string | null;
  region?: string | null;
  customerSegment?: string | null;
  campaignType?: string | null;
  calculationDate?: string | null;
  onboardingDraftId?: string | null;
  organisationId?: string | null;
};

export type PricingTierBreakdown = {
  sequence: number;
  minimum_quantity: number;
  maximum_quantity: number | null;
  applicable_quantity: number;
  unit_price: number;
  fixed_charge: number;
  subtotal: number;
  enterprise_action: PricingEnterpriseAction;
  label: string;
};

export type PricingCalculationResult = {
  pricing_template_id: string | null;
  pricing_template_name: string | null;
  product_key: string;
  country: string | null;
  currency: string;
  pricing_metric: PricingMetric;
  pricing_method: PricingCalculationMethod;
  quantity: number;
  tier_breakdown: PricingTierBreakdown[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  included_admin_users: number;
  quotation_status: "calculated" | "request_quotation";
  quotation_expiry: string | null;
  requires_enterprise_review: boolean;
  calculated_at: string;
  enterprise_action?: PricingEnterpriseAction;
};

export type PricingSnapshot = {
  id: string | null;
  onboarding_draft_id: string | null;
  organisation_id: string | null;
  product_key: string;
  pricing_template_id: string | null;
  pricing_template_name: string;
  template_version: string;
  market: string | null;
  currency: string;
  pricing_metric: PricingMetric;
  pricing_method: PricingCalculationMethod;
  quantity: number;
  tier_breakdown: PricingTierBreakdown[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  included_admin_users: number;
  requires_enterprise_review: boolean;
  calculated_at: string;
  expires_at: string | null;
  status: "calculated" | "accepted" | "expired" | "superseded" | "cancelled";
  created_at: string;
  updated_at: string;
};

export type PricingUnavailableResult = {
  kind: "pricing-unavailable";
  error: string;
  status: 404;
  details?: Record<string, unknown>;
};

export type EnterpriseReviewResult = PricingCalculationResult & {
  kind: "enterprise-review-required";
  status: 202;
};

export type PricingValidationError = {
  code: "invalid_quantity" | "invalid_configuration" | "pricing_unavailable" | "configuration_conflict";
  message: string;
  details?: Record<string, unknown>;
};

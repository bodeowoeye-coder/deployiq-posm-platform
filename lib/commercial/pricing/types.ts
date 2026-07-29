export type PricingTemplateStatus = "draft" | "active" | "inactive" | "archived";
export type PricingTierStatus = "active" | "inactive" | "archived";

export type PricingTemplateRecord = {
  id: string;
  product_key: string;
  name: string;
  description: string | null;
  currency: string;
  country: string | null;
  region: string | null;
  customer_segment: string | null;
  campaign_type: string | null;
  pricing_metric: string;
  pricing_method: string;
  status: PricingTemplateStatus;
  is_default: boolean;
  effective_from: string | null;
  effective_to: string | null;
  quotation_validity_days: number | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type PricingTierRecord = {
  id: string;
  pricing_template_id: string;
  sequence: number;
  minimum_quantity: number;
  maximum_quantity: number | null;
  unit_price: number;
  fixed_charge: number | null;
  calculation_type: string;
  status: PricingTierStatus;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

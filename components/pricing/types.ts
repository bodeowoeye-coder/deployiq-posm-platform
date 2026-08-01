import type { TierFormItem } from "@/lib/commercial/pricing/tierEditor";

export type FormState = {
  name: string;
  description: string;
  productKey: string;
  currency: string;
  country: string;
  region: string;
  customerSegment: string;
  campaignType: string;
  pricingMetric: string;
  pricingMethod: string;
  status: string;
  isDefault: boolean;
  quotationValidityDays: string;
  tiers: TierFormItem[];
};

export type PreviewTierRow = {
  sequence: number;
  minimum_quantity: number;
  maximum_quantity: number | null;
  applicable_quantity: number;
  unit_price: number;
  fixed_charge: number;
  subtotal: number;
  enterprise_action: string | null;
  label: string;
};

export type PreviewResult = {
  quantity: number;
  currency: string;
  tierBreakdown: PreviewTierRow[];
  subtotal: number;
  total: number;
  includedAdminUsers: number;
  quotationStatus: "calculated" | "request_quotation";
  requiresEnterpriseReview: boolean;
};

export type WizardStep = 1 | 2 | 3 | 4;

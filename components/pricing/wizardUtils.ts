/**
 * Pure, side-effect-free utilities for the pricing wizard.
 * No React, no fetch — fully testable with node --test.
 * Relative imports with .ts extension for compatibility with node --test runner.
 */
import type { PricingTemplate } from "../../lib/commercial/pricing/types.ts";
import { createFirstTier, formatQuantity } from "../../lib/commercial/pricing/tierEditor.ts";
import type { FormState, PreviewResult, PreviewTierRow } from "./types.ts";

export function createDefaultFormState(): FormState {
  return {
    name: "",
    description: "",
    productKey: "retail",
    currency: "NGN",
    country: "Nigeria",
    region: "",
    customerSegment: "",
    campaignType: "",
    pricingMetric: "deployment_location",
    pricingMethod: "progressive_tiered",
    status: "draft",
    isDefault: false,
    quotationValidityDays: "14",
    tiers: [createFirstTier()],
  };
}

export function templateToFormState(template: PricingTemplate): FormState {
  return {
    name: template.name,
    description: template.description ?? "",
    productKey: template.product_key,
    currency: template.currency,
    country: template.country ?? "",
    region: template.region ?? "",
    customerSegment: template.customer_segment ?? "",
    campaignType: template.campaign_type ?? "",
    pricingMetric: template.pricing_metric,
    pricingMethod: template.pricing_method,
    status: template.status,
    isDefault: template.is_default,
    quotationValidityDays: String(template.quotation_validity_days ?? "14"),
    tiers: template.tiers.map((t) => ({
      sequence: t.sequence,
      minimumQuantity: t.minimum_quantity,
      maximumQuantity: t.maximum_quantity,
      unitPrice: t.unit_price,
      fixedCharge: t.fixed_charge ?? 0,
      isEnterpriseTier: t.enterprise_action === "request_quotation",
      enterpriseAction: t.enterprise_action,
    })),
  };
}

/** Offline preview calculation against current form tiers (no API call). */
export function calcDraftPreview(form: FormState, qty: number): PreviewResult {
  let total = 0;
  const breakdown: PreviewTierRow[] = [];

  for (const tier of form.tiers) {
    const min = tier.minimumQuantity;

    if (tier.isEnterpriseTier) {
      if (qty >= min) {
        breakdown.push({
          sequence: tier.sequence,
          minimum_quantity: min,
          maximum_quantity: null,
          applicable_quantity: qty - min + 1,
          unit_price: 0,
          fixed_charge: 0,
          subtotal: 0,
          enterprise_action: "request_quotation",
          label: `Tier ${tier.sequence}: ${formatQuantity(min)}+`,
        });
      }
      break;
    }

    const max = tier.maximumQuantity;
    if (max !== null) {
      const end = Math.min(qty, max);
      if (end >= min) {
        const applicable = end - min + 1;
        const subtotal = applicable * tier.unitPrice + tier.fixedCharge;
        total += subtotal;
        breakdown.push({
          sequence: tier.sequence,
          minimum_quantity: min,
          maximum_quantity: max,
          applicable_quantity: applicable,
          unit_price: tier.unitPrice,
          fixed_charge: tier.fixedCharge,
          subtotal,
          enterprise_action: null,
          label: `Tier ${tier.sequence}: ${formatQuantity(min)} – ${formatQuantity(max)}`,
        });
        if (qty <= max) break;
      }
    } else {
      // Open-ended non-enterprise final tier
      if (qty >= min) {
        const applicable = qty - min + 1;
        const subtotal = applicable * tier.unitPrice + tier.fixedCharge;
        total += subtotal;
        breakdown.push({
          sequence: tier.sequence,
          minimum_quantity: min,
          maximum_quantity: null,
          applicable_quantity: applicable,
          unit_price: tier.unitPrice,
          fixed_charge: tier.fixedCharge,
          subtotal,
          enterprise_action: null,
          label: `Tier ${tier.sequence}: ${formatQuantity(min)}+`,
        });
      }
    }
  }

  const requiresEnterprise = breakdown.some((r) => r.enterprise_action === "request_quotation");

  return {
    quantity: qty,
    currency: form.currency,
    tierBreakdown: breakdown,
    subtotal: total,
    total,
    includedAdminUsers: 0,
    quotationStatus: requiresEnterprise ? "request_quotation" : "calculated",
    requiresEnterpriseReview: requiresEnterprise,
  };
}

export function isEnterpriseOnlyForm(form: FormState): boolean {
  return form.tiers.every(
    (t) => t.isEnterpriseTier || t.enterpriseAction === "request_quotation"
  );
}

/** Build the POST/PATCH body from form state. */
export function formStateToApiBody(
  form: FormState,
  savedTemplateId: string | null
): Record<string, unknown> {
  return {
    ...(savedTemplateId ? { templateId: savedTemplateId } : {}),
    name: form.name,
    description: form.description,
    productKey: form.productKey,
    currency: form.currency,
    country: form.country || null,
    region: form.region || null,
    customerSegment: form.customerSegment || null,
    campaignType: form.campaignType || null,
    pricingMetric: form.pricingMetric,
    pricingMethod: form.pricingMethod,
    status: form.status,
    isDefault: form.isDefault,
    quotationValidityDays: form.quotationValidityDays ? Number(form.quotationValidityDays) : null,
    tiers: form.tiers.map((tier) => ({
      sequence: tier.sequence,
      minimumQuantity: tier.minimumQuantity,
      maximumQuantity: tier.isEnterpriseTier ? null : tier.maximumQuantity,
      unitPrice: tier.unitPrice,
      fixedCharge: tier.fixedCharge,
      enterpriseAction: tier.isEnterpriseTier ? "request_quotation" : tier.enterpriseAction,
    })),
  };
}

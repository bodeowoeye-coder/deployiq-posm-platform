import { NextResponse } from "next/server";
import { requireAdmin, AccessControlError } from "@/lib/accessControl";
import { buildPricingTemplatePayload } from "@/lib/commercial/pricing/payload";
import { calculateProgressivePricing } from "@/lib/commercial/pricing/service";
import type {
  PricingEnterpriseAction,
  PricingTemplate,
  PricingTierStatus,
} from "@/lib/commercial/pricing/types";

/**
 * Preview pricing for an unsaved draft.
 * Accepts the wizard form payload and quantity, builds a synthetic template,
 * runs it through the shared pricing engine, and returns the breakdown.
 * Nothing is persisted.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const body = await request.json();

    const quantity = Number(body.quantity ?? 0);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json(
        { error: "Quantity must be a positive whole number." },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.tiers) || body.tiers.length === 0) {
      return NextResponse.json(
        { error: "At least one pricing tier is required." },
        { status: 400 }
      );
    }

    // Build the normalized payload using the shared utility
    const payload = buildPricingTemplatePayload({
      name: typeof body.name === "string" && body.name.trim() ? body.name : "Draft Preview",
      description: null,
      productKey: typeof body.productKey === "string" ? body.productKey : "retail",
      currency: typeof body.currency === "string" ? body.currency : "NGN",
      pricingMetric: typeof body.pricingMetric === "string" ? body.pricingMetric : "deployment_location",
      pricingMethod: typeof body.pricingMethod === "string" ? body.pricingMethod : "progressive_tiered",
      status: "draft",
      quotationValidityDays:
        typeof body.quotationValidityDays === "number" ? body.quotationValidityDays : null,
      tiers: (body.tiers as Record<string, unknown>[]).map((tier) => ({
        sequence: Number(tier.sequence ?? 0),
        minimumQuantity: Number(tier.minimumQuantity ?? 0),
        maximumQuantity:
          typeof tier.maximumQuantity === "number" ? tier.maximumQuantity : null,
        unitPrice: Number(tier.unitPrice ?? 0),
        fixedCharge: typeof tier.fixedCharge === "number" ? tier.fixedCharge : 0,
        enterpriseAction:
          typeof tier.enterpriseAction === "string" ? tier.enterpriseAction : null,
      })),
    });

    // Construct a synthetic PricingTemplate — never saved to DB
    const now = new Date().toISOString();
    const syntheticTemplate: PricingTemplate = {
      id: null,
      product_key: payload.product_key,
      name: payload.name,
      description: payload.description,
      currency: payload.currency,
      country: null,
      region: null,
      customer_segment: null,
      campaign_type: null,
      pricing_metric: payload.pricing_metric as PricingTemplate["pricing_metric"],
      pricing_method: payload.pricing_method as PricingTemplate["pricing_method"],
      status: "draft",
      is_default: false,
      effective_from: null,
      effective_to: null,
      quotation_validity_days: payload.quotation_validity_days,
      commercial_model: (payload as Record<string, unknown>).commercial_model as string | null ?? null,
      billing_behaviour: (payload as Record<string, unknown>).billing_behaviour as string | null ?? null,
      renewal_required: false,
      allowed_payment_methods: null,
      created_by: null,
      updated_by: null,
      activated_by: null,
      activated_at: null,
      deactivated_by: null,
      deactivated_at: null,
      archived_by: null,
      created_at: now,
      updated_at: now,
      archived_at: null,
      tiers: payload.tiers.map((tier) => ({
        id: null,
        pricing_template_id: null,
        sequence: tier.sequence,
        minimum_quantity: tier.minimum_quantity,
        maximum_quantity: tier.maximum_quantity,
        unit_price: tier.unit_price,
        fixed_charge: tier.fixed_charge,
        calculation_type: "progressive" as const,
        enterprise_action: tier.enterprise_action as PricingEnterpriseAction,
        status: "active" as PricingTierStatus,
      })),
    };

    const result = calculateProgressivePricing(
      quantity,
      syntheticTemplate,
      syntheticTemplate.tiers
    );

    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    const isValidation =
      message.includes("Invalid") ||
      message.includes("invalid") ||
      message.includes("Quantity") ||
      message.includes("continuous") ||
      message.includes("overlaps");
    return NextResponse.json(
      { error: message },
      { status: isValidation ? 422 : 500 }
    );
  }
}

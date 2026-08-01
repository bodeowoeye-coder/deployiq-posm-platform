import { NextResponse } from "next/server";
import { requireAdmin, AccessControlError } from "@/lib/accessControl";
import { buildPricingTemplatePayload, createOrUpdatePricingTemplate, getPricingTemplateById, listPricingTemplates } from "@/lib/commercial/pricing/service";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const templates = await listPricingTemplates();
    return NextResponse.json({ templates });
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let payloadFieldNames: string[] = [];
  let tierCount = 0;
  
  try {
    const context = await requireAdmin(request);
    const body = await request.json();
    const payload = buildPricingTemplatePayload({
      name: typeof body.name === "string" ? body.name : "",
      description: typeof body.description === "string" ? body.description : null,
      productKey: typeof body.productKey === "string" ? body.productKey : "retail",
      currency: typeof body.currency === "string" ? body.currency : "NGN",
      country: typeof body.country === "string" ? body.country : null,
      region: typeof body.region === "string" ? body.region : null,
      customerSegment: typeof body.customerSegment === "string" ? body.customerSegment : null,
      campaignType: typeof body.campaignType === "string" ? body.campaignType : null,
      pricingMetric: typeof body.pricingMetric === "string" ? body.pricingMetric : "deployment_location",
      pricingMethod: typeof body.pricingMethod === "string" ? body.pricingMethod : "progressive_tiered",
      status: typeof body.status === "string" ? body.status : "draft",
      isDefault: Boolean(body.isDefault),
      effectiveFrom: typeof body.effectiveFrom === "string" ? body.effectiveFrom : null,
      effectiveTo: typeof body.effectiveTo === "string" ? body.effectiveTo : null,
      quotationValidityDays: typeof body.quotationValidityDays === "number" ? body.quotationValidityDays : null,
      tiers: Array.isArray(body.tiers) ? body.tiers.map((tier: Record<string, unknown>) => ({
        sequence: Number(tier.sequence ?? 0),
        minimumQuantity: Number(tier.minimumQuantity ?? 0),
        maximumQuantity: typeof tier.maximumQuantity === "number" ? tier.maximumQuantity : null,
        unitPrice: Number(tier.unitPrice ?? 0),
        fixedCharge: typeof tier.fixedCharge === "number" ? tier.fixedCharge : 0,
        enterpriseAction: typeof tier.enterpriseAction === "string" ? tier.enterpriseAction : null
      })) : []
    });
    
    payloadFieldNames = Object.keys(payload);
    tierCount = (payload.tiers ?? []).length;

    const template = await createOrUpdatePricingTemplate({
      templateId: typeof body.templateId === "string" ? body.templateId : null,
      userId: context.user_id,
      payload
    });

    return NextResponse.json({ template });
  } catch (error) {
    // DIAGNOSTIC LOGGING - Temporary for debugging POST 500 error
    let errorCode = null;
    let errorMessage = null;
    let errorDetails = null;
    let errorHint = null;
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorCode = (error as any).code;
      errorDetails = (error as any).details;
      errorHint = (error as any).hint;
    } else if (typeof error === 'object' && error !== null) {
      // Handle plain objects from Supabase errors
      errorCode = (error as any).code;
      errorMessage = (error as any).message;
      errorDetails = (error as any).details;
      errorHint = (error as any).hint;
    }
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      errorName: error instanceof Error ? error.constructor.name : typeof error,
      errorCode,
      errorMessage,
      errorDetails,
      errorHint,
      payloadFieldNames,
      tierCount,
    };
    console.error("[POST /api/admin/commercial/pricing-templates] Diagnostic Error Report:", JSON.stringify(diagnostics, null, 2));
    
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    
    const message = errorMessage ?? "Unknown error";
    const isNotFound = message.includes("not found");
    const isValidation = message.includes("Invalid") || message.includes("invalid") || message.includes("cannot");
    const isDatabaseConstraint = message.includes("check constraint") || message.includes("unique violation") || message.includes("foreign key");
    
    let userFacingMessage = "Unable to save pricing template.";
    if (isValidation) {
      userFacingMessage = `Pricing template validation failed: ${message}`;
    } else if (isDatabaseConstraint) {
      userFacingMessage = `Database constraint violation: ${message}`;
    } else if (isNotFound) {
      userFacingMessage = message;
    }
    
    return NextResponse.json({ error: userFacingMessage }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireAdmin(request);
    const body = await request.json();
    const templateId = typeof body.templateId === "string" ? body.templateId : null;
    if (!templateId) {
      return NextResponse.json({ error: "A pricing template id is required." }, { status: 400 });
    }
    const template = await getPricingTemplateById(templateId);
    if (!template) {
      return NextResponse.json({ error: "Pricing template not found." }, { status: 404 });
    }
    const payload = buildPricingTemplatePayload({
      name: typeof body.name === "string" ? body.name : template.name,
      description: typeof body.description === "string" ? body.description : template.description,
      productKey: typeof body.productKey === "string" ? body.productKey : template.product_key,
      currency: typeof body.currency === "string" ? body.currency : template.currency,
      country: typeof body.country === "string" ? body.country : template.country,
      region: typeof body.region === "string" ? body.region : template.region,
      customerSegment: typeof body.customerSegment === "string" ? body.customerSegment : template.customer_segment,
      campaignType: typeof body.campaignType === "string" ? body.campaignType : template.campaign_type,
      pricingMetric: typeof body.pricingMetric === "string" ? body.pricingMetric : template.pricing_metric,
      pricingMethod: typeof body.pricingMethod === "string" ? body.pricingMethod : template.pricing_method,
      status: typeof body.status === "string" ? body.status : template.status,
      isDefault: typeof body.isDefault === "boolean" ? body.isDefault : template.is_default,
      effectiveFrom: typeof body.effectiveFrom === "string" ? body.effectiveFrom : template.effective_from,
      effectiveTo: typeof body.effectiveTo === "string" ? body.effectiveTo : template.effective_to,
      quotationValidityDays: typeof body.quotationValidityDays === "number" ? body.quotationValidityDays : template.quotation_validity_days,
      tiers: Array.isArray(body.tiers)
        ? body.tiers.map((tier: Record<string, unknown>) => ({
            sequence: Number(tier.sequence ?? 0),
            minimumQuantity: Number(tier.minimumQuantity ?? 0),
            maximumQuantity: typeof tier.maximumQuantity === "number" ? tier.maximumQuantity : null,
            unitPrice: Number(tier.unitPrice ?? 0),
            fixedCharge: typeof tier.fixedCharge === "number" ? tier.fixedCharge : 0,
            enterpriseAction: typeof tier.enterpriseAction === "string" ? tier.enterpriseAction : null
          }))
        : template.tiers.map((tier) => ({
            sequence: tier.sequence,
            minimumQuantity: tier.minimum_quantity,
            maximumQuantity: tier.maximum_quantity,
            unitPrice: tier.unit_price,
            fixedCharge: tier.fixed_charge ?? 0,
            enterpriseAction: tier.enterprise_action ?? null
          }))
    });

    const updatedTemplate = await createOrUpdatePricingTemplate({
      templateId,
      userId: context.user_id,
      payload
    });

    return NextResponse.json({ template: updatedTemplate });
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

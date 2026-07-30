import { NextResponse } from "next/server";
import { getOnboardingDraftByToken } from "@/lib/commercial/onboarding/service";
import { validateCapacityInput } from "@/lib/commercial/onboarding/validation";
import { calculateProgressivePricing, resolveApplicablePricingTemplate, createPricingSnapshot } from "@/lib/commercial/pricing/service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const draftToken = typeof body.resumeToken === "string" ? body.resumeToken : null;
    const quantity = typeof body.quantity === "number" ? body.quantity : Number(body.quantity);
    const validation = validateCapacityInput(quantity);

    if (!validation.isValid) {
      return NextResponse.json({ error: "Invalid capacity input.", details: validation.errors }, { status: 422 });
    }

    if (draftToken) {
      const draft = await getOnboardingDraftByToken(draftToken);
      if (!draft) {
        return NextResponse.json({ error: "Onboarding draft not found." }, { status: 404 });
      }
    }

    let onboardingDraftId: string | null = null;
    if (draftToken) {
      const draft = await getOnboardingDraftByToken(draftToken);
      onboardingDraftId = draft?.id ?? null;
    }

    const templateResolution = await resolveApplicablePricingTemplate({
      productKey: typeof body.productKey === "string" ? body.productKey : "retail",
      quantity,
      country: typeof body.country === "string" ? body.country : null,
      currency: typeof body.currency === "string" ? body.currency : "NGN",
      region: typeof body.region === "string" ? body.region : null,
      customerSegment: typeof body.customerSegment === "string" ? body.customerSegment : null,
      campaignType: typeof body.campaignType === "string" ? body.campaignType : null,
      calculationDate: typeof body.calculationDate === "string" ? body.calculationDate : null,
      onboardingDraftId
    });

    if (!templateResolution.template) {
      const error = templateResolution.error;
      if (error?.code === "configuration_conflict") {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      return NextResponse.json({ error: error?.message ?? "Pricing is unavailable." }, { status: 404 });
    }

    const result = calculateProgressivePricing(quantity, templateResolution.template, templateResolution.template.tiers);
    const snapshot = await createPricingSnapshot({
      onboardingDraftId,
      organisationId: typeof body.organisationId === "string" ? body.organisationId : null,
      productKey: templateResolution.template.product_key,
      template: templateResolution.template,
      pricingResult: result,
      market: typeof body.country === "string" ? body.country : templateResolution.template.country
    });

    return NextResponse.json({ result, snapshot, status: result.requires_enterprise_review ? "enterprise-review-required" : "calculated" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

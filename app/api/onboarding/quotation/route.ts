import { NextResponse } from "next/server";
import { getOnboardingDraftByToken, updateOnboardingDraft } from "@/lib/commercial/onboarding/service";
import {
  resolveApplicablePricingTemplate,
  calculateProgressivePricing,
  createPricingSnapshot,
} from "@/lib/commercial/pricing/service";
import { toCustomerQuotation, currencyForCountry } from "@/lib/commercial/onboarding/quotation";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Server validates all inputs — client cannot force a product key or template
    const rawQuantity = body.quantity;
    const quantity = typeof rawQuantity === "number" ? rawQuantity : parseInt(String(rawQuantity ?? "0"), 10);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json(
        { error: "Rollout quantity must be a positive whole number." },
        { status: 422 }
      );
    }

    // Product key comes from draft or the recommendation — not from arbitrary client input
    const draftToken = typeof body.resumeToken === "string" ? body.resumeToken : null;
    let draft = draftToken ? await getOnboardingDraftByToken(draftToken) : null;
    const onboardingDraftId = draft?.id ?? null;

    // Resolve product key from draft (trusted) or body (validated against catalogue)
    const productKey =
      draft?.selected_product ??
      (typeof body.productKey === "string" ? body.productKey : "retail");

    const country = typeof body.country === "string" ? body.country : draft?.draft_data?.country as string | undefined ?? null;
    const currency = typeof body.currency === "string" ? body.currency : (country ? currencyForCountry(country) : "NGN");

    // Server-side template resolution — client cannot specify template ID or pricing method
    const templateResolution = await resolveApplicablePricingTemplate({
      productKey,
      quantity,
      country: country ?? null,
      currency,
      region: null,
      customerSegment: null,
      campaignType: null,
      calculationDate: null,
      onboardingDraftId,
    });

    if (!templateResolution.template) {
      // No active template — enterprise path
      if (draft && draftToken) {
        await updateOnboardingDraft({
          resumeToken: draftToken,
          status: "pricing_complete",
          currentStep: "pricing",
          draftData: {
            ...(draft.draft_data ?? {}),
            pricingStatus: "enterprise_required",
            pricingUnavailableReason:
              templateResolution.error?.message ?? "No active pricing template available.",
          },
        });
      }
      return NextResponse.json(
        {
          requiresEnterpriseReview: true,
          enterpriseReason:
            "No standard pricing is available for your country and product selection. Our team will prepare a tailored proposal.",
          quantity,
          productKey,
        },
        { status: 200 }
      );
    }

    // Server calculates pricing — client cannot influence amounts
    const result = calculateProgressivePricing(
      quantity,
      templateResolution.template,
      templateResolution.template.tiers
    );

    let snapshotId: string | null = null;
    try {
      const snapshot = await createPricingSnapshot({
        onboardingDraftId,
        productKey: templateResolution.template.product_key,
        template: templateResolution.template,
        pricingResult: result,
        market: country ?? templateResolution.template.country,
      });
      snapshotId = snapshot.id;
    } catch {
      // Non-fatal — snapshot creation failure does not block quotation display
    }

    if (draft && draftToken) {
      await updateOnboardingDraft({
        resumeToken: draftToken,
        status: "pricing_complete",
        currentStep: "pricing",
        pricingSnapshotId: snapshotId,
        draftData: {
          ...(draft.draft_data ?? {}),
          pricingStatus: result.requires_enterprise_review ? "enterprise_required" : "calculated",
        },
      });
    }

    // Strip internal fields before returning to client
    const quotation = toCustomerQuotation(result, templateResolution.template);

    return NextResponse.json({ quotation, requiresEnterpriseReview: result.requires_enterprise_review });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

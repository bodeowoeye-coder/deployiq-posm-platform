import { NextResponse } from "next/server";
import { getOnboardingDraftByToken, updateOnboardingDraft } from "@/lib/commercial/onboarding/service";
import type { CustomerQuotation } from "@/lib/commercial/onboarding/quotation";

/**
 * POST /api/acquisition/checkout/confirm-plan
 *
 * Stores the confirmed quotation in draft_data and generates a unique
 * commercial reference (DQ-QT-YYYY-XXXXXX) if one has not already been set.
 *
 * Must be called when the customer clicks "Confirm commercial plan".
 * Subsequent checkout and payment steps read from this persisted state.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const draftToken = typeof body.resumeToken === "string" ? body.resumeToken : null;
    const quotation  = body.quotation as CustomerQuotation | undefined;

    if (!draftToken) {
      return NextResponse.json({ error: "Acquisition session is required." }, { status: 400 });
    }
    if (!quotation || typeof quotation.estimatedTotal !== "number") {
      return NextResponse.json({ error: "A valid confirmed quotation is required." }, { status: 400 });
    }
    if (quotation.estimatedTotal <= 0 && !quotation.requiresEnterpriseReview) {
      return NextResponse.json({ error: "Zero-value quotations are not accepted for self-service activation." }, { status: 400 });
    }

    const draft = await getOnboardingDraftByToken(draftToken);
    if (!draft) {
      return NextResponse.json({ error: "Acquisition session not found." }, { status: 404 });
    }

    // Idempotent: preserve existing commercial reference — do not re-generate on retries.
    const existingRef = draft.draft_data?.commercialReference as string | undefined;
    const commercialReference = existingRef || generateCommercialReference(draft.id);

    await updateOnboardingDraft({
      resumeToken: draftToken,
      currentStep: "pricing",
      status: "pricing_complete",
      draftData: {
        ...draft.draft_data,
        confirmedQuotation: quotation,
        commercialReference,
        quotationConfirmedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({ commercialReference });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Generate a human-readable commercial quotation reference.
 * Format: DQ-QT-{YEAR}-{6 chars from draft UUID}
 */
function generateCommercialReference(draftId: string | null): string {
  const year = new Date().getFullYear();
  const suffix = draftId
    ? draftId.replace(/-/g, "").slice(-6).toUpperCase()
    : Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DQ-QT-${year}-${suffix}`;
}

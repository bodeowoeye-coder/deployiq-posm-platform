import { NextResponse } from "next/server";
import { getOnboardingDraftByToken, updateOnboardingDraft } from "@/lib/commercial/onboarding/service";
import type { EnterprisePOSubmission } from "@/lib/commercial/checkout/types";

/**
 * POST /api/acquisition/checkout/enterprise-po
 * Submit an Enterprise Purchase Order for commercial team review.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const draftToken = typeof body.resumeToken === "string" ? body.resumeToken : null;

    if (!draftToken) {
      return NextResponse.json({ error: "Acquisition session is required." }, { status: 400 });
    }

    const draft = await getOnboardingDraftByToken(draftToken);
    if (!draft) {
      return NextResponse.json({ error: "Acquisition session not found." }, { status: 404 });
    }

    // Validate required PO fields
    const errors: Record<string, string> = {};
    const poNumber = typeof body.poNumber === "string" ? body.poNumber.trim() : "";
    const expectedApprovalDate = typeof body.expectedApprovalDate === "string" ? body.expectedApprovalDate.trim() : "";
    const procurementContact = typeof body.procurementContact === "string" ? body.procurementContact.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";

    if (!poNumber) errors.poNumber = "PO number is required.";
    if (poNumber.length > 50) errors.poNumber = "PO number must be 50 characters or fewer.";
    if (!expectedApprovalDate) errors.expectedApprovalDate = "Expected approval date is required.";
    if (!procurementContact) errors.procurementContact = "Procurement contact is required.";

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: "Validation failed.", details: errors }, { status: 400 });
    }

    const submission: EnterprisePOSubmission = {
      poNumber,
      expectedApprovalDate,
      procurementContact,
      notes,
    };

    await updateOnboardingDraft({
      resumeToken: draftToken,
      currentStep: "account",
      status: "account_created",
      draftData: {
        ...draft.draft_data,
        paymentMethod: "enterprise_po",
        paymentStatus: "awaiting_approval",
        commercialStatus: "enterprise_submitted",
        subscriptionStatus: "inactive",
        enterprisePO: submission,
        checkoutCompletedAt: new Date().toISOString(),
        readyForProvisioning: false, // awaiting commercial approval
      },
    });

    return NextResponse.json({
      submitted: true,
      poNumber,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

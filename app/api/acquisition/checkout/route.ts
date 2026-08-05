import { NextResponse } from "next/server";
import { getOnboardingDraftByToken, updateOnboardingDraft } from "@/lib/commercial/onboarding/service";
import type { BillingCycle, PaymentMethod } from "@/lib/commercial/checkout/types";

/**
 * POST /api/acquisition/checkout
 * Initialise or update the checkout state in the acquisition draft.
 * Called when the customer enters checkout-review.
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

    if (!draft.draft_data?.emailVerified) {
      return NextResponse.json({ error: "Email verification required before checkout." }, { status: 400 });
    }

    await updateOnboardingDraft({
      resumeToken: draftToken,
      currentStep: "review",
      status: "pricing_complete",
      draftData: {
        ...draft.draft_data,
        commercialStatus: "checkout_initiated",
        paymentStatus: "pending",
        subscriptionStatus: "inactive",
        readyForProvisioning: false,
      },
    });

    return NextResponse.json({ initiated: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/acquisition/checkout
 * Update billing cycle or payment method selection.
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const draftToken = typeof body.resumeToken === "string" ? body.resumeToken : null;
    const billingCycle = typeof body.billingCycle === "string" ? body.billingCycle as BillingCycle : null;
    const paymentMethod = typeof body.paymentMethod === "string" ? body.paymentMethod as PaymentMethod : null;

    if (!draftToken) {
      return NextResponse.json({ error: "Acquisition session is required." }, { status: 400 });
    }

    const validCycles: BillingCycle[] = ["monthly", "annual"];
    const validMethods: PaymentMethod[] = ["card", "bank_transfer", "enterprise_po"];

    if (billingCycle && !validCycles.includes(billingCycle)) {
      return NextResponse.json({ error: "Invalid billing cycle." }, { status: 400 });
    }
    if (paymentMethod && !validMethods.includes(paymentMethod)) {
      return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
    }

    const draft = await getOnboardingDraftByToken(draftToken);
    if (!draft) {
      return NextResponse.json({ error: "Acquisition session not found." }, { status: 404 });
    }

    await updateOnboardingDraft({
      resumeToken: draftToken,
      currentStep: "review",
      status: "pricing_complete",
      draftData: {
        ...draft.draft_data,
        ...(billingCycle ? { billingCycle } : {}),
        ...(paymentMethod ? { paymentMethod } : {}),
      },
    });

    return NextResponse.json({ updated: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

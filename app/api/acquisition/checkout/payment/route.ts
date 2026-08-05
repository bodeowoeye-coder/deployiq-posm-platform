import { NextResponse } from "next/server";
import { getOnboardingDraftByToken, updateOnboardingDraft } from "@/lib/commercial/onboarding/service";
import { getActivePaymentProvider, generatePaymentReference } from "@/lib/commercial/checkout/payment";
import type { CustomerQuotation } from "@/lib/commercial/onboarding/quotation";
import { resolveProductKey } from "@/lib/commercial/products/catalogue";

/**
 * POST /api/acquisition/checkout/payment
 * Process a card payment through the active PaymentProvider.
 *
 * HARDENED: This route now:
 * 1. Reads the confirmed quotation from draft_data (not from the request body).
 * 2. Validates the selected payment method against allowedPaymentMethods.
 * 3. Rejects client-supplied amounts — uses server-confirmed total only.
 * 4. Persists the commercial reference through the payment record.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const draftToken    = typeof body.resumeToken    === "string" ? body.resumeToken    : null;
    const selectedMethod = typeof body.paymentMethod === "string" ? body.paymentMethod  : "card";

    if (!draftToken) {
      return NextResponse.json({ error: "Acquisition session is required." }, { status: 400 });
    }

    const draft = await getOnboardingDraftByToken(draftToken);
    if (!draft) {
      return NextResponse.json({ error: "Acquisition session not found." }, { status: 404 });
    }

    if (!draft.draft_data?.emailVerified) {
      return NextResponse.json({ error: "Email must be verified before payment." }, { status: 400 });
    }

    const email = draft.draft_data.adminEmail as string | undefined;
    if (!email) {
      return NextResponse.json({ error: "Administrator email not found." }, { status: 400 });
    }

    // ── 1. Read confirmed quotation from draft — reject client-supplied amounts ──
    const confirmedQuotation = draft.draft_data.confirmedQuotation as CustomerQuotation | undefined;
    if (!confirmedQuotation) {
      return NextResponse.json({ error: "No confirmed commercial plan found. Please complete the commercial plan step before payment." }, { status: 400 });
    }
    const recommendationProduct = typeof draft.draft_data.recommendedProductKey === "string"
      ? resolveProductKey(draft.draft_data.recommendedProductKey)
      : draft.selected_product
      ? resolveProductKey(draft.selected_product)
      : null;
    const quotationProduct = resolveProductKey(confirmedQuotation.productKey);
    if (recommendationProduct && recommendationProduct !== quotationProduct) {
      return NextResponse.json(
        { error: "The confirmed commercial plan does not match the selected product. Please refresh your quotation." },
        { status: 409 }
      );
    }
    const amount      = confirmedQuotation.estimatedTotal;
    const currency    = confirmedQuotation.currency;
    const productName = confirmedQuotation.pricingTemplateName ?? "DeployIQ";

    if (amount <= 0 && !confirmedQuotation.requiresEnterpriseReview) {
      return NextResponse.json({ error: "Zero-value self-service payment is not permitted." }, { status: 400 });
    }

    // ── 2. Validate payment method against allowedPaymentMethods ──
    const allowedMethods = confirmedQuotation.allowedPaymentMethods ?? ["card", "bank_transfer"];
    if (!allowedMethods.includes(selectedMethod)) {
      return NextResponse.json(
        { error: `Payment method '${selectedMethod}' is not permitted for this commercial plan. Allowed: ${allowedMethods.join(", ")}.` },
        { status: 403 }
      );
    }

    // ── 3. Preserve commercial reference ──
    const commercialReference = draft.draft_data.commercialReference as string | undefined;

    const reference = generatePaymentReference(draftToken);

    if (selectedMethod === "bank_transfer") {
      await updateOnboardingDraft({
        resumeToken: draftToken,
        currentStep: "review",
        status: "pricing_complete",
        draftData: {
          ...draft.draft_data,
          paymentStatus: "awaiting_verification",
          commercialStatus: "payment_pending",
          subscriptionStatus: "inactive",
          paymentReference: reference,
          paymentMethod: "bank_transfer",
          commercialReference,
          readyForProvisioning: false,
          bankTransferSubmittedAt: new Date().toISOString(),
        },
      });

      return NextResponse.json({
        submitted: true,
        reference,
        status: "awaiting_verification",
      });
    }

    if (selectedMethod !== "card") {
      return NextResponse.json({ error: "This payment method must use its dedicated activation route." }, { status: 400 });
    }

    const provider  = getActivePaymentProvider();

    // Mark as processing
    await updateOnboardingDraft({
      resumeToken: draftToken,
      currentStep: "account",
      status: "account_created",
      draftData: {
        ...draft.draft_data,
        paymentStatus: "processing",
        paymentReference: reference,
        paymentMethod: selectedMethod,
        pricingTemplateId: confirmedQuotation.pricingTemplateId,
        commercialReference,
      },
    });

    const result = await provider.initiatePayment({
      amount,
      currency,
      reference,
      customerEmail: email,
      description: `DeployIQ ${productName}`,
    });

    if (!result.success) {
      await updateOnboardingDraft({
        resumeToken: draftToken,
        currentStep: "account",
        status: "account_created",
        draftData: {
          ...draft.draft_data,
          paymentStatus: "failed",
          paymentReference: reference,
        },
      });
      return NextResponse.json({ error: result.error ?? "Payment failed." }, { status: 402 });
    }

    // Payment succeeded
    await updateOnboardingDraft({
      resumeToken: draftToken,
      currentStep: "success",
      status: "provisioning_pending",
      draftData: {
        ...draft.draft_data,
        paymentStatus: "succeeded",
        commercialStatus: "payment_verified",
        subscriptionStatus: "active",
        paymentReference: reference,
        checkoutCompletedAt: new Date().toISOString(),
        readyForProvisioning: true,
      },
    });

    return NextResponse.json({
      success: true,
      reference,
      providerReference: result.providerReference,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

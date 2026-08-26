import { NextResponse } from "next/server";
import { getOnboardingDraftByToken, updateOnboardingDraft } from "@/lib/commercial/onboarding/service";
import type { CustomerQuotation } from "@/lib/commercial/onboarding/quotation";
import { validateQuotationAgainstSnapshot, type AuthoritativePricingSnapshot } from "@/lib/commercial/onboarding/quotationAuthority";
import { createAdminSupabase } from "@/lib/supabaseAdmin";

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

    const snapshotId = draft.pricing_snapshot_id;
    if (!snapshotId) {
      return NextResponse.json({ error: "The commercial plan must be recalculated before it can be confirmed.", code: "pricing_snapshot_required" }, { status: 409 });
    }
    const { data: snapshot, error: snapshotError } = await createAdminSupabase()
      .from("commercial_pricing_snapshots")
      .select("id,onboarding_draft_id,product_key,pricing_template_id,pricing_template_name,currency,quantity,subtotal,discount,total,included_admin_users,requires_enterprise_review,expires_at,status")
      .eq("id", snapshotId)
      .maybeSingle();
    if (snapshotError) throw snapshotError;
    const authority = validateQuotationAgainstSnapshot({
      draftId: draft.id,
      selectedProduct: draft.selected_product,
      snapshot: snapshot as AuthoritativePricingSnapshot | null,
      quotation,
    });
    if (!authority.ok) {
      return NextResponse.json({ error: authority.message, code: authority.code }, { status: 409 });
    }

    // Idempotent: preserve existing commercial reference — do not re-generate on retries.
    const existingRef = draft.draft_data?.commercialReference as string | undefined;
    const commercialReference = existingRef || generateCommercialReference(draft.id);

    const { error: acceptError } = await createAdminSupabase()
      .from("commercial_pricing_snapshots")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", snapshotId)
      .eq("onboarding_draft_id", draft.id)
      .in("status", ["calculated", "accepted"]);
    if (acceptError) throw acceptError;

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
      pricingSnapshotId: snapshotId,
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

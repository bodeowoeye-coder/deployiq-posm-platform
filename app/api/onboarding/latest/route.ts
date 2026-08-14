import { NextResponse } from "next/server";
import { getCurrentUserContext, readAccountSecurityState } from "@/lib/auth";
import { getEligibleIncompleteDraftsForCustomer, getLatestActivationDraftForCustomer, updateOnboardingDraft } from "@/lib/commercial/onboarding/service";
import { getCanonicalProduct } from "@/lib/commercial/products/catalogue";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const context = await getCurrentUserContext();
    if (!context?.user) {
      return NextResponse.json({ draft: null });
    }
    const accountSecurity = readAccountSecurityState(context.user);
    if (accountSecurity.passwordChangeRequired) {
      return NextResponse.json({
        draft: null,
        blockedByPasswordChange: true,
        redirectTo: `/login/create-password?returnTo=${encodeURIComponent("/onboarding")}`,
      });
    }

    const activationDraft = await getLatestActivationDraftForCustomer({
      userId: context.user.id,
      email: context.user.email ?? null,
    });
    if (activationDraft) {
      return NextResponse.json({
        draft: null,
        activationPending: true,
        redirectTo: `/workspace/activation?token=${encodeURIComponent(activationDraft.resume_token)}`,
      });
    }

    const drafts = await getEligibleIncompleteDraftsForCustomer({
      userId: context.user.id,
      email: context.user.email ?? null,
    });
    if (drafts.length > 1) {
      return NextResponse.json({
        draft: null,
        drafts: drafts.map((draft) => ({
          ...draft,
          recoveryLabel: recoveryLabelForDraft(draft),
        })),
        multipleDrafts: true,
      });
    }
    const draft = drafts[0] ?? null;
    if (draft && !draft.authenticated_user_id && draft.email?.toLowerCase() === context.user.email?.toLowerCase() && draft.draft_data.emailVerified === true) {
      const linkedDraft = await updateOnboardingDraft({
        resumeToken: draft.resume_token,
        email: draft.email,
        status: draft.status,
        currentStep: draft.current_step,
        selectedProduct: draft.selected_product,
        authenticatedUserId: context.user.id,
        pricingSnapshotId: draft.pricing_snapshot_id,
        failureReason: draft.failure_reason,
        draftData: {
          ...draft.draft_data,
          identityLinkedAt: draft.draft_data.identityLinkedAt ?? new Date().toISOString(),
          existingAccountLinkedAt: new Date().toISOString(),
        },
      });
      return NextResponse.json({ draft: { ...linkedDraft, recoveryLabel: recoveryLabelForDraft(linkedDraft) } });
    }

    return NextResponse.json({ draft: draft ? { ...draft, recoveryLabel: recoveryLabelForDraft(draft) } : null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function recoveryLabelForDraft(draft: { selected_product?: string | null; draft_data?: Record<string, unknown> }) {
  const data = draft.draft_data ?? {};
  const productKey = draft.selected_product
    ?? (typeof data.recommendedProductKey === "string" ? data.recommendedProductKey : null)
    ?? (typeof data.recommendation === "object" && data.recommendation && "productKey" in data.recommendation
      ? String((data.recommendation as { productKey?: unknown }).productKey ?? "")
      : "");
  const product = productKey ? getCanonicalProduct(productKey) : null;
  const productName = product?.productName ?? (typeof data.productName === "string" ? data.productName : "DeployIQ");
  const organisationName = typeof data.organisationName === "string" && data.organisationName.trim()
    ? data.organisationName.trim()
    : "Saved workspace";
  return {
    productName,
    organisationName,
    title: `incomplete ${productName.replace(/^DeployIQ\s+/i, "")} workspace setup`,
  };
}

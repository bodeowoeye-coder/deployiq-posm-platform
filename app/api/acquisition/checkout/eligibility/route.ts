import { NextResponse } from "next/server";
import { getOnboardingDraftByToken } from "@/lib/commercial/onboarding/service";

/**
 * GET /api/acquisition/checkout/eligibility?token=...
 *
 * Server-side guard: verify that a draft is genuinely ready for workspace
 * provisioning before the client is allowed to enter the provision-boundary.
 *
 * Does NOT create records or change state.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const draftToken = url.searchParams.get("token");

    if (!draftToken || typeof draftToken !== "string") {
      return NextResponse.json({ error: "Acquisition session token is required." }, { status: 400 });
    }

    const draft = await getOnboardingDraftByToken(draftToken);
    if (!draft) {
      return NextResponse.json({ error: "Acquisition session not found." }, { status: 404 });
    }

    const readyForProvisioning = draft.draft_data?.readyForProvisioning === true;
    const paymentStatus = (draft.draft_data?.paymentStatus as string | undefined) ?? "pending";
    const commercialStatus = (draft.draft_data?.commercialStatus as string | undefined) ?? "pending";
    const subscriptionStatus = (draft.draft_data?.subscriptionStatus as string | undefined) ?? "inactive";

    return NextResponse.json({
      readyForProvisioning,
      paymentStatus,
      commercialStatus,
      subscriptionStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

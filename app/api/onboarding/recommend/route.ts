import { NextResponse } from "next/server";
import { resolveRecommendation } from "@/lib/commercial/onboarding/recommendation";
import { getOnboardingDraftByToken, updateOnboardingDraft } from "@/lib/commercial/onboarding/service";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const objectiveId = typeof body.objectiveId === "string" ? body.objectiveId.trim() : "";
    const country = typeof body.country === "string" ? body.country.trim() : "";
    const rawQuantity = body.quantity;
    const quantity = typeof rawQuantity === "number" ? rawQuantity : parseInt(String(rawQuantity ?? "0"), 10);
    const draftToken = typeof body.resumeToken === "string" ? body.resumeToken : null;

    if (!objectiveId) {
      return NextResponse.json({ error: "Business objective is required." }, { status: 400 });
    }
    if (!country) {
      return NextResponse.json({ error: "Country is required." }, { status: 400 });
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json(
        { error: "Rollout quantity must be a positive whole number." },
        { status: 400 }
      );
    }

    // Accept new capabilities array; derive legacy boolean flags for backwards compatibility
    const capabilities: string[] = Array.isArray(body.capabilities) ? body.capabilities : [];

    // Server resolves recommendation — client cannot influence product selection
    const recommendation = resolveRecommendation({
      objectiveId,
      quantity,
      country,
      needsInstallers: capabilities.includes("fieldEvidence") || Boolean(body.needsInstallers),
      needsClientPortal: capabilities.includes("clientVisibility") || Boolean(body.needsClientPortal),
      needsAnalytics: capabilities.includes("projectAnalytics") || Boolean(body.needsAnalytics),
    });

    // Persist to draft if token provided
    if (draftToken) {
      const draft = await getOnboardingDraftByToken(draftToken);
      if (draft) {
        await updateOnboardingDraft({
          resumeToken: draftToken,
          currentStep: "product",
          status: "product_selected",
          draftData: {
            ...draft.draft_data,
            objectiveId,
            quantity,
            country,
            industry: typeof body.industry === "string" ? body.industry : "",
            adminCount: typeof body.adminCount === "number"
              ? body.adminCount
              : parseInt(String(body.adminCount ?? "1"), 10),
            capabilities,
            needsInstallers: capabilities.includes("fieldEvidence") || Boolean(body.needsInstallers),
            needsClientPortal: capabilities.includes("clientVisibility") || Boolean(body.needsClientPortal),
            needsAnalytics: capabilities.includes("projectAnalytics") || Boolean(body.needsAnalytics),
            recommendedProductKey: recommendation.productKey,
          },
          selectedProduct: recommendation.productKey,
        });
      }
    }

    return NextResponse.json({ recommendation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

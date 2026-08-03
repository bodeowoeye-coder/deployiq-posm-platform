import { NextResponse } from "next/server";
import { createOnboardingDraft, getOnboardingDraftByToken, updateOnboardingDraft } from "@/lib/commercial/onboarding/service";
import { validateOrganisationInput, validateRetailSetup } from "@/lib/commercial/onboarding/validation";
import { getCommercialProduct } from "@/lib/commercial/products/catalogue";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const draftToken = typeof body.resumeToken === "string" ? body.resumeToken : null;
    const step = typeof body.step === "string" ? body.step : "welcome";

    if (step === "welcome") {
      const draft = await createOnboardingDraft({ email: typeof body.email === "string" ? body.email : null, currentStep: "organisation" });
      return NextResponse.json({ draft });
    }

    if (!draftToken) {
      return NextResponse.json({ error: "A valid onboarding draft is required." }, { status: 400 });
    }

    const existingDraft = await getOnboardingDraftByToken(draftToken);
    if (!existingDraft) {
      return NextResponse.json({ error: "Onboarding draft not found." }, { status: 404 });
    }

    if (step === "organisation") {
      const validation = validateOrganisationInput(body);
      if (!validation.isValid) {
        return NextResponse.json({ error: "Invalid organisation details.", details: validation.errors }, { status: 400 });
      }

      const updatedDraft = await updateOnboardingDraft({
        resumeToken: draftToken,
        currentStep: "product",
        status: "organisation_details_complete",
        draftData: { ...existingDraft.draft_data, ...body, organisationCompleted: true },
        selectedProduct: existingDraft.selected_product ?? null
      });
      return NextResponse.json({ draft: updatedDraft });
    }

    if (step === "product") {
      const product = getCommercialProduct(typeof body.productKey === "string" ? (body.productKey as any) : "retail");
      if (!product || product.availability !== "available") {
        return NextResponse.json({ error: "The selected product is not currently available." }, { status: 400 });
      }
      const updatedDraft = await updateOnboardingDraft({
        resumeToken: draftToken,
        currentStep: "retail-setup",
        status: "product_selected",
        draftData: { ...existingDraft.draft_data, selectedProduct: product.product_key },
        selectedProduct: product.product_key
      });
      return NextResponse.json({ draft: updatedDraft });
    }

    if (step === "retail-setup") {
      const validation = validateRetailSetup(body);
      if (!validation.isValid) {
        return NextResponse.json({ error: "Invalid retail setup details.", details: validation.errors }, { status: 400 });
      }
      const updatedDraft = await updateOnboardingDraft({
        resumeToken: draftToken,
        currentStep: "capacity",
        status: "product_setup_complete",
        draftData: { ...existingDraft.draft_data, ...body, retailSetupCompleted: true }
      });
      return NextResponse.json({ draft: updatedDraft });
    }

    if (step === "enterprise-assistance") {
      const updatedDraft = await updateOnboardingDraft({
        resumeToken: draftToken,
        currentStep: "account",
        status: "account_pending",
        draftData: {
          ...existingDraft.draft_data,
          enterpriseRequest: typeof body.enterpriseRequest === "object" ? body.enterpriseRequest : null,
          enterpriseRequestedAt: new Date().toISOString(),
        }
      });
      return NextResponse.json({ draft: updatedDraft });
    }

    return NextResponse.json({ draft: existingDraft });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

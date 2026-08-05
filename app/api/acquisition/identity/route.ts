import { NextResponse } from "next/server";
import { getOnboardingDraftByToken, updateOnboardingDraft } from "@/lib/commercial/onboarding/service";
import {
  validateOrganisationName,
  validateWorkspaceName,
  validateWorkspaceSlug,
  validateBusinessEmail,
  validateName,
  validateMobile,
} from "@/lib/acquisition/identity";

/**
 * Persist CO-1B identity data (organisation + administrator) to the acquisition draft.
 * Does NOT create a workspace or user account — that is CO-1D.
 * Passwords are NOT stored here.
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

    // Validate and extract organisation data
    const orgErrors: Record<string, string> = {};
    const orgName = typeof body.organisationName === "string" ? body.organisationName.trim() : "";
    const workspaceName = typeof body.workspaceName === "string" ? body.workspaceName.trim() : "";
    const workspaceSlug = typeof body.workspaceSlug === "string" ? body.workspaceSlug.trim().toLowerCase() : "";
    const country = typeof body.country === "string" ? body.country.trim() : "";
    const timezone = typeof body.timezone === "string" ? body.timezone.trim() : "";

    const orgNameErr = validateOrganisationName(orgName);
    if (orgNameErr) orgErrors.organisationName = orgNameErr;
    const wsNameErr = validateWorkspaceName(workspaceName);
    if (wsNameErr) orgErrors.workspaceName = wsNameErr;
    const wsSlugErr = validateWorkspaceSlug(workspaceSlug);
    if (wsSlugErr) orgErrors.workspaceSlug = wsSlugErr;
    if (!country) orgErrors.country = "Country is required.";
    if (!timezone) orgErrors.timezone = "Time zone is required.";

    // Validate and extract admin data (if provided)
    const adminErrors: Record<string, string> = {};
    let adminData: Record<string, string | undefined> | null = null;

    if (body.adminData) {
      const ad = body.adminData;
      const firstName = typeof ad.firstName === "string" ? ad.firstName.trim() : "";
      const lastName = typeof ad.lastName === "string" ? ad.lastName.trim() : "";
      const email = typeof ad.email === "string" ? ad.email.trim() : "";
      const mobile = typeof ad.mobile === "string" ? ad.mobile.trim() : "";

      const fnErr = validateName(firstName, "First name");
      if (fnErr) adminErrors.firstName = fnErr;
      const lnErr = validateName(lastName, "Last name");
      if (lnErr) adminErrors.lastName = lnErr;
      const emailErr = validateBusinessEmail(email);
      if (emailErr) adminErrors.email = emailErr;
      const mobileErr = validateMobile(mobile);
      if (mobileErr) adminErrors.mobile = mobileErr;
      if (!ad.acceptedTerms) adminErrors.terms = "You must accept the Terms of Service.";
      if (!ad.acceptedPrivacy) adminErrors.privacy = "You must accept the Privacy Policy.";

      if (Object.keys(adminErrors).length === 0) {
        const acceptedTermsAt = typeof ad.acceptedTermsAt === "string" ? ad.acceptedTermsAt : undefined;
        const acceptedPrivacyAt = typeof ad.acceptedPrivacyAt === "string" ? ad.acceptedPrivacyAt : undefined;
        adminData = { firstName, lastName, email, mobile, acceptedTermsAt, acceptedPrivacyAt };
      }
    }

    const allErrors = { ...orgErrors, ...adminErrors };
    if (Object.keys(allErrors).length > 0) {
      return NextResponse.json({ error: "Validation failed.", details: allErrors }, { status: 400 });
    }

    // Persist to draft — password deliberately excluded
    const updatedDraft = await updateOnboardingDraft({
      resumeToken: draftToken,
      currentStep: "account",
      status: "organisation_details_complete",
      draftData: {
        ...draft.draft_data,
        organisationName: orgName,
        workspaceName,
        workspaceSlug,
        country,
        timezone,
        ...(adminData ? {
          adminFirstName: adminData.firstName,
          adminLastName: adminData.lastName,
          adminEmail: adminData.email,
          adminMobile: adminData.mobile,
          adminAccountReady: true,
          acceptedTermsAt: adminData.acceptedTermsAt ?? null,
          acceptedPrivacyAt: adminData.acceptedPrivacyAt ?? null,
        } : {}),
      },
    });

    return NextResponse.json({ draft: updatedDraft });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

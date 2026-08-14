import { NextResponse } from "next/server";
import { getOnboardingDraftByToken, updateOnboardingDraft } from "@/lib/commercial/onboarding/service";
import {
  validateOrganisationName,
  validateWorkspaceName,
  validateWorkspaceSlug,
  validateBusinessEmail,
  validateName,
  validateMobile,
  analysePassword,
  validatePasswordMatch,
} from "@/lib/acquisition/identity";
import { encryptOnboardingPassword } from "@/lib/acquisition/testIdentitySession";

type PersistedAdminData = {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  passwordMethod: "generated" | "customer_created";
  passwordEnvelope?: ReturnType<typeof encryptOnboardingPassword>;
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
  acceptedTermsAt?: string;
  acceptedPrivacyAt?: string;
};

/**
 * Persist CO-1B identity data (organisation + administrator) to the acquisition draft.
 * Does NOT create a workspace or user account — that is CO-1D.
 * Customer-created passwords are encrypted for the OTP handoff and deleted after verification.
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
    let adminData: PersistedAdminData | null = null;

    if (body.adminData) {
      const ad = body.adminData;
      const firstName = typeof ad.firstName === "string" ? ad.firstName.trim() : "";
      const lastName = typeof ad.lastName === "string" ? ad.lastName.trim() : "";
      const email = typeof ad.email === "string" ? ad.email.trim() : "";
      const mobile = typeof ad.mobile === "string" ? ad.mobile.trim() : "";
      const passwordMethod = ad.passwordMethod === "customer_created" ? "customer_created" : "generated";
      const password = typeof ad.password === "string" ? ad.password : "";
      const confirmPassword = typeof ad.confirmPassword === "string" ? ad.confirmPassword : "";

      const fnErr = validateName(firstName, "First name");
      if (fnErr) adminErrors.firstName = fnErr;
      const lnErr = validateName(lastName, "Last name");
      if (lnErr) adminErrors.lastName = lnErr;
      const emailErr = validateBusinessEmail(email);
      if (emailErr) adminErrors.email = emailErr;
      const mobileErr = validateMobile(mobile);
      if (mobileErr) adminErrors.mobile = mobileErr;
      let passwordEnvelope: ReturnType<typeof encryptOnboardingPassword> | undefined;
      if (passwordMethod === "customer_created") {
        if (!analysePassword(password).isAcceptable) adminErrors.password = "Password does not meet requirements.";
        const matchErr = validatePasswordMatch(password, confirmPassword);
        if (matchErr) adminErrors.confirmPassword = matchErr;
        if (!adminErrors.password && !adminErrors.confirmPassword) {
          passwordEnvelope = encryptOnboardingPassword(password);
        }
      }
      if (!ad.acceptedTerms) adminErrors.terms = "You must accept the Terms of Service.";
      if (!ad.acceptedPrivacy) adminErrors.privacy = "You must accept the Privacy Policy.";

      if (Object.keys(adminErrors).length === 0) {
        const acceptedTermsAt = typeof ad.acceptedTermsAt === "string" ? ad.acceptedTermsAt : undefined;
        const acceptedPrivacyAt = typeof ad.acceptedPrivacyAt === "string" ? ad.acceptedPrivacyAt : undefined;
        adminData = {
          firstName,
          lastName,
          email,
          mobile,
          passwordMethod,
          passwordEnvelope,
          acceptedTerms: true,
          acceptedPrivacy: true,
          acceptedTermsAt,
          acceptedPrivacyAt,
        };
      }
    }

    const allErrors = { ...orgErrors, ...adminErrors };
    if (Object.keys(allErrors).length > 0) {
      return NextResponse.json({ error: "Validation failed.", details: allErrors }, { status: 400 });
    }

    // Persist to draft — any customer-created password is encrypted and removed after OTP verification.
    const updatedDraft = await updateOnboardingDraft({
      resumeToken: draftToken,
      email: adminData?.email ?? draft.email,
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
          passwordMethod: adminData.passwordMethod,
          password_change_required: adminData.passwordMethod === "generated",
          first_login_completed: false,
          customerPasswordEnvelope: adminData.passwordEnvelope ?? null,
          adminAccountReady: true,
          acceptedTerms: true,
          acceptedPrivacy: true,
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

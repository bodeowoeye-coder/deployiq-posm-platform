import type { OnboardingDraft } from "../../commercial/onboarding/types.ts";

function normaliseEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function assertProvisioningOwnership(draft: OnboardingDraft, user: {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
}) {
  if (!user.emailConfirmed || draft.draft_data?.emailVerified !== true) {
    throw Object.assign(new Error("The administrator identity must be verified before workspace setup."), { status: 403, code: "identity_not_verified" });
  }
  if (!draft.authenticated_user_id || draft.authenticated_user_id !== user.id) {
    throw Object.assign(new Error("This workspace setup belongs to another account."), { status: 403, code: "draft_owner_mismatch" });
  }
  if (!normaliseEmail(user.email) || normaliseEmail(user.email) !== normaliseEmail(draft.draft_data?.adminEmail)) {
    throw Object.assign(new Error("The signed-in account does not match the verified administrator."), { status: 403, code: "verified_email_mismatch" });
  }
}

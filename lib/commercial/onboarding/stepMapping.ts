import type { OnboardingDraft } from "./types.ts";

export type CurrentOnboardingStep =
  | "objective"
  | "discovery"
  | "recommendation"
  | "decision"
  | "enterprise"
  | "enterprise-submitted"
  | "identity-organisation"
  | "identity-admin"
  | "identity-verification"
  | "checkout-boundary"
  | "commercial-plan"
  | "checkout-review"
  | "checkout-payment"
  | "checkout-success"
  | "checkout-enterprise"
  | "checkout-transfer-pending"
  | "provision-boundary";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function restoreCurrentOnboardingStep(draft: Pick<OnboardingDraft, "status" | "current_step" | "draft_data">): CurrentOnboardingStep {
  const data = draft.draft_data ?? {};
  const status = text(draft.status);
  const savedStep = text(draft.current_step);

  if (status === "provisioned" || status === "completed" || text(data.provisioningStatus) === "completed") {
    return "provision-boundary";
  }

  if (data.readyForProvisioning === true && text(data.paymentStatus) === "succeeded") {
    return "provision-boundary";
  }

  if (text(data.paymentStatus) === "awaiting_verification") return "checkout-transfer-pending";
  if (text(data.paymentMethod) === "enterprise_po" || text(data.commercialStatus) === "enterprise_submitted") return "checkout-enterprise";
  if (data.confirmedQuotation) return "checkout-review";
  if (data.emailVerified === true) return "checkout-boundary";
  if (text(data.otpExpiresAt)) return "identity-verification";
  if (text(data.adminEmail)) return "identity-admin";
  if (data.enterpriseRequest && typeof data.enterpriseRequest === "object") return "enterprise-submitted";
  if (text(data.workspaceSlug) || text(data.organisationName)) return "identity-organisation";

  if (savedStep === "success" || savedStep === "complete" || savedStep === "next-steps") {
    return text(data.recommendedProductKey) ? "identity-organisation" : "discovery";
  }

  if (savedStep === "pricing") return data.confirmedQuotation ? "checkout-review" : "commercial-plan";
  if (savedStep === "review") return "checkout-review";
  if (savedStep === "account") return text(data.adminEmail) ? "identity-verification" : "identity-organisation";
  if (savedStep === "product") return text(data.recommendedProductKey) ? "recommendation" : "discovery";
  if (savedStep === "organisation" || savedStep === "retail-setup" || savedStep === "capacity") return "discovery";
  if (text(data.objectiveId)) return "discovery";

  return "objective";
}

export function isEligibleIncompleteDraft(draft: Pick<OnboardingDraft, "status" | "expires_at">) {
  if (["provisioned", "completed", "abandoned"].includes(draft.status)) return false;
  if (draft.expires_at) {
    const expiry = new Date(draft.expires_at).getTime();
    if (Number.isFinite(expiry) && expiry <= Date.now()) return false;
  }
  return true;
}

export function isActivationPendingDraft(draft: Pick<OnboardingDraft, "status" | "draft_data">) {
  const data = draft.draft_data ?? {};
  if (["provisioning_pending", "provisioning", "activation_pending", "provisioning_delayed"].includes(draft.status)) return true;
  if (data.readyForProvisioning === true && text(data.paymentStatus) === "succeeded") return true;
  if (text(data.provisioningJobId) && text(data.provisioningStatus) !== "completed") return true;
  return false;
}

import type { ProvisioningStage } from "./registry.ts";

export type ProvisioningFailureJob = {
  current_stage: ProvisioningStage;
};

export type ProvisioningFailureClassification =
  | "retryable"
  | "permanent"
  | "approval_required"
  | "security_rejected";

const SECURITY_CODES = new Set(["authentication_required", "identity_not_verified", "draft_owner_mismatch", "verified_email_mismatch"]);
const APPROVAL_CODES = new Set(["provisioning_blueprint_not_enabled", "commercial_not_verified", "payment_not_verified"]);
const PERMANENT_CODES = new Set(["product_chain_mismatch", "manifest_product_mismatch", "missing_quotation", "missing_commercial_reference"]);

export function classifyProvisioningFailure(code: string): ProvisioningFailureClassification {
  if (SECURITY_CODES.has(code)) return "security_rejected";
  if (APPROVAL_CODES.has(code)) return "approval_required";
  if (PERMANENT_CODES.has(code)) return "permanent";
  return "retryable";
}

const CUSTOMER_FAILURE = "We could not finish workspace setup automatically. Your activation is safe and our team can resume it.";

function failureDetails(error: unknown) {
  const code = typeof (error as { code?: unknown })?.code === "string"
    ? (error as { code: string }).code
    : "provisioning_failed";
  const message = error instanceof Error
    ? error.message
    : typeof (error as { message?: unknown })?.message === "string"
    ? (error as { message: string }).message
    : "Unknown provisioning failure";
  return { code, message };
}

export function buildProvisioningFailureMetadata(job: ProvisioningFailureJob, error: unknown) {
  const details = failureDetails(error);
  const failedSafeStage = job.current_stage === "failed" ? "failed" : job.current_stage;
  const classification = classifyProvisioningFailure(details.code);
  return {
    failureCode: details.code,
    failureMessage: details.message,
    failedSafeStage,
    customerFailureMessage: CUSTOMER_FAILURE,
    classification,
    retryable: classification === "retryable",
  };
}

import type { ProvisioningStage } from "./registry.ts";

export type ProvisioningFailureJob = {
  current_stage: ProvisioningStage;
};

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
  return {
    failureCode: details.code,
    failureMessage: details.message,
    failedSafeStage,
    customerFailureMessage: CUSTOMER_FAILURE,
    retryable: true,
  };
}

export type ProvisioningPresentationPhase =
  | "idle"
  | "planning"
  | "validated_plan_review"
  | "provisioning"
  | "completed";

type ShadowPlanningLike = {
  status?: string;
  validation?: { status?: string };
  proposedPlan?: unknown;
} | null | undefined;

export function hasValidatedShadowPlan(value: ShadowPlanningLike) {
  return Boolean(value?.proposedPlan && value.validation?.status !== "rejected");
}

export function shadowPlanAcknowledgementCookie(jobId: string) {
  return `deployiq-shadow-plan-ack-${jobId}`;
}

export function resolveProvisioningPresentationPhase(input: {
  shadowPlanning: ShadowPlanningLike;
  jobStatus?: string | null;
  acknowledged: boolean;
  started: boolean;
}): ProvisioningPresentationPhase {
  if (hasValidatedShadowPlan(input.shadowPlanning) && !input.acknowledged) return "validated_plan_review";
  if (input.jobStatus === "completed") return "completed";
  if (input.acknowledged) return "provisioning";
  return input.started ? "planning" : "idle";
}

export function advanceProvisioningPresentationPhase(
  current: ProvisioningPresentationPhase,
  next: ProvisioningPresentationPhase,
  acknowledged: boolean,
) {
  if (current === "completed") return current;
  if (current === "validated_plan_review" && !acknowledged) return current;
  if (current === "provisioning" && (next === "idle" || next === "planning" || next === "validated_plan_review")) return current;
  return next;
}

export function preserveShadowPlanning<T>(current: T | null, incoming: T | null | undefined) {
  return incoming ?? current;
}

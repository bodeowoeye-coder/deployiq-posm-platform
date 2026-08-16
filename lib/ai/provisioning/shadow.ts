import type { TrustedProvisioningContext } from "./context.ts";
import { compareProvisioningPlans, validateProvisioningPlan } from "./policy.ts";
import { createDeterministicBaseline, DeterministicFallbackProvider, type ProvisioningPlannerProvider } from "./planner.ts";
import type { ShadowPlanningResult } from "./schema.ts";

export async function runProvisioningShadow(context: TrustedProvisioningContext, provider: ProvisioningPlannerProvider = new DeterministicFallbackProvider()): Promise<ShadowPlanningResult> {
  const baselinePlan = createDeterministicBaseline(context);
  const generatedAt = new Date().toISOString();
  try {
    const proposedPlan = await provider.createPlan(context);
    const validation = validateProvisioningPlan(proposedPlan, context);
    return { status: validation.status === "rejected" ? "rejected" : "completed", proposedPlan, baselinePlan, differences: compareProvisioningPlans(proposedPlan, baselinePlan), validation, providerVersion: provider.version, generatedAt };
  } catch {
    return { status: "fallback", proposedPlan: null, baselinePlan, differences: [{ path: "$", classification: "exact_match" }], validation: { status: "valid", reasons: [] }, providerVersion: provider.version, generatedAt, errorCode: "planner_unavailable" };
  }
}

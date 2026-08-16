import type { TrustedProvisioningContext } from "./context.ts";
import { compareProvisioningPlans, validateProvisioningPlan } from "./policy.ts";
import { createDeterministicBaseline, DeterministicFallbackProvider, type ProvisioningPlannerProvider } from "./planner.ts";
import type { ShadowPlanningResult } from "./schema.ts";
import { getProvisioningAgentFlags } from "./flags.ts";
import { OpenAIProvisioningPlannerProvider, ProvisioningProviderError } from "./openaiProvider.ts";

export function createProvisioningPlannerProvider(): ProvisioningPlannerProvider {
  const flags = getProvisioningAgentFlags();
  return flags.provider === "openai"
    ? new OpenAIProvisioningPlannerProvider(flags.model, flags.timeoutMs, flags.maxRetries)
    : new DeterministicFallbackProvider();
}

export async function runProvisioningShadow(context: TrustedProvisioningContext, provider: ProvisioningPlannerProvider = createProvisioningPlannerProvider()): Promise<ShadowPlanningResult> {
  const baselinePlan = createDeterministicBaseline(context);
  const generatedAt = new Date().toISOString();
  const startedAt = Date.now();
  try {
    const proposedPlan = await provider.createPlan(context);
    const validation = validateProvisioningPlan(proposedPlan, context);
    const differences = compareProvisioningPlans(proposedPlan, baselinePlan);
    if (validation.status !== "rejected") return { status: "completed", proposedPlan, baselinePlan, differences, validation, provider: provider.provider, model: provider.model, providerVersion: provider.version, promptSchemaVersion: provider.promptSchemaVersion, generatedAt, generationDurationMs: Date.now() - startedAt, fallbackUsed: false };
    return { status: "fallback", proposedPlan: baselinePlan, baselinePlan, differences: [{ path: "$", classification: "exact_match" }], validation: { status: "valid", reasons: [] }, provider: provider.provider, model: provider.model, providerVersion: provider.version, promptSchemaVersion: provider.promptSchemaVersion, generatedAt, generationDurationMs: Date.now() - startedAt, fallbackUsed: true, providerFailureCode: "policy_rejected", providerValidation: validation, providerDifferences: differences };
  } catch (error) {
    const fallback = new DeterministicFallbackProvider();
    const proposedPlan = await fallback.createPlan(context);
    return { status: "fallback", proposedPlan, baselinePlan, differences: [{ path: "$", classification: "exact_match" }], validation: { status: "valid", reasons: [] }, provider: provider.provider, model: provider.model, providerVersion: provider.version, promptSchemaVersion: provider.promptSchemaVersion, generatedAt, generationDurationMs: Date.now() - startedAt, fallbackUsed: true, providerFailureCode: error instanceof ProvisioningProviderError ? error.code : "planner_unavailable" };
  }
}

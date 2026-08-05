import type { RecommendationResult } from "./recommendation";

export type CommercialDecisionTarget = "quotation" | "assisted_setup";

export function shouldRequestQuotation(recommendation: RecommendationResult | null): boolean {
  return Boolean(recommendation?.pricingReady && recommendation.deploymentMode === "SELF_SERVICE");
}

export function nextCommercialDecisionTarget(recommendation: RecommendationResult | null): CommercialDecisionTarget {
  return shouldRequestQuotation(recommendation) ? "quotation" : "assisted_setup";
}

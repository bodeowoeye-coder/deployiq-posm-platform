/**
 * Deterministic product recommendation service.
 * No external AI calls — logic is transparent and testable.
 * Separated from presentation so an AI adapter can be added later.
 */
import { getCanonicalProduct, resolveProductKey } from "../../commercial/products/catalogue.ts";
import { getObjectiveById } from "./objectives.ts";
import type { OnboardingProductKey } from "./types.ts";

export type DeploymentMode = "SELF_SERVICE" | "ENTERPRISE";

export const STANDARD_PRICING_UNAVAILABLE_REASON =
  "Standard online pricing is not yet available for this solution. Our assisted sales team will prepare a tailored commercial plan.";

const DEPLOYMENT_MODE_CONFIG: Record<string, DeploymentMode> = {
  retail:           "SELF_SERVICE",
  build:            "ENTERPRISE",
  location_audit:   "ENTERPRISE",
  assets_audit:     "ENTERPRISE",
  fleet:            "ENTERPRISE",
  field_operations: "ENTERPRISE",
  // Legacy aliases
  assets:  "ENTERPRISE",
  audit:   "ENTERPRISE",
  survey:  "ENTERPRISE",
};

function getDeploymentMode(productKey: string): DeploymentMode {
  return DEPLOYMENT_MODE_CONFIG[productKey] ?? "ENTERPRISE";
}

export type RecommendationResult = {
  productKey: OnboardingProductKey;
  productName: string;
  productDescription: string;
  whyItFits: string;
  capabilities: string[];
  isAvailable: boolean;
  pricingReady: boolean;
  deploymentMode: DeploymentMode;
  requiresAssistedOnboarding: boolean;
  assistedOnboardingReason: string | null;
  provisioningManifestKey: string | null;
};

export type RecommendationInput = {
  objectiveId: string;
  quantity: number;
  country: string;
  needsInstallers: boolean;
  needsClientPortal: boolean;
  needsAnalytics: boolean;
  pricingReady?: boolean;
};

const PRODUCT_CAPABILITIES: Record<string, string[]> = {
  retail: [
    "Multi-location project management",
    "Installer submissions with photo evidence",
    "GPS-verified deployment confirmation",
    "AI-assisted photo and evidence validation",
    "Real-time analytics and deployment reporting",
    "Client and stakeholder portal",
    "Automated submission approval workflows",
  ],
  build: [
    "Construction programme management",
    "Site progress tracking",
    "Work package execution",
    "Photo and GPS evidence capture",
    "Compliance and milestone reporting",
  ],
  location_audit: [
    "Structured location auditing",
    "Evidence capture per audit visit",
    "Compliance documentation",
    "Audit trail and reporting",
  ],
  assets_audit: [
    "Field asset auditing and verification",
    "Evidence collection per asset",
    "Compliance and certification workflows",
    "Audit trail reporting",
  ],
  fleet: [
    "Fleet branding and condition tracking",
    "Vehicle identification and GPS tagging",
    "Inspection and verification workflows",
    "Fleet status reporting",
  ],
  field_operations: [
    "Field survey and site management",
    "Mobile data capture",
    "Distributed installation tracking",
    "Response aggregation and reporting",
  ],
  // Legacy aliases
  assets:  ["Asset and fleet management", "Tracking and verification", "Condition reporting"],
  audit:   ["Structured auditing", "Evidence collection", "Compliance documentation"],
  survey:  ["Field data collection", "Survey execution", "Response analysis"],
};

const PRODUCT_FIT_EXPLANATIONS: Record<string, string> = {
  retail:           "Suitable for multi-location deployment programmes requiring installer management, GPS-verified evidence, analytics, and client reporting.",
  build:            "Designed for construction site monitoring with work package management and field evidence collection.",
  location_audit:   "Optimised for structured field auditing of retail outlets and branded locations with evidence capture and compliance documentation.",
  assets_audit:     "Built for asset verification and certification in the field with evidence collection and compliance workflows.",
  fleet:            "Purpose-built for fleet branding campaigns and vehicle condition inspections with GPS tracking.",
  field_operations: "Designed for distributed field programmes including telecom rollouts, billboard installations, and other field-based operations.",
  // Legacy
  assets:  "Built for asset and fleet operations requiring tracking, verification, and condition reporting.",
  audit:   "Optimised for structured field auditing with evidence capture and compliance documentation.",
  survey:  "Designed for field data collection, survey execution, and response analysis.",
};

export function resolveRecommendation(input: RecommendationInput): RecommendationResult {
  const objective = getObjectiveById(input.objectiveId);
  const rawProductKey = objective?.maps_to_product ?? "retail";
  const productKey = resolveProductKey(rawProductKey) as OnboardingProductKey;

  const canonicalProduct = getCanonicalProduct(productKey);
  const productName = canonicalProduct?.productName ?? "Custom DeployIQ Solution";
  const productDescription = canonicalProduct?.description ?? "A tailored DeployIQ solution for your field operations.";
  const pricingReady = input.pricingReady ?? canonicalProduct?.pricingAvailability === "instant_setup";

  if (!pricingReady) {
    return {
      productKey,
      productName,
      productDescription,
      whyItFits: PRODUCT_FIT_EXPLANATIONS[productKey] ?? productDescription,
      capabilities: PRODUCT_CAPABILITIES[productKey] ?? [],
      isAvailable: false,
      pricingReady: false,
      deploymentMode: "ENTERPRISE",
      requiresAssistedOnboarding: true,
      assistedOnboardingReason: STANDARD_PRICING_UNAVAILABLE_REASON,
      provisioningManifestKey: canonicalProduct?.provisioningManifestKey ?? null,
    };
  }

  return {
    productKey,
    productName,
    productDescription,
    whyItFits: PRODUCT_FIT_EXPLANATIONS[productKey] ?? productDescription,
    capabilities: PRODUCT_CAPABILITIES[productKey] ?? [],
    isAvailable: true,
    pricingReady: true,
    deploymentMode: getDeploymentMode(productKey) === "SELF_SERVICE" ? "SELF_SERVICE" : "SELF_SERVICE",
    requiresAssistedOnboarding: false,
    assistedOnboardingReason: null,
    provisioningManifestKey: canonicalProduct?.provisioningManifestKey ?? null,
  };
}

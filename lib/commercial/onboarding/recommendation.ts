/**
 * Deterministic product recommendation service.
 * No external AI calls — logic is transparent and testable.
 * Separated from presentation so an AI adapter can be added later.
 */
import { getCommercialProduct } from "../../commercial/products/catalogue.ts";
import { getObjectiveById } from "./objectives.ts";
import type { OnboardingProductKey } from "./types.ts";

export type DeploymentMode = "SELF_SERVICE" | "ENTERPRISE";

/**
 * Configuration-driven deployment mode per product key.
 * Future products require only an entry here — no UI code changes.
 */
const DEPLOYMENT_MODE_CONFIG: Record<string, DeploymentMode> = {
  retail:              "SELF_SERVICE",
  build:               "ENTERPRISE",
  assets:              "SELF_SERVICE",
  audit:               "SELF_SERVICE",
  survey:              "SELF_SERVICE",
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
  deploymentMode: DeploymentMode;
  requiresAssistedOnboarding: boolean;
  assistedOnboardingReason: string | null;
};

export type RecommendationInput = {
  objectiveId: string;
  quantity: number;
  country: string;
  needsInstallers: boolean;
  needsClientPortal: boolean;
  needsAnalytics: boolean;
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
  assets: [
    "Fleet and asset management",
    "Vehicle branding tracking",
    "Inspection and verification workflows",
    "Asset status and condition reporting",
  ],
  audit: [
    "Field asset auditing",
    "Evidence collection and verification",
    "Compliance documentation",
    "Audit trail reporting",
  ],
  survey: [
    "Field survey management",
    "Mobile data capture",
    "Response aggregation and reporting",
  ],
};

const PRODUCT_FIT_EXPLANATIONS: Record<string, string> = {
  retail:
    "Suitable for multi-location deployment programmes requiring installer management, GPS-verified evidence, analytics, and client reporting.",
  build:
    "Designed for construction site monitoring with work package management and field evidence collection.",
  assets:
    "Built for asset and fleet operations requiring tracking, verification, and condition reporting.",
  audit:
    "Optimised for structured field auditing with evidence capture and compliance documentation.",
  survey:
    "Designed for field data collection, survey execution, and response analysis.",
};

export function resolveRecommendation(input: RecommendationInput): RecommendationResult {
  const objective = getObjectiveById(input.objectiveId);
  const productKey = (objective?.maps_to_product ?? "retail") as OnboardingProductKey;
  const product = getCommercialProduct(productKey);

  if (!product || product.availability !== "available") {
    return {
      productKey,
      productName: product?.product_name ?? "Custom DeployIQ Solution",
      productDescription:
        product?.description ??
        "A tailored DeployIQ solution for your field operations.",
      whyItFits:
        PRODUCT_FIT_EXPLANATIONS[productKey] ??
        "A tailored solution for your field operations programme.",
      capabilities: PRODUCT_CAPABILITIES[productKey] ?? [],
      isAvailable: false,
      deploymentMode: getDeploymentMode(productKey),
      requiresAssistedOnboarding: true,
      assistedOnboardingReason: `${
        product?.product_name ?? "This solution"
      } is not yet available for self-service onboarding. Our team will configure a tailored solution for you.`,
    };
  }

  return {
    productKey,
    productName: product.product_name,
    productDescription: product.description,
    whyItFits:
      PRODUCT_FIT_EXPLANATIONS[productKey] ?? product.description,
    capabilities: PRODUCT_CAPABILITIES[productKey] ?? [],
    isAvailable: true,
    deploymentMode: getDeploymentMode(productKey),
    requiresAssistedOnboarding: false,
    assistedOnboardingReason: null,
  };
}

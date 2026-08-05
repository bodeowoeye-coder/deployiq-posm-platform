/**
 * Canonical DeployIQ product catalogue.
 *
 * Single source of truth used by:
 * - Customer acquisition journey (objective → product key)
 * - Recommendation engine
 * - Pricing Studio template ownership
 * - Commercial plan and checkout
 * - Future CO-1D workspace provisioning manifest
 *
 * No component or service may maintain its own product list.
 */
import type { OnboardingProductKey } from "@/lib/commercial/onboarding/types";

export type PricingAvailability = "instant_setup" | "assisted_setup" | "not_configured";

export type CanonicalProduct = {
  /** Canonical internal identifier. Must match pricing_templates.product_key. */
  productKey: OnboardingProductKey;
  /** Customer-facing product name. */
  productName: string;
  /** Short description used in recommendation UI. */
  description: string;
  /** Objective IDs that map to this product. */
  supportedObjectiveIds: string[];
  /** Pricing metrics supported by this product's templates. */
  supportedPricingMetrics: { value: string; label: string }[];
  /** Default pricing metric for new templates. */
  defaultPricingMetric: string;
  /** Whether a standard self-service pricing path exists. */
  pricingAvailability: PricingAvailability;
  /** Key used by CO-1D provisioning manifest. */
  provisioningManifestKey: string;
  /** Whether this product is visible for new template creation. */
  isActive: boolean;
};

// ---------------------------------------------------------------------------
// Canonical product registry
// ---------------------------------------------------------------------------

const CANONICAL_PRODUCTS: CanonicalProduct[] = [
  {
    productKey: "retail",
    productName: "DeployIQ Retail",
    description: "Plan, execute, verify, approve and report retail deployment activities across multiple locations.",
    supportedObjectiveIds: ["retail_visibility"],
    supportedPricingMetrics: [
      { value: "deployment_location", label: "Deployment location" },
    ],
    defaultPricingMetric: "deployment_location",
    pricingAvailability: "instant_setup",
    provisioningManifestKey: "retail_workspace_manifest",
    isActive: true,
  },
  {
    productKey: "build",
    productName: "DeployIQ Build",
    description: "Operational build and work-package execution management.",
    supportedObjectiveIds: ["construction_monitoring"],
    supportedPricingMetrics: [
      { value: "site",           label: "Site" },
      { value: "project",        label: "Project" },
      { value: "phase",          label: "Phase" },
      { value: "milestone",      label: "Milestone" },
      { value: "managed_value",  label: "Managed value (£/$ amount)" },
    ],
    defaultPricingMetric: "site",
    pricingAvailability: "assisted_setup",
    provisioningManifestKey: "build_workspace_manifest",
    isActive: true,
  },
  {
    productKey: "location_audit",
    productName: "DeployIQ Location Audit",
    description: "Systematically audit retail outlets, branded sites, or field locations.",
    supportedObjectiveIds: ["location_audit"],
    supportedPricingMetrics: [
      { value: "audited_location", label: "Audited location" },
      { value: "audit_visit",      label: "Audit visit" },
    ],
    defaultPricingMetric: "audited_location",
    pricingAvailability: "assisted_setup",
    provisioningManifestKey: "location_audit_workspace_manifest",
    isActive: true,
  },
  {
    productKey: "assets_audit",
    productName: "DeployIQ Assets Audit",
    description: "Audit, verify, and certify deployed assets in the field.",
    supportedObjectiveIds: ["asset_verification"],
    supportedPricingMetrics: [
      { value: "asset",       label: "Asset" },
      { value: "inspection",  label: "Inspection" },
    ],
    defaultPricingMetric: "asset",
    pricingAvailability: "assisted_setup",
    provisioningManifestKey: "assets_audit_workspace_manifest",
    isActive: true,
  },
  {
    productKey: "fleet",
    productName: "DeployIQ Fleet",
    description: "Manage fleet branding campaigns and vehicle condition inspections.",
    supportedObjectiveIds: ["fleet_branding"],
    supportedPricingMetrics: [
      { value: "vehicle", label: "Vehicle" },
    ],
    defaultPricingMetric: "vehicle",
    pricingAvailability: "assisted_setup",
    provisioningManifestKey: "fleet_workspace_manifest",
    isActive: true,
  },
  {
    productKey: "field_operations",
    productName: "DeployIQ Field Operations",
    description: "Coordinate telecom rollouts, billboard installations, and other distributed field programmes.",
    supportedObjectiveIds: ["field_operations"],
    supportedPricingMetrics: [
      { value: "site",          label: "Site" },
      { value: "installation",  label: "Installation" },
      { value: "field_task",    label: "Field task" },
      { value: "project",       label: "Project" },
    ],
    defaultPricingMetric: "site",
    pricingAvailability: "assisted_setup",
    provisioningManifestKey: "field_operations_workspace_manifest",
    isActive: true,
  },
];

// ---------------------------------------------------------------------------
// Legacy product-key compatibility aliases
// Old keys existed before the canonical renaming. These allow existing
// draft_data and template records with old keys to continue resolving.
// ---------------------------------------------------------------------------
export const LEGACY_PRODUCT_KEY_ALIASES: Readonly<Record<string, OnboardingProductKey>> = {
  assets: "assets_audit",
  asset_audit: "assets_audit",
  asset_audits: "assets_audit",
  asset_verification: "assets_audit",
  field_assets: "assets_audit",
  audit:  "location_audit",
  survey: "field_operations",
  // Pricing Studio used non-standard keys — map them to canonical
  "asset-verification":  "assets_audit",
  "fleet-branding":      "fleet",
  "construction":        "build",
  "outdoor-advertising": "location_audit",
  "event-activation":    "field_operations",
} as const;

/** Resolve a product key through legacy aliases to the canonical form. */
export function resolveProductKey(key: string): OnboardingProductKey {
  if (key in LEGACY_PRODUCT_KEY_ALIASES) {
    return LEGACY_PRODUCT_KEY_ALIASES[key];
  }
  return key as OnboardingProductKey;
}

/** Return canonical and legacy database values that resolve to the same product. */
export function getProductKeyLookupVariants(productKey: string): string[] {
  const canonical = resolveProductKey(productKey);
  const legacy = Object.entries(LEGACY_PRODUCT_KEY_ALIASES)
    .filter(([, target]) => target === canonical)
    .map(([alias]) => alias);
  return Array.from(new Set([canonical, ...legacy]));
}

// ---------------------------------------------------------------------------
// Public accessors
// ---------------------------------------------------------------------------

export function getCanonicalProductCatalog(): CanonicalProduct[] {
  return CANONICAL_PRODUCTS.filter((p) => p.isActive);
}

export function getCanonicalProduct(productKey: string): CanonicalProduct | undefined {
  const canonical = resolveProductKey(productKey);
  return CANONICAL_PRODUCTS.find((p) => p.productKey === canonical);
}

/** @deprecated Use getCanonicalProductCatalog() */
export function getCommercialProductCatalog() {
  return CANONICAL_PRODUCTS.map((p) => ({
    product_key: p.productKey,
    product_name: p.productName,
    description: p.description,
    status: p.isActive ? "available" : "coming_soon",
    availability: p.pricingAvailability,
    display_sequence: CANONICAL_PRODUCTS.indexOf(p) + 1,
    pricing_model_key: p.pricingAvailability === "instant_setup" ? "progressive_tiered" : "coming_soon",
    provisioning_service_key: p.provisioningManifestKey,
  }));
}

/** @deprecated Use getCanonicalProduct() */
export function getCommercialProduct(productKey: string) {
  const product = getCanonicalProduct(productKey);
  if (!product) return undefined;
  return {
    product_key: product.productKey,
    product_name: product.productName,
    description: product.description,
    status: product.isActive ? "available" : "coming_soon",
    availability: product.pricingAvailability,
    display_sequence: CANONICAL_PRODUCTS.indexOf(product) + 1,
    pricing_model_key: "progressive_tiered",
    provisioning_service_key: product.provisioningManifestKey,
  };
}

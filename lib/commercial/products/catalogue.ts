import type { CommercialProduct, OnboardingProductKey } from "@/lib/commercial/onboarding/types";

const products: CommercialProduct[] = [
  {
    product_key: "retail",
    product_name: "DeployIQ Retail",
    description: "Plan, execute, verify, approve and report retail deployment activities across multiple locations.",
    status: "available",
    availability: "available",
    display_sequence: 1,
    icon: "store",
    pricing_model_key: "progressive_tiered",
    provisioning_service_key: "retail"
  },
  {
    product_key: "build",
    product_name: "DeployIQ Build",
    description: "Operational build and work package execution management.",
    status: "coming_soon",
    availability: "coming_soon",
    display_sequence: 2,
    icon: "construction",
    pricing_model_key: "coming_soon",
    provisioning_service_key: "coming_soon"
  },
  {
    product_key: "assets",
    product_name: "DeployIQ Assets",
    description: "Asset deployment and inventory operations.",
    status: "coming_soon",
    availability: "coming_soon",
    display_sequence: 3,
    icon: "package",
    pricing_model_key: "coming_soon",
    provisioning_service_key: "coming_soon"
  },
  {
    product_key: "audit",
    product_name: "DeployIQ Audit",
    description: "Audit execution and evidence collection workflows.",
    status: "coming_soon",
    availability: "coming_soon",
    display_sequence: 4,
    icon: "check-circle",
    pricing_model_key: "coming_soon",
    provisioning_service_key: "coming_soon"
  },
  {
    product_key: "survey",
    product_name: "DeployIQ Survey",
    description: "Survey capture and field verification.",
    status: "coming_soon",
    availability: "coming_soon",
    display_sequence: 5,
    icon: "clipboard",
    pricing_model_key: "coming_soon",
    provisioning_service_key: "coming_soon"
  }
];

export function getCommercialProductCatalog(): CommercialProduct[] {
  return products.slice().sort((a, b) => a.display_sequence - b.display_sequence);
}

export function getCommercialProduct(productKey: OnboardingProductKey): CommercialProduct | undefined {
  return products.find((product) => product.product_key === productKey);
}

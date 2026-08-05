/**
 * Business objectives catalog.
 * Maps customer-facing outcomes to canonical internal product keys.
 * Single source of truth — never scattered into components.
 */

export const BUSINESS_OBJECTIVES = [
  {
    id: "retail_visibility",
    label: "Launch a retail visibility campaign",
    description: "Deploy branded materials or activations across multiple retail locations.",
    emoji: "🏪",
    maps_to_product: "retail" as const,
  },
  {
    id: "construction_monitoring",
    label: "Monitor construction progress",
    description: "Track site progress with photo evidence, milestones, and reporting.",
    emoji: "🏗️",
    maps_to_product: "build" as const,
  },
  {
    id: "location_audit",
    label: "Conduct a retail or location audit",
    description: "Systematically audit retail outlets, branded sites, or field locations.",
    emoji: "📋",
    maps_to_product: "location_audit" as const,
  },
  {
    id: "asset_verification",
    label: "Verify field assets",
    description: "Audit, verify, and certify deployed assets in the field.",
    emoji: "📦",
    maps_to_product: "assets_audit" as const,
  },
  {
    id: "fleet_branding",
    label: "Brand or inspect a vehicle fleet",
    description: "Manage fleet branding campaigns and condition inspections.",
    emoji: "🚚",
    maps_to_product: "fleet" as const,
  },
  {
    id: "field_operations",
    label: "Manage other field operations",
    description: "Telecom rollouts, billboard installations and other distributed field programmes.",
    emoji: "📍",
    maps_to_product: "field_operations" as const,
  },
] as const;

export type BusinessObjectiveId = (typeof BUSINESS_OBJECTIVES)[number]["id"];

export type BusinessObjective = (typeof BUSINESS_OBJECTIVES)[number];

export function getObjectiveById(id: string): BusinessObjective | undefined {
  return BUSINESS_OBJECTIVES.find((o) => o.id === id) as BusinessObjective | undefined;
}

/**
 * Resolve a customer objective ID to a canonical product key.
 * Returns null for unknown IDs rather than silently defaulting.
 */
export function objectiveToProductKey(objectiveId: string): string | null {
  const obj = getObjectiveById(objectiveId);
  return obj?.maps_to_product ?? null;
}

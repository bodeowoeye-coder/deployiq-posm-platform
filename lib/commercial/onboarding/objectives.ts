/**
 * Business objectives catalog.
 * Maps customer-facing outcomes to internal product keys.
 * Single source of truth — never scattered into components.
 */

export const BUSINESS_OBJECTIVES = [
  {
    id: "retail_visibility",
    label: "Launch a retail visibility campaign",
    description: "Deploy branded materials or activations across multiple retail locations.",
    emoji: "🏪",
    maps_to_product: "retail",
  },
  {
    id: "location_audit",
    label: "Conduct retail or location audits",
    description: "Systematically audit retail outlets, branded sites, or field locations.",
    emoji: "📋",
    maps_to_product: "retail",
  },
  {
    id: "construction_monitoring",
    label: "Monitor construction progress",
    description: "Track site progress with photo evidence, milestones, and reporting.",
    emoji: "🏗️",
    maps_to_product: "build",
  },
  {
    id: "fleet_branding",
    label: "Brand or inspect a vehicle fleet",
    description: "Manage fleet branding campaigns and condition inspections.",
    emoji: "🚚",
    maps_to_product: "assets",
  },
  {
    id: "asset_verification",
    label: "Verify field assets",
    description: "Audit, verify, and certify deployed assets in the field.",
    emoji: "📦",
    maps_to_product: "audit",
  },
  {
    id: "field_operations",
    label: "Manage another field operation",
    description: "Coordinate any other field-based operational programme.",
    emoji: "📍",
    maps_to_product: "survey",
  },
] as const;

export type BusinessObjectiveId = (typeof BUSINESS_OBJECTIVES)[number]["id"];

export type BusinessObjective = (typeof BUSINESS_OBJECTIVES)[number];

export function getObjectiveById(id: string): BusinessObjective | undefined {
  return BUSINESS_OBJECTIVES.find((o) => o.id === id) as BusinessObjective | undefined;
}

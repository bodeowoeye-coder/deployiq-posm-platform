/**
 * Workspace capability catalogue.
 * No React dependencies — fully testable with node --test.
 */

export const WORKSPACE_CAPABILITIES = [
  {
    id: "fieldEvidence",
    label: "Field evidence collection",
    description: "Field teams will capture photos, GPS and deployment evidence.",
  },
  {
    id: "clientVisibility",
    label: "Client visibility",
    description: "Customers and stakeholders need live progress and reporting.",
  },
  {
    id: "aiValidation",
    label: "AI-assisted validation",
    description: "Automatically verify field evidence and improve submission quality.",
  },
  {
    id: "projectAnalytics",
    label: "Project analytics",
    description: "Monitor programme performance and completion in real time.",
  },
  {
    id: "approvalWorkflow",
    label: "Approval workflow",
    description: "Review and approve field submissions before they become official.",
  },
  {
    id: "offlineOperation",
    label: "Offline field operation",
    description: "Allow field teams to continue working without internet access.",
  },
] as const;

export type WorkspaceCapabilityId = (typeof WORKSPACE_CAPABILITIES)[number]["id"];

/**
 * Convert the new capability ID array to legacy boolean fields used by
 * the recommendation API and draft persistence.
 */
export function legacyCapabilityFlags(capabilities: string[]): {
  needsInstallers: boolean;
  needsClientPortal: boolean;
  needsAnalytics: boolean;
} {
  return {
    needsInstallers:   capabilities.includes("fieldEvidence"),
    needsClientPortal: capabilities.includes("clientVisibility"),
    needsAnalytics:    capabilities.includes("projectAnalytics"),
  };
}

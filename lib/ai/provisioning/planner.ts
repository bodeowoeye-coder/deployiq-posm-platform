import { randomUUID } from "node:crypto";
import type { TrustedProvisioningContext } from "./context.ts";
import type { ProvisioningPlan } from "./schema.ts";

export interface ProvisioningPlannerProvider { readonly provider: string; readonly model: string; readonly version: string; readonly promptSchemaVersion: string; createPlan(context: TrustedProvisioningContext): Promise<ProvisioningPlan>; }

export function createDeterministicBaseline(context: TrustedProvisioningContext): ProvisioningPlan {
  return {
    schemaVersion: "1", planId: randomUUID(), acquisitionDraftId: context.acquisitionDraftId, authenticatedOwnerId: context.authenticatedOwnerId, contextHash: context.contextHash, manifestVersion: context.manifest.version,
    customer: { ...context.customer }, commercial: { ...context.commercial, approvedCapabilities: [...context.commercial.approvedCapabilities] }, workspace: { ...context.workspace },
    administration: { verifiedAdministratorUserId: context.verifiedAdministrator.userId, verifiedAdministratorEmail: context.verifiedAdministrator.email, role: "customer_admin" },
    configuration: { modules: [...context.manifest.permittedModules], navigation: [...context.manifest.permittedNavigation], roles: [...context.manifest.permittedRoles], statuses: [...context.manifest.permittedStatuses], reportingDefaults: [...context.manifest.permittedReports], notificationDefaults: [...context.manifest.permittedNotifications], checklist: [...context.manifest.permittedChecklist] },
    interpretation: { summary: `A ${context.commercial.productKey} workspace for ${context.customer.organisation} in ${context.customer.country}, configured for ${context.customer.deploymentScale} deployment locations.`, rationale: ["Configuration follows the approved commercial plan and versioned product manifest."], humanReviewRecommended: false },
    decisions: [{ code: "retail_manifest_configuration", classification: "deterministic", source: context.manifest.key, rationale: "Configuration is constrained to the approved commercial plan and versioned Retail manifest." }],
    warnings: [], approval: { required: false, reasons: [] },
  };
}

export class DeterministicFallbackProvider implements ProvisioningPlannerProvider {
  readonly provider = "deterministic";
  readonly model = "retail-manifest";
  readonly version = "deterministic-fallback-v1";
  readonly promptSchemaVersion = "provisioning-plan-v2";
  async createPlan(context: TrustedProvisioningContext) { return createDeterministicBaseline(context); }
}

import { createHash } from "node:crypto";
import type { OnboardingDraft } from "../../commercial/onboarding/types.ts";
import type { ProvisioningEligibilityResult } from "../../acquisition/provisioning/validation.ts";
import { enabledRetailModulesForCapabilities, getRetailWorkspaceManifest, retailNavigationForCapabilities } from "../../acquisition/provisioning/retailManifest.ts";

type Eligible = Extract<ProvisioningEligibilityResult, { ok: true }>;

export type TrustedProvisioningContext = {
  schemaVersion: "1";
  acquisitionDraftId: string;
  authenticatedOwnerId: string;
  verifiedAdministrator: { userId: string; email: string; name: string };
  customer: { organisation: string; country: string; industry: string; operationalObjective: string; deploymentScale: number };
  commercial: { productKey: string; commercialModel: string; quantity: number; currency: string; approvedCapabilities: string[]; commercialReference: string };
  workspace: { type: string; displayName: string; requestedSlug: string; country: string; timezone: string };
  manifest: { key: string; version: string; permittedModules: string[]; permittedNavigation: string[]; permittedRoles: string[]; permittedStatuses: string[]; permittedReports: string[]; permittedNotifications: string[]; permittedChecklist: string[] };
  contextHash: string;
};

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function buildTrustedProvisioningContext(draft: OnboardingDraft, eligibility: Eligible): TrustedProvisioningContext {
  const data = draft.draft_data ?? {};
  const manifest = getRetailWorkspaceManifest();
  const capabilities = Array.isArray(data.capabilities) ? data.capabilities.filter((item): item is string => typeof item === "string") : [];
  const base = {
    schemaVersion: "1" as const,
    acquisitionDraftId: draft.id,
    authenticatedOwnerId: text(draft.authenticated_user_id),
    verifiedAdministrator: { userId: text(draft.authenticated_user_id), email: text(data.adminEmail).toLowerCase(), name: [text(data.adminFirstName), text(data.adminLastName)].filter(Boolean).join(" ") },
    customer: { organisation: text(data.organisationName), country: text(data.country), industry: text(data.industry), operationalObjective: text(data.objectiveId), deploymentScale: eligibility.quotation.quantity },
    commercial: { productKey: eligibility.productKey, commercialModel: eligibility.quotation.commercialModel ?? "one_time_programme", quantity: eligibility.quotation.quantity, currency: eligibility.quotation.currency, approvedCapabilities: capabilities, commercialReference: eligibility.commercialReference },
    workspace: { type: manifest.identity.productFamily, displayName: text(data.workspaceName) || text(data.organisationName), requestedSlug: eligibility.workspaceSlug, country: text(data.country), timezone: text(data.timezone) || manifest.defaults.timezone },
    manifest: {
      key: manifest.identity.manifestKey, version: manifest.identity.manifestVersion,
      permittedModules: enabledRetailModulesForCapabilities(capabilities),
      permittedNavigation: retailNavigationForCapabilities(capabilities).map((item) => item.key),
      permittedRoles: manifest.roles.map((item) => item.key),
      permittedStatuses: Object.entries(manifest.statuses).flatMap(([category, statuses]) => statuses.map((item) => `${category}:${item.key}`)),
      permittedReports: manifest.starterData.reports.map((item) => item.key),
      permittedNotifications: manifest.starterData.notifications.map((item) => item.key),
      permittedChecklist: manifest.starterData.checklist.map((item) => item.key),
    },
  };
  return { ...base, contextHash: createHash("sha256").update(stable(base)).digest("hex") };
}

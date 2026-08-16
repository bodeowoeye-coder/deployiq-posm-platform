import type { TrustedProvisioningContext } from "./context.ts";
import type { PlanDifference, PlanValidation, ProvisioningPlan } from "./schema.ts";

function same(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b); }
function subset(values: string[], permitted: string[]) { const allowed = new Set(permitted); return values.every((item) => allowed.has(item)); }

export function validateProvisioningPlan(plan: ProvisioningPlan, context: TrustedProvisioningContext): PlanValidation {
  const reasons: string[] = [];
  if (plan.schemaVersion !== "1" || plan.contextHash !== context.contextHash) reasons.push("stale_or_unknown_context");
  if (plan.acquisitionDraftId !== context.acquisitionDraftId) reasons.push("acquisition_identity_changed");
  if (plan.authenticatedOwnerId !== context.authenticatedOwnerId) reasons.push("authenticated_owner_changed");
  if (plan.administration.verifiedAdministratorUserId !== context.verifiedAdministrator.userId || plan.administration.verifiedAdministratorEmail !== context.verifiedAdministrator.email) reasons.push("administrator_identity_changed");
  if (plan.commercial.productKey !== context.commercial.productKey) reasons.push("product_changed");
  if (plan.commercial.quantity !== context.commercial.quantity) reasons.push("quantity_changed");
  if (plan.commercial.currency !== context.commercial.currency || plan.commercial.commercialReference !== context.commercial.commercialReference || plan.commercial.commercialModel !== context.commercial.commercialModel) reasons.push("commercial_authority_changed");
  if (!same(plan.commercial.approvedCapabilities, context.commercial.approvedCapabilities)) reasons.push("capabilities_changed");
  if (plan.manifestVersion !== context.manifest.version) reasons.push("manifest_version_changed");
  if (plan.workspace.requestedSlug !== context.workspace.requestedSlug || plan.workspace.displayName !== context.workspace.displayName) reasons.push("workspace_identity_changed");
  for (const [values, permitted, code] of [[plan.configuration.modules, context.manifest.permittedModules, "unknown_module"], [plan.configuration.navigation, context.manifest.permittedNavigation, "unknown_navigation"], [plan.configuration.roles, context.manifest.permittedRoles, "unknown_role"], [plan.configuration.statuses, context.manifest.permittedStatuses, "unknown_status"], [plan.configuration.reportingDefaults, context.manifest.permittedReports, "unknown_report"], [plan.configuration.notificationDefaults, context.manifest.permittedNotifications, "unknown_notification"], [plan.configuration.checklist, context.manifest.permittedChecklist, "unknown_checklist"]] as const) if (!subset(values, permitted)) reasons.push(code);
  return { status: reasons.length ? "rejected" : plan.approval.required ? "approval_required" : plan.warnings.length ? "warning" : "valid", reasons };
}

export function compareProvisioningPlans(proposed: ProvisioningPlan, baseline: ProvisioningPlan): PlanDifference[] {
  const differences: PlanDifference[] = [];
  if (proposed.acquisitionDraftId !== baseline.acquisitionDraftId || proposed.authenticatedOwnerId !== baseline.authenticatedOwnerId || !same(proposed.administration, baseline.administration)) differences.push({ path: "identity", classification: "security_sensitive_difference" });
  if (!same(proposed.commercial, baseline.commercial)) differences.push({ path: "commercial", classification: "commercial_difference" });
  if (!same(proposed.configuration, baseline.configuration)) differences.push({ path: "configuration", classification: "unsupported_difference" });
  if (!same(proposed.interpretation, baseline.interpretation) || !same(proposed.decisions, baseline.decisions) || !same(proposed.warnings, baseline.warnings)) differences.push({ path: "explanation", classification: "explanation_only_difference" });
  return differences.length ? differences : [{ path: "$", classification: "exact_match" }];
}

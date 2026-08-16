export type PlanDecision = { code: string; classification: "deterministic" | "ai_assisted" | "human"; source: string; rationale: string };
export type PlanInterpretation = { summary: string; rationale: string[]; humanReviewRecommended: boolean };
export type ProvisioningPlan = {
  schemaVersion: "1"; planId: string; acquisitionDraftId: string; authenticatedOwnerId: string; contextHash: string; manifestVersion: string;
  customer: { organisation: string; country: string; industry: string; operationalObjective: string; deploymentScale: number };
  commercial: { productKey: string; commercialModel: string; quantity: number; currency: string; approvedCapabilities: string[]; commercialReference: string };
  workspace: { type: string; displayName: string; requestedSlug: string; country: string; timezone: string };
  administration: { verifiedAdministratorUserId: string; verifiedAdministratorEmail: string; role: "customer_admin" };
  configuration: { modules: string[]; navigation: string[]; roles: string[]; statuses: string[]; reportingDefaults: string[]; notificationDefaults: string[]; checklist: string[] };
  interpretation: PlanInterpretation; decisions: PlanDecision[]; warnings: string[]; approval: { required: boolean; reasons: string[] };
};
export type PlanValidation = { status: "valid" | "warning" | "approval_required" | "rejected"; reasons: string[] };
export type PlanDifference = { path: string; classification: "exact_match" | "explanation_only_difference" | "optional_default_difference" | "unsupported_difference" | "commercial_difference" | "security_sensitive_difference" };
export type ShadowPlanningResult = { status: "completed" | "fallback" | "rejected" | "failed"; proposedPlan: ProvisioningPlan | null; baselinePlan: ProvisioningPlan; differences: PlanDifference[]; validation: PlanValidation; provider: string; model: string; providerVersion: string; promptSchemaVersion: string; generatedAt: string; generationDurationMs: number; fallbackUsed: boolean; providerFailureCode?: string; providerValidation?: PlanValidation; providerDifferences?: PlanDifference[] };

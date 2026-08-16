import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildTrustedProvisioningContext } from "../lib/ai/provisioning/context.ts";
import { getProvisioningAgentFlags, shouldRunProvisioningShadow } from "../lib/ai/provisioning/flags.ts";
import { createDeterministicBaseline } from "../lib/ai/provisioning/planner.ts";
import { compareProvisioningPlans, validateProvisioningPlan } from "../lib/ai/provisioning/policy.ts";
import { runProvisioningShadow } from "../lib/ai/provisioning/shadow.ts";

function context() {
  const draft = {
    id: "draft-owner", resume_token: "SECRET_RESUME", email: "admin@example.com", status: "provisioning_pending", current_step: "provisioning",
    draft_data: { organisationName: "Example", country: "Nigeria", industry: "Retail", objectiveId: "retail_visibility", workspaceName: "Example Workspace", timezone: "Africa/Lagos", adminFirstName: "Ada", adminLastName: "Admin", adminEmail: "admin@example.com", capabilities: ["fieldEvidence"], password: "SECRET_PASSWORD", otpHash: "SECRET_OTP", accountSetupLink: "SECRET_LINK", accessToken: "SECRET_ACCESS", refreshToken: "SECRET_REFRESH" },
    selected_product: "retail", pricing_snapshot_id: null, authenticated_user_id: "user-owner", expires_at: null, last_updated_at: null, completed_at: null, abandoned_at: null, failure_reason: null, created_at: "",
  };
  const eligibility = { ok: true, productKey: "retail", workspaceSlug: "example", commercialReference: "COMM-1", quotation: { productKey: "retail", pricingTemplateId: "tpl", pricingTemplateName: "Retail", currency: "NGN", quantity: 100, estimatedTotal: 1, subtotal: 1, discountAmount: 0, discountPercentage: 0, discountLabel: null, pricingMethodLabel: "Standard", pricingExplanation: "Standard", includedAdminUsers: 1, requiresEnterpriseReview: false, quotationExpiry: null, calculatedAt: "", tierBreakdown: [], commercialModel: "one_time_programme", billingBehaviour: "single_payment", renewalRequired: false, allowedPaymentMethods: ["card"] } };
  return buildTrustedProvisioningContext(draft, eligibility);
}

test("shadow context is server-derived and excludes all credentials and resume authority", () => {
  const trusted = context();
  const serialized = JSON.stringify(trusted);
  for (const forbidden of ["resumeToken", "resume_token", "accessToken", "refreshToken", "password", "otp", "setupLink", "recoveryLink", "SECRET_"]) assert.doesNotMatch(serialized, new RegExp(forbidden, "i"));
  assert.equal(trusted.acquisitionDraftId, "draft-owner");
  assert.equal(trusted.authenticatedOwnerId, "user-owner");
});

test("deterministic baseline uses the typed Retail manifest shape", () => {
  const trusted = context();
  const plan = createDeterministicBaseline(trusted);
  assert.equal(plan.commercial.productKey, "retail");
  assert.equal(plan.contextHash, trusted.contextHash);
  assert.ok(plan.configuration.modules.includes("dashboard"));
  assert.equal(validateProvisioningPlan(plan, trusted).status, "valid");
  assert.equal(compareProvisioningPlans(plan, plan)[0].classification, "exact_match");
});

for (const [name, mutate, reason] of [
  ["product", (plan) => { plan.commercial.productKey = "fleet"; }, "product_changed"],
  ["quantity", (plan) => { plan.commercial.quantity += 1; }, "quantity_changed"],
  ["currency", (plan) => { plan.commercial.currency = "USD"; }, "commercial_authority_changed"],
  ["capabilities", (plan) => { plan.commercial.approvedCapabilities.push("unsupported"); }, "capabilities_changed"],
  ["administrator", (plan) => { plan.administration.verifiedAdministratorUserId = "other"; }, "administrator_identity_changed"],
  ["owner", (plan) => { plan.authenticatedOwnerId = "other"; }, "authenticated_owner_changed"],
  ["context hash", (plan) => { plan.contextHash = "stale"; }, "stale_or_unknown_context"],
  ["manifest key", (plan) => { plan.configuration.modules.push("unknown_module"); }, "unknown_module"],
  ["acquisition", (plan) => { plan.acquisitionDraftId = "unrelated"; }, "acquisition_identity_changed"],
]) test(`policy rejects AI changes to ${name}`, () => {
  const trusted = context(); const plan = createDeterministicBaseline(trusted); mutate(plan);
  const validation = validateProvisioningPlan(plan, trusted);
  assert.equal(validation.status, "rejected"); assert.ok(validation.reasons.includes(reason));
});

test("provider failure falls back safely without blocking deterministic authority", async () => {
  const result = await runProvisioningShadow(context(), { version: "failing-provider", async createPlan() { throw new Error("secret provider detail"); } });
  assert.equal(result.status, "fallback");
  assert.equal(result.validation.status, "valid");
  assert.equal(result.errorCode, "planner_unavailable");
  assert.doesNotMatch(JSON.stringify(result), /secret provider detail/);
});

test("execution remains structurally disabled and flags fail closed", () => {
  const previous = { ...process.env };
  process.env.DEPLOYIQ_PROVISIONING_AGENT_ENABLED = "1";
  process.env.DEPLOYIQ_PROVISIONING_AGENT_MODE = "shadow";
  process.env.DEPLOYIQ_PROVISIONING_AGENT_PRODUCTS = "retail";
  process.env.DEPLOYIQ_PROVISIONING_AGENT_EXECUTION_ENABLED = "1";
  assert.equal(shouldRunProvisioningShadow("retail"), true);
  assert.equal(getProvisioningAgentFlags().executionEnabled, false);
  process.env = previous;
});

test("AI modules contain no Supabase client or unrestricted database writes", () => {
  for (const file of ["context.ts", "flags.ts", "planner.ts", "policy.ts", "schema.ts", "shadow.ts"]) {
    const source = readFileSync(new URL(`../lib/ai/provisioning/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /createAdminSupabase|createClient|supabase|\.from\(["']|\.insert\(\{|\.update\(\{|\.delete\(\)|\.rpc\(["']/i);
  }
});

test("disabled Shadow Mode leaves the existing provisioning path authoritative", () => {
  const service = readFileSync(new URL("../lib/acquisition/provisioning/service.ts", import.meta.url), "utf8");
  assert.match(service, /if \(shouldRunProvisioningShadow\(eligibility\.productKey\)\)/);
  assert.match(service, /provisionRetailWorkspaceReference/);
  assert.doesNotMatch(service, /execute.*proposedPlan|provision.*proposedPlan/i);
});

test("customer handoff receives and retains the persisted Shadow result before workspace launch", () => {
  const route = readFileSync(new URL("../app/api/acquisition/provision/route.ts", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../components/onboarding/OnboardingShell.tsx", import.meta.url), "utf8");
  const boundary = readFileSync(new URL("../components/onboarding/ProvisionBoundaryStep.tsx", import.meta.url), "utf8");
  assert.match(route, /shadowPlanning: result\.job\.result_data\.shadowPlanning \?\? null/);
  assert.match(shell, /setShadowPlanning\(payload\.shadowPlanning \?\? null\)/);
  assert.match(shell, /setProvisioningJob\(payload\.job \?\? null\)/);
  assert.match(boundary, /DeployIQ AI is preparing your workspace/);
  assert.match(boundary, /DeployIQ AI plan validated/);
  assert.match(boundary, /Continue with Workspace Setup/);
  assert.match(boundary, /planAcknowledged/);
  assert.match(boundary, /hasCompletedBackendResult/);
  assert.match(boundary, /deterministicCompleted/);
  assert.doesNotMatch(boundary, /setActiveStep|stepTimer/);
});

test("completed localhost provisioning exposes only the existing tenant-checked admin route", () => {
  const route = readFileSync(new URL("../app/api/acquisition/provision/route.ts", import.meta.url), "utf8");
  const activation = readFileSync(new URL("../app/workspace/activation/page.tsx", import.meta.url), "utf8");
  assert.match(route, /process\.env\.NODE_ENV === "development"/);
  assert.match(route, /result\.workspaceDestination\?\.adminWorkspaceUrl/);
  assert.match(activation, /getProvisioningJobForDraft\(draft\.id\)/);
  assert.match(activation, /completedJob\?\.status === "completed" && adminWorkspaceUrl/);
  assert.doesNotMatch(activation, /DEPLOYIQ_WORKSPACE_WILDCARD_ROUTING_ENABLED/);
});

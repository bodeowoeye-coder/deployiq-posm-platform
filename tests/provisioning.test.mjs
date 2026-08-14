import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { validateProvisioningEligibility, validateProvisioningProductChain } from "../lib/acquisition/provisioning/validation.ts";
import { buildProvisioningFailureMetadata } from "../lib/acquisition/provisioning/failure.ts";
import { getProductProvisioningManifest, isProvisioningBlueprintEnabled } from "../lib/acquisition/provisioning/registry.ts";
import {
  assertRetailWorkspaceAccess,
  buildRetailEntitlement,
  enabledRetailModulesForCapabilities,
  getRetailWorkspaceManifest,
  retailNavigationForCapabilities,
} from "../lib/acquisition/provisioning/retailManifest.ts";
import { buildRetailHealthChecks } from "../lib/acquisition/provisioning/retailWorkspace.ts";
import { verifyWorkspaceDestination } from "../lib/acquisition/provisioning/workspaceDestination.ts";

function makeQuotation(overrides = {}) {
  return {
    productKey: "retail",
    pricingTemplateId: "tpl-retail",
    pricingTemplateName: "Retail Standard",
    currency: "NGN",
    quantity: 1000,
    estimatedTotal: 500000,
    subtotal: 500000,
    discountAmount: 0,
    discountPercentage: 0,
    discountLabel: null,
    pricingMethodLabel: "Standard progressive pricing",
    pricingExplanation: "All 1,000 deployment locations are charged at one rate.",
    includedAdminUsers: 5,
    requiresEnterpriseReview: false,
    quotationExpiry: new Date(Date.now() + 86400000).toISOString(),
    calculatedAt: new Date().toISOString(),
    tierBreakdown: [],
    commercialModel: "one_time_programme",
    billingBehaviour: "single_payment",
    renewalRequired: false,
    allowedPaymentMethods: ["card", "bank_transfer"],
    ...overrides,
  };
}

function makeDraft(overrides = {}) {
  const quotation = makeQuotation(overrides.quotation ?? {});
  const { draft_data: draftDataOverrides, quotation: _quotation, ...rootOverrides } = overrides;
  return {
    id: "draft-1",
    resume_token: "token-1",
    selected_product: "retail",
    pricing_snapshot_id: null,
    authenticated_user_id: null,
    status: "payment_complete",
    current_step: "provisioning",
    failure_reason: null,
    created_at: new Date().toISOString(),
    draft_data: {
      objectiveId: "retail_visibility",
      recommendedProductKey: "retail",
      confirmedQuotation: quotation,
      commercialReference: "DQ-QT-2026-ABC123",
      workspaceSlug: "example-workspace",
      paymentStatus: "succeeded",
      commercialStatus: "payment_verified",
      paymentMethod: "card",
      readyForProvisioning: true,
      ...draftDataOverrides,
    },
    ...rootOverrides,
  };
}

test("provisioning: product-chain mismatch is rejected", () => {
  const draft = makeDraft({
    draft_data: {
      objectiveId: "retail_visibility",
      recommendedProductKey: "retail",
      confirmedQuotation: makeQuotation({ productKey: "fleet" }),
    },
  });
  const result = validateProvisioningEligibility(draft);
  assert.equal(result.ok, false);
  assert.equal(result.code, "product_chain_mismatch");
});

test("provisioning: product-chain validator accepts matching canonical keys", () => {
  const draft = makeDraft();
  const result = validateProvisioningProductChain(draft, draft.draft_data.confirmedQuotation);
  assert.equal(result.ok, true);
  assert.equal(result.productKey, "retail");
});

test("provisioning: failure metadata persists failed safe stage and code", () => {
  const failure = buildProvisioningFailureMetadata(
    { current_stage: "configuring_product" },
    { code: "42703", message: "column brands.client_id does not exist" }
  );
  assert.equal(failure.failureCode, "42703");
  assert.equal(failure.failureMessage, "column brands.client_id does not exist");
  assert.equal(failure.failedSafeStage, "configuring_product");
  assert.equal(failure.retryable, true);
});

test("provisioning: retry path reuses existing job by acquisition draft", () => {
  const source = readFileSync(new URL("../lib/acquisition/provisioning/service.ts", import.meta.url), "utf8");
  assert.match(source, /\.eq\("acquisition_draft_id", input\.draftId\)/);
  assert.match(source, /if \(existing\) return normaliseJob/);
});

test("provisioning: Set up my workspace marks activation state before job execution", () => {
  const source = readFileSync(new URL("../lib/acquisition/provisioning/service.ts", import.meta.url), "utf8");
  assert.match(source, /status: "provisioning"/);
  assert.match(source, /currentStep: "success"/);
  assert.match(source, /activationStartedAt/);
  assert.match(source, /provisioningStatus: "running"/);
  assert.ok(source.indexOf('status: "provisioning"') < source.indexOf("let job = await createOrResumeJob"));
});

test("provisioning: completed job returns without incrementing attempts", () => {
  const source = readFileSync(new URL("../lib/acquisition/provisioning/service.ts", import.meta.url), "utf8");
  assert.match(source, /if \(job\.status === "completed"\)/);
  assert.ok(source.indexOf('if (job.status === "completed")') < source.indexOf("job = await incrementAttempt(job)"));
});

test("provisioning: retail product provisioning tolerates live schema without duplicate resources", () => {
  const source = readFileSync(new URL("../lib/commercial/provisioning/products/retail.ts", import.meta.url), "utf8");
  assert.match(source, /eq\("name", input\.projectName\)/);
  assert.match(source, /campaign: input\.campaignName/);
  assert.match(source, /client_projects/);
  assert.match(source, /!isMissingSchemaObject\(linkResult\.error\)/);
});

test("provisioning: successful provisioning reaches completed stage", () => {
  const source = readFileSync(new URL("../lib/acquisition/provisioning/service.ts", import.meta.url), "utf8");
  assert.match(source, /updateJob\(job, "completed"/);
  assert.match(source, /status: "provisioned"/);
  assert.match(source, /workspaceUrl: job\.result_data\.workspaceUrl/);
  assert.match(source, /adminWorkspaceUrl: job\.result_data\.adminWorkspaceUrl/);
});

test("provisioning: Retail does not redirect to an unverified hostname", () => {
  const previous = process.env.DEPLOYIQ_WORKSPACE_WILDCARD_ROUTING_ENABLED;
  delete process.env.DEPLOYIQ_WORKSPACE_WILDCARD_ROUTING_ENABLED;
  const destination = verifyWorkspaceDestination("acme-ltd");
  if (previous !== undefined) process.env.DEPLOYIQ_WORKSPACE_WILDCARD_ROUTING_ENABLED = previous;
  assert.equal(destination.workspaceUrl, "https://acme-ltd.deployiq.ng");
  assert.equal(destination.adminWorkspaceUrl, "/workspace/admin?workspace=acme-ltd");
  assert.equal(destination.deploymentReady, false);
  assert.equal(destination.redirectAllowed, false);
});

test("provisioning: wildcard routing must be explicitly confirmed before redirect", () => {
  const previous = process.env.DEPLOYIQ_WORKSPACE_WILDCARD_ROUTING_ENABLED;
  process.env.DEPLOYIQ_WORKSPACE_WILDCARD_ROUTING_ENABLED = "true";
  const destination = verifyWorkspaceDestination("acme-ltd");
  if (previous === undefined) delete process.env.DEPLOYIQ_WORKSPACE_WILDCARD_ROUTING_ENABLED;
  else process.env.DEPLOYIQ_WORKSPACE_WILDCARD_ROUTING_ENABLED = previous;
  assert.equal(destination.redirectAllowed, true);
  assert.equal(destination.deploymentReady, true);
});

test("provisioning: API exposes workspace readiness before browser redirect", () => {
  const route = readFileSync(new URL("../app/api/acquisition/provision/route.ts", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../components/onboarding/OnboardingShell.tsx", import.meta.url), "utf8");
  assert.match(route, /workspaceReady: result\.workspaceReady/);
  assert.match(route, /adminWorkspaceUrl: result\.adminWorkspaceUrl/);
  assert.match(shell, /payload\.workspaceReady === true/);
  assert.match(shell, /payload\.adminWorkspaceUrl/);
  assert.match(shell, /window\.location\.assign\(launchUrl\)/);
  assert.doesNotMatch(shell, /window\.location\.assign\(payload\.workspaceUrl\)/);
});

test("provisioning: activation destination is DeployIQ Admin Workspace, not client dashboard", () => {
  const destination = verifyWorkspaceDestination("acme-ltd");
  const authSource = readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8");
  const adminShell = readFileSync(new URL("../components/workspace/CustomerWorkspaceShell.tsx", import.meta.url), "utf8");
  assert.equal(destination.adminWorkspaceUrl, "/workspace/admin?workspace=acme-ltd");
  assert.notEqual(destination.adminWorkspaceUrl, "/client");
  assert.match(authSource, /normalized === "\/workspace\/admin"/);
  assert.match(adminShell, /DeployIQ Admin Workspace/);
});

test("provisioning: activation boundary shows staged progress and delayed fallback", () => {
  const boundary = readFileSync(new URL("../components/onboarding/ProvisionBoundaryStep.tsx", import.meta.url), "utf8");
  assert.match(boundary, /Creating organisation/);
  assert.match(boundary, /Configuring administrator account/);
  assert.match(boundary, /Preparing workspace URL/);
  assert.match(boundary, /Applying subscription/);
  assert.match(boundary, /Finalising workspace/);
  assert.match(boundary, /Your DeployIQ workspace is almost ready/);
  assert.match(boundary, /We’re preparing your DeployIQ workspace in the background/);
  assert.match(boundary, /We’ve sent a confirmation email containing a secure link/);
  assert.match(boundary, /Continue to Workspace/);
  assert.match(boundary, /Notify me when ready/);
  assert.match(boundary, /Notification requested/);
  assert.match(boundary, /We’ll email you as soon as your DeployIQ workspace is ready/);
  assert.doesNotMatch(boundary, /Return to activation summary/);
});

test("provisioning: pending account resumes activation status instead of Set up my workspace", () => {
  const shell = readFileSync(new URL("../components/onboarding/OnboardingShell.tsx", import.meta.url), "utf8");
  const boundary = readFileSync(new URL("../components/onboarding/ProvisionBoundaryStep.tsx", import.meta.url), "utf8");
  assert.match(shell, /activationStartedAt/);
  assert.match(shell, /provisioningJobId/);
  assert.match(shell, /setActivationStarted\(hasStartedActivation && provisioningStatus !== "completed"\)/);
  assert.match(boundary, /const \[provisioningStarted, setProvisioningStarted\] = useState\(activationStarted\)/);
  assert.match(boundary, /Preparing your DeployIQ workspace/);
  assert.match(boundary, /Your DeployIQ workspace is almost ready/);
});

test("provisioning: never-started paid account alone sees Set up my workspace", () => {
  const shell = readFileSync(new URL("../components/onboarding/OnboardingShell.tsx", import.meta.url), "utf8");
  const boundary = readFileSync(new URL("../components/onboarding/ProvisionBoundaryStep.tsx", import.meta.url), "utf8");
  assert.match(shell, /data\.readyForProvisioning === true/);
  assert.match(shell, /data\.activationStartedAt/);
  assert.match(shell, /data\.provisioningJobId/);
  assert.match(boundary, /if \(provisioningStarted\)/);
  assert.match(boundary, /Your workspace is ready to set up/);
  assert.match(boundary, /Set up my workspace/);
});

test("provisioning: activation notification requests are owner scoped and idempotent", () => {
  const route = readFileSync(new URL("../app/api/acquisition/provision/notification/route.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/acquisition/provisioning/activationNotifications.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/20260806000000_add_workspace_activation_notifications.sql", import.meta.url), "utf8");
  assert.match(route, /getCurrentUserContext/);
  assert.match(service, /draft\.authenticated_user_id !== input\.user\.id/);
  assert.match(service, /recipientEmail !== adminEmail/);
  assert.match(service, /draft\.draft_data\.emailVerified !== true/);
  assert.match(service, /findActiveNotification/);
  assert.match(migration, /workspace_activation_notifications_active_uidx/);
  assert.match(migration, /WHERE status IN \('requested', 'sending', 'failed'\)/);
});

test("provisioning: notification request state survives refresh", () => {
  const boundary = readFileSync(new URL("../components/onboarding/ProvisionBoundaryStep.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/acquisition/provision/notification/route.ts", import.meta.url), "utf8");
  assert.match(boundary, /\/api\/acquisition\/provision\/notification\?token=/);
  assert.match(boundary, /setNotificationRequested\(true\)/);
  assert.match(route, /export async function GET/);
  assert.match(route, /requested: state\.requested/);
});

test("provisioning: notification failure uses customer-safe copy", () => {
  const route = readFileSync(new URL("../app/api/acquisition/provision/notification/route.ts", import.meta.url), "utf8");
  assert.match(route, /We couldn’t save your notification request\. Please try again\./);
  assert.match(route, /logNotificationError/);
  assert.match(route, /code: typeof maybe\.code === "string"/);
  assert.doesNotMatch(route, /stack/);
  assert.doesNotMatch(route, /Unable to update workspace notification request/);
});

test("provisioning: activation notification derives server fields and stores no credentials", () => {
  const service = readFileSync(new URL("../lib/acquisition/provisioning/activationNotifications.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/20260806000000_add_workspace_activation_notifications.sql", import.meta.url), "utf8");
  assert.match(service, /recipient_email: userEmail/);
  assert.match(service, /onboarding_draft_id: draft\.id/);
  assert.match(service, /provisioning_job_id: String\(job\.id\)/);
  assert.match(service, /client_id: text\(\(job\.result_data as Record<string, unknown>\)\?\.organisationId\) \|\| null/);
  assert.match(service, /commercial_reference: text\(job\.commercial_reference\)/);
  assert.doesNotMatch(migration, /\b(password|otp|session_token|access_token|refresh_token)\s+(text|jsonb|uuid)/i);
});

test("provisioning: workspace-ready delivery is one-shot and safe without provider", () => {
  const service = readFileSync(new URL("../lib/acquisition/provisioning/activationNotifications.ts", import.meta.url), "utf8");
  const provisioning = readFileSync(new URL("../lib/acquisition/provisioning/service.ts", import.meta.url), "utf8");
  assert.match(provisioning, /safelyDeliverWorkspaceReadyNotifications\(job\)/);
  assert.match(service, /\.neq\("status", "sent"\)/);
  assert.match(service, /status: "sent"/);
  assert.match(service, /sent_at: new Date\(\)\.toISOString\(\)/);
  assert.match(service, /email_provider_not_configured/);
  assert.match(service, /workspace_ready_email_delivery_failed/);
  assert.match(service, /development_simulated/);
});

test("provisioning: secure continuation link is token-hashed, expiring and tenant-scoped", () => {
  const service = readFileSync(new URL("../lib/acquisition/provisioning/activationNotifications.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/workspace/continue/page.tsx", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/20260806000000_add_workspace_activation_notifications.sql", import.meta.url), "utf8");
  assert.match(service, /hashToken\(continuationToken\)/);
  assert.match(service, /continuation_token_expires_at/);
  assert.match(service, /continuation_token_used_at/);
  assert.match(service, /\/workspace\/continue\?token=/);
  assert.match(page, /resolveWorkspaceContinuationToken/);
  assert.match(page, /redirect\(continuation\.adminWorkspaceUrl\)/);
  assert.match(migration, /continuation_token_hash/);
  assert.doesNotMatch(service, /deployiq-access-token/);
});

test("provisioning: structured destination logs include redirect decision", () => {
  const source = readFileSync(new URL("../lib/acquisition/provisioning/service.ts", import.meta.url), "utf8");
  assert.match(source, /draftId/);
  assert.match(source, /provisioningJobId/);
  assert.match(source, /workspaceClientId/);
  assert.match(source, /generatedHostname/);
  assert.match(source, /returnedWorkspaceUrl/);
  assert.match(source, /domainRegistrationResult/);
  assert.match(source, /deploymentReadinessResult/);
  assert.match(source, /redirectDecision/);
});

test("retail reference: manifest loads", () => {
  const manifest = getRetailWorkspaceManifest();
  assert.equal(manifest.identity.productKey, "retail");
  assert.equal(manifest.identity.manifestKey, "retail_workspace_manifest");
  assert.equal(manifest.identity.productName, "DeployIQ Retail");
});

test("retail reference: manifest version is stored in provisioning registry", () => {
  const manifest = getRetailWorkspaceManifest();
  const registryManifest = getProductProvisioningManifest("retail");
  assert.equal(registryManifest?.manifestVersion, manifest.identity.manifestVersion);
});

test("retail reference: Retail provisioning blueprint is enabled", () => {
  const manifest = getProductProvisioningManifest("retail");
  assert.equal(manifest?.provisioningStatus, "enabled");
  assert.equal(manifest?.isPlaceholder, false);
  assert.equal(isProvisioningBlueprintEnabled("retail"), true);
});

test("retail reference: Fleet provisioning blueprint is still a placeholder", () => {
  const manifest = getProductProvisioningManifest("fleet");
  assert.equal(manifest?.manifestKey, "fleet_workspace_manifest");
  assert.equal(manifest?.provisioningStatus, "placeholder");
  assert.equal(manifest?.isPlaceholder, true);
  assert.equal(isProvisioningBlueprintEnabled("fleet"), false);
});

test("retail reference: Fleet with commercial checkout cannot enter provisioning execution", () => {
  const draft = makeDraft({
    selected_product: "fleet",
    draft_data: {
      objectiveId: "fleet_branding",
      recommendedProductKey: "fleet",
      confirmedQuotation: makeQuotation({ productKey: "fleet", pricingTemplateId: "tpl-fleet" }),
    },
  });
  const result = validateProvisioningEligibility(draft);
  assert.equal(result.ok, false);
  assert.equal(result.code, "provisioning_blueprint_not_enabled");
});

test("retail reference: entitlement payload is product-specific and active", () => {
  const entitlement = buildRetailEntitlement({
    acquisitionDraftId: "draft-1",
    commercialReference: "DQ-QT-2026-ABC123",
    pricingTemplateId: "tpl-retail",
    quotation: makeQuotation(),
    capabilities: ["fieldEvidence"],
  });
  assert.equal(entitlement.productKey, "retail");
  assert.equal(entitlement.status, "active");
  assert.equal(entitlement.programmeQuantity, 1000);
});

test("retail reference: workspace settings are created once by client_id conflict", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260805000000_add_retail_workspace_reference_foundation.sql", import.meta.url), "utf8");
  const source = readFileSync(new URL("../lib/acquisition/provisioning/retailWorkspace.ts", import.meta.url), "utf8");
  assert.match(migration, /client_id uuid NOT NULL UNIQUE REFERENCES public\.clients/);
  assert.match(source, /workspace_settings/);
  assert.match(source, /onConflict: "client_id"/);
});

test("retail reference: admin auth user is created or linked once without password persistence", () => {
  const source = readFileSync(new URL("../lib/acquisition/provisioning/service.ts", import.meta.url), "utf8");
  assert.match(source, /listUsers\(\{ page: 1, perPage: 1000 \}\)/);
  assert.match(source, /createUser\(\{\s*email,\s*email_confirm: true/s);
  assert.doesNotMatch(source, /password:/);
  assert.doesNotMatch(source, /console\.log\(.*password/i);
});

test("retail reference: Customer Admin membership is created once", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260805000000_add_retail_workspace_reference_foundation.sql", import.meta.url), "utf8");
  const source = readFileSync(new URL("../lib/acquisition/provisioning/service.ts", import.meta.url), "utf8");
  assert.match(migration, /UNIQUE \(client_id, user_id\)/);
  assert.match(source, /workspace_memberships/);
  assert.match(source, /role_key: "customer_admin"/);
});

test("retail reference: default roles are declared once", () => {
  const manifest = getRetailWorkspaceManifest();
  assert.deepEqual(manifest.roles.map((role) => role.label), [
    "Customer Admin",
    "Workspace Administrator",
    "Project Manager",
    "Field Supervisor",
    "Installer / Field Agent",
    "Client Viewer",
  ]);
});

test("retail reference: default permissions are seeded once", () => {
  const source = readFileSync(new URL("../lib/acquisition/provisioning/retailWorkspace.ts", import.meta.url), "utf8");
  assert.match(source, /workspace_role_permissions/);
  assert.match(source, /onConflict: "role_id,permission"/);
});

test("retail reference: navigation is configured from manifest", () => {
  const nav = retailNavigationForCapabilities(["fieldEvidence", "projectAnalytics", "approvalWorkflow"]);
  assert.ok(nav.some((item) => item.key === "dashboard"));
  assert.ok(nav.some((item) => item.key === "approvals"));
  assert.ok(nav.some((item) => item.key === "analytics"));
});

test("retail reference: capability-based modules enable acquired modules only", () => {
  const base = enabledRetailModulesForCapabilities([]);
  const withEvidence = enabledRetailModulesForCapabilities(["fieldEvidence"]);
  assert.ok(base.includes("projects"));
  assert.ok(!base.includes("maps"));
  assert.ok(withEvidence.includes("maps"));
  assert.ok(withEvidence.includes("evidence"));
});

test("retail reference: default statuses are created once", () => {
  const manifest = getRetailWorkspaceManifest();
  const source = readFileSync(new URL("../lib/acquisition/provisioning/retailWorkspace.ts", import.meta.url), "utf8");
  assert.equal(manifest.statuses.project.length, 5);
  assert.equal(manifest.statuses.submission.length, 6);
  assert.match(source, /onConflict: "client_id,category,status_key"/);
});

test("retail reference: Getting Started project is not created", () => {
  const manifest = getRetailWorkspaceManifest();
  const source = readFileSync(new URL("../lib/acquisition/provisioning/retailWorkspace.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/acquisition/provisioning/service.ts", import.meta.url), "utf8");
  assert.equal(manifest.starterData.project, null);
  assert.match(source, /const starterProjectId = null/);
  assert.doesNotMatch(source, /\.from\("projects"\)\s*[\s\S]*\.insert\(/);
  assert.match(service, /starter_project_skipped/);
});

test("retail reference: onboarding checklist has ten persisted items", () => {
  const manifest = getRetailWorkspaceManifest();
  assert.equal(manifest.starterData.checklist.length, 10);
  assert.equal(manifest.starterData.checklist[0].label, "Complete organisation profile");
});

test("retail reference: dashboard starts in intentional empty state", () => {
  const dashboard = getRetailWorkspaceManifest().defaults.dashboard;
  assert.equal(dashboard.emptyStateMessage, "Your Retail workspace is ready.");
  assert.equal(dashboard.kpiState, "hidden_until_live_project");
});

test("retail reference: no fake deployment metrics are seeded", () => {
  const manifest = getRetailWorkspaceManifest();
  const source = readFileSync(new URL("../lib/acquisition/provisioning/retailWorkspace.ts", import.meta.url), "utf8");
  assert.equal(manifest.starterData.project, null);
  assert.doesNotMatch(source, /deployment_progress"\)\.insert/);
  assert.doesNotMatch(source, /submissions"\)\.insert/);
});

test("retail reference: reporting defaults are created as empty-state configuration", () => {
  const reports = getRetailWorkspaceManifest().starterData.reports;
  assert.ok(reports.some((report) => report.key === "gps_verification"));
  assert.ok(reports.every((report) => report.emptyState.includes("populate once customer data exists")));
});

test("retail reference: notification defaults do not send external email", () => {
  const source = readFileSync(new URL("../lib/acquisition/provisioning/retailWorkspace.ts", import.meta.url), "utf8");
  assert.match(source, /workspace_notification_defaults/);
  assert.match(source, /send_external_email: false/);
});

test("retail reference: branding does not copy another client", () => {
  const manifest = getRetailWorkspaceManifest();
  assert.equal(manifest.defaults.branding.productIdentity, "DeployIQ Retail");
  assert.equal(manifest.defaults.branding.logoPlaceholder, "workspace_initials");
  assert.doesNotMatch(JSON.stringify(manifest), /GCPL|Godrej/i);
});

test("retail reference: health checks must pass before completion", () => {
  const health = buildRetailHealthChecks({
    organisationId: "client-1",
    workspaceSlug: "example-workspace",
    entitlementId: "ent-1",
    adminUserId: "user-1",
    starterProjectId: null,
    checklistId: "checklist-1",
    manifestVersion: getRetailWorkspaceManifest().identity.manifestVersion,
    productKey: "retail",
    workspaceBelongsToDraft: true,
    duplicateWorkspaceCount: 1,
    crossTenantReferenceCount: 0,
    ownerMembershipExists: true,
    roleCount: 6,
    permissionCount: 10,
  });
  assert.equal(health.passed, true);
});

test("retail reference: failed health checks block completion", () => {
  const health = buildRetailHealthChecks({
    organisationId: "client-1",
    workspaceSlug: "example-workspace",
    entitlementId: null,
    adminUserId: "user-1",
    starterProjectId: null,
    checklistId: "checklist-1",
    manifestVersion: getRetailWorkspaceManifest().identity.manifestVersion,
    productKey: "retail",
    workspaceBelongsToDraft: true,
    duplicateWorkspaceCount: 1,
    crossTenantReferenceCount: 0,
    ownerMembershipExists: true,
    roleCount: 6,
    permissionCount: 10,
  });
  assert.equal(health.passed, false);
  assert.equal(health.checks.productEntitlementActive, false);
});

test("retail reference: missing Customer Admin membership blocks completion", () => {
  const health = buildRetailHealthChecks({
    organisationId: "client-1",
    workspaceSlug: "example-workspace",
    entitlementId: "ent-1",
    adminUserId: "user-1",
    starterProjectId: null,
    checklistId: "checklist-1",
    manifestVersion: getRetailWorkspaceManifest().identity.manifestVersion,
    productKey: "retail",
    workspaceBelongsToDraft: true,
    duplicateWorkspaceCount: 1,
    crossTenantReferenceCount: 0,
    ownerMembershipExists: false,
    roleCount: 6,
    permissionCount: 10,
  });
  assert.equal(health.passed, false);
  assert.equal(health.checks.ownerMembershipExists, false);
});

test("retail reference: retry does not duplicate resources", () => {
  const source = readFileSync(new URL("../lib/acquisition/provisioning/retailWorkspace.ts", import.meta.url), "utf8");
  assert.match(source, /upsert/g);
  assert.match(source, /onConflict: "client_id,product_key"/);
  assert.match(source, /onConflict: "client_id,item_key"/);
  assert.match(source, /onConflict: "checklist_id,item_key"/);
});

test("retail reference: migrated foundation tables are mandatory", () => {
  const workspaceSource = readFileSync(new URL("../lib/acquisition/provisioning/retailWorkspace.ts", import.meta.url), "utf8");
  const serviceSource = readFileSync(new URL("../lib/acquisition/provisioning/service.ts", import.meta.url), "utf8");
  assert.equal(workspaceSource.includes('PGRST205") throw error'), false);
  assert.match(workspaceSource, /if \(error\) throw error/);
  assert.match(serviceSource, /if \(membershipResult\.error\) throw membershipResult\.error/);
});

test("retail reference: completed job returns existing workspace", () => {
  const source = readFileSync(new URL("../lib/acquisition/provisioning/service.ts", import.meta.url), "utf8");
  assert.match(source, /Your workspace has already been created/);
  assert.ok(source.indexOf('if (job.status === "completed")') < source.indexOf("job = await incrementAttempt(job)"));
});

test("retail reference: cross-tenant access is rejected", () => {
  assert.equal(assertRetailWorkspaceAccess("client-a", "client-a"), true);
  assert.equal(assertRetailWorkspaceAccess("client-a", "client-b"), false);
  assert.equal(assertRetailWorkspaceAccess(null, "client-b"), false);
});

test("retail reference: Fleet cannot accidentally receive Retail entitlement", () => {
  const fleetManifest = getProductProvisioningManifest("fleet");
  assert.notEqual(fleetManifest?.manifestKey, "retail_workspace_manifest");
  assert.notEqual(fleetManifest?.productKey, "retail");
});

test("retail reference: Build cannot accidentally load Retail manifest", () => {
  const buildManifest = getProductProvisioningManifest("build");
  assert.notEqual(buildManifest?.manifestKey, "retail_workspace_manifest");
  assert.notEqual(buildManifest?.productName, "DeployIQ Retail");
});

test("retail reference: provisioning events are idempotent", () => {
  const source = readFileSync(new URL("../lib/acquisition/provisioning/service.ts", import.meta.url), "utf8");
  assert.match(source, /\.eq\("event_type", eventType\)/);
  assert.match(source, /if \(\(existing \?\? \[\]\)\.length > 0\) return/);
});

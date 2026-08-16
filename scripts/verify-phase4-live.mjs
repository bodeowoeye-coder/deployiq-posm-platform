import crypto from "node:crypto";
import assert from "node:assert/strict";
import dotenv from "dotenv";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const baseUrl = process.env.PHASE4_BASE_URL || "http://127.0.0.1:3000";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(supabaseUrl && anonKey && serviceKey, "Development Supabase configuration is unavailable.");
assert.equal(process.env.DEPLOYIQ_PROVISIONING_AGENT_PROVIDER, "openai");
assert.equal(process.env.DEPLOYIQ_PROVISIONING_AGENT_EXECUTION_ENABLED, "0");
assert(process.env.OPENAI_API_KEY, "The server-only OpenAI credential is unavailable.");

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const password = `Phase4!${crypto.randomUUID()}Aa1`;
const existingResult = await admin.from("onboarding_drafts").select("id,resume_token,email,authenticated_user_id,draft_data").like("resume_token", "phase4-%").order("created_at", { ascending: false }).limit(1).maybeSingle();
if (existingResult.error) throw existingResult.error;
let draft = existingResult.data;
if (!draft) {
  const runId = crypto.randomUUID().slice(0, 8);
  const email = `phase4-owner-${runId}@example.test`;
  const resumeToken = `phase4-${crypto.randomUUID()}`;
  const slug = `phase4-${runId}`;
  const commercialReference = `PHASE4-${runId}`;
  const userResult = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { password_change_required: false }, user_metadata: { full_name: "Phase 4 Acceptance" } });
  if (userResult.error || !userResult.data.user) throw userResult.error ?? new Error("Controlled user creation failed.");
  await admin.from("user_profiles").upsert({ user_id: userResult.data.user.id, email, full_name: "Phase 4 Acceptance", status: "Active", assigned_project_ids: [], assigned_regions: [], assigned_states: [] });
  await admin.from("user_roles").upsert({ user_id: userResult.data.user.id, role: "admin", client_id: null }, { onConflict: "user_id" });
  const template = await admin.from("commercial_pricing_templates").select("id").eq("product_key", "retail").limit(1).single();
  if (template.error) throw template.error;
  const quotation = { productKey: "retail", pricingTemplateId: template.data.id, pricingTemplateName: "Phase 4 controlled Retail", currency: "NGN", quantity: 125, estimatedTotal: 1, subtotal: 1, discountAmount: 0, discountPercentage: 0, discountLabel: null, pricingMethodLabel: "Controlled acceptance", pricingExplanation: "Approved controlled Retail acceptance", includedAdminUsers: 1, requiresEnterpriseReview: false, quotationExpiry: new Date(Date.now() + 3_600_000).toISOString(), calculatedAt: new Date().toISOString(), tierBreakdown: [], commercialModel: "one_time_programme", billingBehaviour: "single_payment", renewalRequired: false, allowedPaymentMethods: ["card"] };
  const inserted = await admin.from("onboarding_drafts").insert({ resume_token: resumeToken, email, status: "provisioning_pending", current_step: "provisioning", selected_product: "retail", authenticated_user_id: userResult.data.user.id, expires_at: new Date(Date.now() + 3_600_000).toISOString(), draft_data: { objectiveId: "retail_visibility", quantity: 125, adminCount: 1, pricingReady: true, recommendedProductKey: "retail", confirmedQuotation: quotation, commercialReference, workspaceSlug: slug, workspaceName: `Phase 4 Retail ${runId}`, organisationName: `Phase 4 Retail Organisation ${runId}`, country: "Nigeria", industry: "Retail", timezone: "Africa/Lagos", adminFirstName: "Phase", adminLastName: "Acceptance", adminEmail: email, adminMobile: "+2348000000000", emailVerified: true, paymentStatus: "succeeded", commercialStatus: "payment_verified", subscriptionStatus: "active", paymentMethod: "card", readyForProvisioning: true, acceptedTerms: true, acceptedPrivacy: true, capabilities: ["fieldEvidence", "approvalWorkflow", "projectAnalytics"] } }).select("id,resume_token,email,authenticated_user_id,draft_data").single();
  if (inserted.error) throw inserted.error;
  draft = inserted.data;
}
const draftId = draft.id;
const resumeToken = draft.resume_token;
const email = draft.email;
const userId = draft.authenticated_user_id;
assert(email && userId, "Controlled draft identity is incomplete.");
const passwordUpdate = await admin.auth.admin.updateUserById(userId, { password, app_metadata: { password_change_required: false } });
if (passwordUpdate.error) throw passwordUpdate.error;

const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const signIn = await anon.auth.signInWithPassword({ email, password });
if (signIn.error || !signIn.data.session) throw signIn.error ?? new Error("Controlled sign-in failed.");
const accessToken = signIn.data.session.access_token;

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "deployiq-access-token", value: accessToken, url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/onboarding?token=${encodeURIComponent(resumeToken)}`, { waitUntil: "networkidle" });
  const setupButton = page.locator('button:has-text("Set up my workspace")');
  await setupButton.waitFor({ timeout: 30_000 });
  await setupButton.click();
  await page.getByRole("heading", { name: "DeployIQ AI plan validated" }).waitFor({ timeout: 60_000 });
  await page.getByRole("heading", { name: "Understanding your requirements" }).waitFor();
  await page.getByText("Why this configuration").waitFor();
  await page.getByRole("button", { name: "Continue with Workspace Setup" }).waitFor();
  await page.screenshot({ path: "/tmp/deployiq-phase4-customer-plan.png", fullPage: true });

  const jobResult = await admin.from("provisioning_jobs").select("*").eq("acquisition_draft_id", draftId).single();
  if (jobResult.error) throw jobResult.error;
  const job = jobResult.data;
  const shadow = job.result_data?.shadowPlanning;
  assert(shadow, "Persisted Shadow result is absent.");
  assert.equal(shadow.provider, "openai");
  assert.equal(shadow.model, process.env.DEPLOYIQ_PROVISIONING_AGENT_MODEL);
  assert.equal(shadow.fallbackUsed, false, `Provider fallback: ${shadow.providerFailureCode ?? "unknown"}`);
  assert.equal(shadow.status, "completed");
  assert.notEqual(shadow.validation?.status, "rejected");
  assert.equal(typeof shadow.proposedPlan?.interpretation?.summary, "string");
  assert(shadow.proposedPlan.interpretation.summary.trim().length > 20);
  assert(Array.isArray(shadow.proposedPlan.interpretation.rationale));
  assert(shadow.proposedPlan.interpretation.rationale.length > 0);
  assert(Array.isArray(shadow.differences) && shadow.differences.length > 0);

  const clientId = job.result_data?.organisationId;
  assert(clientId, "Provisioning did not return a client identity.");
  const [clients, workspaces, memberships, entitlements, jobs, events] = await Promise.all([
    admin.from("clients").select("id,acquisition_draft_id").eq("acquisition_draft_id", draftId),
    admin.from("workspace_settings").select("id,client_id,workspace_slug").eq("client_id", clientId),
    admin.from("workspace_memberships").select("id,client_id,user_id,role_key,status").eq("client_id", clientId).eq("user_id", userId),
    admin.from("product_entitlements").select("id,client_id,product_key,status").eq("client_id", clientId),
    admin.from("provisioning_jobs").select("id,acquisition_draft_id").eq("acquisition_draft_id", draftId),
    admin.from("provisioning_events").select("event_type,metadata").eq("provisioning_job_id", job.id).eq("event_type", "provisioning_shadow_plan_generated"),
  ]);
  for (const result of [clients, workspaces, memberships, entitlements, jobs, events]) if (result.error) throw result.error;
  assert.equal(clients.data.length, 1);
  assert.equal(workspaces.data.length, 1);
  assert.equal(memberships.data.length, 1);
  assert.equal(entitlements.data.length, 1);
  assert.equal(jobs.data.length, 1);
  assert.equal(events.data.length, 1);
  assert.equal(events.data[0].metadata?.provider, "openai");
  assert.equal(events.data[0].metadata?.fallbackUsed, false);

  const coreAdminRole = await admin.from("user_roles").update({ role: "admin", client_id: null }).eq("user_id", userId);
  if (coreAdminRole.error) throw coreAdminRole.error;
  const adminPage = await context.newPage();
  await adminPage.goto(`${baseUrl}/admin/customers/${clientId}?tab=provisioning`, { waitUntil: "networkidle" });
  await adminPage.getByText("DeployIQ AI Shadow Mode plan generated").waitFor();
  await adminPage.getByText("openai", { exact: true }).waitFor();
  await adminPage.getByText(process.env.DEPLOYIQ_PROVISIONING_AGENT_MODEL, { exact: true }).waitFor();
  await adminPage.getByText("No", { exact: true }).waitFor();
  await adminPage.screenshot({ path: "/tmp/deployiq-phase4-customer360.png", fullPage: true });
  const restoredRole = await admin.from("user_roles").update({ role: "client", client_id: clientId }).eq("user_id", userId);
  if (restoredRole.error) throw restoredRole.error;

  console.log(JSON.stringify({
    acceptance: "passed",
    draftId,
    canonicalJobId: job.id,
    clientId,
    provider: shadow.provider,
    model: shadow.model,
    fallbackUsed: shadow.fallbackUsed,
    validation: shadow.validation.status,
    comparison: shadow.differences.map((difference) => difference.classification),
    summary: shadow.proposedPlan.interpretation.summary,
    rationale: shadow.proposedPlan.interpretation.rationale,
    generationDurationMs: shadow.generationDurationMs,
    cardinality: { clients: 1, workspaces: 1, memberships: 1, entitlements: 1, jobs: 1 },
    customerPlanScreen: "passed",
    customer360Screen: "passed",
    executionEnabled: false,
  }, null, 2));
} finally {
  await browser.close();
}

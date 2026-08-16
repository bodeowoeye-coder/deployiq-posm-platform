import crypto from "node:crypto";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const baseUrl = process.env.PHASE2B_BASE_URL || "http://127.0.0.1:3100";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Supabase development configuration is unavailable.");

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = crypto.randomUUID().slice(0, 8);
const ownerEmail = `phase2b-owner-${runId}@example.test`;
const otherEmail = `phase2b-other-${runId}@example.test`;
const password = `Phase2b!${crypto.randomUUID()}Aa1`;
const created = { userIds: [], draftIds: [], clientIds: [] };

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Phase 2B Probe" } });
  if (error || !data.user) throw error ?? new Error("User creation failed.");
  created.userIds.push(data.user.id);
  await admin.from("user_profiles").upsert({ user_id: data.user.id, email, full_name: "Phase 2B Probe", status: "Active", assigned_project_ids: [], assigned_regions: [], assigned_states: [] });
  await admin.from("user_roles").upsert({ user_id: data.user.id, role: "admin", client_id: null }, { onConflict: "user_id" });
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await anon.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error("Sign-in failed.");
  return { user: data.user, accessToken: signedIn.data.session.access_token };
}

function cookie(accessToken) {
  return `deployiq-access-token=${accessToken}`;
}

async function http(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

async function cleanup() {
  for (const clientId of created.clientIds) await admin.from("clients").delete().eq("id", clientId);
  for (const draftId of created.draftIds) await admin.from("onboarding_drafts").delete().eq("id", draftId);
  for (const userId of created.userIds) {
    await admin.from("user_roles").delete().eq("user_id", userId);
    await admin.from("user_profiles").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
  }
}

try {
  const baseline = {};
  for (const [name, query] of [
    ["clients", admin.from("clients").select("id", { count: "exact", head: true })],
    ["workspaces", admin.from("workspace_settings").select("id", { count: "exact", head: true })],
    ["jobs", admin.from("provisioning_jobs").select("id,execution_lock_token,execution_locked_at", { count: "exact", head: true })],
  ]) {
    const result = await query;
    if (result.error) throw result.error;
    baseline[name] = result.count;
  }

  const legacy = await http("/api/onboarding/provision", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert(legacy.response.status === 410 && legacy.payload?.code === "legacy_provisioning_retired", "Legacy endpoint was not retired.");

  const anonymousToken = `phase2b-anon-${runId}`;
  const anonymousInsert = await admin.from("onboarding_drafts").insert({ resume_token: anonymousToken, status: "started", current_step: "welcome", draft_data: { probe: runId }, expires_at: new Date(Date.now() + 3600000).toISOString() }).select("id").single();
  if (anonymousInsert.error) throw anonymousInsert.error;
  created.draftIds.push(anonymousInsert.data.id);
  const anonymousResume = await http(`/api/onboarding/resume?token=${encodeURIComponent(anonymousToken)}`);
  assert(anonymousResume.response.status === 200 && anonymousResume.payload?.draft?.id === anonymousInsert.data.id, "Anonymous resume continuity failed.");
  const anonymousProvision = await http("/api/acquisition/provision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resumeToken: anonymousToken }) });
  assert(anonymousProvision.response.status === 401 && anonymousProvision.payload?.code === "authentication_required", "Token-only provisioning was not rejected.");

  const owner = await createUser(ownerEmail);
  const other = await createUser(otherEmail);
  const templateResult = await admin.from("commercial_pricing_templates").select("id").eq("product_key", "retail").limit(1).maybeSingle();
  if (templateResult.error || !templateResult.data) throw templateResult.error ?? new Error("Retail pricing template unavailable.");
  const resumeToken = `phase2b-owner-${runId}`;
  const slug = `phase2b-${runId}`;
  const commercialReference = `PHASE2B-${runId}`;
  const quotation = {
    productKey: "retail", pricingTemplateId: templateResult.data.id, pricingTemplateName: "Phase 2B",
    currency: "NGN", quantity: 1, estimatedTotal: 1, subtotal: 1, discountAmount: 0,
    discountPercentage: 0, discountLabel: null, pricingMethodLabel: "Verified fixture",
    pricingExplanation: "Phase 2B fixture", includedAdminUsers: 1, requiresEnterpriseReview: false,
    quotationExpiry: new Date(Date.now() + 3600000).toISOString(), calculatedAt: new Date().toISOString(),
    tierBreakdown: [], commercialModel: "one_time_programme", billingBehaviour: "single_payment",
    renewalRequired: false, allowedPaymentMethods: ["card"],
  };
  const draftInsert = await admin.from("onboarding_drafts").insert({
    resume_token: resumeToken, email: ownerEmail, status: "provisioning_pending", current_step: "provisioning",
    selected_product: "retail", authenticated_user_id: owner.user.id, expires_at: new Date(Date.now() + 3600000).toISOString(),
    draft_data: {
      objectiveId: "retail_visibility", recommendedProductKey: "retail", confirmedQuotation: quotation,
      commercialReference, workspaceSlug: slug, workspaceName: `Phase 2B ${runId}`,
      organisationName: `Phase 2B Organisation ${runId}`, country: "Nigeria", timezone: "Africa/Lagos",
      adminFirstName: "Phase", adminLastName: "Probe", adminEmail: ownerEmail, adminMobile: "+2348000000000",
      emailVerified: true, paymentStatus: "succeeded", commercialStatus: "payment_verified",
      subscriptionStatus: "active", paymentMethod: "card", readyForProvisioning: true,
      capabilities: ["fieldEvidence"],
    },
  }).select("id").single();
  if (draftInsert.error) throw draftInsert.error;
  created.draftIds.push(draftInsert.data.id);

  const ownerResume = await http(`/api/onboarding/resume?token=${encodeURIComponent(resumeToken)}`, { headers: { cookie: cookie(owner.accessToken) } });
  assert(ownerResume.response.status === 200 && ownerResume.payload?.draft?.authenticated_user_id === owner.user.id, "Authenticated owner resume failed.");
  const wrongUser = await http("/api/acquisition/provision", { method: "POST", headers: { "content-type": "application/json", cookie: cookie(other.accessToken) }, body: JSON.stringify({ resumeToken }) });
  assert(wrongUser.response.status === 403 && wrongUser.payload?.classification === "security_rejected" && wrongUser.payload?.code === "draft_owner_mismatch", "Wrong-user provisioning was not rejected safely.");

  const requestOptions = { method: "POST", headers: { "content-type": "application/json", cookie: cookie(owner.accessToken) }, body: JSON.stringify({ resumeToken }) };
  const [first, second] = await Promise.all([http("/api/acquisition/provision", requestOptions), http("/api/acquisition/provision", requestOptions)]);
  assert(first.response.ok && second.response.ok, `Concurrent requests failed: ${first.response.status}/${second.response.status}`);
  assert(first.payload?.job?.id && first.payload.job.id === second.payload?.job?.id, "Concurrent requests did not reuse one canonical job.");
  const shadowPlanning = first.payload?.shadowPlanning ?? second.payload?.shadowPlanning;
  assert(shadowPlanning?.validation?.status === "valid", "DeployIQ AI Shadow Mode plan was not validated.");

  const jobResult = await admin.from("provisioning_jobs").select("*").eq("acquisition_draft_id", draftInsert.data.id).single();
  if (jobResult.error) throw jobResult.error;
  const clientId = jobResult.data.result_data?.organisationId;
  assert(clientId, "Provisioning did not create a client.");
  created.clientIds.push(clientId);
  const [clients, workspaces, memberships, entitlements, otherMemberships] = await Promise.all([
    admin.from("clients").select("id,acquisition_draft_id").eq("acquisition_draft_id", draftInsert.data.id),
    admin.from("workspace_settings").select("id,client_id,workspace_slug,status").eq("workspace_slug", slug),
    admin.from("workspace_memberships").select("id,client_id,user_id,status").eq("client_id", clientId).eq("user_id", owner.user.id).eq("status", "active"),
    admin.from("product_entitlements").select("id,client_id,product_key,status").eq("client_id", clientId).eq("product_key", "retail").eq("status", "active"),
    admin.from("workspace_memberships").select("id,client_id").eq("user_id", owner.user.id).eq("status", "active").neq("client_id", clientId),
  ]);
  for (const result of [clients, workspaces, memberships, entitlements, otherMemberships]) if (result.error) throw result.error;
  assert(clients.data.length === 1 && clients.data[0].id === clientId, "Acquisition/client identity is not unique.");
  assert(workspaces.data.length === 1 && workspaces.data[0].client_id === clientId, "Workspace ownership/uniqueness failed.");
  assert(memberships.data.length === 1, "Canonical administrator membership missing or duplicated.");
  assert(entitlements.data.length === 1, "Canonical entitlement missing or duplicated.");
  assert(otherMemberships.data.length === 0, "Cross-tenant membership was introduced.");
  assert(jobResult.data.result_data?.healthChecksPassed === true, "Database-backed health checks did not pass.");

  const duplicateClient = await admin.from("clients").insert({ name: `Duplicate ${runId}`, status: "Active", acquisition_draft_id: draftInsert.data.id });
  assert(Boolean(duplicateClient.error), "Unique acquisition/client constraint was not enforced.");

  console.log(JSON.stringify({
    projectHost: new URL(supabaseUrl).host,
    baseline,
    anonymousResume: "passed",
    unauthenticatedProvisioning: { status: anonymousProvision.response.status, code: anonymousProvision.payload.code },
    authenticatedResume: "passed",
    wrongUser: { status: wrongUser.response.status, code: wrongUser.payload.code, classification: wrongUser.payload.classification },
    concurrency: { statuses: [first.response.status, second.response.status], canonicalJobId: jobResult.data.id, attemptCount: jobResult.data.attempt_count },
    shadowPlanning: { status: shadowPlanning.status, validation: shadowPlanning.validation.status, providerVersion: shadowPlanning.providerVersion, differences: shadowPlanning.differences.map((item) => item.classification) },
    tenantVerification: { clients: clients.data.length, workspaces: workspaces.data.length, memberships: memberships.data.length, entitlements: entitlements.data.length, crossTenantMemberships: otherMemberships.data.length, healthChecksPassed: jobResult.data.result_data.healthChecksPassed },
    legacy: { status: legacy.response.status, code: legacy.payload.code },
    uniquenessEnforced: true,
  }, null, 2));
} finally {
  await cleanup();
}

import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { randomUUID } from "node:crypto";
import { getOnboardingDraftByToken, updateOnboardingDraft } from "@/lib/commercial/onboarding/service";
import { upsertPlatformProvisioningContext } from "@/lib/commercial/provisioning/platform";
import { upsertUserProfileWithRetry } from "@/lib/userManagement";
import { getProductProvisioningManifest, type ProvisioningStage } from "./registry";
import { validateProvisioningEligibility } from "./validation";
import { buildProvisioningFailureMetadata } from "./failure";
import { getRetailWorkspaceManifest } from "./retailManifest";
import { buildRetailHealthChecks, provisionRetailWorkspaceReference } from "./retailWorkspace";
import { buildAdminWorkspaceUrl, verifyWorkspaceDestination, type WorkspaceDestinationReadiness } from "./workspaceDestination";
import { deliverWorkspaceReadyNotifications } from "./activationNotifications";
import { assertProvisioningOwnership } from "./ownership";
import { shouldRunProvisioningShadow } from "../../ai/provisioning/flags";
import { buildTrustedProvisioningContext } from "../../ai/provisioning/context";
import { runProvisioningShadow } from "../../ai/provisioning/shadow";

export type ProvisioningJobRecord = {
  id: string;
  acquisition_draft_id: string;
  commercial_reference: string;
  product_key: string;
  workspace_slug: string;
  status: "queued" | "running" | "completed" | "failed";
  current_stage: ProvisioningStage;
  progress_percent: number;
  attempt_count: number;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  result_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ProvisioningResult = {
  job: ProvisioningJobRecord;
  completed: boolean;
  customerMessage: string;
  workspaceUrl?: string;
  adminWorkspaceUrl?: string;
  workspaceReady: boolean;
  workspaceDestination?: WorkspaceDestinationReadiness;
  accountSetupLink?: string | null;
};

const STAGE_PROGRESS: Record<ProvisioningStage, number> = {
  queued: 0,
  validating: 10,
  reserving_workspace: 20,
  creating_organisation: 35,
  creating_workspace: 45,
  configuring_product: 58,
  creating_administrator: 72,
  creating_permissions: 82,
  seeding_workspace: 90,
  running_post_checks: 96,
  completed: 100,
  failed: 100,
};

const CUSTOMER_FAILURE = "We could not finish workspace setup automatically. Your activation is safe and our team can resume it.";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fullName(firstName: unknown, lastName: unknown): string {
  return [text(firstName), text(lastName)].filter(Boolean).join(" ").trim() || "Workspace Administrator";
}

function logProvisioningDecision(event: string, metadata: Record<string, unknown>) {
  console.info(`[provisioning:${event}]`, metadata);
}

async function safelyDeliverWorkspaceReadyNotifications(job: ProvisioningJobRecord) {
  try {
    await deliverWorkspaceReadyNotifications(job);
  } catch (error) {
    console.error("[provisioning:workspace_ready_notification_failed]", {
      provisioningJobId: job.id,
      message: error instanceof Error ? error.message : "Unknown notification failure",
    });
  }
}

function normaliseJob(record: Record<string, unknown>): ProvisioningJobRecord {
  return {
    id: String(record.id ?? ""),
    acquisition_draft_id: String(record.acquisition_draft_id ?? ""),
    commercial_reference: String(record.commercial_reference ?? ""),
    product_key: String(record.product_key ?? ""),
    workspace_slug: String(record.workspace_slug ?? ""),
    status: String(record.status ?? "queued") as ProvisioningJobRecord["status"],
    current_stage: String(record.current_stage ?? "queued") as ProvisioningStage,
    progress_percent: Number(record.progress_percent ?? 0),
    attempt_count: Number(record.attempt_count ?? 0),
    started_at: typeof record.started_at === "string" ? record.started_at : null,
    completed_at: typeof record.completed_at === "string" ? record.completed_at : null,
    failed_at: typeof record.failed_at === "string" ? record.failed_at : null,
    failure_code: typeof record.failure_code === "string" ? record.failure_code : null,
    failure_message: typeof record.failure_message === "string" ? record.failure_message : null,
    result_data: (record.result_data as Record<string, unknown>) ?? {},
    created_at: String(record.created_at ?? ""),
    updated_at: String(record.updated_at ?? ""),
  };
}

function mergeResult(job: ProvisioningJobRecord, patch: Record<string, unknown>) {
  return {
    ...(job.result_data ?? {}),
    ...patch,
  };
}

function mergeCompletionResult(job: ProvisioningJobRecord, patch: Record<string, unknown>) {
  const {
    failedSafeStage: _failedSafeStage,
    customerFailureMessage: _customerFailureMessage,
    retryable: _retryable,
    ...result
  } = job.result_data ?? {};
  return {
    ...result,
    ...patch,
  };
}

async function recordEvent(jobId: string, stage: ProvisioningStage, eventType: string, message: string, metadata?: Record<string, unknown>) {
  const supabase = createAdminSupabase();
  const { data: existing } = await supabase
    .from("provisioning_events")
    .select("id")
    .eq("provisioning_job_id", jobId)
    .eq("event_type", eventType)
    .limit(1);
  if ((existing ?? []).length > 0) return;
  await supabase.from("provisioning_events").insert({
    provisioning_job_id: jobId,
    stage,
    event_type: eventType,
    message,
    metadata: metadata ?? {},
  });
}

async function updateJob(job: ProvisioningJobRecord, stage: ProvisioningStage, patch: Record<string, unknown> = {}) {
  const supabase = createAdminSupabase();
  const payload = {
    status: stage === "completed" ? "completed" : stage === "failed" ? "failed" : "running",
    current_stage: stage,
    progress_percent: STAGE_PROGRESS[stage],
    updated_at: new Date().toISOString(),
    ...(stage !== "queued" && !job.started_at ? { started_at: new Date().toISOString() } : {}),
    ...(stage === "completed" ? { completed_at: new Date().toISOString(), failed_at: null, failure_code: null, failure_message: null } : {}),
    ...(stage === "failed" ? { failed_at: new Date().toISOString() } : {}),
    ...patch,
  };
  const { data, error } = await supabase
    .from("provisioning_jobs")
    .update(payload)
    .eq("id", job.id)
    .select()
    .single();
  if (error) throw error;
  const next = normaliseJob(data as Record<string, unknown>);
  await recordEvent(next.id, stage, "stage_updated", `Provisioning stage: ${stage}`);
  return next;
}

async function createOrResumeJob(input: {
  draftId: string;
  commercialReference: string;
  productKey: string;
  workspaceSlug: string;
}) {
  const supabase = createAdminSupabase();
  const { data: existing, error: lookupError } = await supabase
    .from("provisioning_jobs")
    .select("*")
    .eq("acquisition_draft_id", input.draftId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return normaliseJob(existing as Record<string, unknown>);

  const { data, error } = await supabase
    .from("provisioning_jobs")
    .insert({
      acquisition_draft_id: input.draftId,
      commercial_reference: input.commercialReference,
      product_key: input.productKey,
      workspace_slug: input.workspaceSlug,
      status: "queued",
      current_stage: "queued",
      progress_percent: 0,
      attempt_count: 0,
      result_data: {},
    })
    .select()
    .single();
  if (error) {
    const { data: winner, error: winnerError } = await supabase
      .from("provisioning_jobs")
      .select("*")
      .eq("acquisition_draft_id", input.draftId)
      .maybeSingle();
    if (winnerError) throw winnerError;
    if (winner) return normaliseJob(winner as Record<string, unknown>);
    throw error;
  }
  const job = normaliseJob(data as Record<string, unknown>);
  await recordEvent(job.id, "queued", "job_created", "Provisioning job created.");
  return job;
}

async function claimJob(job: ProvisioningJobRecord) {
  const lockToken = randomUUID();
  const { data, error } = await createAdminSupabase().rpc("claim_acquisition_provisioning_job", {
    p_job_id: job.id,
    p_lock_token: lockToken,
  });
  if (error) throw error;
  return data === true;
}

async function getJob(jobId: string) {
  const { data, error } = await createAdminSupabase().from("provisioning_jobs").select("*").eq("id", jobId).single();
  if (error) throw error;
  return normaliseJob(data as Record<string, unknown>);
}

export async function getProvisioningJobForDraft(draftId: string) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("provisioning_jobs")
    .select("*")
    .eq("acquisition_draft_id", draftId)
    .maybeSingle();
  if (error) throw error;
  return data ? normaliseJob(data as Record<string, unknown>) : null;
}

async function incrementAttempt(job: ProvisioningJobRecord) {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("provisioning_jobs")
    .update({ attempt_count: job.attempt_count + 1, updated_at: new Date().toISOString() })
    .eq("id", job.id)
    .select()
    .single();
  if (error) throw error;
  return normaliseJob(data as Record<string, unknown>);
}

async function ensureAdminUser(input: {
  email: string;
  name: string;
  phone: string | null;
  organisationId: string;
  ownerRoleId?: string | null;
}) {
  const supabase = createAdminSupabase();
  const email = input.email.toLowerCase();
  const [{ data: authUsers }, { data: profileByEmail }] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase.schema("public").from("user_profiles").select("user_id, email").eq("email", email).maybeSingle(),
  ]);

  let authUser = authUsers.users.find((user) => user.email?.toLowerCase() === email) ?? null;
  if (!authUser && profileByEmail?.user_id) {
    const { data } = await supabase.auth.admin.getUserById(profileByEmail.user_id);
    authUser = data.user ?? null;
  }

  if (!authUser) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: input.name },
    });
    if (error || !data.user) throw error ?? new Error("Could not create administrator auth user.");
    authUser = data.user;
  }

  const profileResult = await upsertUserProfileWithRetry(supabase, {
    user_id: authUser.id,
    full_name: input.name,
    email,
    phone: input.phone,
    agency_id: null,
    assigned_project_ids: [],
    assigned_regions: [],
    assigned_states: [],
    status: "Active",
  });
  if (profileResult.error) throw profileResult.error;

  const { data: existingRole, error: existingRoleError } = await supabase
    .schema("public")
    .from("user_roles")
    .select("user_id, role, client_id")
    .eq("user_id", authUser.id)
    .maybeSingle();
  if (existingRoleError) throw existingRoleError;

  const canAssignPrimaryRole = !existingRole?.user_id || !existingRole.client_id || existingRole.client_id === input.organisationId;
  if (canAssignPrimaryRole) {
    const { error: roleError } = await supabase
      .schema("public")
      .from("user_roles")
      .upsert({ user_id: authUser.id, role: "client", client_id: input.organisationId }, { onConflict: "user_id" });
    if (roleError) throw roleError;
  }

  const membershipResult = await supabase
    .from("workspace_memberships")
    .upsert({
      client_id: input.organisationId,
      user_id: authUser.id,
      role_id: input.ownerRoleId ?? null,
      role_key: "customer_admin",
      status: "active",
      updated_at: new Date().toISOString(),
    }, { onConflict: "client_id,user_id" });
  if (membershipResult.error) throw membershipResult.error;

  let accountSetupLink: string | null = null;
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  if (!linkError) {
    accountSetupLink = linkData.properties?.action_link ?? null;
  }

  return {
    userId: authUser.id,
    accountSetupLink,
    accountSetupStatus: accountSetupLink ? "recovery_link_generated" : "email_confirmed_existing_flow",
    primaryRoleAssigned: canAssignPrimaryRole,
    ownerMembershipExists: true,
  };
}

export async function provisionAcquisitionWorkspace(resumeToken: string, user: {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
}): Promise<ProvisioningResult> {
  const draft = await getOnboardingDraftByToken(resumeToken);
  if (!draft) {
    throw Object.assign(new Error("Acquisition session not found."), { status: 404, code: "draft_not_found" });
  }

  assertProvisioningOwnership(draft, user);

  const eligibility = validateProvisioningEligibility(draft);
  if (!eligibility.ok) {
    throw Object.assign(new Error(eligibility.message), { status: 400, code: eligibility.code });
  }

  await updateOnboardingDraft({
    resumeToken,
    status: "provisioning",
    currentStep: "success",
    authenticatedUserId: draft.authenticated_user_id,
    pricingSnapshotId: draft.pricing_snapshot_id,
    draftData: {
      ...(draft.draft_data ?? {}),
      activationStartedAt: draft.draft_data?.activationStartedAt ?? new Date().toISOString(),
      provisioningStatus: "running",
      readyForProvisioning: true,
    },
  });

  let job = await createOrResumeJob({
    draftId: draft.id,
    commercialReference: eligibility.commercialReference,
    productKey: eligibility.productKey,
    workspaceSlug: eligibility.workspaceSlug,
  });

  if (job.status === "completed") {
    if ("failedSafeStage" in job.result_data || "customerFailureMessage" in job.result_data || job.result_data.retryable === true) {
      job = await updateJob(job, "completed", {
        result_data: mergeCompletionResult(job, {}),
      });
    }
    if (job.result_data.workspaceReady === true) {
      await safelyDeliverWorkspaceReadyNotifications(job);
    }
    return {
      job,
      completed: true,
      customerMessage: "Your workspace has already been created.",
      workspaceUrl: text(job.result_data.workspaceUrl),
      adminWorkspaceUrl: text(job.result_data.adminWorkspaceUrl) || buildAdminWorkspaceUrl(job.workspace_slug),
      workspaceReady: job.result_data.workspaceReady === true,
      workspaceDestination: job.result_data.workspaceDestination as WorkspaceDestinationReadiness | undefined,
      accountSetupLink: process.env.NODE_ENV === "development" ? text(job.result_data.accountSetupLink) || null : null,
    };
  }

  const claimed = await claimJob(job);
  if (!claimed) {
    const canonicalJob = await getJob(job.id);
    return {
      job: canonicalJob,
      completed: canonicalJob.status === "completed" && canonicalJob.result_data.workspaceReady === true,
      customerMessage: "Your workspace setup is already in progress.",
      workspaceUrl: canonicalJob.result_data.workspaceReady === true ? text(canonicalJob.result_data.workspaceUrl) : undefined,
      adminWorkspaceUrl: canonicalJob.result_data.workspaceReady === true ? text(canonicalJob.result_data.adminWorkspaceUrl) : undefined,
      workspaceReady: canonicalJob.result_data.workspaceReady === true,
      workspaceDestination: canonicalJob.result_data.workspaceDestination as WorkspaceDestinationReadiness | undefined,
    };
  }
  job = await incrementAttempt(job);

  try {
    job = await updateJob(job, "validating");
    if (shouldRunProvisioningShadow(eligibility.productKey)) {
      try {
        const trustedContext = buildTrustedProvisioningContext(draft, eligibility);
        const shadowPlanning = await runProvisioningShadow(trustedContext);
        job = await updateJob(job, "validating", {
          result_data: mergeResult(job, { shadowPlanning }),
        });
        await recordEvent(job.id, "validating", "provisioning_shadow_plan_generated", "DeployIQ AI Shadow Mode plan generated and validated.", {
          planId: shadowPlanning.proposedPlan?.planId ?? shadowPlanning.baselinePlan.planId,
          contextHash: trustedContext.contextHash,
          schemaVersion: shadowPlanning.baselinePlan.schemaVersion,
          providerVersion: shadowPlanning.providerVersion,
          manifestVersion: trustedContext.manifest.version,
          validationStatus: shadowPlanning.validation.status,
          differenceSummary: shadowPlanning.differences.map((item) => item.classification),
          generatedAt: shadowPlanning.generatedAt,
        });
      } catch {
        await recordEvent(job.id, "validating", "provisioning_shadow_plan_failed", "DeployIQ AI Shadow Mode planning was unavailable; deterministic provisioning continued.", { errorCode: "shadow_planning_unavailable" });
      }
    }
    const manifest = getProductProvisioningManifest(eligibility.productKey);
    if (!manifest) {
      throw Object.assign(new Error("No provisioning manifest is configured for this product."), { code: "manifest_not_configured" });
    }
    if (eligibility.productKey === "retail") {
      await recordEvent(job.id, "validating", "retail_manifest_loaded", "Retail workspace manifest loaded.", {
        manifestKey: manifest.manifestKey,
        manifestVersion: manifest.manifestVersion ?? null,
      });
    }

    job = await updateJob(job, "reserving_workspace", { result_data: mergeResult(job, { workspaceSlug: eligibility.workspaceSlug }) });
    job = await updateJob(job, "creating_organisation");
    const data = draft.draft_data ?? {};
    const adminName = fullName(data.adminFirstName, data.adminLastName);
    const adminEmail = text(data.adminEmail).toLowerCase();
    if (!adminEmail) {
      throw Object.assign(new Error("Administrator email is missing."), { code: "missing_admin_email" });
    }
    const platform = await upsertPlatformProvisioningContext({
      acquisitionDraftId: draft.id,
      organisationName: text(data.organisationName),
      contactPerson: adminName,
      businessEmail: adminEmail,
      phoneNumber: text(data.adminMobile),
      country: text(data.country),
    });
    const destination = verifyWorkspaceDestination(eligibility.workspaceSlug);
    logProvisioningDecision("workspace_destination_checked", {
      draftId: draft.id,
      provisioningJobId: job.id,
      workspaceClientId: platform.organisationId,
      generatedHostname: destination.hostname,
      returnedWorkspaceUrl: destination.redirectAllowed ? destination.workspaceUrl : null,
      returnedAdminWorkspaceUrl: destination.redirectAllowed ? destination.adminWorkspaceUrl : null,
      domainRegistrationResult: destination.domainRegistrationStatus,
      deploymentReadinessResult: destination.deploymentReady,
      redirectDecision: destination.redirectAllowed ? "redirect_allowed" : "stay_on_provision_boundary",
    });
    job = await updateJob(job, "creating_workspace", {
      result_data: mergeResult(job, {
        organisationId: platform.organisationId,
        organisationName: text(data.organisationName),
        workspaceName: text(data.workspaceName) || text(data.organisationName),
        workspaceSlug: eligibility.workspaceSlug,
        workspaceUrl: destination.workspaceUrl,
        adminWorkspaceUrl: destination.adminWorkspaceUrl,
        workspaceReady: destination.redirectAllowed,
        workspaceDestination: destination,
      }),
    });

    job = await updateJob(job, "configuring_product");
    let productResult: Record<string, unknown> = { skipped: true, reason: "assisted_product" };
    if (eligibility.productKey === "retail") {
      const retailManifest = getRetailWorkspaceManifest();
      productResult = await provisionRetailWorkspaceReference({
        acquisitionDraftId: draft.id,
        clientId: platform.organisationId,
        organisationName: text(data.organisationName),
        workspaceName: text(data.workspaceName) || text(data.organisationName),
        workspaceSlug: eligibility.workspaceSlug,
        country: text(data.country),
        timezone: text(data.timezone) || retailManifest.defaults.timezone,
        currency: eligibility.quotation.currency,
        commercialReference: eligibility.commercialReference,
        pricingTemplateId: text(eligibility.quotation.pricingTemplateId) || "unknown",
        quotation: eligibility.quotation,
        capabilities: Array.isArray(data.capabilities) ? data.capabilities.filter((cap): cap is string => typeof cap === "string") : [],
      });
      await recordEvent(job.id, "configuring_product", "product_entitlement_created", "Retail product entitlement created or reused.", { entitlementId: productResult.entitlementId ?? null });
      await recordEvent(job.id, "configuring_product", "navigation_configured", "Retail navigation configured from manifest.", { navigationCount: productResult.navigationCount ?? 0 });
      await recordEvent(job.id, "configuring_product", "roles_created", "Retail workspace roles created or reused.", { roleCount: Array.isArray(productResult.roleIds) ? productResult.roleIds.length : 0 });
      await recordEvent(job.id, "creating_permissions", "permissions_applied", "Retail workspace permissions applied.", { permissionCount: productResult.permissionCount ?? 0 });
      await recordEvent(job.id, "seeding_workspace", "statuses_seeded", "Retail operational statuses seeded.", { statusCount: productResult.statusCount ?? 0 });
      await recordEvent(job.id, "seeding_workspace", "starter_project_skipped", "Starter project creation skipped; customer will create the first deployment project.", { projectId: null });
      await recordEvent(job.id, "seeding_workspace", "onboarding_checklist_created", "Workspace onboarding checklist created or reused.", { checklistId: productResult.checklistId ?? null });
      await recordEvent(job.id, "seeding_workspace", "reporting_defaults_created", "Retail reporting defaults created or reused.", { reportCount: productResult.reportCount ?? 0 });
      await recordEvent(job.id, "seeding_workspace", "notification_defaults_created", "Retail notification defaults created or reused.", { notificationCount: productResult.notificationCount ?? 0 });
    }
    job = await updateJob(job, "creating_administrator", {
      result_data: mergeResult(job, { manifest, product: productResult }),
    });

    const admin = await ensureAdminUser({
      email: adminEmail,
      name: adminName,
      phone: text(data.adminMobile) || null,
      organisationId: platform.organisationId,
      ownerRoleId: Array.isArray(productResult.roleIds) ? text(productResult.roleIds[0]) || null : null,
    });

    job = await updateJob(job, "creating_permissions", {
      result_data: mergeResult(job, {
        adminUserId: admin.userId,
        administratorName: adminName,
        administratorEmail: adminEmail,
        accountSetupStatus: admin.accountSetupStatus,
        accountSetupDelivery: "email_pending",
        primaryRoleAssigned: admin.primaryRoleAssigned,
        ...(process.env.NODE_ENV === "development" && admin.accountSetupLink ? { accountSetupLink: admin.accountSetupLink } : {}),
      }),
    });

    job = await updateJob(job, "seeding_workspace", {
      result_data: mergeResult(job, {
        starterDashboard: manifest.starterDashboard,
        enabledModules: manifest.enabledModules,
        defaultNavigation: manifest.defaultNavigation,
      }),
    });

    job = await updateJob(job, "running_post_checks");
    const verificationSupabase = createAdminSupabase();
    const clientId = text(job.result_data.organisationId);
    const entitlementId = text((job.result_data.product as { entitlementId?: unknown } | undefined)?.entitlementId);
    const [
      { data: workspaceRows, error: workspaceVerificationError },
      { data: entitlementRows, error: entitlementVerificationError },
      { data: administratorMembership, error: membershipVerificationError },
      { data: otherTenantMemberships, error: crossTenantVerificationError },
    ] = await Promise.all([
      verificationSupabase.from("workspace_settings").select("id,client_id,workspace_slug,status").eq("workspace_slug", eligibility.workspaceSlug),
      verificationSupabase.from("product_entitlements").select("id,client_id,product_key,status").eq("id", entitlementId).eq("client_id", clientId).eq("product_key", eligibility.productKey).eq("status", "active"),
      verificationSupabase.from("workspace_memberships").select("id,client_id,user_id,role_key,status").eq("client_id", clientId).eq("user_id", admin.userId).eq("status", "active").maybeSingle(),
      verificationSupabase.from("workspace_memberships").select("id,client_id").eq("user_id", admin.userId).eq("status", "active").neq("client_id", clientId),
    ]);
    if (workspaceVerificationError || entitlementVerificationError || membershipVerificationError || crossTenantVerificationError) {
      throw Object.assign(new Error("Post-provision tenant verification could not be completed."), { code: "verification_query_failed" });
    }
    const ownedWorkspaceRows = (workspaceRows ?? []).filter((row) => row.client_id === clientId && row.status === "active");
    const destinationAfterProvisioning = verifyWorkspaceDestination(eligibility.workspaceSlug);
    const health = buildRetailHealthChecks({
      organisationId: text(job.result_data.organisationId) || null,
      workspaceSlug: text(job.result_data.workspaceSlug) || null,
      entitlementId: text((job.result_data.product as { entitlementId?: unknown } | undefined)?.entitlementId) || null,
      adminUserId: text(job.result_data.adminUserId) || null,
      starterProjectId: text((job.result_data.product as { starterProjectId?: unknown } | undefined)?.starterProjectId) || null,
      checklistId: text((job.result_data.product as { checklistId?: unknown } | undefined)?.checklistId) || null,
      manifestVersion: text((job.result_data.manifest as { manifestVersion?: unknown } | undefined)?.manifestVersion) || null,
      productKey: eligibility.productKey,
      workspaceBelongsToDraft: draft.id === job.acquisition_draft_id,
      expectedWorkspaceExists: ownedWorkspaceRows.length === 1,
      duplicateWorkspaceCount: (workspaceRows ?? []).length,
      crossTenantReferenceCount: (otherTenantMemberships ?? []).length,
      ownerMembershipExists: Boolean(administratorMembership),
      entitlementVerified: (entitlementRows ?? []).length === 1,
      destinationVerified: destinationAfterProvisioning.hostname === `${eligibility.workspaceSlug}.deployiq.ng`
        && destinationAfterProvisioning.adminWorkspaceUrl === buildAdminWorkspaceUrl(eligibility.workspaceSlug),
      roleCount: Array.isArray((job.result_data.product as { roleIds?: unknown } | undefined)?.roleIds)
        ? ((job.result_data.product as { roleIds?: string[] }).roleIds ?? []).length
        : 0,
      permissionCount: Number((job.result_data.product as { permissionCount?: unknown } | undefined)?.permissionCount ?? 0),
    });
    job = await updateJob(job, "running_post_checks", {
      result_data: mergeResult(job, { healthChecks: health.checks, healthChecksPassed: health.passed }),
    });
    if (!health.passed) {
      throw Object.assign(new Error("Post-provision checks failed."), { code: "post_check_failed" });
    }

    job = await updateJob(job, "completed", {
      result_data: mergeCompletionResult(job, {
        completedAt: new Date().toISOString(),
        workspaceId: job.result_data.organisationId,
        clientId: job.result_data.organisationId,
        organisationName: text(data.organisationName),
        workspaceName: text(data.workspaceName) || text(data.organisationName),
        productKey: eligibility.productKey,
        productName: manifest.productName ?? "DeployIQ Retail",
        manifestVersion: manifest.manifestVersion ?? null,
        administratorEmail: adminEmail,
        commercialReference: eligibility.commercialReference,
        workspaceReady: job.result_data.workspaceReady === true,
      }),
    });

    await updateOnboardingDraft({
      resumeToken,
      status: "provisioned",
      currentStep: "success",
      authenticatedUserId: text(job.result_data.adminUserId) || null,
      pricingSnapshotId: draft.pricing_snapshot_id,
      draftData: {
        ...data,
        provisioningJobId: job.id,
        provisionedClientId: job.result_data.organisationId,
        provisionedAdminUserId: job.result_data.adminUserId,
        workspaceUrl: job.result_data.workspaceUrl,
        adminWorkspaceUrl: job.result_data.adminWorkspaceUrl,
        workspaceReady: job.result_data.workspaceReady === true,
        provisioningStatus: "completed",
        provisionedAt: new Date().toISOString(),
      },
    });
    if (job.result_data.workspaceReady === true) {
      await safelyDeliverWorkspaceReadyNotifications(job);
    }

    return {
      job,
      completed: job.result_data.workspaceReady === true,
      customerMessage: job.result_data.workspaceReady === true
        ? "Your workspace has been created."
        : "Your commercial onboarding is complete. Your DeployIQ workspace is currently being prepared, and this is taking a little longer than expected.",
      workspaceUrl: job.result_data.workspaceReady === true ? text(job.result_data.workspaceUrl) : undefined,
      adminWorkspaceUrl: job.result_data.workspaceReady === true
        ? text(job.result_data.adminWorkspaceUrl) || buildAdminWorkspaceUrl(eligibility.workspaceSlug)
        : undefined,
      workspaceReady: job.result_data.workspaceReady === true,
      workspaceDestination: job.result_data.workspaceDestination as WorkspaceDestinationReadiness | undefined,
      accountSetupLink: process.env.NODE_ENV === "development" ? text(job.result_data.accountSetupLink) || null : null,
    };
  } catch (error) {
    const failure = buildProvisioningFailureMetadata(job, error);
    job = await updateJob(job, "failed", {
      failure_code: failure.failureCode,
      failure_message: failure.failureMessage,
      result_data: mergeResult(job, {
        customerFailureMessage: CUSTOMER_FAILURE,
        failedSafeStage: failure.failedSafeStage,
        failureClassification: failure.classification,
        retryable: failure.retryable,
      }),
    });
    await updateOnboardingDraft({
      resumeToken,
      status: "failed",
      currentStep: "provisioning",
      pricingSnapshotId: draft.pricing_snapshot_id,
      failureReason: CUSTOMER_FAILURE,
      draftData: {
        ...(draft.draft_data ?? {}),
        provisioningJobId: job.id,
        provisioningStatus: "failed",
        provisioningFailureCode: failure.failureCode,
        provisioningFailedStage: failure.failedSafeStage,
      },
    });
    throw Object.assign(new Error(CUSTOMER_FAILURE), {
      status: failure.classification === "security_rejected" ? 403 : failure.classification === "approval_required" ? 409 : 500,
      code: failure.failureCode,
      classification: failure.classification,
      failedStage: failure.failedSafeStage,
      retryable: failure.retryable,
      job,
    });
  }
}

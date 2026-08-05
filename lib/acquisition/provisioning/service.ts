import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { getOnboardingDraftByToken, updateOnboardingDraft } from "@/lib/commercial/onboarding/service";
import { upsertPlatformProvisioningContext } from "@/lib/commercial/provisioning/platform";
import { provisionRetailProduct } from "@/lib/commercial/provisioning/products/retail";
import { upsertUserProfileWithRetry } from "@/lib/userManagement";
import { getProductProvisioningManifest, type ProvisioningStage } from "./registry";
import { validateProvisioningEligibility } from "./validation";
import { buildProvisioningFailureMetadata } from "./failure";

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

async function recordEvent(jobId: string, stage: ProvisioningStage, eventType: string, message: string, metadata?: Record<string, unknown>) {
  const supabase = createAdminSupabase();
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
  if (error) throw error;
  const job = normaliseJob(data as Record<string, unknown>);
  await recordEvent(job.id, "queued", "job_created", "Provisioning job created.");
  return job;
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

  const { error: roleError } = await supabase
    .schema("public")
    .from("user_roles")
    .upsert({ user_id: authUser.id, role: "client", client_id: input.organisationId }, { onConflict: "user_id" });
  if (roleError) throw roleError;

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
  };
}

export async function provisionAcquisitionWorkspace(resumeToken: string): Promise<ProvisioningResult> {
  const draft = await getOnboardingDraftByToken(resumeToken);
  if (!draft) {
    throw Object.assign(new Error("Acquisition session not found."), { status: 404, code: "draft_not_found" });
  }

  const eligibility = validateProvisioningEligibility(draft);
  if (!eligibility.ok) {
    throw Object.assign(new Error(eligibility.message), { status: 400, code: eligibility.code });
  }

  let job = await createOrResumeJob({
    draftId: draft.id,
    commercialReference: eligibility.commercialReference,
    productKey: eligibility.productKey,
    workspaceSlug: eligibility.workspaceSlug,
  });

  if (job.status === "completed") {
    return {
      job,
      completed: true,
      customerMessage: "Your workspace has already been created.",
      workspaceUrl: `https://${job.workspace_slug}.deployiq.ng`,
      accountSetupLink: process.env.NODE_ENV === "development" ? text(job.result_data.accountSetupLink) || null : null,
    };
  }

  job = await incrementAttempt(job);

  try {
    job = await updateJob(job, "validating");
    const manifest = getProductProvisioningManifest(eligibility.productKey);
    if (!manifest) {
      throw Object.assign(new Error("No provisioning manifest is configured for this product."), { code: "manifest_not_configured" });
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
      organisationName: text(data.organisationName),
      contactPerson: adminName,
      businessEmail: adminEmail,
      phoneNumber: text(data.adminMobile),
      country: text(data.country),
    });
    job = await updateJob(job, "creating_workspace", {
      result_data: mergeResult(job, {
        organisationId: platform.organisationId,
        workspaceSlug: eligibility.workspaceSlug,
        workspaceUrl: `https://${eligibility.workspaceSlug}.deployiq.ng`,
      }),
    });

    job = await updateJob(job, "configuring_product");
    let productResult: Record<string, unknown> = { skipped: true, reason: "assisted_product" };
    if (eligibility.productKey === "retail") {
      const quantity = eligibility.quotation.quantity;
      const projectName = `${text(data.organisationName) || "DeployIQ"} Retail Deployment`;
      productResult = await provisionRetailProduct({
        organisationId: platform.organisationId,
        campaignName: projectName,
        projectName,
        brandName: text(data.organisationName) || "DeployIQ",
        capacity: quantity,
        productKey: eligibility.productKey,
      });
    }
    job = await updateJob(job, "creating_administrator", {
      result_data: mergeResult(job, { manifest, product: productResult }),
    });

    const admin = await ensureAdminUser({
      email: adminEmail,
      name: adminName,
      phone: text(data.adminMobile) || null,
      organisationId: platform.organisationId,
    });

    job = await updateJob(job, "creating_permissions", {
      result_data: mergeResult(job, {
        adminUserId: admin.userId,
        accountSetupDelivery: "email_pending",
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
    if (!job.result_data.organisationId || !job.result_data.adminUserId) {
      throw Object.assign(new Error("Post-provision checks failed."), { code: "post_check_failed" });
    }

    job = await updateJob(job, "completed", {
      result_data: mergeResult(job, {
        completedAt: new Date().toISOString(),
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
        provisioningStatus: "completed",
        provisionedAt: new Date().toISOString(),
      },
    });

    return {
      job,
      completed: true,
      customerMessage: "Your workspace has been created.",
      workspaceUrl: text(job.result_data.workspaceUrl),
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
    throw Object.assign(new Error(CUSTOMER_FAILURE), { status: 500, code: failure.failureCode, failedStage: failure.failedSafeStage, retryable: true, job });
  }
}

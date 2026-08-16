import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type { OnboardingDraft, OnboardingDraftStatus, OnboardingProductKey, OnboardingStep } from "@/lib/commercial/onboarding/types";
import { isActivationPendingDraft, isEligibleIncompleteDraft } from "@/lib/commercial/onboarding/stepMapping";

function makeResumeToken() {
  return `deployiq-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function normaliseDraft(record: Record<string, unknown>): OnboardingDraft {
  return {
    id: String(record.id ?? ""),
    resume_token: String(record.resume_token ?? ""),
    email: typeof record.email === "string" ? record.email : null,
    status: (record.status as OnboardingDraftStatus) ?? "started",
    current_step: (record.current_step as OnboardingStep) ?? "welcome",
    draft_data: (record.draft_data as Record<string, unknown>) ?? {},
    selected_product: (record.selected_product as OnboardingProductKey | null) ?? null,
    pricing_snapshot_id: typeof record.pricing_snapshot_id === "string" ? record.pricing_snapshot_id : null,
    authenticated_user_id: typeof record.authenticated_user_id === "string" ? record.authenticated_user_id : null,
    expires_at: typeof record.expires_at === "string" ? record.expires_at : null,
    last_updated_at: typeof record.last_updated_at === "string" ? record.last_updated_at : null,
    completed_at: typeof record.completed_at === "string" ? record.completed_at : null,
    abandoned_at: typeof record.abandoned_at === "string" ? record.abandoned_at : null,
    failure_reason: typeof record.failure_reason === "string" ? record.failure_reason : null,
    created_at: typeof record.created_at === "string" ? record.created_at : ""
  };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isProvisioningCompleteStatus(status: unknown, data: Record<string, unknown>) {
  return ["provisioned", "completed"].includes(text(status)) || text(data.provisioningStatus) === "completed";
}

function preserveCompletedProvisioningState(input: {
  existing: OnboardingDraft;
  nextStatus: OnboardingDraftStatus;
  nextStep: OnboardingStep;
  nextData: Record<string, unknown>;
}) {
  const existingData = input.existing.draft_data ?? {};
  if (!isProvisioningCompleteStatus(input.existing.status, existingData)) {
    return {
      status: input.nextStatus,
      currentStep: input.nextStep,
      draftData: input.nextData,
    };
  }

  if (isProvisioningCompleteStatus(input.nextStatus, input.nextData)) {
    return {
      status: input.nextStatus,
      currentStep: input.nextStep,
      draftData: {
        ...existingData,
        ...input.nextData,
        provisioningStatus: "completed",
      },
    };
  }

  return {
    status: input.existing.status,
    currentStep: input.existing.current_step,
    draftData: {
      ...input.nextData,
      provisioningJobId: existingData.provisioningJobId,
      provisionedClientId: existingData.provisionedClientId,
      provisionedAdminUserId: existingData.provisionedAdminUserId,
      workspaceUrl: existingData.workspaceUrl,
      adminWorkspaceUrl: existingData.adminWorkspaceUrl,
      workspaceReady: existingData.workspaceReady,
      provisioningStatus: "completed",
      provisionedAt: existingData.provisionedAt,
    },
  };
}

export async function createOnboardingDraft(input: { email?: string | null; currentStep?: OnboardingStep; draftData?: Record<string, unknown> }) {
  const adminSupabase = createAdminSupabase();
  const token = makeResumeToken();
  const { data, error } = await adminSupabase
    .from("onboarding_drafts")
    .insert({
      resume_token: token,
      email: input.email?.trim() || null,
      status: "started",
      current_step: input.currentStep ?? "welcome",
      draft_data: input.draftData ?? {},
      selected_product: null,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString()
    })
    .select()
    .single();

  if (error) throw error;
  return normaliseDraft(data as Record<string, unknown>);
}

export async function updateOnboardingDraft(input: { resumeToken: string; email?: string | null; status?: OnboardingDraftStatus; currentStep?: OnboardingStep; draftData?: Record<string, unknown>; selectedProduct?: OnboardingProductKey | null; authenticatedUserId?: string | null; pricingSnapshotId?: string | null; failureReason?: string | null }) {
  const adminSupabase = createAdminSupabase();
  const { data: existingRecord, error: existingError } = await adminSupabase
    .from("onboarding_drafts")
    .select("*")
    .eq("resume_token", input.resumeToken)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existingRecord) throw new Error("Draft not found.");
  const existingDraft = normaliseDraft(existingRecord as Record<string, unknown>);
  if (
    existingDraft.authenticated_user_id
    && input.authenticatedUserId !== undefined
    && input.authenticatedUserId !== existingDraft.authenticated_user_id
  ) {
    throw Object.assign(new Error("The verified onboarding owner cannot be changed."), { status: 403, code: "draft_owner_immutable" });
  }
  if (
    existingDraft.authenticated_user_id
    && input.email !== undefined
    && (input.email?.trim().toLowerCase() || null) !== (existingDraft.email?.trim().toLowerCase() || null)
  ) {
    throw Object.assign(new Error("The verified onboarding email cannot be changed."), { status: 403, code: "draft_email_immutable" });
  }
  const preserved = preserveCompletedProvisioningState({
    existing: existingDraft,
    nextStatus: input.status ?? existingDraft.status,
    nextStep: input.currentStep ?? existingDraft.current_step,
    nextData: input.draftData ?? existingDraft.draft_data ?? {},
  });
  const payload: Record<string, unknown> = {
    ...(input.email !== undefined ? { email: input.email?.trim().toLowerCase() || null } : {}),
    status: preserved.status,
    current_step: preserved.currentStep,
    draft_data: preserved.draftData,
    last_updated_at: new Date().toISOString()
  };
  if (input.selectedProduct !== undefined) payload.selected_product = input.selectedProduct;
  if (input.authenticatedUserId !== undefined) payload.authenticated_user_id = input.authenticatedUserId;
  if (input.pricingSnapshotId !== undefined) payload.pricing_snapshot_id = input.pricingSnapshotId;
  if (input.failureReason !== undefined) payload.failure_reason = input.failureReason;

  const { data, error } = await adminSupabase
    .from("onboarding_drafts")
    .update(payload)
    .eq("resume_token", input.resumeToken)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Draft not found.");
  return normaliseDraft(data as Record<string, unknown>);
}

async function reconcileCompletedActivationDraft(draft: OnboardingDraft) {
  const data = draft.draft_data ?? {};
  const provisioningJobId = text(data.provisioningJobId);
  if (!provisioningJobId) return draft;

  const adminSupabase = createAdminSupabase();
  const { data: job, error: jobError } = await adminSupabase
    .from("provisioning_jobs")
    .select("*")
    .eq("id", provisioningJobId)
    .maybeSingle();
  if (jobError) throw jobError;
  const result = (job?.result_data as Record<string, unknown> | null) ?? {};
  if (!job || job.status !== "completed" || job.current_stage !== "completed") return draft;
  if (result.healthChecksPassed !== true) return draft;

  const clientId = text(result.clientId) || text(result.workspaceId) || text(result.organisationId) || text(data.provisionedClientId);
  const adminUserId = text(result.adminUserId) || text(data.provisionedAdminUserId) || text(draft.authenticated_user_id);
  if (!clientId || !adminUserId) return draft;

  const [
    { data: role },
    { data: membership },
    { data: settings },
    { data: entitlement },
  ] = await Promise.all([
    adminSupabase.from("user_roles").select("user_id,role,client_id").eq("user_id", adminUserId).maybeSingle(),
    adminSupabase.from("workspace_memberships").select("user_id,client_id,role_key,status").eq("user_id", adminUserId).eq("client_id", clientId).eq("status", "active").maybeSingle(),
    adminSupabase.from("workspace_settings").select("client_id,status,workspace_slug").eq("client_id", clientId).eq("status", "active").maybeSingle(),
    adminSupabase.from("product_entitlements").select("client_id,product_key,status").eq("client_id", clientId).eq("status", "active").maybeSingle(),
  ]);
  const roleKey = text((membership as { role_key?: unknown } | null)?.role_key);
  const hasCustomerAdminMembership = ["customer_admin", "workspace_owner", "workspace_administrator"].includes(roleKey);
  if ((role as { role?: unknown; client_id?: unknown } | null)?.role !== "client") return draft;
  if (text((role as { client_id?: unknown } | null)?.client_id) && text((role as { client_id?: unknown } | null)?.client_id) !== clientId) return draft;
  if (!hasCustomerAdminMembership || !settings || !entitlement) return draft;

  return await updateOnboardingDraft({
    resumeToken: draft.resume_token,
    email: draft.email,
    status: "provisioned",
    currentStep: "success",
    selectedProduct: draft.selected_product,
    authenticatedUserId: adminUserId,
    pricingSnapshotId: draft.pricing_snapshot_id,
    failureReason: draft.failure_reason,
    draftData: {
      ...data,
      provisioningJobId,
      provisionedClientId: clientId,
      provisionedAdminUserId: adminUserId,
      workspaceUrl: result.workspaceUrl ?? data.workspaceUrl,
      adminWorkspaceUrl: result.adminWorkspaceUrl ?? data.adminWorkspaceUrl,
      workspaceReady: result.workspaceReady === true,
      provisioningStatus: "completed",
      provisionedAt: data.provisionedAt ?? result.completedAt ?? new Date().toISOString(),
      activationReconciledAt: new Date().toISOString(),
    },
  });
}

export async function getOnboardingDraftByToken(token: string) {
  const adminSupabase = createAdminSupabase();
  const { data, error } = await adminSupabase
    .from("onboarding_drafts")
    .select("*")
    .eq("resume_token", token)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return normaliseDraft(data as Record<string, unknown>);
}

export async function getEligibleIncompleteDraftsForCustomer(input: { userId?: string | null; email?: string | null }) {
  const userId = input.userId?.trim() || "";
  const email = input.email?.trim().toLowerCase() || "";
  if (!userId) return [];

  const adminSupabase = createAdminSupabase();
  let query = adminSupabase
    .from("onboarding_drafts")
    .select("*")
    .not("status", "in", "(provisioned,completed,abandoned)")
    .order("last_updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(5);

  if (email) {
    query = query.or(`authenticated_user_id.eq.${userId},email.eq.${email}`);
  } else {
    query = query.eq("authenticated_user_id", userId);
  }

  const { data, error } = await query;
  if (error) throw error;
  const drafts = (data ?? []).map((record) => normaliseDraft(record as Record<string, unknown>));
  return drafts.filter((draft) => isEligibleIncompleteDraft(draft) && !isActivationPendingDraft(draft));
}

export async function getLatestEligibleIncompleteDraftForCustomer(input: { userId?: string | null; email?: string | null }) {
  const drafts = await getEligibleIncompleteDraftsForCustomer(input);
  return drafts[0] ?? null;
}

export async function getLatestActivationDraftForCustomer(input: { userId?: string | null; email?: string | null }) {
  const userId = input.userId?.trim() || "";
  const email = input.email?.trim().toLowerCase() || "";
  if (!userId) return null;

  const adminSupabase = createAdminSupabase();
  let query = adminSupabase
    .from("onboarding_drafts")
    .select("*")
    .not("status", "in", "(provisioned,completed,abandoned)")
    .order("last_updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(10);

  if (email) {
    query = query.or(`authenticated_user_id.eq.${userId},email.eq.${email}`);
  } else {
    query = query.eq("authenticated_user_id", userId);
  }

  const { data, error } = await query;
  if (error) throw error;
  const drafts = [];
  for (const record of data ?? []) {
    drafts.push(await reconcileCompletedActivationDraft(normaliseDraft(record as Record<string, unknown>)));
  }
  return drafts.find((draft) => isEligibleIncompleteDraft(draft) && isActivationPendingDraft(draft)) ?? null;
}

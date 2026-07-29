import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type { OnboardingDraft, OnboardingDraftStatus, OnboardingProductKey, OnboardingStep } from "@/lib/commercial/onboarding/types";

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

export async function updateOnboardingDraft(input: { resumeToken: string; status?: OnboardingDraftStatus; currentStep?: OnboardingStep; draftData?: Record<string, unknown>; selectedProduct?: OnboardingProductKey | null; authenticatedUserId?: string | null; pricingSnapshotId?: string | null; failureReason?: string | null }) {
  const adminSupabase = createAdminSupabase();
  const payload: Record<string, unknown> = {
    status: input.status ?? "started",
    current_step: input.currentStep ?? "welcome",
    draft_data: input.draftData ?? {},
    selected_product: input.selectedProduct ?? null,
    authenticated_user_id: input.authenticatedUserId ?? null,
    pricing_snapshot_id: input.pricingSnapshotId ?? null,
    failure_reason: input.failureReason ?? null,
    last_updated_at: new Date().toISOString()
  };

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

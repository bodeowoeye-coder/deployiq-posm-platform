import type { UserRole } from "@/lib/types";
import { getLatestActivationDraftForCustomer, getLatestEligibleIncompleteDraftForCustomer } from "@/lib/commercial/onboarding/service";
import { createAdminSupabase } from "@/lib/supabaseAdmin";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dbErrorSummary(error: unknown) {
  if (!error || typeof error !== "object") return { message: "Unknown error" };
  const record = error as Record<string, unknown>;
  return {
    message: typeof record.message === "string" ? record.message : "Unknown error",
    code: typeof record.code === "string" ? record.code : null,
    status: typeof record.status === "number" ? record.status : null,
  };
}

async function hasCustomerAdminMembership(userId: string, clientId: string) {
  const delays = [120, 360];
  for (let attempt = 1; attempt <= delays.length + 1; attempt += 1) {
    const { data, error } = await createAdminSupabase()
      .from("workspace_memberships")
      .select("role_key,status")
      .eq("user_id", userId)
      .eq("client_id", clientId)
      .eq("status", "active")
      .maybeSingle();
    if (!error) {
      const roleKey = text(data?.role_key);
      console.info("[auth-destination]", {
        stage: "customer-admin-membership",
        attempt,
        userId,
        clientId,
        membershipFound: Boolean(data),
        roleKey: roleKey || null,
        finalDestination: roleKey === "customer_admin" || roleKey === "workspace_owner" ? "/workspace/admin" : "/client",
      });
      return roleKey === "customer_admin" || roleKey === "workspace_owner";
    }
    console.warn("[auth-destination]", {
      stage: "customer-admin-membership",
      attempt,
      userId,
      clientId,
      result: "transient_failure",
      error: dbErrorSummary(error),
    });
    if (attempt <= delays.length) await sleep(delays[attempt - 1]);
  }
  throw new Error("Customer workspace membership lookup is temporarily unavailable.");
}

export function defaultDestinationForRole(role: UserRole, clientId?: string | null) {
  if (role === "admin") return "/admin";
  if (role === "installer") return "/submit";
  if (role === "client") return clientId ? "/client" : "/onboarding";
  return "/";
}

export async function defaultDestinationForResolvedUser(input: {
  role: UserRole;
  userId: string;
  clientId?: string | null;
  email?: string | null;
}) {
  if (input.role === "admin") return "/admin";
  if (input.role === "installer") return "/submit";
  if (input.role !== "client") return "/";

  const incompleteDraft = await getLatestEligibleIncompleteDraftForCustomer({
    userId: input.userId,
    email: input.email,
  });
  if (incompleteDraft) return "/onboarding";

  const activationDraft = await getLatestActivationDraftForCustomer({
    userId: input.userId,
    email: input.email,
  });
  if (activationDraft) return `/workspace/activation?token=${encodeURIComponent(activationDraft.resume_token)}`;
  if (!input.clientId) return "/onboarding";
  const isCustomerAdmin = await hasCustomerAdminMembership(input.userId, input.clientId);
  return isCustomerAdmin ? "/workspace/admin" : "/client";
}

export function sessionExpiredDestination() {
  return "/";
}

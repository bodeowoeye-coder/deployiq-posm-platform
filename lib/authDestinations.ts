import type { UserRole } from "@/lib/types";
import { getLatestActivationDraftForCustomer, getLatestEligibleIncompleteDraftForCustomer } from "@/lib/commercial/onboarding/service";

export function defaultDestinationForRole(role: UserRole, clientId?: string | null) {
  if (role === "admin") return "/admin";
  if (role === "installer") return "/submit";
  if (role === "client") return clientId ? "/workspace/admin" : "/onboarding";
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

  const [incompleteDraft, activationDraft] = await Promise.all([
    getLatestEligibleIncompleteDraftForCustomer({
      userId: input.userId,
      email: input.email,
    }),
    getLatestActivationDraftForCustomer({
      userId: input.userId,
      email: input.email,
    }),
  ]);
  if (incompleteDraft) return "/onboarding";
  if (activationDraft) return `/workspace/activation?token=${encodeURIComponent(activationDraft.resume_token)}`;
  if (!input.clientId) return "/onboarding";
  return "/workspace/admin";
}

export function sessionExpiredDestination() {
  return "/";
}

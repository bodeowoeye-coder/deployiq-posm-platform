import type { UserRole } from "@/lib/types";
import { getLatestActivationDraftForCustomer, getLatestEligibleIncompleteDraftForCustomer } from "@/lib/commercial/onboarding/service";
import { getOperationalNotificationDestination } from "@/lib/workspace/operationalNotifications";
import { resolveOperationalBuildDestination } from "@/lib/workspace/operationalBuildAccess";

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
  const workspaceDestination = await resolveOperationalBuildDestination({ userId: input.userId, clientId: input.clientId });
  if (workspaceDestination) return workspaceDestination;
  return await getOperationalNotificationDestination({ userId: input.userId, clientId: input.clientId }) ?? "/workspace/notifications";
}

export function sessionExpiredDestination() {
  return "/";
}

import "server-only";
import { reconcileAuthenticatedBuildNotifications } from "./service.ts";
import { runBuildNotificationPostMutationReconciliation, type BuildNotificationMutationBoundary } from "./postMutationCore.ts";

export async function reconcileBuildNotificationsAfterMutation(
  input: { projectId: string; boundary: BuildNotificationMutationBoundary },
) {
  return runBuildNotificationPostMutationReconciliation(input, reconcileAuthenticatedBuildNotifications);
}

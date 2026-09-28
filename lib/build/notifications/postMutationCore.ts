export type BuildNotificationMutationBoundary =
  | "activity_action"
  | "review_submission"
  | "inspection_decision"
  | "corrective_work_resumed"
  | "exception_created"
  | "exception_action";

export async function runBuildNotificationPostMutationReconciliation(
  input: { projectId: string; boundary: BuildNotificationMutationBoundary },
  reconcile: (input: { projectId: string }) => Promise<unknown>,
) {
  try {
    await reconcile({ projectId: input.projectId });
    return { status: "reconciled" as const };
  } catch {
    console.warn("[build-notifications] post-mutation reconciliation unavailable", {
      projectId: input.projectId,
      boundary: input.boundary,
    });
    return { status: "deferred_to_feed_backstop" as const };
  }
}

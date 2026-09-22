export const BUILD_NOTIFICATION_CATEGORIES = ["execution_block", "changes_required", "review_pending", "exception"] as const;
export type BuildNotificationCategory = typeof BUILD_NOTIFICATION_CATEGORIES[number];
export type BuildNotificationDestination = "activity_execution" | "activity_inspection" | "activity_exceptions";

export type BuildNotificationCandidate = {
  clientId: string;
  projectId: string;
  category: BuildNotificationCategory;
  sourceEntityType: "runtime_activity" | "runtime_exception";
  sourceEntityId: string;
  discriminator: "blocked" | "changes_required" | "submitted_for_review" | "active";
  active: boolean;
  authoritativeAt: string | null;
  destinationType: BuildNotificationDestination;
  destinationPath: string;
};

export type ExistingBuildNotificationCondition = Pick<BuildNotificationCandidate,
  "clientId" | "projectId" | "category" | "sourceEntityType" | "sourceEntityId" | "discriminator">;

export type BuildNotificationReconciliationResult = { activated: number; resolved: number; materialized: number };

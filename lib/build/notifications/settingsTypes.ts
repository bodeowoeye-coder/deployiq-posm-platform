export const BUILD_NOTIFICATION_CATEGORIES = ["execution_block", "changes_required", "review_pending", "exception"] as const;
export type BuildNotificationCategory = typeof BUILD_NOTIFICATION_CATEGORIES[number];

export const BUILD_NOTIFICATION_CATEGORY_PRESENTATION: Record<BuildNotificationCategory, { label: string; description: string }> = {
  execution_block: { label: "Activity Blocked", description: "Notify selected people when an Activity becomes blocked." },
  changes_required: { label: "Changes Required", description: "Notify selected people when reviewed work requires corrective action." },
  review_pending: { label: "Awaiting Review", description: "Notify selected people when work is submitted for review." },
  exception: { label: "Exception Update", description: "Notify selected people while an operational Exception requires action or verification." },
};

export type EligibleBuildNotificationRecipient = { userId: string; displayName: string; roleLabel: string; email?: string };
export type BuildNotificationPreference = {
  category: BuildNotificationCategory;
  label: string;
  description: string;
  enabled: boolean;
  revision: string | null;
  recipients: EligibleBuildNotificationRecipient[];
};
export type BuildNotificationSettings = {
  project: { id: string; name: string };
  channel: "in_app";
  preferences: BuildNotificationPreference[];
  eligibleRecipients: EligibleBuildNotificationRecipient[];
  canManage: boolean;
};
export type BuildNotificationSettingsUpdate = {
  preferences: Array<{ category: BuildNotificationCategory; enabled: boolean; revision: string | null; recipientUserIds: string[] }>;
};

import type { WorkspaceNotification } from "./presentation.ts";

type FeedSource = "retail" | "build";

export type WorkspaceNotificationFeed = {
  notifications: WorkspaceNotification[];
  unreadCount: number;
  partial: boolean;
  unavailableSources: FeedSource[];
};

export function composeWorkspaceNotificationFeed(
  retail: PromiseSettledResult<WorkspaceNotification[]>,
  build: PromiseSettledResult<WorkspaceNotification[]>,
): WorkspaceNotificationFeed {
  if (retail.status === "rejected" && build.status === "rejected") throw new Error("Could not load notifications");
  const unavailableSources: FeedSource[] = [];
  if (retail.status === "rejected") unavailableSources.push("retail");
  if (build.status === "rejected") unavailableSources.push("build");
  const notifications = [
    ...(retail.status === "fulfilled" ? retail.value : []),
    ...(build.status === "fulfilled" ? build.value : []),
  ].sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
    || `${left.source}:${left.id}`.localeCompare(`${right.source}:${right.id}`)).slice(0, 80);
  return { notifications, unreadCount: notifications.filter((item) => !item.readAt).length,
    partial: unavailableSources.length > 0, unavailableSources };
}

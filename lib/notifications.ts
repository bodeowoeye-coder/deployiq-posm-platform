export type NotificationAction = {
  status: string;
  title: string;
  message: string;
};

export const PROJECT_NOTIFICATION_ACTIONS: NotificationAction[] = [
  {
    status: "production_started",
    title: "Production Started",
    message: "Production has started for this deployment project."
  },
  {
    status: "production_completed",
    title: "Production Completed",
    message: "Production has been completed for this deployment project."
  },
  {
    status: "dispatched",
    title: "Dispatched",
    message: "Deployment materials have been dispatched."
  },
  {
    status: "arrived_at_destination",
    title: "Arrived at Destination",
    message: "Deployment materials have arrived at destination."
  },
  {
    status: "deployment_started",
    title: "Deployment Started",
    message: "Field deployment has started."
  },
  {
    status: "deployment_completed",
    title: "Deployment Completed",
    message: "Field deployment has been completed."
  }
];

export function notificationsEnabled() {
  return process.env.ENABLE_NOTIFICATIONS === "true" || process.env.NEXT_PUBLIC_ENABLE_NOTIFICATIONS === "true";
}

export function getNotificationAction(status: string) {
  return PROJECT_NOTIFICATION_ACTIONS.find((action) => action.status === status) ?? null;
}

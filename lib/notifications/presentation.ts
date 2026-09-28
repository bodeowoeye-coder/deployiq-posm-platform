export type WorkspaceNotificationSource = "retail" | "build";

export type WorkspaceNotification = {
  id: string;
  source: WorkspaceNotificationSource;
  category: string;
  title: string;
  summary: string;
  projectId: string | null;
  projectLabel: string | null;
  occurredAt: string;
  readAt: string | null;
  canAcknowledge: boolean;
  acknowledgedAt: string | null;
  state: "active" | "resolved" | "not_applicable";
  destination: { type: string; href: string; available: boolean } | null;
  retailDetails?: { phaseName: string | null; destination: string | null; quantity: number | null; campaignName: string | null };
};

type RetailNotificationRow = {
  id: string; project_id: string | null; title: string; message: string; status: string;
  created_at: string; read_at: string | null; project_name?: string | null; campaign_name?: string | null;
  phase_name?: string | null; destination?: string | null; quantity?: number | null;
};

export function projectRetailNotification(row: RetailNotificationRow): WorkspaceNotification {
  return {
    id: row.id, source: "retail", category: row.status, title: row.title, summary: row.message,
    projectId: row.project_id, projectLabel: row.project_name ?? null, occurredAt: row.created_at,
    readAt: row.read_at, canAcknowledge: false, acknowledgedAt: null, state: "not_applicable",
    destination: row.project_id
      ? { type: "retail_project", href: `/workspace/admin/projects/${encodeURIComponent(row.project_id)}`, available: true }
      : { type: "retail_submissions", href: "/workspace/admin/submissions", available: true },
    retailDetails: { phaseName: row.phase_name ?? null, destination: row.destination ?? null, quantity: row.quantity ?? null, campaignName: row.campaign_name ?? null },
  };
}

export const BUILD_NOTIFICATION_LABELS = {
  execution_block: "Activity Blocked",
  changes_required: "Changes Required",
  review_pending: "Awaiting Review",
  exception: "Exception Update",
} as const;

export function workspaceNotificationIdentity(item: Pick<WorkspaceNotification, "source" | "id">) {
  return `${item.source}:${item.id}`;
}

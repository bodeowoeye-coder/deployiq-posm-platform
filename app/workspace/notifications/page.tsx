import { WorkspaceNotificationsClient } from "@/components/workspace/WorkspaceNotificationsClient";

export default function OperationalNotificationsPage({ searchParams }: { searchParams: { projectId?: string } }) {
  return <WorkspaceNotificationsClient enabled projectId={searchParams.projectId ?? null} projects={[]} routeBase="/workspace/notifications" apiPath="/api/workspace/notifications" operationalBuildLinks />;
}

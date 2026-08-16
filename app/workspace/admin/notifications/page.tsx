import { redirect } from "next/navigation";
import { WorkspaceNotificationsClient } from "@/components/workspace/WorkspaceNotificationsClient";
import { notificationsEnabled } from "@/lib/notifications";
import { resolveCustomerWorkspaceContext, CustomerWorkspaceRedirect } from "@/lib/workspace/customerAdmin";
import { workspaceNotificationsEnabled } from "@/lib/notifications";
import { getCustomerWorkspaceProjectScope } from "@/lib/workspace/projectScope";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({ searchParams }: { searchParams?: { projectId?: string } }) {
  try {
    const workspace = await resolveCustomerWorkspaceContext();
    const projectScope = await getCustomerWorkspaceProjectScope(workspace, searchParams?.projectId);
    return <WorkspaceNotificationsClient enabled={await workspaceNotificationsEnabled(workspace)} projectId={searchParams?.projectId} projects={projectScope.projects} />;
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    return <WorkspaceNotificationsClient enabled={notificationsEnabled()} projectId={searchParams?.projectId} projects={[]} />;
  }
}

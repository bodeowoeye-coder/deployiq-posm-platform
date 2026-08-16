import { redirect } from "next/navigation";
import { WorkspaceAlertsClient } from "@/components/workspace/WorkspaceAlertsClient";
import { CustomerWorkspaceRedirect } from "@/lib/workspace/customerAdmin";
import { getWorkspaceAlertsDashboard } from "@/lib/workspace/alerts";
import { getCustomerWorkspaceProjectScope } from "@/lib/workspace/projectScope";

export const dynamic = "force-dynamic";

export default async function WorkspaceAlertsPage({ searchParams }: { searchParams?: { projectId?: string } }) {
  try {
    const dashboard = await getWorkspaceAlertsDashboard(searchParams?.projectId);
    const projectScope = await getCustomerWorkspaceProjectScope(dashboard.workspace, searchParams?.projectId);
    return <div className="space-y-6"><div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"><p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Customer Workspace</p><h2 className="mt-2 text-2xl font-bold">Alerts</h2><p className="mt-2 text-sm text-slate-600">Review tenant-scoped project and deployment exceptions.</p></div><WorkspaceAlertsClient dashboard={dashboard} projectId={searchParams?.projectId} projects={projectScope.projects} /></div>;
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }

}

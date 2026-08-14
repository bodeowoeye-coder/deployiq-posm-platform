import { redirect } from "next/navigation";
import { ProjectCreateWizard } from "@/components/workspace/ProjectCreateWizard";
import { CustomerWorkspaceRedirect } from "@/lib/workspace/customerAdmin";
import { getCustomerProjectDashboard } from "@/lib/workspace/projects";

export const dynamic = "force-dynamic";

export default async function NewWorkspaceProjectPage() {
  let dashboard;
  try {
    dashboard = await getCustomerProjectDashboard();
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Customer Workspace</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950">CREATE PROJECT</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Create the canonical project and its initial campaign information for this workspace.</p>
      </div>
      <ProjectCreateWizard
        productName={dashboard.workspace.productName}
        productKey={dashboard.workspace.productKey}
        directory={dashboard.directory}
      />
    </div>
  );
}

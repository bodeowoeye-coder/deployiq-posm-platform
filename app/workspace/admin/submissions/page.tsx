import { redirect } from "next/navigation";
import { WorkspaceSubmissionsClient } from "@/components/workspace/WorkspaceSubmissionsClient";
import { CustomerWorkspaceRedirect } from "@/lib/workspace/customerAdmin";
import { getWorkspaceDeploymentSubmissions } from "@/lib/workspace/deploymentExecution";

export const dynamic = "force-dynamic";

export default async function WorkspaceSubmissionsPage() {
  let dashboard;
  try {
    dashboard = await getWorkspaceDeploymentSubmissions();
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Deployment Execution</p>
        <h2 className="mt-2 text-2xl font-bold">Submissions</h2>
        <p className="mt-2 text-sm text-slate-600">Review deployment submissions, evidence status and approval outcomes for this workspace.</p>
      </div>

      <WorkspaceSubmissionsClient dashboard={dashboard} />
    </div>
  );
}

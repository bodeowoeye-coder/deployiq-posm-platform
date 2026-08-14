import { ApprovalWorkflowClient } from "@/components/workspace/ApprovalWorkflowClient";
import { getApprovalWorkflowDashboard } from "@/lib/workspace/approvalWorkflow";

export const dynamic = "force-dynamic";

export default async function ApprovalWorkflowPage() {
  const dashboard = await getApprovalWorkflowDashboard();

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Workspace Settings</p>
        <h2 className="mt-2 text-2xl font-bold">APPROVAL WORKFLOW</h2>
        <p className="mt-2 text-sm text-slate-600">Configure how deployment submissions are reviewed, corrected and approved within this workspace.</p>
      </div>

      <ApprovalWorkflowClient dashboard={dashboard} />
    </div>
  );
}

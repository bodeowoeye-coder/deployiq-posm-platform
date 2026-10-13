import { getBuildManagementSummary } from "@/lib/build/management/service";
import { getBuildProjectWorkspaceOverview } from "@/lib/build/projects/workspaceOverview";

export const dynamic = "force-dynamic";

export default async function OperationalBuildProjectOverviewPage({ params }: { params: { id: string } }) {
  const [overview, management] = await Promise.all([getBuildProjectWorkspaceOverview(params.id), getBuildManagementSummary(params.id)]);
  const facts = [
    ["Sites", overview.counts.sites], ["Work Packages", overview.counts.workPackages], ["Activities", management.activities.total],
    ["In Progress", management.activities.in_progress], ["Awaiting Review", management.activities.submitted_for_review], ["Active Exceptions", management.exceptions.active],
    ["Currently Overdue", management.schedule.currentlyOverdue], ["Attention Items", management.managementAttention.outstandingObligations],
  ] as const;
  return <div className="space-y-5"><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{facts.map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>)}</section>{!management.hasWorkPlans ? <section className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">No runtime Work Plans exist for this project yet.</section> : <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-black">Current operational state</h2><p className="mt-2 text-sm text-slate-600">Project information is read from the existing Build execution, schedule, dependency, inspection and exception records.</p></section>}</div>;
}

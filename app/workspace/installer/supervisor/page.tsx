import { getSupervisorDeploymentDashboard } from "@/lib/workspace/deploymentExecution";

export const dynamic = "force-dynamic";

const SUPERVISOR_KPI_LABELS = ["Assigned Installers", "Live Progress", "Pending Approvals", "Rejected Work", "Outstanding Assignments"];

export default async function SupervisorWorkspacePage() {
  const dashboard = await getSupervisorDeploymentDashboard();
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto w-[min(1120px,calc(100%-28px))] py-6">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Supervisor View</p>
          <h1 className="mt-2 text-2xl font-bold">Field Progress</h1>
          <p className="mt-2 text-sm text-slate-600">Monitor assigned installers, pending approvals, rejected work and outstanding assignments.</p>
        </div>
        <section className="mt-6 grid gap-3 md:grid-cols-5" aria-label="Supervisor summary">
          {SUPERVISOR_KPI_LABELS.map((label) => {
            const item = dashboard.kpis.find((kpi) => kpi.label === label) ?? { label, value: 0 };
            return (
            <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{item.label}</p>
              <p className="mt-2 text-2xl font-bold">{item.value}</p>
            </div>
            );
          })}
        </section>
      </section>
    </main>
  );
}

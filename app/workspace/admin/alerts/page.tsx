import Link from "next/link";
import { redirect } from "next/navigation";
import { CustomerWorkspaceRedirect } from "@/lib/workspace/customerAdmin";
import { getWorkspaceAlertsDashboard } from "@/lib/workspace/alerts";

export const dynamic = "force-dynamic";

function severityClass(severity: string) {
  if (severity === "High") return "border-rose-200 bg-rose-50 text-rose-800";
  if (severity === "Medium") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

export default async function WorkspaceAlertsPage() {
  let dashboard;
  try {
    dashboard = await getWorkspaceAlertsDashboard();
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Customer Workspace</p>
        <h2 className="mt-2 text-2xl font-bold">Alerts</h2>
        <p className="mt-2 text-sm text-slate-600">Review tenant-scoped project and deployment exceptions.</p>
      </div>

      {dashboard.loadError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">{dashboard.loadError}</div>
      ) : null}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {dashboard.alerts.length === 0 ? (
          <div className="p-8 text-center">
            <h3 className="text-lg font-bold">No active alerts.</h3>
            <p className="mt-2 text-sm text-slate-600">Project and submission risks for this workspace will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-500">
                <tr>{["Severity", "Alert", "Details", "Actions"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dashboard.alerts.map((alert) => (
                  <tr key={alert.id} className="align-top">
                    <td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-bold ${severityClass(alert.severity)}`}>{alert.severity}</span></td>
                    <td className="px-4 py-3 font-bold text-slate-950">{alert.title}</td>
                    <td className="px-4 py-3 text-slate-700">{alert.detail}</td>
                    <td className="px-4 py-3"><Link href={alert.href} className="font-bold text-orange-600 hover:text-orange-700">Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

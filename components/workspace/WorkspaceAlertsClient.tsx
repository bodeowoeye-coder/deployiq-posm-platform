"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkspaceAlertsDashboard } from "@/lib/workspace/alerts";

type Props = { dashboard: WorkspaceAlertsDashboard; projectId?: string; projects: Array<{ id: string; project_name: string; campaign_name?: string | null }> };

export function WorkspaceAlertsClient({ dashboard, projectId: selectedProjectId, projects }: Props) {
  const router = useRouter();
  const [severity, setSeverity] = useState("all");
  const [projectId, setProjectId] = useState(selectedProjectId || "all");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const projectOptions = projects.length > 0 ? projects.map((project) => [project.id, project.project_name] as [string, string]) : Array.from(new Map(dashboard.alerts.filter((alert) => alert.projectId).map((alert) => [alert.projectId as string, alert.projectName || "Project"])).entries());
  const typeOptions = Array.from(new Set(dashboard.alerts.map((alert) => alert.type))).sort();
  const statusOptions = Array.from(new Set(dashboard.alerts.map((alert) => alert.status).filter((status): status is string => Boolean(status)))).sort();
  const alerts = useMemo(() => dashboard.alerts.filter((alert) =>
    (severity === "all" || alert.severity === severity) &&
    (projectId === "all" || alert.projectId === projectId) &&
    (type === "all" || alert.type === type) &&
    (status === "all" || alert.status === status)
  ), [dashboard.alerts, projectId, severity, status, type]);

  return (
    <div className="space-y-6">
      {dashboard.loadError ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">{dashboard.loadError}</div> : null}
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Filter label="Severity"><select value={severity} onChange={(event) => setSeverity(event.target.value)} className="control"><option value="all">All alerts</option><option value="High">High</option><option value="Medium">Medium</option><option value="Low">Low</option></select></Filter>
          <Filter label="Project"><select value={projectId} onChange={(event) => { const value = event.target.value; setProjectId(value); router.push(`/workspace/admin/alerts${value === "all" ? "" : `?projectId=${encodeURIComponent(value)}`}`); }} className="control"><option value="all">All projects</option>{projectOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Filter>
          <Filter label="Alert type"><select value={type} onChange={(event) => setType(event.target.value)} className="control"><option value="all">All alert types</option>{typeOptions.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></Filter>
          <Filter label="Status"><select value={status} onChange={(event) => setStatus(event.target.value)} className="control"><option value="all">All statuses</option>{statusOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></Filter>
        </div>
      </section>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {alerts.length === 0 ? <div className="p-8 text-center"><h3 className="text-lg font-bold">No active alerts.</h3><p className="mt-2 text-sm text-slate-600">Project and submission risks for this workspace will appear here.</p></div> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-500"><tr>{["Severity", "Alert", "Project", "Details", "Date", "Action"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{alerts.map((alert) => <tr key={alert.id} className="align-top"><td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-bold ${severityClass(alert.severity)}`}>{alert.severity}</span></td><td className="px-4 py-3 font-bold text-slate-950">{alert.title}</td><td className="px-4 py-3 text-slate-700">{alert.projectName || "Workspace"}</td><td className="px-4 py-3 text-slate-700">{alert.detail}</td><td className="px-4 py-3 text-slate-600">{alert.createdAt ? new Date(alert.createdAt).toLocaleDateString() : "Project rule"}</td><td className="px-4 py-3"><a href={alert.href} className="font-bold text-orange-600 hover:text-orange-700">{alert.submissionId ? "Review Submission" : "View Project"}</a></td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}

function severityClass(severity: string) { if (severity === "High") return "border-rose-200 bg-rose-50 text-rose-800"; if (severity === "Medium") return "border-amber-200 bg-amber-50 text-amber-900"; return "border-slate-200 bg-slate-100 text-slate-700"; }
function Filter({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-semibold text-slate-700"><span className="mb-1.5 block text-xs uppercase tracking-widest text-slate-500">{label}</span>{children}</label>; }

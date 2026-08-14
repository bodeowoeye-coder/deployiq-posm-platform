"use client";

import { useEffect, useMemo, useState } from "react";
import { readQueuedSubmissions } from "@/lib/installerDrafts";
import type { getInstallerAssignments } from "@/lib/workspace/deploymentExecution";

type Dashboard = Awaited<ReturnType<typeof getInstallerAssignments>>;

const INSTALLER_KPI_LABELS = ["Assigned Today", "Pending", "Completed", "Rejected", "Awaiting Approval", "GPS Issues"];

function title(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function statusClass(status: string) {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "in_progress") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "ready") return "border-orange-200 bg-orange-50 text-orange-800";
  return "border-slate-200 bg-white text-slate-700";
}

export function InstallerWorkspaceClient({ dashboard }: { dashboard: Dashboard }) {
  const [online, setOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const pending = useMemo(() => dashboard.assignments.filter((item) => item.status !== "completed"), [dashboard.assignments]);

  useEffect(() => {
    const refresh = () => {
      setOnline(navigator.onLine);
      void readQueuedSubmissions().then((rows) => {
        setQueueCount(rows.filter((row) => row.fields.submissionEndpoint?.startsWith("/api/workspace/installer")).length);
      });
    };
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-16 w-[min(1120px,calc(100%-28px))] items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Installer Workspace</p>
            <h1 className="text-lg font-bold">My Assignments</h1>
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className={`rounded-full border px-3 py-1 ${online ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{online ? "Online" : "Offline"}</span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">Offline queue: {queueCount || "No offline submissions waiting to sync."}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-[min(1120px,calc(100%-28px))] py-6">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6" aria-label="Assignment summary">
          {INSTALLER_KPI_LABELS.map((label) => {
            const item = dashboard.kpis.find((kpi) => kpi.label === label) ?? { label, value: 0 };
            return (
            <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{item.label}</p>
              <p className="mt-2 text-2xl font-bold">{item.value}</p>
            </div>
            );
          })}
        </section>

        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-base font-bold">Performance</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Completed" value={String(dashboard.performance.completed)} />
            <Metric label="Pending" value={String(dashboard.performance.pending)} />
            <Metric label="Rejected" value={String(dashboard.performance.rejected)} />
            <Metric label="Approval %" value={`${dashboard.performance.approvalPercent}%`} />
            <Metric label="GPS %" value={`${dashboard.performance.gpsPercent}%`} />
            <Metric label="Avg Completion Time" value={dashboard.performance.averageCompletionTime} />
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {pending.length === 0 ? (
            <div className="p-8 text-center">
              <h2 className="text-lg font-bold">No deployments have been assigned yet.</h2>
              <p className="mt-2 text-sm text-slate-600">New campaign assignments will appear here when your manager assigns them.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-500">
                  <tr>{["Campaign", "Project", "Outlet", "Address", "State", "Priority", "Due Date", "Status", "Actions"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pending.map((assignment) => (
                    <tr key={assignment.id} className="align-top">
                      <td className="px-4 py-3 font-bold">{assignment.campaign}</td>
                      <td className="px-4 py-3">{assignment.project}</td>
                      <td className="px-4 py-3">{assignment.outlet}</td>
                      <td className="px-4 py-3">{assignment.address || "Not set"}</td>
                      <td className="px-4 py-3">{assignment.state || "Not set"}</td>
                      <td className="px-4 py-3">{assignment.priority}</td>
                      <td className="px-4 py-3">{assignment.dueDate || "Not set"}</td>
                      <td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-bold ${statusClass(assignment.status)}`}>{title(assignment.status)}</span></td>
                      <td className="px-4 py-3"><a href={`/workspace/installer/assignments/${assignment.id}`} className="font-bold text-orange-600">Open</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}

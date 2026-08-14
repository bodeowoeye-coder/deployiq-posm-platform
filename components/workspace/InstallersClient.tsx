"use client";

import { useState } from "react";
import type { getInstallerDashboard } from "@/lib/workspace/fieldResources";

type Dashboard = Awaited<ReturnType<typeof getInstallerDashboard>>;
type Installer = Dashboard["installers"][number];

function title(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function statusClass(status: string) {
  if (status === "available") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "busy") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "on_leave") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

export function InstallersClient({ initialDashboard }: { initialDashboard: Dashboard }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [filters, setFilters] = useState(dashboard.filters);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload(nextFilters = filters) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(nextFilters)) if (value) params.set(key, String(value));
    const response = await fetch(`/api/workspace/installers?${params.toString()}`, { credentials: "include", cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || "Unable to refresh installers.");
    setDashboard(body);
  }

  async function applyFilters(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    await reload(filters).catch((error) => setMessage(error instanceof Error ? error.message : "Unable to apply filters."));
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6" aria-label="Installer summary">
        {dashboard.kpis.map((item) => (
          <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{item.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{item.value}</p>
          </div>
        ))}
      </section>

      {message ? <p className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm font-semibold text-orange-900" role="status">{message}</p> : null}

      <form onSubmit={applyFilters} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 lg:grid-cols-[2fr_repeat(4,1fr)_auto]">
        <Field label="Search"><input className="workspace-search-input" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></Field>
        <Field label="Agency"><select className="workspace-search-input" value={filters.agency} onChange={(event) => setFilters({ ...filters, agency: event.target.value })}><option value="">All</option>{dashboard.agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.agencyName}</option>)}</select></Field>
        <Field label="Status"><select className="workspace-search-input" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All</option><option value="available">Available</option><option value="busy">Busy</option><option value="on_leave">On Leave</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></Field>
        <Field label="State"><input className="workspace-search-input" value={filters.state} onChange={(event) => setFilters({ ...filters, state: event.target.value })} /></Field>
        <Field label="Sort"><select className="workspace-search-input" value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}><option value="name">Name</option><option value="state">State</option><option value="status">Status</option></select></Field>
        <button className="self-end rounded-lg bg-slate-950 px-4 text-sm font-bold text-white">Apply</button>
      </form>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {dashboard.filteredInstallers.length === 0 ? (
          <div className="p-8 text-center">
            <h3 className="text-lg font-bold">No installer activity yet.</h3>
            <p className="mt-2 text-sm text-slate-600">Installers assigned through User Management will appear here when operational activity is available.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-500">
                <tr>{["Installer", "Assigned Project(s)", "Assigned Region / State", "Completed", "Outstanding", "Completion %", "GPS Accuracy", "Status", "Actions"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dashboard.filteredInstallers.map((installer) => (
                  <tr key={installer.id} className="align-top">
                    <td className="px-4 py-3 font-bold text-slate-950"><a href={`/workspace/admin/installers/${installer.id}`} className="hover:text-orange-700">{installer.installerName}</a><span className="block text-xs font-semibold text-slate-500">{installer.email || "No email"}</span></td>
                    <td className="px-4 py-3">{installer.assignedProjects.length > 0 ? installer.assignedProjects.join(", ") : "No projects assigned"}</td>
                    <td className="px-4 py-3">{[installer.region, installer.state].filter(Boolean).join(" / ") || "Not set"}</td>
                    <td className="px-4 py-3">{installer.completed}</td>
                    <td className="px-4 py-3">{installer.remaining}</td>
                    <td className="px-4 py-3">{installer.assignedLocations > 0 ? `${Math.round((installer.completed / installer.assignedLocations) * 100)}%` : "0%"}</td>
                    <td className="px-4 py-3">{installer.gpsPercent}%</td>
                    <td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-bold ${statusClass(installer.status)}`}>{title(installer.status)}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <a href={`/workspace/admin/installers/${installer.id}`} className="font-bold text-orange-600">Open</a>
                      </div>
                    </td>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">{label}{children}</label>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-950">{value}</p>
    </div>
  );
}

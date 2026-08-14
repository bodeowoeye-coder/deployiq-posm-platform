"use client";

import { useMemo, useState } from "react";
import type { getAgencyDashboard } from "@/lib/workspace/fieldResources";

type Dashboard = Awaited<ReturnType<typeof getAgencyDashboard>>;
type Agency = Dashboard["agencies"][number];

const emptyForm = {
  agencyName: "",
  contactPerson: "",
  phone: "",
  email: "",
  officeAddress: "",
  statesCovered: "",
  regionsCovered: "",
  citiesCovered: "",
  status: "Active",
  notes: "",
};

function badge(status: string) {
  if (status === "Active") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "Suspended") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "Archived") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-slate-200 bg-white text-slate-700";
}

export function AgenciesClient({ initialDashboard }: { initialDashboard: Dashboard }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Agency | null>(null);
  const [filters, setFilters] = useState(dashboard.filters);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => dashboard.filteredAgencies, [dashboard.filteredAgencies]);

  async function reload(nextFilters = filters) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(nextFilters)) if (value) params.set(key, String(value));
    const response = await fetch(`/api/workspace/agencies?${params.toString()}`, { credentials: "include", cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || "Unable to refresh agencies.");
    setDashboard(body);
  }

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function edit(agency: Agency) {
    setEditing(agency);
    setForm({
      agencyName: agency.agencyName,
      contactPerson: agency.contactPerson ?? "",
      phone: agency.phone ?? "",
      email: agency.email ?? "",
      officeAddress: agency.officeAddress ?? "",
      statesCovered: agency.statesCovered.join(", "),
      regionsCovered: agency.regionsCovered.join(", "),
      citiesCovered: agency.citiesCovered.join(", "),
      status: agency.status,
      notes: agency.notes ?? "",
    });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/workspace/agencies", {
      method: editing ? "PATCH" : "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editing?.id, ...form }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(body?.error || "Unable to save agency.");
      setBusy(false);
      return;
    }
    setForm(emptyForm);
    setEditing(null);
    await reload();
    setMessage(editing ? "Agency updated." : "Agency created.");
    setBusy(false);
  }

  async function action(agency: Agency, nextAction: "archive" | "suspend" | "restore") {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/workspace/agencies", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: agency.id, action: nextAction }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) setMessage(body?.error || "Unable to update agency.");
    else {
      await reload();
      setMessage("Agency status updated.");
    }
    setBusy(false);
  }

  async function applyFilters(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    await reload(filters).catch((error) => setMessage(error instanceof Error ? error.message : "Unable to apply filters."));
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6" aria-label="Agency summary">
        {dashboard.kpis.map((item) => (
          <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{item.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{item.value}</p>
          </div>
        ))}
      </section>

      {message ? <p className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm font-semibold text-orange-900" role="status">{message}</p> : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-base font-bold">{editing ? "Edit Agency" : "Create Agency"}</h3>
        <form onSubmit={save} className="mt-4 grid gap-3 lg:grid-cols-3">
          <Field label="Agency Name *"><input className="workspace-search-input" value={form.agencyName} onChange={(event) => update("agencyName", event.target.value)} required /></Field>
          <Field label="Contact Person"><input className="workspace-search-input" value={form.contactPerson} onChange={(event) => update("contactPerson", event.target.value)} /></Field>
          <Field label="Phone"><input className="workspace-search-input" value={form.phone} onChange={(event) => update("phone", event.target.value)} /></Field>
          <Field label="Email"><input className="workspace-search-input" value={form.email} onChange={(event) => update("email", event.target.value)} /></Field>
          <Field label="Office Address"><input className="workspace-search-input" value={form.officeAddress} onChange={(event) => update("officeAddress", event.target.value)} /></Field>
          <Field label="Status"><select className="workspace-search-input" value={form.status} onChange={(event) => update("status", event.target.value)}><option>Active</option><option>Suspended</option><option>Archived</option><option>Inactive</option></select></Field>
          <Field label="States Covered"><input className="workspace-search-input" value={form.statesCovered} onChange={(event) => update("statesCovered", event.target.value)} /></Field>
          <Field label="Regions Covered"><input className="workspace-search-input" value={form.regionsCovered} onChange={(event) => update("regionsCovered", event.target.value)} /></Field>
          <Field label="Cities Covered"><input className="workspace-search-input" value={form.citiesCovered} onChange={(event) => update("citiesCovered", event.target.value)} /></Field>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500 lg:col-span-3">Notes<textarea className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm normal-case tracking-normal" value={form.notes} onChange={(event) => update("notes", event.target.value)} /></label>
          <div className="flex gap-2 lg:col-span-3">
            <button className="inline-flex min-h-11 items-center rounded-lg bg-orange-500 px-4 text-sm font-bold text-white" disabled={busy}>{editing ? "Save Agency" : "Create Agency"}</button>
            {editing ? <button type="button" className="workspace-button-secondary" onClick={() => { setEditing(null); setForm(emptyForm); }}>Cancel</button> : null}
          </div>
        </form>
      </section>

      <form onSubmit={applyFilters} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 lg:grid-cols-[2fr_repeat(3,1fr)_auto]">
        <Field label="Search"><input className="workspace-search-input" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></Field>
        <Field label="Status"><select className="workspace-search-input" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All</option><option>Active</option><option>Suspended</option><option>Archived</option><option>Inactive</option></select></Field>
        <Field label="State"><input className="workspace-search-input" value={filters.state} onChange={(event) => setFilters({ ...filters, state: event.target.value })} /></Field>
        <Field label="Sort"><select className="workspace-search-input" value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}><option value="name">Name</option><option value="status">Status</option></select></Field>
        <button className="self-end rounded-lg bg-slate-950 px-4 text-sm font-bold text-white">Apply</button>
      </form>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {rows.length === 0 ? (
          <div className="p-8 text-center">
            <h3 className="text-lg font-bold">No agencies yet.</h3>
            <p className="mt-2 text-sm text-slate-600">Create your first Agency.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-500">
                <tr>{["Agency", "Coverage", "Contact", "Assigned Campaigns", "Assigned Installers", "Status", "Actions"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((agency) => (
                  <tr key={agency.id} className="align-top">
                    <td className="px-4 py-3 font-bold text-slate-950">{agency.agencyName}<span className="block text-xs font-semibold text-slate-500">{agency.officeAddress || "No office address"}</span></td>
                    <td className="px-4 py-3">{agency.statesCovered.join(", ") || agency.regionsCovered.join(", ") || "Not set"}</td>
                    <td className="px-4 py-3">{agency.contactPerson || "Not set"}<span className="block text-xs text-slate-500">{agency.phone || agency.email || "No contact details"}</span></td>
                    <td className="px-4 py-3">{agency.assignedCampaigns}</td>
                    <td className="px-4 py-3">{agency.assignedInstallers}</td>
                    <td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-bold ${badge(agency.status)}`}>{agency.status}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="font-bold text-orange-600" onClick={() => edit(agency)}>Edit</button>
                        {agency.status === "Suspended" || agency.status === "Archived" ? <button type="button" className="font-bold text-emerald-700" onClick={() => action(agency, "restore")}>Restore</button> : <button type="button" className="font-bold text-amber-700" onClick={() => action(agency, "suspend")}>Suspend</button>}
                        {agency.status !== "Archived" ? <button type="button" className="font-bold text-slate-600" onClick={() => window.confirm("Archive this agency?") && action(agency, "archive")}>Archive</button> : null}
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

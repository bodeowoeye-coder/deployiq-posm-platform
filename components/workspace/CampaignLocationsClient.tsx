"use client";

import { useMemo, useState } from "react";
import type { getCampaignLocationDashboard } from "@/lib/workspace/campaignLocations";

type AwaitedReturn<T extends (...args: any[]) => unknown> = Awaited<ReturnType<T>>;
type Dashboard = AwaitedReturn<typeof getCampaignLocationDashboard>;
type LocationRow = Dashboard["locations"][number];

function statusBadge(status: string) {
  if (status === "ready" || status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "in_progress") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "excluded") return "border-slate-200 bg-slate-100 text-slate-600";
  if (status === "unassigned") return "border-slate-200 bg-white text-slate-600";
  return "border-orange-200 bg-orange-50 text-orange-800";
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export function CampaignLocationsClient({ initialDashboard }: { initialDashboard: Dashboard }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldAssignment, setFieldAssignment] = useState({ agencyId: "", installerId: "" });
  const [filters, setFilters] = useState({
    search: dashboard.filters.search,
    state: dashboard.filters.state,
    region: dashboard.filters.region,
    city: dashboard.filters.city,
    status: dashboard.filters.status,
    assigned: dashboard.filters.assigned,
    sort: dashboard.filters.sort,
  });
  const selectable = useMemo(() => dashboard.locations.filter((row) => !row.assignmentId), [dashboard.locations]);
  const selectedCount = selected.length;
  const targetWarning = dashboard.summary.targetWarning;

  async function reload(nextFilters = filters) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(nextFilters)) {
      if (value) params.set(key, value);
    }
    const response = await fetch(`/api/workspace/campaigns/${dashboard.campaign.id}/locations?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || "Unable to refresh campaign locations.");
    setDashboard(body);
    return body as Dashboard;
  }

  async function assignSelected(assignAll = false) {
    setMessage("");
    if (!assignAll && selected.length === 0) {
      setMessage("Select at least one deployment location.");
      return;
    }
    const count = assignAll ? dashboard.allEligibleCount - dashboard.summary.assignedLocations : selected.length;
    if (assignAll && !window.confirm(`You are about to assign ${count} locations to this campaign.\n\nCampaign: ${dashboard.campaign.campaign_name}\nProject: ${dashboard.campaign.projectName}\nTarget: ${dashboard.campaign.target_quantity}\nSelected locations: ${count}`)) {
      return;
    }
    if ((assignAll ? dashboard.allEligibleCount : selected.length) > dashboard.campaign.target_quantity && !window.confirm("Assigned locations exceed the campaign target. Continue without changing the campaign target?")) {
      return;
    }
    setBusy(true);
    const response = await fetch(`/api/workspace/campaigns/${dashboard.campaign.id}/locations`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignAll, locationIds: assignAll ? [] : selected, targetQuantityPerLocation: 1 }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(body?.error || "Unable to assign locations.");
      setBusy(false);
      return;
    }
    setSelected([]);
    const next = await reload();
    setMessage(`${body.assigned ?? 0} locations assigned to ${next.campaign.campaign_name}.`);
    setBusy(false);
  }

  async function remove(row: LocationRow) {
    if (!row.assignmentId) return;
    const label = row.hasActivity ? "Exclude this location from the campaign? Existing activity will be preserved." : "Remove this location assignment?";
    if (!window.confirm(label)) return;
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/workspace/campaigns/${dashboard.campaign.id}/locations`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId: row.assignmentId, locationId: row.locationId, exclusionReason: "Excluded by workspace administrator" }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(body?.error || "Unable to update location assignment.");
      setBusy(false);
      return;
    }
    await reload();
    setMessage(body.excluded ? "Location excluded from campaign. Existing activity was preserved." : "Location assignment removed.");
    setBusy(false);
  }

  async function assignFieldResources(row?: LocationRow) {
    setMessage("");
    const campaignLocationIds = row?.campaignLocationId ? [row.campaignLocationId] : dashboard.locations.filter((item) => selected.includes(item.locationId) && item.campaignLocationId).map((item) => item.campaignLocationId as string);
    if (campaignLocationIds.length === 0) {
      setMessage("Assign deployment locations to the campaign before assigning people.");
      return;
    }
    if (!fieldAssignment.agencyId && !fieldAssignment.installerId) {
      setMessage("Select an agency or installer.");
      return;
    }
    setBusy(true);
    const response = await fetch("/api/workspace/field-assignments", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: dashboard.campaign.id,
        campaignLocationIds,
        agencyId: fieldAssignment.agencyId,
        installerId: fieldAssignment.installerId,
        assignmentType: fieldAssignment.installerId ? "installer" : "agency",
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(body?.error || "Unable to update assignments.");
      setBusy(false);
      return;
    }
    await reload();
    setMessage(`${body.assigned ?? campaignLocationIds.length} assignments updated.`);
    setBusy(false);
  }

  function toggle(locationId: string) {
    setSelected((current) => current.includes(locationId) ? current.filter((id) => id !== locationId) : [...current, locationId]);
  }

  async function applyFilters(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    await reload(filters).catch((error) => setMessage(error instanceof Error ? error.message : "Unable to apply filters."));
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6" aria-label="Campaign location summary">
        {[
          ["Assigned Locations", dashboard.summary.assignedLocations],
          ["Ready", dashboard.summary.ready],
          ["In Progress", dashboard.summary.inProgress],
          ["Completed", dashboard.summary.completed],
          ["Excluded", dashboard.summary.excluded],
          ["Remaining Campaign Target", dashboard.summary.remainingCampaignTarget],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      {targetWarning ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{targetWarning}</p> : null}
      {message ? <p className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm font-semibold text-orange-900" role="status">{message}</p> : null}

      <div className="flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <p className="w-full text-sm font-bold text-slate-950">Assign Locations</p>
        <button type="button" className="inline-flex min-h-11 items-center rounded-lg bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-60" onClick={() => assignSelected(false)} disabled={busy || selectedCount === 0}>
          Assign Selected
        </button>
        <button type="button" className="workspace-button-secondary" onClick={() => assignSelected(true)} disabled={busy || dashboard.allEligibleCount === dashboard.summary.assignedLocations}>
          Assign All Eligible Locations
        </button>
        <a href="/workspace/admin/upload-directory" className="workspace-button-secondary">Upload Directory</a>
        <p className="self-center text-sm text-slate-600">Selected Locations: <strong>{selectedCount}</strong> | Campaign Target: <strong>{dashboard.campaign.target_quantity}</strong> | Existing Assigned: <strong>{dashboard.summary.assignedLocations}</strong> | Remaining Target: <strong>{dashboard.summary.remainingCampaignTarget}</strong></p>
      </div>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 lg:grid-cols-[1fr_1fr_auto]">
        <div>
          <p className="text-sm font-bold text-slate-950">Assign People</p>
          <p className="mt-1 text-sm text-slate-600">Assign an agency or installer to selected campaign locations.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Agency<select className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm normal-case tracking-normal" value={fieldAssignment.agencyId} onChange={(event) => setFieldAssignment({ ...fieldAssignment, agencyId: event.target.value })}><option value="">Not assigned</option>{dashboard.fieldResources.agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.agencyName}</option>)}</select></label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Installer<select className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm normal-case tracking-normal" value={fieldAssignment.installerId} onChange={(event) => setFieldAssignment({ ...fieldAssignment, installerId: event.target.value })}><option value="">Not assigned</option>{dashboard.fieldResources.installers.map((installer) => <option key={installer.id} value={installer.id}>{installer.installerName}</option>)}</select></label>
        </div>
        <button type="button" className="self-end rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-60" onClick={() => assignFieldResources()} disabled={busy || selectedCount === 0}>
          Assign to Selected
        </button>
      </div>

      <form onSubmit={applyFilters} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 lg:grid-cols-[2fr_repeat(6,1fr)_auto]">
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Search<input className="workspace-search-input normal-case tracking-normal" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">State<input className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm normal-case tracking-normal" value={filters.state} onChange={(event) => setFilters({ ...filters, state: event.target.value })} /></label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Region<input className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm normal-case tracking-normal" value={filters.region} onChange={(event) => setFilters({ ...filters, region: event.target.value })} /></label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">City<input className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm normal-case tracking-normal" value={filters.city} onChange={(event) => setFilters({ ...filters, city: event.target.value })} /></label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Status<select className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm normal-case tracking-normal" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All</option><option value="assigned">Assigned</option><option value="ready">Ready</option><option value="in_progress">In Progress</option><option value="completed">Completed</option><option value="excluded">Excluded</option><option value="unassigned">Unassigned</option></select></label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Assigned<select className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm normal-case tracking-normal" value={filters.assigned ?? "all"} onChange={(event) => setFilters({ ...filters, assigned: event.target.value as "all" | "assigned" | "unassigned" })}><option value="all">All</option><option value="assigned">Assigned</option><option value="unassigned">Unassigned only</option></select></label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Sort<select className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm normal-case tracking-normal" value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}><option value="name">Name</option><option value="state">State</option><option value="status">Status</option><option value="assigned">Assignment Date</option></select></label>
        <button className="self-end rounded-lg bg-slate-950 px-4 text-sm font-bold text-white">Apply</button>
      </form>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {dashboard.allEligibleCount === 0 ? (
          <div className="p-8 text-center">
            <h3 className="text-lg font-bold">No deployment locations are available yet.</h3>
            <p className="mt-2 text-sm text-slate-600">Upload your workspace directory before assigning locations to this campaign.</p>
            <a href="/workspace/admin/upload-directory" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-orange-500 px-4 text-sm font-bold text-white">Upload Directory</a>
          </div>
        ) : dashboard.summary.assignedLocations === 0 && dashboard.filters.assigned === "assigned" ? (
          <div className="p-8 text-center">
            <h3 className="text-lg font-bold">No locations have been assigned to this campaign.</h3>
            <p className="mt-2 text-sm text-slate-600">Assign locations to prepare this campaign for execution.</p>
          </div>
        ) : dashboard.filters.assigned === "unassigned" && dashboard.locations.length === 0 ? (
          <div className="p-8 text-center">
            <h3 className="text-lg font-bold">All eligible workspace locations are already assigned.</h3>
            <p className="mt-2 text-sm text-slate-600">Use the Assigned filter to review campaign locations.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-4 py-3">Select</th>
                  {["Location / Outlet Name", "Outlet Code / External ID", "Address", "State", "Region", "City", "Target Quantity", "Assigned Agency", "Assigned Installer", "Deployment Status", "Assignment Date", "Actions"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dashboard.locations.map((row) => (
                  <tr key={row.locationId} className="align-top">
                    <td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${row.outletName}`} disabled={Boolean(row.assignmentId)} checked={selected.includes(row.locationId)} onChange={() => toggle(row.locationId)} /></td>
                    <td className="px-4 py-3 font-bold text-slate-950">{row.outletName}<span className="mt-1 block text-xs font-semibold text-slate-500">{row.readiness}</span></td>
                    <td className="px-4 py-3 font-mono text-xs">{row.outletCode || row.externalId || "Unassigned"}</td>
                    <td className="px-4 py-3">{row.address || "Not set"}</td>
                    <td className="px-4 py-3">{row.state || "Not set"}</td>
                    <td className="px-4 py-3">{row.region || "Not set"}</td>
                    <td className="px-4 py-3">{row.city || "Not set"}</td>
                    <td className="px-4 py-3">{row.targetQuantity || "Not assigned"}</td>
                    <td className="px-4 py-3">{row.assignedAgencyName || "Not assigned"}</td>
                    <td className="px-4 py-3">{row.assignedInstallerName || "Not assigned"}</td>
                    <td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-bold ${statusBadge(row.assignmentStatus)}`}>{titleCase(row.assignmentStatus)}</span></td>
                    <td className="px-4 py-3">{row.assignedAt ? new Date(row.assignedAt).toLocaleDateString() : "Not assigned"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {row.assignmentId && row.assignmentStatus !== "excluded" ? <button type="button" className="font-bold text-orange-600 hover:text-orange-700" onClick={() => assignFieldResources(row)}>Assign Resource</button> : null}
                        {row.assignmentId && row.assignmentStatus !== "excluded" ? <button type="button" className="font-bold text-slate-600 hover:text-slate-800" onClick={() => remove(row)}> {row.hasActivity ? "Exclude from Campaign" : "Remove Assignment"}</button> : "Available"}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {dashboard.pagination.pages > 1 ? (
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <span>Page {dashboard.pagination.page} of {dashboard.pagination.pages}</span>
          <span>{dashboard.pagination.total} locations match these filters.</span>
        </div>
      ) : null}
    </div>
  );
}

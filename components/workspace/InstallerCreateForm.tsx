"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { getInstallerDashboard } from "@/lib/workspace/fieldResources";

type Agency = Awaited<ReturnType<typeof getInstallerDashboard>>["agencies"][number];

const empty = {
  installerName: "",
  phone: "",
  email: "",
  agencyId: "",
  state: "",
  region: "",
  city: "",
  skills: "",
  vehicle: "",
  team: "",
  status: "available",
  profilePhotoUrl: "",
  notes: "",
};

export function InstallerCreateForm({ agencies }: { agencies: Agency[] }) {
  const router = useRouter();
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/workspace/installers", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(body?.error || "Unable to create installer.");
      setBusy(false);
      return;
    }
    router.push(`/workspace/admin/installers/${body.installer.id}`);
  }

  return (
    <form onSubmit={save} className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 lg:grid-cols-3">
      {message ? <p className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm font-semibold text-orange-900 lg:col-span-3" role="status">{message}</p> : null}
      <Field label="Installer Name *"><input className="workspace-search-input" value={form.installerName} onChange={(event) => update("installerName", event.target.value)} required /></Field>
      <Field label="Phone *"><input className="workspace-search-input" value={form.phone} onChange={(event) => update("phone", event.target.value)} required /></Field>
      <Field label="Email"><input className="workspace-search-input" value={form.email} onChange={(event) => update("email", event.target.value)} /></Field>
      <Field label="Agency"><select className="workspace-search-input" value={form.agencyId} onChange={(event) => update("agencyId", event.target.value)}><option value="">Not assigned</option>{agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.agencyName}</option>)}</select></Field>
      <Field label="State"><input className="workspace-search-input" value={form.state} onChange={(event) => update("state", event.target.value)} /></Field>
      <Field label="Region"><input className="workspace-search-input" value={form.region} onChange={(event) => update("region", event.target.value)} /></Field>
      <Field label="City"><input className="workspace-search-input" value={form.city} onChange={(event) => update("city", event.target.value)} /></Field>
      <Field label="Skills"><input className="workspace-search-input" value={form.skills} onChange={(event) => update("skills", event.target.value)} /></Field>
      <Field label="Vehicle"><input className="workspace-search-input" value={form.vehicle} onChange={(event) => update("vehicle", event.target.value)} /></Field>
      <Field label="Team"><input className="workspace-search-input" value={form.team} onChange={(event) => update("team", event.target.value)} /></Field>
      <Field label="Status"><select className="workspace-search-input" value={form.status} onChange={(event) => update("status", event.target.value)}><option value="available">Available</option><option value="busy">Busy</option><option value="on_leave">On Leave</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></Field>
      <Field label="Profile Photo"><input className="workspace-search-input" value={form.profilePhotoUrl} onChange={(event) => update("profilePhotoUrl", event.target.value)} placeholder="Optional URL" /></Field>
      <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500 lg:col-span-3">Notes<textarea className="min-h-28 rounded-lg border border-slate-200 px-3 py-2 text-sm normal-case tracking-normal" value={form.notes} onChange={(event) => update("notes", event.target.value)} /></label>
      <div className="flex gap-2 lg:col-span-3">
        <button className="inline-flex min-h-11 items-center rounded-lg bg-orange-500 px-4 text-sm font-bold text-white disabled:opacity-60" disabled={busy}>Create Installer</button>
        <a href="/workspace/admin/installers" className="workspace-button-secondary">Cancel</a>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">{label}{children}</label>;
}

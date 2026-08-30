"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { BuildProjectWorkspaceOverview } from "@/lib/build/projects/workspaceOverview";

type Mode = "sites" | "work-packages";
type Site = BuildProjectWorkspaceOverview["sites"][number];
type WorkPackage = BuildProjectWorkspaceOverview["workPackages"][number];

const SITE_STATUSES = ["planned", "active", "on_hold", "completed"] as const;
const WORK_PACKAGE_STATUSES = SITE_STATUSES;
const PRIMARY_ACTION_CLASS = "inline-flex min-h-10 items-center justify-center rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:cursor-not-allowed disabled:opacity-60";
const FORM_CONTROL_CLASS = "min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200";

export function BuildProjectManagement({ mode, overview }: { mode: Mode; overview: BuildProjectWorkspaceOverview }) {
  const searchParams = useSearchParams();
  const action = searchParams.get("action");
  const editId = searchParams.get("edit");
  const base = `/workspace/admin/projects/${overview.project.id}/${mode}`;
  if (mode === "sites" && (action === "create" || editId)) {
    const site = editId ? overview.sites.find((item) => item.id === editId) : null;
    if (editId && !site) return <MissingRecord base={base} label="Site" />;
    return <SiteForm overview={overview} site={site ?? null} base={base} />;
  }
  if (mode === "work-packages" && (action === "create" || editId)) {
    const workPackage = editId ? overview.workPackages.find((item) => item.id === editId) : null;
    if (editId && !workPackage) return <MissingRecord base={base} label="Work Package" />;
    return <WorkPackageForm overview={overview} workPackage={workPackage ?? null} base={base} />;
  }
  return mode === "sites" ? <SiteList overview={overview} base={base} /> : <WorkPackageList overview={overview} base={base} />;
}

function SiteList({ overview, base }: { overview: BuildProjectWorkspaceOverview; base: string }) {
  const workPackageCount = new Map<string, number>();
  for (const workPackage of overview.workPackages) {
    workPackageCount.set(workPackage.siteId, (workPackageCount.get(workPackage.siteId) ?? 0) + 1);
  }
  return (
    <ManagementPanel
      title="Sites"
      description="Manage the physical sites for this project."
      action={<Link href={`${base}?action=create`} className={PRIMARY_ACTION_CLASS}>Create Site</Link>}
    >
      {overview.sites.length === 0 ? <EmptyState>No active Build Sites are assigned to this project.</EmptyState> : (
        <div className="grid gap-4 xl:grid-cols-2">
          {overview.sites.map((site) => (
            <article key={site.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-5">
              <div className="flex items-start justify-between gap-4">
                <div><h4 className="font-bold text-slate-950">{site.name}</h4><p className="mt-1 font-mono text-xs text-slate-500">{site.siteCode}</p></div>
                <Status value={site.status} />
              </div>
              <p className="mt-4 text-sm text-slate-600">{[site.address, site.lga, site.state].filter(Boolean).join(", ") || "Location not specified"}</p>
              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
                <p className="text-sm font-semibold text-slate-700">{workPackageCount.get(site.id) ?? 0} Work Package{(workPackageCount.get(site.id) ?? 0) === 1 ? "" : "s"}</p>
                <Link href={`${base}?edit=${encodeURIComponent(site.id)}`} className="text-sm font-bold text-orange-700 hover:text-orange-800">Edit Site</Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </ManagementPanel>
  );
}

function WorkPackageList({ overview, base }: { overview: BuildProjectWorkspaceOverview; base: string }) {
  const siteById = new Map(overview.sites.map((site) => [site.id, site]));
  return (
    <ManagementPanel
      title="Work Packages"
      description="Manage the project's work packages and operational templates."
      action={overview.sites.length > 0 ? <Link href={`${base}?action=create`} className={PRIMARY_ACTION_CLASS}>Create Work Package</Link> : null}
    >
      {overview.sites.length === 0 ? <EmptyState>Create a Site before adding Work Packages.</EmptyState> : overview.workPackages.length === 0 ? <EmptyState>No active Work Packages are assigned to this project.</EmptyState> : (
        <div className="space-y-4">
          {overview.workPackages.map((workPackage) => {
            const site = siteById.get(workPackage.siteId);
            return (
              <article key={workPackage.id} className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-5 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-center">
                <div><h4 className="font-bold text-slate-950">{workPackage.name}</h4><p className="mt-1 font-mono text-xs text-slate-500">{workPackage.code}</p></div>
                <Hierarchy label="Parent Site" value={site ? `${site.name} · ${site.siteCode}` : "Unavailable"} />
                <Hierarchy label="Operational Template" value={workPackage.templateName ?? "Not assigned"} />
                <div className="flex flex-wrap items-center gap-4">
                  <Status value={workPackage.status} />
                  {workPackage.templateId ? <Link href={`/workspace/admin/projects/${overview.project.id}/work-packages/${workPackage.id}/template`} className="text-sm font-bold text-orange-700 hover:text-orange-800">Manage Template</Link> : null}
                  <Link href={`${base}?edit=${encodeURIComponent(workPackage.id)}`} className="text-sm font-bold text-orange-700 hover:text-orange-800">Edit</Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </ManagementPanel>
  );
}

function SiteForm({ overview, site, base }: { overview: BuildProjectWorkspaceOverview; site: Site | null; base: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch("/api/build/sites", { method: site ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...values, projectId: overview.project.id, id: site?.id }) });
      if (!response.ok) { setMessage(await safeError(response, "Site could not be saved.")); setPending(false); return; }
      router.replace(base); router.refresh();
    } catch { setMessage("Site could not be saved."); setPending(false); }
  }
  async function archive() {
    if (!site || !window.confirm("Archive this Site? Active Work Packages must be archived first.")) return;
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/build/sites", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: overview.project.id, id: site.id, archived: true }) });
      if (!response.ok) { setMessage(await safeError(response, "Site could not be archived.")); setPending(false); return; }
      router.replace(base); router.refresh();
    } catch { setMessage("Site could not be archived."); setPending(false); }
  }
  return (
    <ManagementPanel title={site ? "Edit Site" : "Create Site"} description={site ? "Update this project's site details." : "Add a physical site to this project."} action={<Link href={base} className="text-sm font-bold text-orange-700">Cancel</Link>}>
      <form onSubmit={submit} className="grid gap-5 md:grid-cols-2">
        <Field label="Site name" name="name" required defaultValue={site?.name} />
        <Field label="Site code" name="siteCode" defaultValue={site?.siteCode} placeholder="Generated if omitted" />
        <Field label="Address" name="address" defaultValue={site?.address} wide />
        <Field label="State" name="state" defaultValue={site?.state} />
        <Field label="LGA" name="lga" defaultValue={site?.lga} />
        <SelectField label="Status" name="status" values={SITE_STATUSES} defaultValue={site?.status ?? "planned"} />
        <div className="md:col-span-2 flex flex-wrap items-center gap-3"><button disabled={pending} className={PRIMARY_ACTION_CLASS} type="submit">{pending ? "Saving…" : site ? "Save Site" : "Create Site"}</button>{site ? <button disabled={pending} type="button" onClick={archive} className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700">Archive Site</button> : null}{message ? <p role="alert" className="text-sm font-semibold text-rose-700">{message}</p> : null}</div>
      </form>
    </ManagementPanel>
  );
}

function WorkPackageForm({ overview, workPackage, base }: { overview: BuildProjectWorkspaceOverview; workPackage: WorkPackage | null; base: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch("/api/build/work-packages", { method: workPackage ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...values, projectId: overview.project.id, id: workPackage?.id }) });
      if (!response.ok) { setMessage(await safeError(response, "Work Package could not be saved.")); setPending(false); return; }
      router.replace(base); router.refresh();
    } catch { setMessage("Work Package could not be saved."); setPending(false); }
  }
  async function archive() {
    if (!workPackage || !window.confirm("Archive this Work Package?")) return;
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/build/work-packages", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: overview.project.id, siteId: workPackage.siteId, id: workPackage.id, archived: true }) });
      if (!response.ok) { setMessage(await safeError(response, "Work Package could not be archived.")); setPending(false); return; }
      router.replace(base); router.refresh();
    } catch { setMessage("Work Package could not be archived."); setPending(false); }
  }
  return (
    <ManagementPanel title={workPackage ? "Edit Work Package" : "Create Work Package"} description={workPackage ? "Update this work package and its operational template." : "Select the site and operational template for this work package."} action={<Link href={base} className="text-sm font-bold text-orange-700">Cancel</Link>}>
      <form onSubmit={submit} className="grid gap-5 md:grid-cols-2">
        <Field label="Work Package name" name="name" required defaultValue={workPackage?.name} />
        <Field label="Code" name="code" defaultValue={workPackage?.code} placeholder="Generated if omitted" />
        <label className="grid gap-2 text-sm font-bold text-slate-700">Parent Site{workPackage ? <><input type="hidden" name="siteId" value={workPackage.siteId} /><select value={workPackage.siteId} disabled className={FORM_CONTROL_CLASS} aria-label="Parent Site"><option value={workPackage.siteId}>{overview.sites.find((site) => site.id === workPackage.siteId)?.name ?? "Current Site"}</option></select></> : <select required name="siteId" defaultValue="" className={FORM_CONTROL_CLASS}><option value="" disabled>Select a project Site</option>{overview.sites.map((site) => <option key={site.id} value={site.id}>{site.name} · {site.siteCode}</option>)}</select>}</label>
        <label className="grid gap-2 text-sm font-bold text-slate-700">Operational Template<select name="templateId" defaultValue={workPackage?.templateId ?? ""} className={FORM_CONTROL_CLASS}><option value="">No template assigned</option>{overview.templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.code}{template.isGlobal ? " · Global" : " · Tenant"}</option>)}</select></label>
        <Field label="Work Package type" name="workPackageType" defaultValue={workPackage?.workPackageType} />
        <Field label="Contractor" name="contractor" defaultValue={workPackage?.contractor} />
        <Field label="Description" name="description" defaultValue={workPackage?.description} wide />
        <SelectField label="Status" name="status" values={WORK_PACKAGE_STATUSES} defaultValue={workPackage?.status ?? "planned"} />
        <div className="md:col-span-2 flex flex-wrap items-center gap-3"><button disabled={pending} className={PRIMARY_ACTION_CLASS} type="submit">{pending ? "Saving…" : workPackage ? "Save Work Package" : "Create Work Package"}</button>{workPackage ? <button disabled={pending} type="button" onClick={archive} className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700">Archive Work Package</button> : null}{message ? <p role="alert" className="text-sm font-semibold text-rose-700">{message}</p> : null}</div>
      </form>
    </ManagementPanel>
  );
}

async function safeError(response: Response, fallback: string) { if (response.status >= 500) return fallback; const body = await response.json().catch(() => null); return typeof body?.error === "string" ? body.error : fallback; }
function ManagementPanel({ title, description, action, children }: { title: string; description: string; action: React.ReactNode; children: React.ReactNode }) { return <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Build operations</p><h3 className="mt-2 text-xl font-bold text-slate-950">{title}</h3><p className="mt-2 text-sm text-slate-600">{description}</p></div>{action}</div><div className="mt-6">{children}</div></section>; }
function Field({ label, name, defaultValue, required = false, placeholder, wide = false }: { label: string; name: string; defaultValue?: string | null; required?: boolean; placeholder?: string; wide?: boolean }) { return <label className={`grid gap-2 text-sm font-bold text-slate-700 ${wide ? "md:col-span-2" : ""}`}>{label}<input className={FORM_CONTROL_CLASS} name={name} defaultValue={defaultValue ?? ""} required={required} placeholder={placeholder} /></label>; }
function SelectField({ label, name, values, defaultValue }: { label: string; name: string; values: readonly string[]; defaultValue: string }) { return <label className="grid gap-2 text-sm font-bold text-slate-700">{label}<select className={FORM_CONTROL_CLASS} name={name} defaultValue={defaultValue}>{values.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>; }
function Status({ value }: { value: string }) { return <span className="w-fit rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-bold capitalize text-orange-800">{value.replaceAll("_", " ")}</span>; }
function Hierarchy({ label, value }: { label: string; value: string }) { return <div><p className="text-[11px] font-black uppercase tracking-widest text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold text-slate-700">{value}</p></div>; }
function EmptyState({ children }: { children: React.ReactNode }) { return <p className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-600">{children}</p>; }
function MissingRecord({ base, label }: { base: string; label: string }) { return <ManagementPanel title={`${label} unavailable`} description={`The requested ${label} is not active in this project.`} action={<Link href={base} className="text-sm font-bold text-orange-700">Return</Link>}><EmptyState>Choose an active record from the project list.</EmptyState></ManagementPanel>; }

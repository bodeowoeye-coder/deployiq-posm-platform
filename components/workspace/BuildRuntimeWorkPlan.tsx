"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BuildProjectWorkspaceOverview } from "@/lib/build/projects/workspaceOverview";
import type { BuildWorkPlan } from "@/lib/build/runtime/types";

export function BuildRuntimeWorkPlan({ overview, selectedWorkPackageId, plan }: {
  overview: BuildProjectWorkspaceOverview;
  selectedWorkPackageId: string | null;
  plan: BuildWorkPlan | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const workPackage = overview.workPackages.find((item) => item.id === selectedWorkPackageId) ?? null;
  const site = workPackage ? overview.sites.find((item) => item.id === workPackage.siteId) ?? null : null;
  const base = `/workspace/admin/projects/${overview.project.id}/activities`;

  async function generate() {
    if (!workPackage || !site) return;
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/build/work-plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: overview.project.id, siteId: site.id, workPackageId: workPackage.id }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(response.status >= 500 ? "The Work Plan could not be generated." : body?.error || "The Work Plan could not be generated.");
      setMessage(plan ? "Existing Work Plan loaded." : "Work Plan generated.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The Work Plan could not be generated."); }
    finally { setPending(false); }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Build Work Plan</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <label className="grid min-w-72 gap-2 text-sm font-bold text-slate-700">Work Package
            <select value={selectedWorkPackageId ?? ""} onChange={(event) => router.replace(`${base}?workPackage=${encodeURIComponent(event.target.value)}`)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900">
              <option value="" disabled>Select a Work Package</option>
              {overview.workPackages.map((item) => <option key={item.id} value={item.id}>{item.name} · {overview.sites.find((candidate) => candidate.id === item.siteId)?.name ?? "Site unavailable"}</option>)}
            </select>
          </label>
          {workPackage && !plan ? <button type="button" disabled={pending || !workPackage.templateId} onClick={generate} className="min-h-11 rounded-lg bg-orange-600 px-5 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50">{pending ? "Generating…" : "Generate Work Plan"}</button> : null}
        </div>
        {workPackage ? <dl className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3"><Context label="Project" value={overview.project.project_name} /><Context label="Site" value={site?.name ?? "Unavailable"} /><Context label="Work Package" value={workPackage.name} /></dl> : null}
        {message ? <p role="status" className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm font-semibold text-orange-900">{message}</p> : null}
      </div>

      {!workPackage ? <Empty>Select a Work Package to view its Work Plan.</Empty> : !workPackage.templateId ? <Empty>Assign an Operational Template before generating a Work Plan.</Empty> : !plan ? <Empty>No Work Plan has been created for this Work Package yet.</Empty> : <>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Work Plan</p><h3 className="mt-2 text-2xl font-bold text-slate-950">{workPackage.name}</h3><p className="mt-1 text-sm text-slate-600">From {plan.source_template_name} · Version {plan.source_template_version}</p></div><span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold capitalize text-orange-800">{plan.status.replaceAll("_", " ")}</span></div>
          <p className="mt-4 text-xs text-slate-500">Generated {new Date(plan.instantiated_at).toLocaleString()}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Activities" value={plan.counts.activities} /><Metric label="Checklists" value={plan.counts.checklists} /><Metric label="Dependencies" value={plan.counts.dependencies} /><Metric label="Resource Requirements" value={plan.counts.resourceRequirements} /></div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-bold text-slate-950">Planned Activities</h3><p className="mt-2 text-sm text-slate-600">Planned activities generated from the approved Operational Template.</p>
          <div className="mt-5 space-y-3">{plan.activities.map((activity) => <article key={activity.id} className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-[1fr_auto] md:items-center"><div><p className="font-bold text-slate-950">{activity.sequence}. {activity.name}</p><p className="mt-1 text-xs font-semibold text-slate-500">{activity.category_name} · {activity.code}</p></div><div className="text-xs text-slate-600 md:text-right"><p className="font-bold capitalize">{activity.planned_duration ?? 0} {activity.duration_unit} · {activity.status.replaceAll("_", " ")}</p><p className="mt-1">{countLabel(activity.checklist_count, "Checklist")} · {countLabel(activity.resource_requirement_count, "Resource Requirement")} · {countLabel(activity.predecessor_count, "Predecessor")}</p></div></article>)}</div>
        </div>
      </>}
    </section>
  );
}

function Context({ label, value }: { label: string; value: string }) { return <div><dt className="text-[11px] font-black uppercase tracking-widest text-slate-400">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{value}</dd></div>; }
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-[11px] font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-slate-950">{value}</p></div>; }
function countLabel(value: number, singular: string) { return `${value} ${singular}${value === 1 ? "" : "s"}`; }
function Empty({ children }: { children: React.ReactNode }) { return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600">{children}</div>; }

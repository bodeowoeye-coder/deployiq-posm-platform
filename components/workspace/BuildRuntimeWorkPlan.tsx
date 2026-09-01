"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BuildProjectWorkspaceOverview } from "@/lib/build/projects/workspaceOverview";
import { deriveBuildWorkPlanDisplayStatus, type BuildWorkPlan, type BuildWorkPlanSchedulePreview } from "@/lib/build/runtime/types";

export function BuildRuntimeWorkPlan({ overview, selectedWorkPackageId, plan }: {
  overview: BuildProjectWorkspaceOverview;
  selectedWorkPackageId: string | null;
  plan: BuildWorkPlan | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [baselineStart, setBaselineStart] = useState("");
  const [schedulePreview, setSchedulePreview] = useState<BuildWorkPlanSchedulePreview | null>(null);
  const workPackage = overview.workPackages.find((item) => item.id === selectedWorkPackageId) ?? null;
  const site = workPackage ? overview.sites.find((item) => item.id === workPackage.siteId) ?? null : null;
  const base = `/workspace/admin/projects/${overview.project.id}/activities`;
  const displayStatus = plan ? deriveBuildWorkPlanDisplayStatus(plan.activities) : null;

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

  async function schedule(action: "preview-schedule" | "baseline-schedule") {
    if (!workPackage || !site || !plan) return;
    const baselineInstant = new Date(baselineStart);
    if (!baselineStart || !Number.isFinite(baselineInstant.getTime())) {
      setMessage("Select a valid planned work start date and time."); return;
    }
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/build/work-plans", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, projectId: overview.project.id, siteId: site.id, workPackageId: workPackage.id, baselineStart: baselineInstant.toISOString() }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(response.status >= 500 ? "The Work Schedule could not be confirmed." : body?.error || "The Work Schedule could not be confirmed.");
      if (action === "preview-schedule") {
        setSchedulePreview(body.schedule); setMessage("Schedule preview ready. No planned timestamps have been saved.");
      } else {
        setSchedulePreview(null); setMessage("Work Schedule confirmed."); router.refresh();
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "The Work Schedule could not be confirmed."); }
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
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Work Plan</p><h3 className="mt-2 text-2xl font-bold text-slate-950">{workPackage.name}</h3><p className="mt-1 text-sm text-slate-600">From {plan.source_template_name} · Version {plan.source_template_version}</p></div><span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold capitalize text-orange-800">{(displayStatus ?? "not_started").replaceAll("_", " ")}</span></div>
          <p className="mt-4 text-xs text-slate-500">Generated {new Date(plan.instantiated_at).toLocaleString()}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Activities" value={plan.counts.activities} /><Metric label="Checklists" value={plan.counts.checklists} /><Metric label="Dependencies" value={plan.counts.dependencies} /><Metric label="Resource Requirements" value={plan.counts.resourceRequirements} /></div>
          <p className="mt-4 text-sm text-slate-600">{plan.counts.notStarted} Not Started · {plan.counts.inProgress} In Progress · {plan.counts.completed} Completed · {plan.counts.blocked} Blocked</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Work Schedule</p><h3 className="mt-2 text-xl font-bold text-slate-950">{plan.schedule_baselined_at ? "Schedule Confirmed" : "Not Confirmed"}</h3></div>
          {plan.schedule_baselined_at ? <><dl className="mt-5 grid gap-4 sm:grid-cols-2"><Context label="Schedule Confirmed On" value={formatDateTime(plan.schedule_baselined_at, "Unavailable")} /><Context label="Planned Work Start" value={formatDateTime(earliestPlannedStart(plan), "Unavailable")} /></dl><p className="mt-4 text-sm text-slate-600">Activity start and finish dates are calculated from this confirmed schedule.</p></> : <div className="mt-5 max-w-3xl space-y-4">
            <p className="text-sm leading-6 text-slate-600">Confirming the schedule establishes the planned start and finish dates for this Work Plan. The confirmed schedule cannot be changed in this version.</p>
            <label className="grid max-w-sm gap-2 text-sm font-bold text-slate-700">Planned Work Start<input type="datetime-local" value={baselineStart} onChange={(event) => { setBaselineStart(event.target.value); setSchedulePreview(null); }} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900" /></label>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Confirming this Work Schedule creates planned dates for every active Activity. It cannot be edited or replaced in this version.</div>
            <div className="flex flex-wrap gap-3"><button type="button" disabled={pending} onClick={() => schedule("preview-schedule")} className="min-h-11 rounded-lg border border-orange-300 bg-white px-5 text-sm font-bold text-orange-700 disabled:opacity-50">{pending ? "Calculating…" : "Preview Schedule"}</button>{schedulePreview ? <button type="button" disabled={pending} onClick={() => schedule("baseline-schedule")} className="min-h-11 rounded-lg bg-orange-600 px-5 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50">Confirm Work Schedule</button> : null}</div>
            {schedulePreview ? <div><h4 className="font-bold text-slate-950">Schedule Preview</h4><p className="mt-1 text-xs text-slate-500">Preview only — authoritative planned timestamps have not been written.</p><div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Activity</th><th className="px-3 py-2">Planned Start</th><th className="px-3 py-2">Planned Finish</th></tr></thead><tbody>{schedulePreview.activities.map((item) => <tr key={item.activityId} className="border-t border-slate-100"><td className="px-3 py-2 font-semibold text-slate-900">{plan.activities.find((activity) => activity.id === item.activityId)?.name ?? "Activity"}</td><td className="px-3 py-2 text-slate-600">{formatDateTime(item.plannedStartAt)}</td><td className="px-3 py-2 text-slate-600">{formatDateTime(item.plannedFinishAt)}</td></tr>)}</tbody></table></div></div> : null}
          </div>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-bold text-slate-950">Planned Activities</h3><p className="mt-2 text-sm text-slate-600">Planned activities generated from the approved Operational Template.</p>
          <div className="mt-5 space-y-3">{plan.activities.map((activity) => <article key={activity.id} className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-[1fr_auto] md:items-center"><div><p className="font-bold text-slate-950">{activity.sequence}. {activity.name}</p><p className="mt-1 text-xs font-semibold text-slate-500">{activity.category_name} · {activity.code}</p><p className="mt-1 text-xs text-slate-500">Activity Owner: {activity.activity_owner_user_id ? "Assigned" : "Unassigned"} · Supervisor: {activity.supervisor_user_id ? "Assigned" : "Unassigned"}</p><p className="mt-1 text-xs text-slate-500">Checklist {activity.checklist_resolved_count}/{activity.checklist_count} resolved · {activity.evidence_count} Evidence · {activity.active_exception_count} active Exceptions{activity.overdue_exception_count?` · ${activity.overdue_exception_count} overdue`:""}</p>{plan.schedule_baselined_at ? <p className="mt-2 text-xs font-semibold text-slate-600">Planned {formatDateTime(activity.planned_start_at, "Unavailable")} → {formatDateTime(activity.planned_finish_at, "Unavailable")}</p> : null}</div><div className="text-xs text-slate-600 md:text-right"><p className="font-bold capitalize">{activity.planned_duration ?? 0} {activity.duration_unit} · {activity.status.replaceAll("_", " ")}</p><p className="mt-1">{countLabel(activity.checklist_count, "Checklist")} · {countLabel(activity.resource_requirement_count, "Resource Requirement")} · {countLabel(activity.predecessor_count, "Predecessor")}</p><a className="mt-2 inline-block font-bold text-orange-700" href={`${base}/${encodeURIComponent(activity.id)}`}>Manage Activity</a></div></article>)}</div>
        </div>
      </>}
    </section>
  );
}

function Context({ label, value }: { label: string; value: string }) { return <div><dt className="text-[11px] font-black uppercase tracking-widest text-slate-400">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{value}</dd></div>; }
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-[11px] font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-slate-950">{value}</p></div>; }
function countLabel(value: number, singular: string) { return `${value} ${singular}${value === 1 ? "" : "s"}`; }
function formatDateTime(value: string | null, fallback = "Unavailable") { return value ? new Date(value).toLocaleString() : fallback; }
function earliestPlannedStart(plan: BuildWorkPlan) { return plan.activities.map((activity) => activity.planned_start_at).filter((value): value is string => Boolean(value)).sort()[0] ?? null; }
function Empty({ children }: { children: React.ReactNode }) { return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600">{children}</div>; }

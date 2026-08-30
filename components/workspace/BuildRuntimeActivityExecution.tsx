"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BuildRuntimeActivityExecution } from "@/lib/build/runtime/types";

export const BUILD_ACTIVITY_VIEWS = ["overview", "responsibility", "execution", "checklist", "evidence", "resources", "history"] as const;
export type BuildActivityView = (typeof BUILD_ACTIVITY_VIEWS)[number];
const NAVIGATION: Array<{ key: BuildActivityView; label: string }> = [
  { key: "overview", label: "Overview" }, { key: "responsibility", label: "Responsibility" },
  { key: "execution", label: "Execution" }, { key: "checklist", label: "Checklist" },
  { key: "evidence", label: "Evidence" }, { key: "resources", label: "Resources" },
  { key: "history", label: "Activity History" },
];

export function BuildRuntimeActivityExecution({ execution, scope, context, activeView, routeBase }: {
  execution: BuildRuntimeActivityExecution;
  scope: { projectId: string; siteId: string; workPackageId: string };
  context: { projectName: string; siteName: string; workPackageName: string };
  activeView: BuildActivityView;
  routeBase: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [owner, setOwner] = useState(execution.activity.activity_owner_user_id ?? "");
  const [supervisor, setSupervisor] = useState(execution.activity.supervisor_user_id ?? "");
  const [blocker, setBlocker] = useState("");
  const activity = execution.activity;

  async function act(action: string) {
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/build/runtime-activities/${activity.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...scope, action, ownerUserId: owner || null, supervisorUserId: supervisor || null, note: blocker || null }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "The Activity action could not be completed.");
      setMessage("Activity updated."); setBlocker(""); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The Activity action could not be completed."); }
    finally { setPending(false); }
  }

  const incompleteFs = execution.predecessors.find((item) => item.dependencyType === "FS" && item.status !== "completed");
  return <div className="space-y-4">
    <nav aria-label="Activity ancestry" className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
      <span>{context.projectName}</span><span aria-hidden="true">›</span><span>{context.siteName}</span><span aria-hidden="true">›</span><span>{context.workPackageName}</span><span aria-hidden="true">›</span><span className="text-slate-800">{activity.name}</span>
    </nav>
    <section className="rounded-xl border border-orange-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Build Activity</p><h3 className="mt-2 text-2xl font-bold text-slate-950">{activity.name}</h3><p className="mt-1 text-sm text-slate-600">{activity.category_name} · {activity.code}</p></div><span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold capitalize text-orange-800">{activity.status.replaceAll("_", " ")}</span></div>
      <Link href={`/workspace/admin/projects/${scope.projectId}/activities?workPackage=${scope.workPackageId}`} className="mt-4 inline-flex text-sm font-bold text-orange-700 hover:text-orange-800">← Back to Activities</Link>
    </section>
    <nav aria-label="Activity navigation" className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm"><div className="flex min-w-max gap-1">{NAVIGATION.map((item) => <Link key={item.key} href={item.key === "overview" ? routeBase : `${routeBase}?view=${item.key}`} aria-current={activeView === item.key ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm font-bold ${activeView === item.key ? "bg-orange-50 text-orange-900" : "text-slate-600 hover:bg-slate-50"}`}>{item.label}</Link>)}</div></nav>

    {activeView === "overview" ? <Panel title="Activity Overview" eyebrow="Current Activity summary"><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Fact label="Activity Name" value={activity.name}/><Fact label="Activity Code" value={activity.code}/><Fact label="Category" value={activity.category_name}/><Fact label="Current Status" value={titleStatus(activity.status)}/><Fact label="Planned Duration" value={`${activity.planned_duration ?? 0} ${activity.duration_unit}`}/><Fact label="Actual Start" value={formatDateTime(activity.started_at, "Not started")}/><Fact label="Actual Completion" value={formatDateTime(activity.completed_at, "Not completed")}/><Fact label="Dependencies" value={dependencySummary(execution)}/><Fact label="Checklist Requirements" value={countLabel(activity.checklist_count, "item")}/><Fact label="Resource Requirements" value={countLabel(activity.resource_requirement_count, "requirement")}/><Fact label="Activity Owner" value={execution.owner?.name ?? "Unassigned"}/><Fact label="Supervisor" value={execution.supervisor?.name ?? "Unassigned"}/></dl></Panel> : null}

    {activeView === "responsibility" ? <Panel title="Responsibility" eyebrow="Ownership and supervision"><p className="text-sm text-slate-600">Assign operational responsibility without implying fault or performance judgement.</p>{activity.status === "completed" ? <div className="mt-5 grid gap-4 sm:grid-cols-2"><Fact label="Activity Owner" value={execution.owner?.name ?? "Unassigned"}/><Fact label="Supervisor" value={execution.supervisor?.name ?? "Unassigned"}/><p className="sm:col-span-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Completed Activity responsibility is read-only.</p></div> : <><div className="mt-5 grid gap-4 md:grid-cols-2"><PersonSelect label="Activity Owner" value={owner} setValue={setOwner} people={execution.eligibleOwners} empty="Select Activity Owner"/><PersonSelect label="Supervisor" value={supervisor} setValue={setSupervisor} people={execution.eligibleSupervisors} empty="No Supervisor"/></div><button type="button" disabled={pending || !owner} onClick={()=>act("assign_responsibility")} className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold disabled:opacity-50">Save Responsibility</button></>}{message ? <StatusMessage message={message}/> : null}</Panel> : null}

    {activeView === "execution" ? <Panel title="Execution" eyebrow="Authoritative lifecycle actions"><p className="text-sm text-slate-600">Only actions valid for the Activity’s current state are available.</p>{activity.status === "not_started" && incompleteFs ? <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="font-bold text-amber-950">Waiting for predecessor</p><p className="mt-1 text-sm text-amber-900">{incompleteFs.name} must be completed before this Activity can start.</p><p className="mt-2 text-xs font-semibold text-amber-800">Starts after: {incompleteFs.name} is completed · Finish-to-Start (FS)</p></div> : null}{activity.status === "not_started" && !incompleteFs ? <button type="button" disabled={pending || !activity.activity_owner_user_id} onClick={()=>act("start")} className="mt-5 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Start Activity</button> : null}{activity.status === "in_progress" ? <div className="mt-5 grid gap-4"><button type="button" disabled={pending} onClick={()=>act("complete")} className="w-fit rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white">Complete Activity</button><label className="grid max-w-2xl gap-1 text-sm font-bold text-slate-700">Blocker reason<input value={blocker} onChange={(event)=>setBlocker(event.target.value)} className="min-h-10 rounded-lg border border-slate-300 px-3" /></label><button type="button" disabled={pending || !blocker.trim()} onClick={()=>act("block")} className="w-fit rounded-lg bg-rose-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Report Blocker</button>{activity.checklist_count > 0 ? <p className="text-sm text-amber-800">Complete the required checklist before this Activity can be completed.</p> : null}</div> : null}{activity.status === "blocked" ? <div className="mt-5"><p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">Blocker: {activity.blocker_reason}</p><button type="button" disabled={pending} onClick={()=>act("resume")} className="mt-3 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white">Resume Activity</button></div> : null}{activity.status === "completed" ? <p className="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">This Activity is complete. No further lifecycle action is available.</p> : null}{message ? <StatusMessage message={message}/> : null}</Panel> : null}

    {activeView === "checklist" ? <Panel title="Required Checklist Items" eyebrow="Read-only foundation"><p className="text-sm text-slate-600">{countLabel(execution.checklistItems.length, "required Checklist Item")}. All mandatory items must be completed before the Activity can be completed.</p>{execution.checklistItems.length ? <ul className="mt-4 space-y-2">{execution.checklistItems.map((item)=><li key={item.id} className="rounded-lg border border-slate-200 p-3 text-sm"><span className="font-bold text-slate-900">{item.item}</span>{item.mandatory ? <span className="ml-2 text-xs font-semibold text-orange-700">Required</span> : null}</li>)}</ul> : <p className="mt-4 text-sm text-slate-500">No Checklist Items are required for this Activity.</p>}<p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Checklist execution will become available in the next execution stage.</p></Panel> : null}
    {activeView === "evidence" ? <Panel title="Evidence" eyebrow="Future capability"><p className="text-sm text-slate-600">Evidence capture is not available at this execution stage.</p></Panel> : null}
    {activeView === "resources" ? <Panel title="Resource Requirements" eyebrow="Read-only foundation"><p className="text-sm text-slate-600">Requirements inherited from the approved Operational Template. Allocation, issuance, consumption and inventory are not available at this stage.</p>{execution.resourceRequirements.length ? <ul className="mt-4 space-y-2">{execution.resourceRequirements.map((item)=><li key={item.id} className="rounded-lg border border-slate-200 p-3 text-sm text-slate-700"><span className="font-bold text-slate-900">{item.name}</span><span> · {item.quantity}{item.unit ? ` ${item.unit}` : ""} · {item.type.replaceAll("_", " ")}</span>{item.mandatory ? <span className="ml-2 text-xs font-semibold text-orange-700">Required</span> : null}</li>)}</ul> : <p className="mt-4 text-sm text-slate-500">No Resource Requirements are defined for this Activity.</p>}</Panel> : null}
    {activeView === "history" ? <Panel title="Activity History" eyebrow="Authoritative event chronology">{execution.hasLegacyAmbiguousOrder ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Some historical events share the same recorded time. Their exact sequence is unavailable.</p> : null}{execution.events.length ? <ol className="mt-4 space-y-3">{execution.events.map((event)=><li key={event.id} className="rounded-lg border border-slate-200 p-3 text-sm text-slate-700"><p className="font-bold text-slate-950">{historyLabel(event.event_type)}</p><p className="mt-1">{event.actorName} · <time dateTime={event.occurred_at}>{formatDateTime(event.occurred_at, "Time unavailable")}</time></p>{event.note ? <p className="mt-2 text-slate-600">Reason: {event.note}</p> : null}</li>)}</ol> : <p className="text-sm text-slate-500">No execution history yet.</p>}</Panel> : null}
  </div>;
}

function Panel({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) { return <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">{eyebrow}</p><h4 className="mt-2 text-xl font-bold text-slate-950">{title}</h4><div className="mt-5">{children}</div></section>; }
function Fact({label,value}:{label:string;value:string}) { return <div><dt className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{value}</dd></div>; }
function PersonSelect({ label, value, setValue, people, empty }: { label: string; value: string; setValue: (value: string) => void; people: BuildRuntimeActivityExecution["eligibleOwners"]; empty: string }) { return <label className="grid gap-2 text-sm font-bold text-slate-700">{label}<select value={value} onChange={(event)=>setValue(event.target.value)} className="min-h-11 rounded-lg border border-slate-300 px-3"><option value="">{empty}</option>{people.map((person)=><option key={person.userId} value={person.userId}>{person.name} · {person.roleLabel}</option>)}</select></label>; }
function StatusMessage({ message }: { message: string }) { return <p role="status" className="mt-3 text-sm font-semibold text-slate-700">{message}</p>; }
function countLabel(value: number, singular: string) { return `${value} ${singular}${value === 1 ? "" : "s"}`; }
function titleStatus(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter)=>letter.toUpperCase()); }
function formatDateTime(value: string | null, fallback: string) { if (!value) return fallback; return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Lagos" }).format(new Date(value)).replace(",", " ·"); }
function dependencySummary(execution: BuildRuntimeActivityExecution) { if (!execution.predecessors.length) return "No predecessors"; return execution.predecessors.map((item)=>`${item.dependencyType === "FS" ? "Starts after" : item.dependencyType}: ${item.name}${item.dependencyType === "FS" ? " is completed" : ""}`).join("; "); }
function historyLabel(type:string) { return ({responsibility_assigned:"Responsibility assigned",started:"Activity started",completed:"Activity completed",blocked:"Activity blocked",resumed:"Activity resumed"} as Record<string,string>)[type] ?? "Activity updated"; }

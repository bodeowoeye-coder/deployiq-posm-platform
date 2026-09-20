"use client";

import { useState } from "react";
import type { ExecutiveIntelligenceViewModel, ExecutiveSection } from "@/lib/build/ai/executivePresentation";

const messages: Record<string, string> = {
  available: "Available", not_requested: "Not requested", ai_unavailable: "AI interpretation is unavailable", interpretation_unavailable: "Interpretation is unavailable", deterministic_intelligence_unavailable: "Project intelligence is unavailable", no_data: "No eligible data", not_authorized: "Not authorized", invalid_request: "Invalid request",
};
const date = (value: string) => new Date(value).toLocaleString();

function Section({ title, section }: { title: string; section: ExecutiveSection | null }) {
  return <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <h3 className="font-bold text-slate-950">{title}</h3>
    {!section ? <p className="mt-2 text-sm text-slate-600">Generate intelligence to see this section.</p> : <>
      {section.availability !== "available" ? <p className="mt-2 text-sm text-slate-600">{messages[section.availability] ?? "Unavailable"}.</p> : null}
      {section.statements.length ? <ul className="mt-3 space-y-3">{section.statements.map((item) => <li key={item.id} className="rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-800"><p>{item.text}</p>{item.supportState === "coverage_limited" ? <p className="mt-1 text-xs font-semibold text-orange-800">Coverage limited — see limitations below.</p> : null}{item.evidenceIds.length ? <p className="mt-1 text-xs text-slate-500">{item.evidenceIds.length} supporting fact{item.evidenceIds.length === 1 ? "" : "s"}</p> : null}</li>)}</ul> : section.availability === "available" ? <p className="mt-2 text-sm text-slate-600">No statements available.</p> : null}
    </>}
  </section>;
}

export function ExecutiveIntelligenceShell({ projectId, today = new Date().toISOString().slice(0, 10) }: { projectId: string; today?: string }) {
  const [view, setView] = useState<ExecutiveIntelligenceViewModel | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(() => { const start = new Date(`${today}T00:00:00.000Z`); start.setUTCDate(start.getUTCDate() - 6); return start.toISOString().slice(0, 10); });
  const [through, setThrough] = useState(today);
  const [cadence, setCadence] = useState<"daily" | "weekly">("daily");

  async function generate() {
    if (pending) return;
    setPending(true); setError(null);
    try {
      const response = await fetch(`/api/workspace/build/executive-intelligence/${encodeURIComponent(projectId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ history: { from, through, timezone: "UTC", cadence } }) });
      const body: { view?: ExecutiveIntelligenceViewModel; error?: string } = await response.json();
      if (!response.ok || !body.view) { setError(body.error ?? "Executive intelligence is unavailable."); return; }
      setView(body.view);
    } catch { setError("Executive intelligence is unavailable."); }
    finally { setPending(false); }
  }

  return <div className="min-w-0 space-y-4">
    <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-widest text-orange-700">DeployIQ AI</p>
      <h2 className="mt-1 text-2xl font-bold text-slate-950">Executive Intelligence</h2>
      <p className="mt-2 text-sm text-slate-600">AI-assisted interpretation based on DeployIQ project facts.</p>
      <p className="mt-1 text-xs text-slate-500">AI-assisted decision support is non-binding. DeployIQ project records remain authoritative.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-slate-700">Changes from (UTC)<input className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm" type="date" value={from} onChange={(event) => setFrom(event.target.value)}/></label>
        <label className="text-xs font-semibold text-slate-700">Through (UTC)<input className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm" type="date" value={through} onChange={(event) => setThrough(event.target.value)}/></label>
        <label className="text-xs font-semibold text-slate-700">Cadence<select className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm" value={cadence} onChange={(event) => setCadence(event.target.value as "daily" | "weekly")}><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
        <button type="button" onClick={generate} disabled={pending || !from || !through} className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{pending ? "Generating…" : view ? "Refresh Intelligence" : "Generate Intelligence"}</button>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-orange-800">{error}</p> : null}
      {view ? <p className="mt-3 text-xs text-slate-600">Availability: {view.availability}. Current-state As Of and Generated At may differ by section; Material Changes uses the selected history period.</p> : null}
    </header>
    <div className="grid min-w-0 gap-4 lg:grid-cols-2"><Section title="Executive Position" section={view?.executivePosition ?? null}/><Section title="Management Attention" section={view?.managementAttention ?? null}/></div>
    {view?.attentionGroups.length ? <section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-bold">Attention categories</h3><ul className="mt-3 grid gap-2 sm:grid-cols-2">{view.attentionGroups.map((item) => <li key={item.evidenceId} className="flex justify-between gap-3 rounded-lg border border-orange-200 bg-orange-50/50 p-3 text-sm"><span>{item.label}</span><strong>{item.count}</strong></li>)}</ul></section> : null}
    <Section title="Material Changes" section={view?.materialChanges ?? null}/>
    {view?.timing.change_interpretation?.historyPeriod ? <p className="text-xs text-slate-600">Material Changes: {view.timing.change_interpretation.historyPeriod.from} through {view.timing.change_interpretation.historyPeriod.through} · {view.timing.change_interpretation.historyPeriod.timezone} · {view.timing.change_interpretation.historyPeriod.cadence}</p> : null}
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><h3 className="font-bold">Decision Considerations <span className="ml-2 text-xs font-semibold uppercase text-slate-500">Non-binding</span></h3>{view?.decisionConsiderations.items.length ? <ul className="mt-3 space-y-3">{view.decisionConsiderations.items.map((item) => <li key={item.id} className="rounded-lg bg-slate-50 p-3 text-sm text-slate-800">{item.text}</li>)}</ul> : <p className="mt-2 text-sm text-slate-600">{view ? messages[view.decisionConsiderations.availability] ?? "No considerations available" : "Generate intelligence to see this section."}</p>}</section>
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><h3 className="font-bold">Data Coverage &amp; Limitations</h3>{view?.coverage.measures.length ? <ul className="mt-3 space-y-1 text-sm text-slate-700">{view.coverage.measures.map((item, index) => <li key={`${item.label}:${item.noun}:${index}`}>{item.label}: {item.represented} of {item.eligible} {item.noun}</li>)}</ul> : null}{view?.coverage.limitations.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">{view.coverage.limitations.map((item) => <li key={item.id}>{item.text}</li>)}</ul> : <p className="mt-2 text-sm text-slate-600">{view ? "No additional limitations reported." : "Generate intelligence to see this section."}</p>}</section>
    <details className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><summary className="cursor-pointer font-bold text-slate-950">Supporting Evidence {view ? `· ${view.evidence.length} facts` : ""}</summary>{view?.evidence.length ? <ul className="mt-3 space-y-2">{view.evidence.map((item) => <li key={item.id} className="min-w-0 rounded-lg bg-slate-50 p-3 text-sm"><p className="font-semibold">{item.label}</p><p className="break-words text-slate-700">{item.availability === "available" && item.value ? String(item.value.raw ?? "Not available") : "Evidence descriptor unavailable"}</p><p className="mt-1 text-xs text-slate-500">{item.source.label} · As Of {item.timing.asOf ? date(item.timing.asOf) : "unavailable"} · Generated At {item.timing.generatedAt ? date(item.timing.generatedAt) : "unavailable"}</p></li>)}</ul> : <p className="mt-2 text-sm text-slate-600">{view ? "No supporting descriptors available." : "Generate intelligence to see supporting facts."}</p>}</details>
  </div>;
}

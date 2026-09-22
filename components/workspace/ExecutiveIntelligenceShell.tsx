"use client";

import { useState } from "react";
import { formatExecutiveCoverage, groupExecutiveDecisionActions, materialChangesEmptyMessage } from "@/lib/build/ai/executivePresentation";
import type { ExecutiveFact, ExecutiveIntelligenceViewModel, ExecutiveSection, ExecutiveStatement } from "@/lib/build/ai/executivePresentation";

const messages: Record<string, string> = {
  available: "Available", partial: "Partial interpretation", not_requested: "Not requested",
  ai_unavailable: "AI interpretation is unavailable", interpretation_unavailable: "Interpretation is unavailable",
  deterministic_intelligence_unavailable: "Project intelligence is unavailable", no_data: "No eligible data",
  not_authorized: "Not authorized", invalid_request: "Invalid request",
};
const formatDate = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : "Unavailable";

function Availability({ value }: { value: string }) {
  return <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">{messages[value] ?? value}</span>;
}

function StatementList({ items }: { items: ExecutiveStatement[] }) {
  return <ul className="space-y-3">{items.map((item) => <li key={item.id} className="rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-800">
    <p>{item.text}</p>
    {item.supportState === "coverage_limited" ? <p className="mt-1 text-xs font-semibold text-orange-800">Coverage limited — see limitations below.</p> : null}
    {item.evidenceIds.length ? <p className="mt-1 text-xs text-slate-500">{item.evidenceIds.length} supporting fact{item.evidenceIds.length === 1 ? "" : "s"}</p> : null}
  </li>)}</ul>;
}

function Facts({ items }: { items: ExecutiveFact[] }) {
  if (!items.length) return null;
  return <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{items.map((item) => <div key={item.evidenceId} className="rounded-lg border border-slate-200 bg-white p-3 text-slate-950">
    <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{item.label}</dt>
    <dd className="mt-1 text-xl font-bold">{String(item.value ?? "Unavailable")}</dd>
  </div>)}</dl>;
}

function EmptyBriefing({ children = "Generate intelligence to prepare this briefing." }: { children?: string }) {
  return <p className="mt-2 text-sm text-slate-600">{children}</p>;
}

function Section({ title, section }: { title: string; section: ExecutiveSection | null }) {
  return <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-950">{title}</h3>{section ? <Availability value={section.availability} /> : null}</div>
    {!section ? <EmptyBriefing /> : section.statements.length ? <div className="mt-3"><StatementList items={section.statements} /></div> : <p className="mt-2 text-sm text-slate-600">{section.availability === "available" ? "No statements available." : `${messages[section.availability] ?? "Unavailable"}.`}</p>}
  </section>;
}

type Props = { projectId: string; today?: string; initialView?: ExecutiveIntelligenceViewModel | null };

export function ExecutiveIntelligenceShell({ projectId, today = new Date().toISOString().slice(0, 10), initialView = null }: Props) {
  const [view, setView] = useState<ExecutiveIntelligenceViewModel | null>(initialView);
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

  const executiveTiming = view?.timing.executive_summary;
  const historyTiming = view?.timing.change_interpretation;

  return <div className="min-w-0 space-y-4" aria-busy={pending}>
    <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div>
        <p className="text-xs font-bold uppercase tracking-widest text-orange-700">DeployIQ AI</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-950">Executive Intelligence</h2>
        <p className="mt-2 text-sm text-slate-600">AI-assisted interpretation based on DeployIQ project facts.</p>
        <p className="mt-1 text-xs text-slate-500">Decision support is non-binding. DeployIQ project records remain authoritative.</p>
      </div>{view ? <Availability value={view.availability} /> : null}</div>
      {view ? <dl className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
        <div><dt className="font-bold text-slate-700">As Of</dt><dd>{formatDate(executiveTiming?.asOf)}</dd></div>
        <div><dt className="font-bold text-slate-700">Generated At</dt><dd>{formatDate(executiveTiming?.generatedAt)}</dd></div>
        <div><dt className="font-bold text-slate-700">History Period</dt><dd>{historyTiming?.historyPeriod ? `${historyTiming.historyPeriod.from} – ${historyTiming.historyPeriod.through} · ${historyTiming.historyPeriod.timezone}` : "Unavailable"}</dd></div>
      </dl> : null}
      <div className="mt-4 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,11rem)_minmax(0,11rem)_7rem_auto]">
        <label className="min-w-0 text-xs font-semibold text-slate-700">Changes from (UTC)<input className="mt-1 block w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="min-w-0 text-xs font-semibold text-slate-700">Through (UTC)<input className="mt-1 block w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm" type="date" value={through} onChange={(event) => setThrough(event.target.value)} /></label>
        <label className="min-w-0 text-xs font-semibold text-slate-700">Cadence<select className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={cadence} onChange={(event) => setCadence(event.target.value as "daily" | "weekly")}><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
        <button type="button" onClick={generate} disabled={pending || !from || !through} className="min-h-10 rounded-lg bg-orange-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{pending ? "Generating…" : view ? "Refresh Intelligence" : "Generate Intelligence"}</button>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-orange-800">{error}</p> : null}
      {pending ? <p role="status" className="mt-3 text-sm text-slate-600">Preparing executive intelligence…</p> : null}
    </header>

    <section className="min-w-0 rounded-xl border border-slate-200 bg-slate-950 p-4 text-white shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-bold">Executive Position</h3>{view ? <Availability value={view.executivePosition.availability} /> : null}</div>
      {!view ? <p className="mt-2 text-sm text-slate-300">Generate intelligence to prepare the executive position.</p> : view.executivePosition.statements.length ? <div className="mt-4 text-slate-950"><StatementList items={view.executivePosition.statements} /></div> : <p className="mt-2 text-sm text-slate-300">{messages[view.executivePosition.availability] ?? "No executive position available"}.</p>}
      {view ? <Facts items={view.executiveFacts} /> : null}
    </section>

    <section className="min-w-0 rounded-xl border border-orange-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-950">Management Attention</h3>{view ? <Availability value={view.managementAttention.availability} /> : null}</div>
      {!view ? <EmptyBriefing /> : <>
        {view.attentionGroups.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2">{view.attentionGroups.filter((item) => item.count > 0).map((item) => <li key={item.evidenceId} className="flex justify-between gap-3 rounded-lg border border-orange-200 bg-orange-50/60 p-3 text-sm"><span>{item.label}</span><strong>{item.count}</strong></li>)}</ul> : null}
        {view.attentionItems.length ? <ul className="mt-3 space-y-2">{view.attentionItems.map((item) => <li key={`${item.condition}:${item.expectedNextAction}`} className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-semibold text-slate-950">{item.condition}{item.itemCount > 1 ? ` · ${item.itemCount} items` : ""}</p><p className="mt-1 text-slate-600">{item.expectedNextAction}</p><p className="mt-1 text-xs text-slate-500">{item.evidenceIds.length} supporting fact{item.evidenceIds.length === 1 ? "" : "s"}</p></li>)}</ul> : view.managementAttention.statements.length ? <div className="mt-3"><StatementList items={view.managementAttention.statements} /></div> : <p className="mt-2 text-sm text-slate-600">No non-zero attention categories.</p>}
      </>}
    </section>

    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">Decision Considerations</h3><span className="rounded-full bg-orange-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-orange-800">Non-binding</span></div>
      {view?.decisionConsiderations.items.length ? <ul className="mt-3 space-y-3">{groupExecutiveDecisionActions(view.decisionConsiderations.items, view.evidence).map((item) => <li key={item.id} className="rounded-lg bg-slate-50 p-3 text-sm text-slate-800"><p>{item.text}</p>{item.itemCount > 1 ? <p className="mt-1 text-xs font-bold text-slate-600">Applies to {item.itemCount} exact matching actions</p> : null}<p className="mt-1 text-xs text-slate-500">{item.evidenceIds.length} supporting fact{item.evidenceIds.length === 1 ? "" : "s"}</p></li>)}</ul> : <EmptyBriefing />}
    </section>

    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Material Changes</h3>{view ? <Availability value={view.materialChanges.availability} /> : null}</div>
      {historyTiming?.historyPeriod ? <p className="mt-2 text-xs text-slate-600">{historyTiming.historyPeriod.from} through {historyTiming.historyPeriod.through} · {historyTiming.historyPeriod.timezone} · {historyTiming.historyPeriod.cadence}</p> : null}
      {view?.materialChanges.statements.length ? <div className="mt-3"><StatementList items={view.materialChanges.statements} /></div> : <p className="mt-2 text-sm text-slate-600">{materialChangesEmptyMessage(view?.materialChanges ?? null)}</p>}
      {view ? <Facts items={view.materialFacts} /> : null}
    </section>

    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="font-bold">Data Coverage &amp; Limitations</h3>
      {view?.coverage.measures.length ? <ul className="mt-3 space-y-2 text-sm text-slate-700">{view.coverage.measures.map((item, index) => <li key={`${item.label}:${item.noun}:${index}`} className="rounded-lg bg-slate-50 p-3">{formatExecutiveCoverage(item)}</li>)}</ul> : null}
      {view?.coverage.limitations.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">{view.coverage.limitations.map((item) => <li key={item.id}>{item.text}</li>)}</ul> : <p className="mt-2 text-sm text-slate-600">{view ? "No additional limitations reported." : "Generate intelligence to review data coverage."}</p>}
    </section>

    <details className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <summary className="cursor-pointer font-bold text-slate-950">Supporting Evidence {view ? `· ${view.evidence.length} facts` : ""}</summary>
      {view?.evidence.length ? <ul className="mt-3 grid gap-2 lg:grid-cols-2">{view.evidence.map((item) => <li key={item.id} className="min-w-0 rounded-lg bg-slate-50 p-3 text-sm"><div className="flex flex-wrap items-start justify-between gap-2"><p className="font-semibold">{item.label}</p><Availability value={item.availability} /></div><p className="mt-1 break-words text-slate-700">{item.availability === "available" && item.value ? String(item.value.raw ?? "Unavailable") : "Evidence descriptor unavailable"}</p><p className="mt-2 text-xs text-slate-500">Source: {item.source.label}</p><p className="text-xs text-slate-500">As Of {formatDate(item.timing.asOf)} · Generated At {formatDate(item.timing.generatedAt)}</p></li>)}</ul> : <p className="mt-2 text-sm text-slate-600">{view ? "No supporting descriptors available." : "Generate intelligence to see supporting facts."}</p>}
    </details>
  </div>;
}

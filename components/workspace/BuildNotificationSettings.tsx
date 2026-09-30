"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { BuildNotificationSettings } from "@/lib/build/notifications/settingsTypes";

type Draft = Record<string, { enabled: boolean; revision: string | null; recipientUserIds: string[] }>;
const makeDraft = (settings: BuildNotificationSettings): Draft => Object.fromEntries(settings.preferences.map((item) => [item.category, { enabled: item.enabled, revision: item.revision, recipientUserIds: item.recipients.map((recipient) => recipient.userId) }]));

export function BuildNotificationSettings({ projectId }: { projectId: string }) {
  const [settings, setSettings] = useState<BuildNotificationSettings | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setMessage(null);
    try {
      const response = await fetch(`/api/workspace/build/projects/${projectId}/notification-settings`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Notification settings are unavailable.");
      setSettings(body); setDraft(makeDraft(body));
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "Notification settings are unavailable." }); }
    finally { setLoading(false); }
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!settings) return;
    const invalid = settings.preferences.find((item) => draft[item.category]?.enabled && draft[item.category]?.recipientUserIds.length === 0);
    if (invalid) { setMessage({ kind: "error", text: "Select at least one eligible recipient before enabling this notification." }); return; }
    setSaving(true); setMessage(null);
    try {
      const response = await fetch(`/api/workspace/build/projects/${projectId}/notification-settings`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ preferences: settings.preferences.map((item) => ({ category: item.category, ...draft[item.category] })) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Notification settings could not be saved.");
      setSettings(body); setDraft(makeDraft(body)); setMessage({ kind: "success", text: "Notification settings saved." });
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "Notification settings could not be saved." }); }
    finally { setSaving(false); }
  }

  if (loading) return <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-sm text-slate-600">Loading notification settings…</p></section>;
  if (!settings) return <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-xl font-bold text-slate-950">Notifications unavailable</h3><p className="mt-2 text-sm text-slate-600">{message?.text}</p><button type="button" onClick={() => void load()} className="mt-4 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white">Retry</button></section>;

  return <section className="space-y-5">
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Project Settings</p>
      <h3 className="mt-2 text-xl font-bold text-slate-950">Notifications</h3>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Choose which factual in-app Build notifications are active for this project and who receives them. No one is subscribed implicitly.</p>
    </div>
    <div className="grid gap-4">
      {settings.preferences.map((preference) => {
        const state = draft[preference.category];
        return <article key={preference.category} className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1"><h4 className="text-lg font-bold text-slate-950">{preference.label}</h4><p className="mt-1 text-sm leading-6 text-slate-600">{preference.description}</p></div>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800"><input type="checkbox" className="h-5 w-5 accent-orange-600" checked={state.enabled} onChange={(event) => setDraft((current) => ({ ...current, [preference.category]: { ...state, enabled: event.target.checked } }))}/><span>In-app</span></label>
          </div>
          <fieldset className="mt-5 min-w-0"><legend className="text-sm font-semibold text-slate-900">Recipients</legend>
            {settings.eligibleRecipients.length === 0 ? <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No eligible project members are available for notifications. <Link href="/workspace/admin/team" className="font-semibold text-orange-700 underline">Manage users</Link></div> :
              <div className="mt-2 grid gap-2 sm:grid-cols-2">{settings.eligibleRecipients.map((recipient) => <label key={recipient.userId} className="flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-orange-600" checked={state.recipientUserIds.includes(recipient.userId)} onChange={(event) => setDraft((current) => ({ ...current, [preference.category]: { ...state, recipientUserIds: event.target.checked ? [...state.recipientUserIds, recipient.userId] : state.recipientUserIds.filter((id) => id !== recipient.userId) } }))}/><span className="min-w-0"><span className="block break-words text-sm font-semibold text-slate-900">{recipient.displayName}</span><span className="block break-words text-xs text-slate-500">{recipient.roleLabel}{recipient.email ? ` · ${recipient.email}` : ""}</span></span></label>)}</div>}
          </fieldset>
          {state.enabled && state.recipientUserIds.length === 0 && <p className="mt-3 text-sm font-medium text-red-700">Select at least one eligible recipient before enabling this notification.</p>}
        </article>;
      })}
    </div>
    <div className="sticky bottom-3 flex flex-col-reverse gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <div aria-live="polite" className={`text-sm ${message?.kind === "error" ? "text-red-700" : "text-emerald-700"}`}>{message?.text}</div>
      <button type="button" disabled={saving} onClick={() => void save()} className="min-h-11 w-full rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60 sm:w-auto">{saving ? "Saving…" : "Save Changes"}</button>
    </div>
  </section>;
}

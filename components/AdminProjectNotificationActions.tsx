"use client";

import { Bell, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PROJECT_NOTIFICATION_ACTIONS } from "@/lib/notifications";
import type { NotificationEvent, Project } from "@/lib/types";

export function AdminProjectNotificationActions({
  enabled,
  project,
  clientName
}: {
  enabled?: boolean;
  project: Project;
  clientName: string;
}) {
  const [selectedStatus, setSelectedStatus] = useState(PROJECT_NOTIFICATION_ACTIONS[0]?.status ?? "");
  const [timeline, setTimeline] = useState<NotificationEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  async function loadTimeline() {
    if (!enabled) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/notifications?projectId=${encodeURIComponent(project.id)}`, { credentials: "include" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Could not load timeline.");
      setTimeline((body?.notifications ?? []) as NotificationEvent[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load timeline.");
    } finally {
      setLoading(false);
    }
  }

  async function sendNotification() {
    setSending(true);
    setMessage("");
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: project.id, clientId: project.client_id, status: selectedStatus })
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Could not send notification.");
      setMessage("Client notification sent.");
      await loadTimeline();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send notification.");
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    loadTimeline();
  }, [enabled, project.id]);

  if (!enabled) return null;

  return (
    <div className="grid gap-3 rounded-lg border border-orange-100 bg-orange-50/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-600">
            <Bell size={14} /> Client notifications
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{clientName} project activity timeline</p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          <select
            value={selectedStatus}
            onChange={(event) => setSelectedStatus(event.target.value)}
            className="min-h-10 rounded-lg border border-orange-200 bg-white px-3 text-sm font-semibold text-slate-900"
          >
            {PROJECT_NOTIFICATION_ACTIONS.map((action) => (
              <option key={action.status} value={action.status}>{action.title}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={sendNotification}
            disabled={sending}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-bold text-white transition hover:bg-orange-600 disabled:bg-orange-300"
          >
            {sending ? <Loader2 className="animate-spin" size={16} /> : null}
            Send update
          </button>
        </div>
      </div>
      {message ? <p className="text-xs font-semibold text-slate-600">{message}</p> : null}
      <div className="grid gap-2">
        {loading ? <p className="text-sm text-slate-500">Loading activity timeline...</p> : null}
        {!loading && timeline.length === 0 ? <p className="text-sm text-slate-500">No client updates sent for this project yet.</p> : null}
        {timeline.slice(0, 6).map((event) => (
          <div key={event.id} className="flex min-w-0 items-start gap-2 rounded-lg bg-white px-3 py-2 text-sm">
            <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-500" size={16} />
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">{event.title}</p>
              <p className="text-xs leading-5 text-slate-500">
                {event.message} · {new Date(event.created_at).toLocaleString("en-GB", { timeZone: "Africa/Lagos" })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

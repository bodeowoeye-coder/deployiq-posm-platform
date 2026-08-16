"use client";

import { CheckCheck, ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { NotificationEvent } from "@/lib/types";

type NotificationWithProject = NotificationEvent & { project_name?: string | null; campaign_name?: string | null };

type Props = { enabled: boolean; projectId?: string | null; projects: Array<{ id: string; project_name: string; campaign_name?: string | null }> };

export function WorkspaceNotificationsClient({ enabled, projectId, projects: scopedProjects }: Props) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationWithProject[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const [scope, setScope] = useState("all");
  const [project, setProject] = useState(projectId || "all");
  const [eventType, setEventType] = useState("all");
  const [date, setDate] = useState("");

  async function loadNotifications() {
    if (!enabled) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/notifications${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`, { credentials: "include", cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Could not load notifications.");
      setNotifications((body?.notifications ?? []) as NotificationWithProject[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadNotifications(); }, [enabled, projectId]);

  const projects = scopedProjects.length > 0 ? scopedProjects.map((item) => [item.id, item.project_name] as [string, string]) : Array.from(new Map(notifications.filter((item) => item.project_id).map((item) => [item.project_id as string, item.project_name || item.project_id as string])).entries());
  const eventTypes = Array.from(new Set(notifications.map((item) => item.status).filter(Boolean))).sort();
  const filtered = useMemo(() => notifications.filter((item) =>
    (scope === "all" || (scope === "unread" && !item.read_at)) &&
    (project === "all" || item.project_id === project) &&
    (eventType === "all" || item.status === eventType) &&
    (!date || item.created_at.slice(0, 10) === date)
  ), [date, eventType, notifications, project, scope]);
  const unreadCount = notifications.filter((item) => !item.read_at).length;

  async function markRead(id: string) {
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, read_at: readAt } : item));
    const response = await fetch("/api/notifications", { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    if (!response.ok) await loadNotifications();
  }

  async function markAllRead() {
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
    const response = await fetch("/api/notifications", { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ markAllRead: true }) });
    if (!response.ok) await loadNotifications();
  }

  if (!enabled) return <EmptyState title="Notifications are unavailable" message="Workspace notifications are currently disabled." />;
  if (loading) return <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600"><Loader2 className="animate-spin" size={16} />Loading notifications...</div>;
  if (error) return <section className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-rose-900"><h2 className="text-lg font-bold">Notifications unavailable</h2><p className="mt-2 text-sm">{error}</p></section>;

  return <div className="space-y-6">
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Customer Workspace</p><h2 className="mt-2 text-2xl font-bold text-slate-950">Notifications</h2><p className="mt-2 text-sm leading-6 text-slate-600">Workspace activity and updates from the existing DeployIQ event stream.</p></div><div className="text-right"><p className="text-2xl font-bold text-slate-950">{unreadCount}</p><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Unread</p></div></div>
    </section>
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Filter label="Scope"><select value={scope} onChange={(event) => setScope(event.target.value)} className="control"><option value="all">All</option><option value="unread">Unread</option></select></Filter><Filter label="Project"><select value={project} onChange={(event) => { const value = event.target.value; setProject(value); router.push(`/workspace/admin/notifications${value === "all" ? "" : `?projectId=${encodeURIComponent(value)}`}`); }} className="control"><option value="all">All projects</option>{projects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Filter><Filter label="Event type"><select value={eventType} onChange={(event) => setEventType(event.target.value)} className="control"><option value="all">All event types</option>{eventTypes.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></Filter><Filter label="Date"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="control" /></Filter></div><button type="button" onClick={() => void markAllRead()} disabled={unreadCount === 0} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:border-orange-300 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"><CheckCheck size={16} />Mark all as read</button></section>
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">{filtered.length === 0 ? <EmptyState title="No notifications yet." message="Workspace activity and updates will appear here." /> : <div className="divide-y divide-slate-100">{filtered.map((item) => <article key={item.id} className={`p-5 ${item.read_at ? "bg-white" : "bg-orange-50/40"}`}><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-950">{item.title}</h3>{!item.read_at ? <span className="rounded-full bg-orange-100 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-orange-700">Unread</span> : null}</div><p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{item.message}</p><p className="mt-2 text-xs text-slate-500">{item.project_name || item.project_id ? `${item.project_name || "Project"}${item.campaign_name ? ` · ${item.campaign_name}` : ""}` : "Workspace activity"} · {new Date(item.created_at).toLocaleString("en-GB", { timeZone: "Africa/Lagos" })}</p></div><div className="flex shrink-0 flex-wrap gap-2"><a href={item.project_id ? `/workspace/admin/projects/${item.project_id}` : "/workspace/admin/submissions"} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold text-orange-700 hover:border-orange-300 hover:bg-orange-50"><ExternalLink size={14} />Open</a>{!item.read_at ? <button type="button" onClick={() => void markRead(item.id)} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:border-orange-300 hover:bg-orange-50">Mark read</button> : null}</div></div></article>)}</div>}</section>
  </div>;
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-semibold text-slate-700"><span className="mb-1.5 block text-xs uppercase tracking-widest text-slate-500">{label}</span>{children}</label>; }
function EmptyState({ title, message }: { title: string; message: string }) { return <div className="p-10 text-center"><h3 className="text-lg font-bold text-slate-950">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{message}</p></div>; }

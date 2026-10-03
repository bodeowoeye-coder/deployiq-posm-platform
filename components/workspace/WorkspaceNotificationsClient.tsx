"use client";

import { CheckCheck, ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BUILD_NOTIFICATION_LABELS, workspaceNotificationIdentity, type WorkspaceNotification } from "@/lib/notifications/presentation";

type Props = { enabled: boolean; projectId?: string | null; projects: Array<{ id: string; project_name: string; campaign_name?: string | null }>; routeBase?: string; apiPath?: string; operationalBuildLinks?: boolean };

function categoryLabel(item: WorkspaceNotification) {
  if (item.source === "build") return BUILD_NOTIFICATION_LABELS[item.category as keyof typeof BUILD_NOTIFICATION_LABELS] ?? item.category.replaceAll("_", " ");
  return item.category.replaceAll("_", " ");
}

export function WorkspaceNotificationsClient({ enabled, projectId, projects: scopedProjects, routeBase = "/workspace/admin/notifications", apiPath = "/api/notifications", operationalBuildLinks = false }: Props) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [partial, setPartial] = useState(false);
  const [scope, setScope] = useState("all");
  const [project, setProject] = useState(projectId || "all");
  const [eventType, setEventType] = useState("all");
  const [date, setDate] = useState("");

  async function loadNotifications() {
    if (!enabled) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${apiPath}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`, { credentials: "include", cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Could not load notifications.");
      setNotifications((body?.notifications ?? []) as WorkspaceNotification[]);
      setPartial(body?.partial === true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadNotifications(); }, [enabled, projectId]);

  const projects = scopedProjects.length > 0
    ? scopedProjects.map((item) => [item.id, item.project_name] as [string, string])
    : Array.from(new Map(notifications.filter((item) => item.projectId).map((item) => [item.projectId as string, item.projectLabel || "Project"])).entries());
  const eventTypes = Array.from(new Set(notifications.map((item) => item.category).filter(Boolean))).sort();
  const filtered = useMemo(() => notifications.filter((item) =>
    (scope === "all" || (scope === "unread" && !item.readAt)) &&
    (project === "all" || item.projectId === project) &&
    (eventType === "all" || item.category === eventType) &&
    (!date || item.occurredAt.slice(0, 10) === date)
  ), [date, eventType, notifications, project, scope]);
  const unreadCount = notifications.filter((item) => !item.readAt).length;
  const unreadRetailCount = notifications.filter((item) => item.source === "retail" && !item.readAt).length;
  const hasBuildNotifications = notifications.some((item) => item.source === "build");

  async function applyAction(item: WorkspaceNotification, action: "mark_read" | "acknowledge") {
    const previous = notifications;
    const now = new Date().toISOString();
    setActionError("");
    setNotifications((current) => current.map((candidate) => workspaceNotificationIdentity(candidate) === workspaceNotificationIdentity(item)
      ? action === "mark_read" ? { ...candidate, readAt: candidate.readAt ?? now } : { ...candidate, acknowledgedAt: candidate.acknowledgedAt ?? now, canAcknowledge: false }
      : candidate));
    try {
      const response = await fetch(apiPath, {
        method: "PATCH", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: item.source, id: item.id, action })
      });
      if (!response.ok) throw new Error("Notification action could not be completed.");
      return true;
    } catch {
      setNotifications(previous);
      setActionError("Notification action could not be completed. Please try again.");
      return false;
    }
  }

  async function openNotification(item: WorkspaceNotification) {
    if (!item.destination?.available || !item.destination.href) return;
    const authorized = item.readAt ? true : await applyAction(item, "mark_read");
    if (authorized) router.push(operationalBuildLinks && item.source === "build" ? `${routeBase}/${encodeURIComponent(item.id)}` : item.destination.href);
  }

  async function markAllRetailRead() {
    const previous = notifications;
    const readAt = new Date().toISOString();
    setActionError("");
    setNotifications((current) => current.map((item) => item.source === "retail" ? { ...item, readAt: item.readAt ?? readAt } : item));
    try {
      const response = await fetch(apiPath, { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "retail", markAllRead: true }) });
      if (!response.ok) throw new Error("Retail notification update failed");
    } catch {
      setNotifications(previous);
      setActionError("Retail notifications could not be marked as read. Please try again.");
    }
  }

  if (!enabled) return <EmptyState title="Notifications are unavailable" message="Workspace notifications are currently disabled." />;
  if (loading) return <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600"><Loader2 className="animate-spin" size={16} />Loading notifications...</div>;
  if (error) return <section className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-rose-900"><h2 className="text-lg font-bold">Notifications unavailable</h2><p className="mt-2 text-sm">{error}</p></section>;

  return <div className="space-y-6">
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Customer Workspace</p><h2 className="mt-2 text-2xl font-bold text-slate-950">Notifications</h2><p className="mt-2 text-sm leading-6 text-slate-600">Workspace activity and updates in one chronological feed.</p></div><div className="text-right"><p className="text-2xl font-bold text-slate-950">{unreadCount}</p><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Unread</p></div></div>
    </section>
    {partial ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">Some updates are temporarily unavailable.</div> : null}
    {actionError ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{actionError}</div> : null}
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Filter label="Scope"><select value={scope} onChange={(event) => setScope(event.target.value)} className="control"><option value="all">All</option><option value="unread">Unread</option></select></Filter><Filter label="Project"><select value={project} onChange={(event) => { const value = event.target.value; setProject(value); router.push(`${routeBase}${value === "all" ? "" : `?projectId=${encodeURIComponent(value)}`}`); }} className="control"><option value="all">All projects</option>{projects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Filter><Filter label="Event type"><select value={eventType} onChange={(event) => setEventType(event.target.value)} className="control"><option value="all">All event types</option>{eventTypes.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></Filter><Filter label="Date"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="control" /></Filter></div>{!operationalBuildLinks ? <button type="button" onClick={() => void markAllRetailRead()} disabled={unreadRetailCount === 0} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:border-orange-300 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"><CheckCheck size={16} />{hasBuildNotifications ? "Mark all Retail as read" : "Mark all as read"}</button> : null}</section>
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">{filtered.length === 0 ? <EmptyState title="No notifications yet" message="Workspace activity and updates will appear here." /> : <div className="divide-y divide-slate-100">{filtered.map((item) => <article key={workspaceNotificationIdentity(item)} className={`p-5 ${item.readAt ? "bg-white" : "bg-orange-50/40"}`}><div className="flex flex-col items-start justify-between gap-4 sm:flex-row"><div className="min-w-0 max-w-full"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-bold text-slate-950">{item.title}</h3>{!item.readAt ? <Badge tone="orange">Unread</Badge> : null}{item.source === "build" ? <Badge>{categoryLabel(item)}</Badge> : null}{item.source === "build" ? <Badge>{item.state === "active" ? "Active" : "Resolved"}</Badge> : null}{item.acknowledgedAt ? <Badge>Acknowledged</Badge> : null}</div><p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-slate-700">{item.summary}</p><p className="mt-2 break-words text-xs text-slate-500">{item.projectLabel || "Workspace activity"} · {new Date(item.occurredAt).toLocaleString("en-GB", { timeZone: "Africa/Lagos" })}</p>{item.destination && !item.destination.available ? <p className="mt-2 text-xs font-semibold text-slate-500">Destination no longer available.</p> : null}</div><div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto">{item.destination?.available ? <button type="button" onClick={() => void openNotification(item)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold text-orange-700 hover:border-orange-300 hover:bg-orange-50 sm:flex-none"><ExternalLink size={14} />{item.source === "build" && item.category === "exception" ? "Open Exception" : item.source === "build" ? "Open Activity" : "Open"}</button> : null}{!item.readAt ? <button type="button" onClick={() => void applyAction(item, "mark_read")} className="min-h-11 flex-1 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:border-orange-300 hover:bg-orange-50 sm:flex-none">Mark read</button> : null}{item.source === "build" && item.canAcknowledge ? <button type="button" onClick={() => void applyAction(item, "acknowledge")} className="min-h-11 flex-1 rounded-lg bg-orange-500 px-3 text-xs font-bold text-white hover:bg-orange-600 sm:flex-none">Acknowledge</button> : null}</div></div></article>)}</div>}</section>
  </div>;
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "orange" }) { return <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${tone === "orange" ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-600"}`}>{children}</span>; }
function Filter({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-semibold text-slate-700"><span className="mb-1.5 block text-xs uppercase tracking-widest text-slate-500">{label}</span>{children}</label>; }
function EmptyState({ title, message }: { title: string; message: string }) { return <div className="p-10 text-center"><h3 className="text-lg font-bold text-slate-950">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{message}</p></div>; }

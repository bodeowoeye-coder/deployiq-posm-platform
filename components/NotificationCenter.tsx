"use client";

import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BUILD_NOTIFICATION_LABELS, workspaceNotificationIdentity, type WorkspaceNotification } from "@/lib/notifications/presentation";

export function NotificationCenter({ enabled }: { enabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);
  const [partial, setPartial] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = useMemo(() => notifications.filter((notification) => !notification.readAt).length, [notifications]);
  const unreadRetailCount = useMemo(() => notifications.filter((notification) => notification.source === "retail" && !notification.readAt).length, [notifications]);
  const hasBuildNotifications = notifications.some((notification) => notification.source === "build");
  const visibleNotifications = showAll ? notifications : notifications.slice(0, 6);

  async function loadNotifications() {
    if (!enabled) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/notifications", { credentials: "include" });
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

  async function markRead(notification: WorkspaceNotification) {
    const previous = notifications;
    setNotifications((current) => current.map((item) => (item.source === notification.source && item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item)));
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: notification.source, id: notification.id, action: "mark_read" })
      });
      if (!response.ok) throw new Error("Could not mark notification as read.");
    } catch {
      setNotifications(previous);
      setError("Could not update notification.");
    }
  }

  async function markAllRead() {
    const previous = notifications;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => item.source === "retail" ? { ...item, readAt: item.readAt ?? readAt } : item));
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "retail", markAllRead: true })
      });
      if (!response.ok) throw new Error("Could not mark notifications as read.");
    } catch {
      setNotifications(previous);
      setError("Could not update Retail notifications.");
    }
  }

  useEffect(() => {
    if (!enabled) return;
    loadNotifications();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") loadNotifications();
    }, 30000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") loadNotifications();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!enabled) return null;

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          if (!open) loadNotifications();
        }}
        className="relative inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-orange-200 hover:bg-orange-50"
        aria-label="Open notification center"
      >
        <Bell size={16} />
        <span className="hidden sm:inline">Notifications</span>
        {unreadCount > 0 ? (
          <span className="absolute -right-2 -top-2 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[11px] font-bold text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-x-3 top-4 z-50 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-950 shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[min(360px,calc(100vw-28px))]">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-bold">Notification Center</p>
              <p className="text-xs text-slate-500">{unreadCount} unread update{unreadCount === 1 ? "" : "s"}</p>
            </div>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadRetailCount === 0}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-orange-600 transition hover:bg-orange-50 disabled:text-slate-400"
            >
              <CheckCheck size={14} /> {hasBuildNotifications ? "Mark Retail read" : "Mark read"}
            </button>
          </div>
          <div className="max-h-[420px] overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-slate-500"><Loader2 className="animate-spin" size={16} /> Loading notifications...</div>
            ) : null}
            {error ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
            {!error && partial ? <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Some updates are temporarily unavailable.</div> : null}
            {!loading && !error && notifications.length === 0 ? (
              <div className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">No notifications yet.</div>
            ) : null}
            {visibleNotifications.map((notification) => (
              <button
                key={workspaceNotificationIdentity(notification)}
                type="button"
                onClick={() => markRead(notification)}
                className={`mb-2 block w-full rounded-lg border px-3 py-2 text-left transition ${
                  notification.readAt ? "border-slate-100 bg-white" : "border-orange-100 bg-orange-50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold leading-snug">{notification.title}</p>
                  {!notification.readAt ? <span className="mt-1 h-2 w-2 rounded-full bg-orange-500" aria-hidden /> : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-600">{notification.summary}</p>
                <div className="mt-2 flex flex-wrap gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {notification.source === "build" ? <span className="rounded-full bg-slate-100 px-2 py-1">{BUILD_NOTIFICATION_LABELS[notification.category as keyof typeof BUILD_NOTIFICATION_LABELS] ?? notification.category.replaceAll("_", " ")}</span> : null}
                  {notification.source === "build" ? <span className="rounded-full bg-slate-100 px-2 py-1">{notification.state}</span> : null}
                  {notification.acknowledgedAt ? <span className="rounded-full bg-slate-100 px-2 py-1">Acknowledged</span> : null}
                </div>
                {notification.retailDetails && (notification.retailDetails.phaseName || notification.retailDetails.destination || notification.retailDetails.quantity !== null) ? (
                  <div className="mt-2 flex flex-wrap gap-1 text-[11px] font-semibold text-slate-600">
                    {notification.retailDetails?.phaseName ? <span className="rounded-full bg-white px-2 py-1">Phase: {notification.retailDetails.phaseName}</span> : null}
                    {notification.retailDetails?.destination ? <span className="rounded-full bg-white px-2 py-1">Destination: {notification.retailDetails.destination}</span> : null}
                    {notification.retailDetails?.quantity !== null && notification.retailDetails?.quantity !== undefined ? <span className="rounded-full bg-white px-2 py-1">Quantity: {notification.retailDetails.quantity} boards</span> : null}
                  </div>
                ) : null}
                <p className="mt-2 text-[11px] font-medium text-slate-400">
                  {notification.projectLabel ? `${notification.projectLabel} · ` : ""}{new Date(notification.occurredAt).toLocaleString("en-GB", { timeZone: "Africa/Lagos" })}
                </p>
              </button>
            ))}
          </div>
          {notifications.length > 6 ? (
            <button type="button" onClick={() => setShowAll((current) => !current)} className="w-full border-t border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              {showAll ? "Show recent notifications" : "View all notifications"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

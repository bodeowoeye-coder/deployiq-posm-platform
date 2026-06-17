"use client";

import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { NotificationEvent } from "@/lib/types";

export function NotificationCenter({ enabled }: { enabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = useMemo(() => notifications.filter((notification) => !notification.read_at).length, [notifications]);
  const visibleNotifications = showAll ? notifications : notifications.slice(0, 6);

  async function loadNotifications() {
    if (!enabled) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/notifications", { credentials: "include" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Could not load notifications.");
      setNotifications((body?.notifications ?? []) as NotificationEvent[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }

  async function markRead(id: string) {
    const previous = notifications;
    setNotifications((current) => current.map((item) => (item.id === id ? { ...item, read_at: new Date().toISOString() } : item)));
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (!response.ok) throw new Error("Could not mark notification as read.");
    } catch {
      setNotifications(previous);
    }
  }

  async function markAllRead() {
    const previous = notifications;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? readAt })));
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markAllRead: true })
      });
      if (!response.ok) throw new Error("Could not mark notifications as read.");
    } catch {
      setNotifications(previous);
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
        <div className="absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-28px))] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-950 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-bold">Notification Center</p>
              <p className="text-xs text-slate-500">{unreadCount} unread update{unreadCount === 1 ? "" : "s"}</p>
            </div>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-orange-600 transition hover:bg-orange-50 disabled:text-slate-400"
            >
              <CheckCheck size={14} /> Mark read
            </button>
          </div>
          <div className="max-h-[420px] overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-slate-500"><Loader2 className="animate-spin" size={16} /> Loading notifications...</div>
            ) : null}
            {error ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
            {!loading && !error && notifications.length === 0 ? (
              <div className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">No notifications yet.</div>
            ) : null}
            {visibleNotifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => markRead(notification.id)}
                className={`mb-2 block w-full rounded-lg border px-3 py-2 text-left transition ${
                  notification.read_at ? "border-slate-100 bg-white" : "border-orange-100 bg-orange-50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold leading-snug">{notification.title}</p>
                  {!notification.read_at ? <span className="mt-1 h-2 w-2 rounded-full bg-orange-500" aria-hidden /> : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-600">{notification.message}</p>
                {notification.phase_name || notification.destination || notification.quantity !== null ? (
                  <div className="mt-2 flex flex-wrap gap-1 text-[11px] font-semibold text-slate-600">
                    {notification.phase_name ? <span className="rounded-full bg-white px-2 py-1">Phase: {notification.phase_name}</span> : null}
                    {notification.destination ? <span className="rounded-full bg-white px-2 py-1">Destination: {notification.destination}</span> : null}
                    {notification.quantity !== null ? <span className="rounded-full bg-white px-2 py-1">Quantity: {notification.quantity} boards</span> : null}
                  </div>
                ) : null}
                <p className="mt-2 text-[11px] font-medium text-slate-400">
                  {new Date(notification.created_at).toLocaleString("en-GB", { timeZone: "Africa/Lagos" })}
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

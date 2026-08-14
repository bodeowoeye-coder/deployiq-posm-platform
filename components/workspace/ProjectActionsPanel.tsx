"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const actions = [
  { label: "Edit", action: "edit" },
  { label: "Pause", action: "pause" },
  { label: "Resume", action: "resume" },
  { label: "Archive", action: "archive" },
  { label: "Duplicate", action: "duplicate" },
  { label: "Export", action: "export" },
  { label: "Launch", action: "launch" },
  { label: "Close", action: "close" },
  { label: "Delete Draft", action: "delete_draft" },
] as const;

export function ProjectActionsPanel({ projectId, launchReady }: { projectId: string; launchReady: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  async function run(action: string, label: string) {
    if (action === "edit") {
      router.push(`/workspace/admin/projects/${projectId}/edit`);
      return;
    }
    if (action === "duplicate" || action === "export") {
      setMessage(`${label} support is being prepared for this workspace.`);
      messageRef.current?.focus();
      return;
    }
    if (action === "launch" && !launchReady) {
      setMessage("Launch is available when the project has the required operational data.");
      messageRef.current?.focus();
      return;
    }
    setLoading(action);
    setMessage(null);
    const response = await fetch("/api/workspace/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, action }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(payload.error ?? "Could not update this project.");
      setLoading(null);
      messageRef.current?.focus();
      return;
    }
    setLoading(null);
    setMessage(`${label} completed.`);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Actions</p>
      {message ? (
        <p ref={messageRef} tabIndex={-1} role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          {message}
        </p>
      ) : null}
      <div className="mt-4 grid gap-2">
        {actions.map((item) => {
          const blocked = item.action === "launch" && !launchReady;
          return (
            <button
              key={item.action}
              type="button"
              onClick={() => run(item.action, item.label)}
              aria-disabled={blocked ? "true" : undefined}
              disabled={loading === item.action}
              className="min-h-10 rounded-lg border border-slate-200 px-3 text-left text-sm font-bold text-slate-700 hover:border-orange-300 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-200 aria-disabled:bg-slate-100 aria-disabled:text-slate-400 disabled:opacity-60"
              data-project-id={projectId}
            >
              {loading === item.action ? "Updating..." : item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

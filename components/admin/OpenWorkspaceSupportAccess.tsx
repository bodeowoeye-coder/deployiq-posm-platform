"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function OpenWorkspaceSupportAccess({
  clientId,
  organisation,
  adminName,
  provisioned,
}: {
  clientId: string;
  organisation: string;
  adminName: string;
  provisioned: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!provisioned) {
    return (
      <span className="inline-flex min-h-10 cursor-not-allowed items-center rounded-lg border border-slate-200 bg-slate-100 px-4 text-sm font-bold text-slate-400">
        Workspace not provisioned
      </span>
    );
  }

  async function startSupportSession() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/support-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ clientId, reason, initiatedFrom: "customer_360" }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Could not start the support session.");
      router.push(body?.redirectTo ?? "/workspace/admin");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start the support session.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-10 items-center rounded-lg bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800">
        Open Workspace
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4" role="dialog" aria-modal="true" aria-labelledby="support-access-title">
          <section className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <h2 id="support-access-title" className="text-xl font-bold text-slate-950">Access Customer Workspace</h2>
            <dl className="mt-4 grid gap-3">
              <div className="rounded-lg bg-slate-50 px-3 py-3">
                <dt className="text-[11px] font-bold uppercase tracking-widest text-slate-400">You are about to enter</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-950">{organisation}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-3">
                <dt className="text-[11px] font-bold uppercase tracking-widest text-slate-400">You will remain signed in as</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-950">{adminName}</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-slate-600">Your access will be recorded as a DeployIQ support session.</p>
            <label className="mt-4 grid gap-1 text-sm font-semibold text-slate-700">
              Reason for access
              <textarea
                className="min-h-20 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
              />
            </label>
            {error ? <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800" role="alert">{error}</p> : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:border-orange-300 hover:bg-orange-50">Cancel</button>
              <button
                type="button"
                disabled={submitting || reason.trim().length < 5}
                onClick={startSupportSession}
                className="inline-flex min-h-10 items-center rounded-lg bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Starting..." : "Start Support Session"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

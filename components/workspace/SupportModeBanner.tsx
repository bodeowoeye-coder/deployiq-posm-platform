"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SupportModeBanner({
  organisation,
  expiresInMinutes,
}: {
  organisation: string;
  expiresInMinutes: number;
}) {
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  async function exitSupportMode() {
    setExiting(true);
    const response = await fetch("/api/admin/support-sessions", { method: "DELETE", credentials: "include" });
    const body = await response.json().catch(() => null);
    router.push(body?.redirectTo ?? "/admin/customers");
    router.refresh();
  }

  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 bg-amber-500 px-5 py-2 text-slate-950">
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-[0.2em]">DeployIQ Support Mode</p>
        <p className="text-sm font-semibold">
          You are accessing {organisation} as a DeployIQ Platform Administrator.
          <span className="ml-2 font-medium">Session expires in {expiresInMinutes} minutes.</span>
        </p>
      </div>
      <button
        type="button"
        onClick={exitSupportMode}
        disabled={exiting}
        className="inline-flex min-h-9 items-center rounded-lg bg-slate-950 px-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {exiting ? "Exiting..." : "Exit Support Mode"}
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import type { getApprovalWorkflowDashboard } from "@/lib/workspace/approvalWorkflow";

type Dashboard = Awaited<ReturnType<typeof getApprovalWorkflowDashboard>>;
type Config = Dashboard["config"];

export function ApprovalWorkflowClient({ dashboard }: { dashboard: Dashboard }) {
  const [config, setConfig] = useState<Config>(dashboard.config);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function toggleRole(roleKey: string) {
    const reviewerRoles = config.reviewerRoles.includes(roleKey as Config["reviewerRoles"][number])
      ? config.reviewerRoles.filter((role) => role !== roleKey)
      : [...config.reviewerRoles, roleKey as Config["reviewerRoles"][number]];
    setConfig({ ...config, reviewerRoles });
  }

  async function save() {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/workspace/approval-workflow", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    if (!response?.ok) {
      setMessage(body?.error || "Approval workflow could not be saved.");
      setBusy(false);
      return;
    }
    setConfig(body.config);
    setMessage("Approval workflow saved.");
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      {message ? <p className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm font-semibold text-orange-900" role="status">{message}</p> : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Current Workflow / Status</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Metric label="Mode" value={config.mode === "automatic" ? "Automatic Approval" : "Customer Review"} />
          <Metric label="Reviewer Roles" value={String(config.reviewerRoles.length)} />
          <Metric label="Status" value={config.configured ? "Configured" : "Not Configured"} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Approval Mode</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <ModeButton active={config.mode === "customer_review"} title="Customer Review" text="Submissions require review by an authorised workspace reviewer." onClick={() => setConfig({ ...config, mode: "customer_review" })} />
          <ModeButton active={config.mode === "automatic"} title="Automatic Approval" text="Eligible submissions may follow existing validation rules where supported." onClick={() => setConfig({ ...config, mode: "automatic" })} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Authorised Reviewers</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {dashboard.reviewerRoles.map((role) => (
            <label key={role.key} className="flex min-h-28 cursor-pointer gap-3 rounded-lg border border-slate-200 p-4">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={config.reviewerRoles.includes(role.key)} onChange={() => toggleRole(role.key)} />
              <span>
                <span className="block text-sm font-bold text-slate-950">{role.label}</span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">{role.description}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Review Rules</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Toggle label="Rejection reason required" checked={config.requireRejectionReason} onChange={(checked) => setConfig({ ...config, requireRejectionReason: checked })} />
          <Toggle label="Correction instructions required" checked={config.requireCorrectionInstructions} onChange={(checked) => setConfig({ ...config, requireCorrectionInstructions: checked })} />
          <Toggle label="Approval comments allowed" checked={config.allowApprovalComments} onChange={(checked) => setConfig({ ...config, allowApprovalComments: checked })} />
        </div>
      </section>

      <div className="flex justify-end">
        <button type="button" className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-60" disabled={busy || config.reviewerRoles.length === 0} onClick={save}>
          {busy ? "Saving..." : "Save Configuration"}
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-bold text-slate-950">{value}</p>
    </div>
  );
}

function ModeButton({ active, title, text, onClick }: { active: boolean; title: string; text: string; onClick: () => void }) {
  return (
    <button type="button" className={`rounded-lg border p-4 text-left ${active ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-white"}`} onClick={onClick}>
      <span className="block text-sm font-bold text-slate-950">{title}</span>
      <span className="mt-1 block text-xs leading-5 text-slate-600">{text}</span>
    </button>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-4 text-sm font-bold text-slate-900">
      <span>{label}</span>
      <input type="checkbox" className="h-4 w-4" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

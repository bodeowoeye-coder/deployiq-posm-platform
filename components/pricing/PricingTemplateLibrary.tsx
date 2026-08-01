"use client";

import { AlertCircle, Loader2, Plus } from "lucide-react";
import type { PricingTemplate } from "@/lib/commercial/pricing/types";
import { PricingTemplateCard } from "./PricingTemplateCard";

const STATUS_ORDER: Record<string, number> = {
  active: 0, inactive: 1, draft: 2, archived: 3,
};

type Props = {
  templates: PricingTemplate[];
  loading: boolean;
  error: string | null;
  success: string | null;
  actionLoading: string | null;
  onNewTemplate: () => void;
  onEditTemplate: (template: PricingTemplate) => void;
  onLifecycleAction: (id: string, action: "activate" | "deactivate" | "archive" | "clone") => void;
};

export function PricingTemplateLibrary({
  templates, loading, error, success, actionLoading,
  onNewTemplate, onEditTemplate, onLifecycleAction,
}: Props) {
  const sorted = [...templates].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 4) - (STATUS_ORDER[b.status] ?? 4)
  );

  const active = sorted.filter((t) => t.status === "active");
  const others = sorted.filter((t) => t.status !== "active");

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-2">

      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">Commercial pricing</h1>
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
              Admin
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Manage pricing templates applied during client onboarding.
          </p>
        </div>
        <button
          type="button"
          onClick={onNewTemplate}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New template
        </button>
      </div>

      {/* Alerts */}
      {error ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
          {success}
        </div>
      ) : null}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center gap-2.5 py-12 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading templates…
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-14 text-center">
          <p className="text-sm font-medium text-slate-500">No pricing templates yet</p>
          <p className="mt-1 text-xs text-slate-400">
            Create a template to configure commercial pricing for your platform.
          </p>
          <button
            type="button"
            onClick={onNewTemplate}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> New template
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active section */}
          {active.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Currently active
              </p>
              {active.map((t) => (
                <PricingTemplateCard
                  key={t.id ?? t.name}
                  template={t}
                  actionLoading={actionLoading}
                  onEdit={onEditTemplate}
                  onLifecycle={onLifecycleAction}
                />
              ))}
            </div>
          ) : null}

          {/* Draft / Inactive / Archived */}
          {others.length > 0 ? (
            <div className="space-y-3">
              {active.length > 0 ? (
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Other templates
                </p>
              ) : null}
              {others.map((t) => (
                <PricingTemplateCard
                  key={t.id ?? t.name}
                  template={t}
                  actionLoading={actionLoading}
                  onEdit={onEditTemplate}
                  onLifecycle={onLifecycleAction}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

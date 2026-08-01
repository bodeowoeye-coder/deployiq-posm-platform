"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, ChevronRight, Eye, Lock, X } from "lucide-react";
import type { PricingTemplate } from "@/lib/commercial/pricing/types";
import {
  currencySymbol,
  formatMoney,
  formatQuantity,
  hasValidationErrors,
  validateFormTiers,
} from "@/lib/commercial/pricing/tierEditor";
import {
  createDefaultFormState,
  formStateToApiBody,
  templateToFormState,
} from "./wizardUtils";
import { PricingTemplateDetailsStep } from "./PricingTemplateDetailsStep";
import { PricingTierTable } from "./PricingTierTable";
import { PricingPreviewStep } from "./PricingPreviewStep";
import { PricingReviewStep } from "./PricingReviewStep";
import type { FormState, WizardStep } from "./types";

const STEPS: { id: WizardStep; label: string; description: string }[] = [
  { id: 1, label: "Template details",  description: "Name, product and currency" },
  { id: 2, label: "Pricing tiers",     description: "Set quantity ranges and prices" },
  { id: 3, label: "Preview",           description: "Test the pricing calculation" },
  { id: 4, label: "Review",            description: "Save as draft and activate" },
];

type Props = {
  initialTemplate?: PricingTemplate | null;
  /** Active and archived templates open in read-only mode. */
  isReadOnly?: boolean;
  onClose: (reload?: boolean) => void;
};

export function PricingWizard({ initialTemplate, isReadOnly = false, onClose }: Props) {
  const [step, setStep] = useState<WizardStep>(1);
  const [form, setForm] = useState<FormState>(() =>
    initialTemplate ? templateToFormState(initialTemplate) : createDefaultFormState()
  );
  const [savedTemplateId, setSavedTemplateId] = useState<string | null>(
    initialTemplate?.id ?? null
  );
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track unsaved changes: becomes true after any field edit
  const [isDirty, setIsDirty] = useState(false);

  const tierErrors = useMemo(() => validateFormTiers(form.tiers), [form.tiers]);
  const hasTierErrors = useMemo(() => hasValidationErrors(tierErrors), [tierErrors]);

  const stepReady: Record<WizardStep, boolean> = {
    1: form.name.trim().length > 0,
    2: !hasTierErrors,
    3: true,
    4: true,
  };

  function handleFormChange(patch: Partial<FormState>) {
    setForm((c) => ({ ...c, ...patch }));
    if (!isReadOnly) setIsDirty(true);
  }

  function requestClose(reload = false) {
    if (!isReadOnly && isDirty && !reload) {
      // eslint-disable-next-line no-alert
      const confirmed = window.confirm(
        "You have unsaved changes. Leave without saving?"
      );
      if (!confirmed) return;
    }
    onClose(reload);
  }

  function goBack() {
    if (step > 1) setStep((s) => (s - 1) as WizardStep);
  }

  function goNext() {
    if (!stepReady[step] || step === 4) return;
    setStep((s) => (s + 1) as WizardStep);
  }

  async function handleSaveDraft() {
    setSaving(true);
    setError(null);
    try {
      const isUpdate = !!savedTemplateId;
      const body = formStateToApiBody(form, savedTemplateId);
      const response = await fetch("/api/admin/commercial/pricing-templates", {
        method: isUpdate ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("You don't have permission to save pricing templates.");
        }
        throw new Error(payload.error || "Unable to save pricing template.");
      }
      setSavedTemplateId(payload.template?.id ?? null);
      setIsDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save pricing template.");
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate(templateId: string) {
    setActivating(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/commercial/pricing-templates/${templateId}/activate`,
        { method: "POST", headers: { "Content-Type": "application/json" } }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to activate template.");
      setIsDirty(false);
      onClose(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to activate template.");
    } finally {
      setActivating(false);
    }
  }

  const templateStatus = initialTemplate?.status ?? "draft";
  const current = STEPS[step - 1];

  return (
    <div className="mx-auto max-w-3xl space-y-0">
      {/* ── Wizard header ── */}
      <div className="flex items-center justify-between gap-4 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => requestClose(false)}
            aria-label="Close wizard and return to library"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-orange-300"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400">
              {isReadOnly ? "Viewing template" : initialTemplate ? "Edit template" : "New template"}
            </p>
            <p className="truncate text-sm font-semibold text-slate-800">
              {form.name || "Untitled template"}
            </p>
          </div>
        </div>

        {/* Progress steps — desktop */}
        <nav className="hidden items-center gap-1 sm:flex" aria-label="Wizard progress">
          {STEPS.map((s, i) => {
            const isDone = s.id < step;
            const isCurrent = s.id === step;
            return (
              <div key={s.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => isDone ? setStep(s.id) : undefined}
                  disabled={!isDone && !isCurrent}
                  aria-current={isCurrent ? "step" : undefined}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    isCurrent
                      ? "bg-slate-900 text-white"
                      : isDone
                      ? "cursor-pointer bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                      : "cursor-default bg-slate-100 text-slate-400"
                  }`}
                >
                  {isDone ? <CheckCircle2 className="h-3 w-3" /> : <span>{s.id}</span>}
                  {s.label}
                </button>
                {i < STEPS.length - 1 ? (
                  <span className="h-px w-3 bg-slate-200" aria-hidden="true" />
                ) : null}
              </div>
            );
          })}
        </nav>

        <p className="shrink-0 text-xs text-slate-400 sm:hidden">{step} / {STEPS.length}</p>
      </div>

      {/* ── Read-only notice ── */}
      {isReadOnly ? (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">
              {templateStatus === "active" ? "Active template — view only" : "Archived template — view only"}
            </p>
            <p className="mt-0.5 text-xs text-amber-700">
              {templateStatus === "active"
                ? "Clone or deactivate this template to make structural changes."
                : "Archived templates cannot be edited."}
            </p>
          </div>
        </div>
      ) : null}

      {/* ── Step card ── */}
      <div className="rounded-xl border border-slate-200 bg-white">
        {/* Step title bar */}
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
              {isReadOnly ? <Eye className="h-3.5 w-3.5" /> : step}
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">{current.label}</h2>
              <p className="text-xs text-slate-500">{current.description}</p>
            </div>
          </div>
          {/* Mobile dot progress */}
          <div className="mt-3 flex items-center gap-1 sm:hidden" aria-hidden="true">
            {STEPS.map((s) => (
              <div key={s.id} className={`h-1.5 rounded-full transition-all ${
                s.id === step ? "w-5 bg-slate-900" :
                s.id < step ? "w-1.5 bg-emerald-400" : "w-1.5 bg-slate-200"
              }`} />
            ))}
          </div>
        </div>

        {/* Error banner */}
        {error ? (
          <div className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-700 flex items-start gap-2" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}

        {/* Step content */}
        <div className="px-5 py-6">
          {step === 1 && (
            <PricingTemplateDetailsStep form={form} onChange={isReadOnly ? () => {} : handleFormChange} readOnly={isReadOnly} />
          )}
          {step === 2 && (
            isReadOnly ? (
              <ReadOnlyTierView form={form} />
            ) : (
              <PricingTierTable
                tiers={form.tiers}
                currency={form.currency}
                onChange={(tiers) => handleFormChange({ tiers })}
              />
            )
          )}
          {step === 3 && (
            <PricingPreviewStep form={form} savedTemplateId={savedTemplateId} />
          )}
          {step === 4 && (
            isReadOnly ? (
              <PricingReviewStep
                form={form}
                savedTemplateId={savedTemplateId}
                saving={false}
                activating={false}
                readOnly={isReadOnly}
                onSaveDraft={async () => {}}
                onActivate={async () => {}}
              />
            ) : (
              <PricingReviewStep
                form={form}
                savedTemplateId={savedTemplateId}
                saving={saving}
                activating={activating}
                readOnly={false}
                onSaveDraft={handleSaveDraft}
                onActivate={handleActivate}
              />
            )
          )}
        </div>

        {/* ── Footer nav ── */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={goBack}
            className={`inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-orange-300 ${
              step === 1 ? "invisible" : ""
            }`}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => requestClose(false)}
              className="text-sm text-slate-400 hover:text-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-orange-300 rounded px-2 py-1"
            >
              {isReadOnly ? "Close" : "Cancel"}
            </button>

            {step < 4 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={!stepReady[step]}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 transition-colors focus:outline-none focus:ring-2 focus:ring-orange-300"
              >
                Continue
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Read-only view of tiers displayed as a table (no editing). */
function ReadOnlyTierView({ form }: { form: FormState }) {
  const sym = currencySymbol(form.currency);
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left">
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Tier</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">From</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">To</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Unit price</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Outcome</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {form.tiers.map((tier) => (
            <tr key={tier.sequence}>
              <td className="px-4 py-3 font-semibold text-slate-500">{tier.sequence}</td>
              <td className="px-4 py-3 font-mono text-slate-600">{formatQuantity(tier.minimumQuantity)}</td>
              <td className="px-4 py-3 font-mono text-slate-600">
                {tier.isEnterpriseTier
                  ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">No limit</span>
                  : tier.maximumQuantity ? formatQuantity(tier.maximumQuantity) : "—"}
              </td>
              <td className="px-4 py-3 font-mono text-slate-600">
                {tier.isEnterpriseTier ? "—" : `${sym}${formatQuantity(tier.unitPrice)}`}
              </td>
              <td className="px-4 py-3">
                {tier.isEnterpriseTier
                  ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Quotation</span>
                  : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Automatic</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

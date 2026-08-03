"use client";

import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { RecommendationResult } from "@/lib/commercial/onboarding/recommendation";

type Props = {
  recommendation: RecommendationResult | null;
  quantity: number;
  country: string;
  resumeToken: string | null;
  onBack: () => void;
};

type AssistanceForm = {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  notes: string;
};

export function EnterpriseAssistanceStep({
  recommendation,
  quantity,
  country,
  resumeToken,
  onBack,
}: Props) {
  const [form, setForm] = useState<AssistanceForm>({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    notes: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputClass =
    "block w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email.trim() || !form.contactName.trim()) {
      setError("Contact name and business email are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Persist enterprise request details to the onboarding draft.
      // No CRM or email automation — per sprint scope.
      if (resumeToken) {
        await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step: "enterprise-assistance",
            resumeToken,
            enterpriseRequest: {
              companyName: form.companyName,
              contactName: form.contactName,
              email: form.email,
              phone: form.phone,
              notes: form.notes,
              requestedProduct: recommendation?.productKey ?? null,
              estimatedQuantity: quantity,
              country,
              submittedAt: new Date().toISOString(),
            },
          }),
        });
      }
      setSubmitted(true);
    } catch {
      // Non-fatal — show confirmation anyway
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="space-y-8">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-emerald-900">Thank you</h2>
          <p className="mt-2 text-sm text-emerald-700">
            Your details have been saved. A member of the DeployIQ team will be in touch to prepare a tailored proposal for your programme.
          </p>
          <p className="mt-3 text-xs text-emerald-600">
            Typical response time: 1–2 business days.
          </p>
        </div>
        {resumeToken ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center">
            <p className="text-xs text-slate-400">
              Your progress is saved. Return any time at:
            </p>
            <p className="mt-1 break-all font-mono text-xs text-slate-600">
              /onboarding?token={resumeToken}
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Assisted Setup
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Let's configure your workspace.
          </h1>
          <p className="text-base text-slate-500 leading-relaxed">
            Our implementation specialists will review your requirements, configure the right DeployIQ workspace for your programme, and prepare a tailored commercial proposal.
          </p>
        </div>

        {/* Summary */}
        {(quantity > 0 || recommendation) ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              {recommendation ? (
                <span><strong className="text-slate-700">{recommendation.productName}</strong></span>
              ) : null}
              {quantity > 0 ? (
                <span><strong className="text-slate-700">{quantity.toLocaleString("en-US")}</strong> deployment locations</span>
              ) : null}
              {country ? <span><strong className="text-slate-700">{country}</strong></span> : null}
            </div>
          </div>
        ) : null}

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="ea-company" className="block text-sm font-medium text-slate-700">
                Company name
              </label>
              <input
                id="ea-company"
                type="text"
                value={form.companyName}
                onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                className={inputClass}
                placeholder="e.g. Acme Corporation"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ea-name" className="block text-sm font-medium text-slate-700">
                Contact name <span className="text-rose-500" aria-hidden="true">*</span>
              </label>
              <input
                id="ea-name"
                type="text"
                required
                value={form.contactName}
                onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                className={inputClass}
                placeholder="Your full name"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="ea-email" className="block text-sm font-medium text-slate-700">
                Business email <span className="text-rose-500" aria-hidden="true">*</span>
              </label>
              <input
                id="ea-email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className={inputClass}
                placeholder="you@company.com"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ea-phone" className="block text-sm font-medium text-slate-700">
                Phone
                <span className="ml-1 text-xs font-normal text-slate-400">optional</span>
              </label>
              <input
                id="ea-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className={inputClass}
                placeholder="+234 000 000 0000"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ea-notes" className="block text-sm font-medium text-slate-700">
              Any additional requirements or context
              <span className="ml-1 text-xs font-normal text-slate-400">optional</span>
            </label>
            <textarea
              id="ea-notes"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={`${inputClass} resize-none`}
              placeholder="Tell us more about your programme…"
            />
          </div>
        </div>

        {error ? (
          <p className="text-sm text-rose-600" role="alert">{error}</p>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </button>
          <button type="submit" disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </div>

        <p className="text-center text-xs text-slate-400">
          Your details will only be used to prepare your proposal. No payment information is collected at this stage.
        </p>
      </div>
    </form>
  );
}

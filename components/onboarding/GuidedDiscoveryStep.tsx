"use client";

import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";

import { WORKSPACE_CAPABILITIES, legacyCapabilityFlags } from "@/lib/commercial/onboarding/capabilities";
import type { WorkspaceCapabilityId } from "@/lib/commercial/onboarding/capabilities";

export type { WorkspaceCapabilityId };
export { WORKSPACE_CAPABILITIES, legacyCapabilityFlags };

export type DiscoveryData = {
  country: string;
  industry: string;
  rolloutQuantity: string;
  adminCount: string;
  /** Capability identifiers selected by the customer. */
  capabilities: string[];
};

type Props = {
  initialData: DiscoveryData;
  onSubmit: (data: DiscoveryData) => void;
  onBack: () => void;
  loading: boolean;
};

const COUNTRIES = [
  "Nigeria", "Ghana", "Kenya", "South Africa",
  "United Kingdom", "United States", "Other",
];

const INDUSTRIES = [
  "Retail merchandising & Point of Sale Materials (POSM)",
  "OOH billboard installation",
  "Fleet branding",
  "Real estate construction monitoring",
  "Telecom site rollout",
  "Solar installations",
  "Utility meter deployment",
  "Road infrastructure projects",
  "Oil & gas inspections",
  "Warehouse audits",
  "Facility management",
  "Insurance loss inspections",
  "Government capital projects",
];

export const WORKSPACE_CAPABILITIES_DEFINITION = WORKSPACE_CAPABILITIES;

type WorkspaceCapabilityItem = (typeof WORKSPACE_CAPABILITIES)[number];

const inputClass =
  "block w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400";

export function GuidedDiscoveryStep({ initialData, onSubmit, onBack, loading }: Props) {
  const [form, setForm] = useState<DiscoveryData>({
    ...initialData,
    capabilities: initialData.capabilities ?? [],
  });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.country.trim()) next.country = "Please select a country.";
    if (!form.industry.trim()) next.industry = "Please select your industry.";
    const qty = parseInt(form.rolloutQuantity, 10);
    if (!form.rolloutQuantity.trim() || !Number.isInteger(qty) || qty <= 0) {
      next.rolloutQuantity = "Enter a positive whole number.";
    }
    const admins = parseInt(form.adminCount, 10);
    if (!form.adminCount.trim() || !Number.isInteger(admins) || admins <= 0) {
      next.adminCount = "Enter a positive whole number.";
    }
    if (form.capabilities.length === 0) {
      next.capabilities = "Please select at least one capability for your programme.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    onSubmit(form);
  }

  function patchField(field: keyof Omit<DiscoveryData, "capabilities">, value: string) {
    setForm((c) => ({ ...c, [field]: value }));
    setErrors((c) => ({ ...c, [field]: undefined }));
  }

  function toggleCapability(id: string) {
    setForm((c) => {
      const caps = c.capabilities.includes(id)
        ? c.capabilities.filter((x) => x !== id)
        : [...c.capabilities, id];
      return { ...c, capabilities: caps };
    });
    setErrors((c) => ({ ...c, capabilities: undefined }));
  }

  const allIds = WORKSPACE_CAPABILITIES.map((c) => c.id);
  const selectedCount = form.capabilities.length;
  const allSelected = selectedCount === allIds.length;
  const noneSelected = selectedCount === 0;
  // aria-checked: true=all, false=none, mixed=some
  const selectAllChecked: boolean | "mixed" = allSelected ? true : noneSelected ? false : "mixed";

  function handleSelectAll() {
    if (allSelected) {
      setForm((c) => ({ ...c, capabilities: [] }));
    } else {
      setForm((c) => ({ ...c, capabilities: allIds.slice() }));
    }
    setErrors((c) => ({ ...c, capabilities: undefined }));
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
            Step 2 of 4
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Let's configure your DeployIQ workspace
          </h1>
          <p className="text-base text-slate-500 leading-relaxed">
            Answer a few questions so DeployIQ can recommend the right solution, configure your
            workspace, and prepare the appropriate commercial plan.
          </p>
        </div>

        <div className="space-y-5">
          {/* Country */}
          <div className="space-y-1.5">
            <label htmlFor="od-country" className="block text-sm font-medium text-slate-700">
              Which country is this rollout in?{" "}
              <span className="text-rose-500" aria-hidden="true">*</span>
            </label>
            <select
              id="od-country"
              value={form.country}
              onChange={(e) => patchField("country", e.target.value)}
              className={inputClass}
              aria-describedby={errors.country ? "od-country-err" : undefined}
            >
              <option value="">Select a country</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {errors.country ? (
              <p id="od-country-err" className="text-xs text-rose-600" role="alert">{errors.country}</p>
            ) : null}
          </div>

          {/* Industry — now required */}
          <div className="space-y-1.5">
            <label htmlFor="od-industry" className="block text-sm font-medium text-slate-700">
              What industry are you in?{" "}
              <span className="text-rose-500" aria-hidden="true">*</span>
            </label>
            <select
              id="od-industry"
              value={form.industry}
              onChange={(e) => patchField("industry", e.target.value)}
              className={inputClass}
              aria-describedby={errors.industry ? "od-industry-err" : undefined}
            >
              <option value="">Select your industry</option>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
            {errors.industry ? (
              <p id="od-industry-err" className="text-xs text-rose-600" role="alert">{errors.industry}</p>
            ) : null}
          </div>

          {/* Rollout quantity */}
          <div className="space-y-1.5">
            <label htmlFor="od-qty" className="block text-sm font-medium text-slate-700">
              How many deployment locations are in this rollout?{" "}
              <span className="text-rose-500" aria-hidden="true">*</span>
            </label>
            <input
              id="od-qty"
              type="number"
              min="1"
              step="1"
              value={form.rolloutQuantity}
              onChange={(e) => patchField("rolloutQuantity", e.target.value)}
              className={inputClass}
              placeholder="e.g. 5,000"
              aria-describedby="od-qty-hint od-qty-err"
            />
            <p id="od-qty-hint" className="text-xs text-slate-400">
              Each outlet, site, vehicle, or asset counts as one deployment location.
            </p>
            {errors.rolloutQuantity ? (
              <p id="od-qty-err" className="text-xs text-rose-600" role="alert">
                {errors.rolloutQuantity}
              </p>
            ) : null}
          </div>

          {/* Admin count */}
          <div className="space-y-1.5">
            <label htmlFor="od-admins" className="block text-sm font-medium text-slate-700">
              How many internal administrators will manage this programme?{" "}
              <span className="text-rose-500" aria-hidden="true">*</span>
            </label>
            <input
              id="od-admins"
              type="number"
              min="1"
              step="1"
              value={form.adminCount}
              onChange={(e) => patchField("adminCount", e.target.value)}
              className={inputClass}
              placeholder="e.g. 3"
              aria-describedby="od-admins-hint od-admins-err"
            />
            <p id="od-admins-hint" className="text-xs text-slate-400">
              These are the people in your team who will configure and oversee the programme.
            </p>
            {errors.adminCount ? (
              <p id="od-admins-err" className="text-xs text-rose-600" role="alert">
                {errors.adminCount}
              </p>
            ) : null}
          </div>

          {/* Capabilities — always visible, required */}
          <fieldset>
            <legend className="mb-3 block text-sm font-medium text-slate-700">
              Which capabilities does your programme require?{" "}
              <span className="text-rose-500" aria-hidden="true">*</span>
            </legend>

            {/* Select all / Clear all */}
            <div className="mb-3 flex items-center gap-2.5">
              <button
                type="button"
                role="checkbox"
                aria-checked={selectAllChecked}
                aria-label={allSelected ? "Clear all capabilities" : "Select all capabilities"}
                onClick={handleSelectAll}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors focus:outline-none focus:ring-2 focus:ring-orange-300 ${
                  allSelected
                    ? "border-orange-500 bg-orange-500"
                    : selectAllChecked === "mixed"
                    ? "border-orange-400 bg-orange-100"
                    : "border-slate-300 bg-white"
                }`}
              >
                {allSelected ? (
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : selectAllChecked === "mixed" ? (
                  <svg className="h-3 w-3 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 12h14" />
                  </svg>
                ) : null}
              </button>
              <span
                className="cursor-pointer text-sm font-medium text-slate-700 select-none"
                onClick={handleSelectAll}
              >
                {allSelected ? "Clear all" : "Select all capabilities"}
              </span>
              {!noneSelected && !allSelected ? (
                <span className="text-xs text-slate-400">({selectedCount} of {allIds.length} selected)</span>
              ) : null}
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {WORKSPACE_CAPABILITIES.map((cap) => {
                const selected = form.capabilities.includes(cap.id);
                return (
                  <button
                    key={cap.id}
                    type="button"
                    onClick={() => toggleCapability(cap.id)}
                    aria-pressed={selected}
                    className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-orange-300 ${
                      selected
                        ? "border-orange-400 bg-orange-50 ring-1 ring-orange-200"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        selected ? "border-orange-500 bg-orange-500" : "border-slate-300 bg-white"
                      }`}
                      aria-hidden="true"
                    >
                      {selected ? (
                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : null}
                    </span>
                    <div className="min-w-0">
                      <span className={`block text-sm font-medium ${selected ? "text-orange-900" : "text-slate-800"}`}>
                        {cap.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-slate-500">
                        {cap.description}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            {errors.capabilities ? (
              <p className="mt-2 text-xs text-rose-600" role="alert">{errors.capabilities}</p>
            ) : null}
          </fieldset>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {loading ? "Finding recommendation…" : "Get recommendation"}
          </button>
        </div>
      </div>
    </form>
  );
}

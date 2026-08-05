"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2, X } from "lucide-react";
import {
  validateOrganisationName,
  validateWorkspaceName,
  validateWorkspaceSlug,
  generateWorkspaceSlug,
  generateSlugAlternatives,
} from "@/lib/acquisition/identity";
import type { RecommendationResult } from "@/lib/commercial/onboarding/recommendation";
import type { CustomerQuotation } from "@/lib/commercial/onboarding/quotation";
import { WorkspacePreview } from "./WorkspacePreview";

export type IdentityOrgData = {
  organisationName: string;
  workspaceName: string;
  workspaceSlug: string;
  country: string;
  timezone: string;
};

const TIMEZONES = [
  { value: "Africa/Lagos",        label: "Lagos (WAT, UTC+1)" },
  { value: "Africa/Accra",        label: "Accra (GMT, UTC+0)" },
  { value: "Africa/Nairobi",      label: "Nairobi (EAT, UTC+3)" },
  { value: "Africa/Johannesburg", label: "Johannesburg (SAST, UTC+2)" },
  { value: "Europe/London",       label: "London (GMT/BST)" },
  { value: "America/New_York",    label: "New York (ET)" },
  { value: "America/Chicago",     label: "Chicago (CT)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PT)" },
];

type SlugStatus = "idle" | "checking" | "available" | "taken";

type Props = {
  initialData: IdentityOrgData;
  prefilledCountry: string;
  recommendation: RecommendationResult | null;
  quotation: CustomerQuotation | null;
  onSubmit: (data: IdentityOrgData) => void;
  onBack: () => void;
  adminPreview: { firstName: string; lastName: string; email: string };
};

const inputClass =
  "block w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400";

export function IdentityOrganisationStep({
  initialData,
  prefilledCountry,
  recommendation,
  quotation,
  onSubmit,
  onBack,
  adminPreview,
}: Props) {
  const [form, setForm] = useState<IdentityOrgData>({
    ...initialData,
    country: initialData.country || prefilledCountry,
  });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [slugSuggestions, setSlugSuggestions] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  // Track whether the user has manually edited the slug so we don't overwrite their input.
  const [userEditedSlug, setUserEditedSlug] = useState(false);

  // Auto-generate slug from org name only when user has not manually edited it.
  useEffect(() => {
    if (userEditedSlug) return;
    if (!form.organisationName.trim()) return;
    const generated = generateWorkspaceSlug(form.organisationName);
    setForm((c) => ({ ...c, workspaceSlug: generated }));
  }, [form.organisationName, userEditedSlug]);

  // Debounced slug availability check
  useEffect(() => {
    const slug = form.workspaceSlug.trim();
    if (!slug || validateWorkspaceSlug(slug)) {
      setSlugStatus("idle");
      return;
    }
    setSlugStatus("checking");
    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await fetch("/api/acquisition/workspace-availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        });
        const payload = await res.json();
        setSlugStatus(payload.available ? "available" : "taken");
        if (!payload.available) {
          setSlugSuggestions(generateSlugAlternatives(slug));
        } else {
          setSlugSuggestions([]);
        }
      } catch {
        setSlugStatus("idle");
      } finally {
        setChecking(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [form.workspaceSlug]);

  function patch(field: keyof IdentityOrgData, value: string) {
    setForm((c) => ({ ...c, [field]: value }));
    setErrors((c) => ({ ...c, [field]: undefined }));
  }

  function handleSlugChange(raw: string) {
    const cleaned = raw.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setUserEditedSlug(true);
    patch("workspaceSlug", cleaned);
  }

  function useSuggestedSlug() {
    if (!form.organisationName.trim()) return;
    const generated = generateWorkspaceSlug(form.organisationName);
    setUserEditedSlug(false);
    patch("workspaceSlug", generated);
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    const orgErr = validateOrganisationName(form.organisationName);
    if (orgErr) next.organisationName = orgErr;
    const wsErr = validateWorkspaceName(form.workspaceName || form.organisationName);
    if (wsErr) next.workspaceName = wsErr;
    const slugErr = validateWorkspaceSlug(form.workspaceSlug);
    if (slugErr) next.workspaceSlug = slugErr;
    if (slugStatus === "taken") next.workspaceSlug = "This workspace URL is already taken.";
    if (!form.country.trim()) next.country = "Please select a country.";
    if (!form.timezone.trim()) next.timezone = "Please select a time zone.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const finalData: IdentityOrgData = {
      ...form,
      workspaceName: form.workspaceName || form.organisationName,
    };
    onSubmit(finalData);
  }

  const slugIndicator =
    slugStatus === "available" ? (
      <span className="flex items-center gap-1 text-xs text-emerald-600">
        <Check className="h-3 w-3" /> Available
      </span>
    ) : slugStatus === "taken" ? (
      <span className="flex items-center gap-1 text-xs text-rose-600">
        <X className="h-3 w-3" /> Taken
      </span>
    ) : slugStatus === "checking" ? (
      <span className="flex items-center gap-1 text-xs text-slate-400">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking…
      </span>
    ) : null;

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* Main form */}
        <div className="space-y-8 min-w-0">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
              Workspace Setup — Step 1 of 4
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Create your organisation
            </h1>
            <p className="text-base text-slate-500 leading-relaxed">
              Let's create the DeployIQ workspace for your organisation.
            </p>
          </div>

          <div className="space-y-5">
            {/* Organisation Name */}
            <div className="space-y-1.5">
              <label htmlFor="org-name" className="block text-sm font-medium text-slate-700">
                Organisation name <span className="text-rose-500" aria-hidden="true">*</span>
              </label>
              <input id="org-name" type="text" value={form.organisationName}
                onChange={(e) => patch("organisationName", e.target.value)}
                className={inputClass} placeholder="e.g. Acme Limited"
                aria-describedby={errors.organisationName ? "org-name-err" : undefined} />
              {errors.organisationName ? (
                <p id="org-name-err" className="text-xs text-rose-600" role="alert">{errors.organisationName}</p>
              ) : null}
            </div>

            {/* Workspace URL */}
            <div className="space-y-1.5">
              <label htmlFor="ws-slug" className="block text-sm font-medium text-slate-700">
                Workspace URL <span className="text-rose-500" aria-hidden="true">*</span>
              </label>
              <div className="flex items-center gap-0">
                <input id="ws-slug" type="text" value={form.workspaceSlug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  className="block flex-1 rounded-l-xl border border-r-0 border-slate-200 px-3.5 py-2.5 text-sm font-mono placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                  placeholder="your-workspace"
                  aria-describedby="ws-slug-suffix ws-slug-helper ws-slug-err" />
                <span id="ws-slug-suffix" className="inline-flex items-center rounded-r-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-400 whitespace-nowrap">
                  .deployiq.ng
                </span>
              </div>
              <p id="ws-slug-helper" className="text-xs text-slate-400">
                This will be your organisation's DeployIQ workspace address.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {slugIndicator}
                  {userEditedSlug && form.organisationName.trim() ? (
                    <button
                      type="button"
                      onClick={useSuggestedSlug}
                      className="text-xs text-orange-600 hover:text-orange-700 underline underline-offset-2"
                    >
                      Use suggested URL
                    </button>
                  ) : null}
                </div>
                <p className="text-xs text-slate-300 italic">
                  Not permanently reserved until workspace is created.
                </p>
              </div>
              {errors.workspaceSlug ? (
                <p id="ws-slug-err" className="text-xs text-rose-600" role="alert">{errors.workspaceSlug}</p>
              ) : null}
              {slugSuggestions.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs text-slate-500">Try one of these:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {slugSuggestions.map((s) => (
                      <button key={s} type="button" onClick={() => { setUserEditedSlug(true); patch("workspaceSlug", s); }}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-mono text-slate-600 hover:border-orange-300 hover:text-orange-700 transition-colors">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Country + Timezone */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="org-country" className="block text-sm font-medium text-slate-700">
                  Country <span className="text-rose-500" aria-hidden="true">*</span>
                </label>
                <input id="org-country" type="text" value={form.country}
                  onChange={(e) => patch("country", e.target.value)}
                  className={inputClass} placeholder="e.g. Nigeria" />
                {errors.country ? (
                  <p className="text-xs text-rose-600" role="alert">{errors.country}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="org-tz" className="block text-sm font-medium text-slate-700">
                  Time zone <span className="text-rose-500" aria-hidden="true">*</span>
                </label>
                <select id="org-tz" value={form.timezone}
                  onChange={(e) => patch("timezone", e.target.value)} className={inputClass}>
                  <option value="">Select time zone</option>
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
                {errors.timezone ? (
                  <p className="text-xs text-rose-600" role="alert">{errors.timezone}</p>
                ) : null}
              </div>
            </div>

            {/* Read-only context */}
            {recommendation ? (
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                  Selected configuration
                </p>
                <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                  <span className="text-slate-400">Product</span>
                  <span className="font-medium text-slate-700">{recommendation.productName}</span>
                  {quotation ? (
                    <>
                      <span className="text-slate-400">Deployment locations</span>
                      <span className="font-medium text-slate-700">{quotation.quantity.toLocaleString("en-US")}</span>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={onBack}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
            </button>
            <button type="submit" disabled={slugStatus === "checking" || slugStatus === "taken"}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors">
              {checking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Continue
            </button>
          </div>
        </div>

        {/* Live preview */}
        <div className="hidden lg:block">
          <WorkspacePreview
            organisationName={form.organisationName}
            workspaceName={form.workspaceName || form.organisationName}
            workspaceSlug={form.workspaceSlug}
            adminFirstName={adminPreview.firstName}
            adminLastName={adminPreview.lastName}
            adminEmail={adminPreview.email}
            recommendation={recommendation}
            quotation={quotation}
          />
        </div>
      </div>
    </form>
  );
}

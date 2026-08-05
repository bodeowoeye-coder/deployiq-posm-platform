"use client";

import { Building2, Globe, Package, Users, CheckCircle2, ArrowRight } from "lucide-react";
import type { RecommendationResult } from "@/lib/commercial/onboarding/recommendation";
import type { CustomerQuotation } from "@/lib/commercial/onboarding/quotation";
import { billingPeriodLabel, isRecurringModel, resolveCommercialModel } from "@/lib/commercial/pricing/commercialModel";
import type { IdentityOrgData } from "./IdentityOrganisationStep";
import type { IdentityAdminData } from "./IdentityAdminStep";

const WORKSPACE_DOMAIN = "deployiq.ng";

const JOURNEY_STEPS = [
  {
    title: "Configure your workspace",
    description: "Set up teams, user roles, and operational settings.",
  },
  {
    title: "Import your deployment locations",
    description: "Upload or connect your site and location data.",
  },
  {
    title: "Run your first deployment",
    description: "Assign work packages and start tracking activity.",
  },
];

type Props = {
  orgData: IdentityOrgData;
  adminData: IdentityAdminData;
  recommendation: RecommendationResult | null;
  quotation: CustomerQuotation | null;
  onContinue: () => void;
};

function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm font-medium text-slate-800 truncate">{value}</p>
      </div>
    </div>
  );
}

export function CheckoutBoundaryStep({ orgData, adminData, recommendation, quotation, onContinue }: Props) {
  const adminName = `${adminData.firstName} ${adminData.lastName}`.trim();
  const commercialModel = resolveCommercialModel(quotation?.commercialModel);
  const isRecurring = isRecurringModel(commercialModel);

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      {/* Header */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
          Workspace Setup — Step 4 of 4
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Your DeployIQ workspace is almost ready.
        </h1>
        <p className="text-base text-slate-500 leading-relaxed">
          Review your configuration before proceeding to payment.
        </p>
      </div>

      {/* Summary card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-3.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Configuration summary</p>
        </div>
        <div className="px-5">
          <SummaryRow
            icon={<Building2 className="h-4 w-4" aria-hidden="true" />}
            label="Organisation"
            value={orgData.organisationName}
          />
          <SummaryRow
            icon={<Globe className="h-4 w-4" aria-hidden="true" />}
            label="Workspace URL"
            value={`${orgData.workspaceSlug}.${WORKSPACE_DOMAIN}`}
          />
          {recommendation ? (
            <SummaryRow
              icon={<Package className="h-4 w-4" aria-hidden="true" />}
              label="Product"
              value={recommendation.productName}
            />
          ) : null}
          {quotation ? (
            <SummaryRow
              icon={<Users className="h-4 w-4" aria-hidden="true" />}
              label="Deployment locations"
              value={quotation.quantity.toLocaleString("en-US")}
            />
          ) : null}
          <SummaryRow
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />}
            label="Primary administrator"
            value={`${adminName} — ${adminData.email}`}
          />
        </div>
      </div>

      {/* Pricing summary */}
      {quotation && !quotation.requiresEnterpriseReview ? (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-orange-600 font-semibold uppercase tracking-wide">
              {isRecurring ? "Estimated cost" : "Programme fee"}
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: quotation.currency,
                maximumFractionDigits: 0,
              }).format(quotation.estimatedTotal)}
              <span className="ml-1.5 text-sm font-normal text-slate-400">
                {isRecurring ? billingPeriodLabel(commercialModel) : "One-time payment"}
              </span>
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-slate-500">Locations</p>
            <p className="text-lg font-semibold text-slate-700">{quotation.quantity.toLocaleString("en-US")}</p>
          </div>
        </div>
      ) : quotation?.requiresEnterpriseReview ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
          <p className="text-sm font-medium text-slate-700">Enterprise pricing — our team will finalise your proposal after setup.</p>
        </div>
      ) : null}

      {/* What happens next */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-slate-900">What happens after checkout</h2>
        <ol className="space-y-3">
          {JOURNEY_STEPS.map((step, i) => (
            <li key={i} className="flex items-start gap-3.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-600">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-slate-800">{step.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* CTA */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-8 py-3 text-sm font-semibold text-white hover:bg-orange-600 shadow-sm transition-colors"
        >
          Continue to payment <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

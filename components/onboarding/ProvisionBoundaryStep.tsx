"use client";

import { Rocket, ArrowRight, CheckCircle2, ArrowLeft, AlertCircle } from "lucide-react";
import type { RecommendationResult } from "@/lib/commercial/onboarding/recommendation";
import type { CustomerQuotation } from "@/lib/commercial/onboarding/quotation";
import type { BillingCycle } from "@/lib/commercial/checkout/types";
import { getChargeForCycle, calculateBillingQuote, formatMoney, getPeriodLabel } from "@/lib/commercial/checkout/billing";
import { billingPeriodLabel, isRecurringModel, resolveCommercialModel } from "@/lib/commercial/pricing/commercialModel";
import type { IdentityOrgData } from "./IdentityOrganisationStep";
import type { IdentityAdminData } from "./IdentityAdminStep";

const DOMAIN = "deployiq.ng";

type Props = {
  orgData: IdentityOrgData;
  adminData: IdentityAdminData;
  recommendation: RecommendationResult | null;
  quotation: CustomerQuotation | null;
  billingCycle: BillingCycle;
  paymentReference: string | null;
  /** Must be true before the workspace setup experience is shown. */
  readyForProvisioning: boolean;
  provisioningError?: {
    message: string;
    reference: string | null;
    failedStage: string | null;
    retryable: boolean;
  } | null;
  onContinue: () => void;
  onReturnToActivation: () => void;
};

const PROVISION_STEPS = [
  "Configure teams and user roles",
  "Import your deployment locations",
  "Set up your first project",
  "Invite your field team",
  "Run your first deployment",
];

export function ProvisionBoundaryStep({
  orgData, adminData, recommendation, quotation, billingCycle, paymentReference,
  readyForProvisioning, provisioningError, onContinue, onReturnToActivation,
}: Props) {
  const quote = quotation && recommendation ? calculateBillingQuote(quotation, recommendation.productName) : null;
  const commercialModel = resolveCommercialModel(quotation?.commercialModel);
  const isRecurring = isRecurringModel(commercialModel);
  const amountDue = quotation?.estimatedTotal ?? null;

  // Guard: only render the provisioning experience if eligibility is confirmed.
  if (!readyForProvisioning) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center space-y-6">
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
            <AlertCircle className="h-7 w-7 text-amber-500" aria-hidden="true" />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900">Workspace setup not yet available</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Your workspace is not yet eligible for setup. Your commercial plan may be awaiting payment verification or commercial approval.
          </p>
        </div>
        <button
          type="button"
          onClick={onReturnToActivation}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Return to activation summary
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-50">
            <Rocket className="h-8 w-8 text-orange-500" aria-hidden="true" />
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Your workspace is ready to set up.
        </h1>
        <p className="text-base text-slate-500 leading-relaxed">
          Your commercial plan is confirmed. The next step creates your live DeployIQ workspace.
        </p>
      </div>

      {/* Commercial plan card */}
      {provisioningError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-rose-800">{provisioningError.message}</p>
              <div className="mt-2 grid gap-1 text-xs text-rose-700 sm:grid-cols-2">
                {provisioningError.reference ? (
                  <>
                    <span>Provisioning reference</span>
                    <span className="font-mono font-semibold">{provisioningError.reference}</span>
                  </>
                ) : null}
                {provisioningError.failedStage ? (
                  <>
                    <span>Failed safe stage</span>
                    <span className="font-mono font-semibold">{provisioningError.failedStage}</span>
                  </>
                ) : null}
              </div>
              {provisioningError.retryable ? (
                <button
                  type="button"
                  onClick={onContinue}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                >
                  Retry workspace setup
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" aria-hidden="true" />
          <p className="text-sm font-semibold text-emerald-800">Commercial plan confirmed</p>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <span className="text-emerald-600">Product</span>
          <span className="font-semibold text-emerald-800">{recommendation?.productName ?? "DeployIQ"}</span>
          <span className="text-emerald-600">Workspace</span>
          <span className="font-mono font-semibold text-emerald-800">{orgData.workspaceSlug}.{DOMAIN}</span>
          {quote && !quotation?.requiresEnterpriseReview ? (
            <>
              <span className="text-emerald-600">{isRecurring ? "Subscription" : "Programme fee"}</span>
              <span className="font-semibold text-emerald-800">
                {isRecurring
                  ? `${formatMoney(getChargeForCycle(quote, billingCycle), quote.currency)} ${getPeriodLabel(billingCycle)}`
                  : `${formatMoney(amountDue ?? quote.annualTotal, quote.currency)} — ${billingPeriodLabel(commercialModel)}`}
              </span>
            </>
          ) : null}
          {paymentReference ? (
            <>
              <span className="text-emerald-600">Reference</span>
              <span className="font-mono font-semibold text-emerald-800 truncate">{paymentReference}</span>
            </>
          ) : null}
        </div>
      </div>

      {/* What happens next */}
      <div className="space-y-4">
        <p className="text-sm font-semibold text-slate-900">What you'll do next</p>
        <ol className="space-y-2.5">
          {PROVISION_STEPS.map((step, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-400" aria-hidden="true">
                {i + 1}
              </span>
              <span className="text-sm text-slate-700">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* CTA */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center gap-3 rounded-xl bg-orange-500 px-10 py-4 text-base font-semibold text-white hover:bg-orange-600 shadow-sm transition-colors"
          aria-label="Set up my DeployIQ workspace"
        >
          Set up my workspace
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <p className="text-center text-xs text-slate-400">
        Workspace setup is handled in the next step. Your configuration is saved.
      </p>
    </div>
  );
}

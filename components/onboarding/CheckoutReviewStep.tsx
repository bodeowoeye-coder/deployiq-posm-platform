"use client";

import { useState } from "react";
import { ArrowLeft, Loader2, CreditCard, Building2, Globe, ArrowRight } from "lucide-react";
import type { RecommendationResult } from "@/lib/commercial/onboarding/recommendation";
import type { CustomerQuotation } from "@/lib/commercial/onboarding/quotation";
import type { BillingCycle, PaymentMethod } from "@/lib/commercial/checkout/types";
import { formatMoney } from "@/lib/commercial/checkout/billing";
import { resolveCommercialModel, commercialModelLabel, billingPeriodLabel, isEnterpriseModel } from "@/lib/commercial/pricing/commercialModel";
import { OrderSummary } from "./checkout/OrderSummary";
import type { IdentityOrgData } from "./IdentityOrganisationStep";
import type { IdentityAdminData } from "./IdentityAdminStep";

type Props = {
  orgData: IdentityOrgData;
  adminData: IdentityAdminData;
  recommendation: RecommendationResult | null;
  quotation: CustomerQuotation | null;
  initialBillingCycle: BillingCycle;
  resumeToken: string | null;
  onProceed: (billingCycle: BillingCycle, method: PaymentMethod) => void;
  onBack: () => void;
  loading?: boolean;
};

const DOMAIN = "deployiq.ng";

export function CheckoutReviewStep({
  orgData,
  adminData,
  recommendation,
  quotation,
  initialBillingCycle,
  resumeToken,
  onProceed,
  onBack,
  loading = false,
}: Props) {
  const commercialModel = resolveCommercialModel(quotation?.commercialModel);
  const isOneTime = commercialModel === "one_time_programme";
  const isEnterprise =
    isEnterpriseModel(commercialModel) ||
    recommendation?.deploymentMode === "ENTERPRISE" ||
    quotation?.requiresEnterpriseReview;

  // Permitted payment methods come from the quotation (set by Pricing Studio).
  // Fall back to all self-service methods for legacy quotations.
  const allowedMethods: string[] = quotation?.allowedPaymentMethods?.length
    ? quotation.allowedPaymentMethods
    : isEnterprise
    ? ["enterprise_po"]
    : ["card", "bank_transfer"];

  // Default to first permitted method
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    (allowedMethods[0] as PaymentMethod) ?? "card"
  );

  const programmeAmount = quotation?.estimatedTotal ?? 0;
  const currency = quotation?.currency ?? "NGN";

  function handleProceed() {
    // For one-time programmes billingCycle is not meaningful — pass "annual" as sentinel
    onProceed(isOneTime ? "annual" : initialBillingCycle, paymentMethod);
  }

  return (
    <div className="space-y-0">
      {/* Page header */}
      <div className="mb-8 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
          Activate Workspace
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Activate your DeployIQ workspace
        </h1>
        <p className="text-base text-slate-500 leading-relaxed">
          Review your commercial plan and choose how you would like to activate your workspace.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* Left column */}
        <div className="space-y-7 min-w-0">

          {/* Configuration summary */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-label="Workspace configuration">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Your configuration</p>
            <div className="grid gap-y-2 text-sm">
              <ConfigRow icon={<Building2 className="h-3.5 w-3.5" />} label="Organisation" value={orgData.organisationName || "—"} />
              <ConfigRow icon={<Globe className="h-3.5 w-3.5" />} label="Workspace URL" value={`${orgData.workspaceSlug}.${DOMAIN}`} mono />
              {recommendation ? (
                <ConfigRow icon={null} label="Product" value={recommendation.productName} />
              ) : null}
              {quotation ? (
                <ConfigRow icon={null} label="Programme quantity" value={quotation.quantity.toLocaleString("en-US")} />
              ) : null}
            </div>
          </section>

          {/* Commercial plan — replaces hardcoded billing-period selector for one-time programmes */}
          {quotation && !isEnterprise ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-label="Commercial plan">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Commercial plan</p>
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <p className="text-base font-semibold text-slate-900">{commercialModelLabel(commercialModel)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{billingPeriodLabel(commercialModel)}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-900">{formatMoney(programmeAmount, currency)}</p>
                  {isOneTime ? (
                    <p className="text-xs text-slate-400">one-time payment</p>
                  ) : (
                    <p className="text-xs text-slate-400">per {quotation.billingBehaviour === "monthly" ? "month" : "year"}</p>
                  )}
                </div>
              </div>
              {quotation.discountAmount > 0 ? (
                <p className="mt-2 text-xs text-emerald-600 font-medium">
                  You save {formatMoney(quotation.discountAmount, currency)}
                  {quotation.discountLabel ? ` — ${quotation.discountLabel}` : ""}
                </p>
              ) : null}
            </section>
          ) : null}

          {/* Enterprise notice */}
          {isEnterprise ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-700">Enterprise commercial review</p>
              <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
                Your configuration qualifies for an enterprise commercial proposal. Our assisted sales team will prepare a tailored plan.
              </p>
            </div>
          ) : null}

          {/* Activation method */}
          <section aria-label="Activation method" role="radiogroup">
            <p className="text-sm font-semibold text-slate-900 mb-3">Activation method</p>
            <div className="space-y-3">
              {allowedMethods.includes("card") ? (
                <MethodCard
                  id="method-card"
                  selected={paymentMethod === "card"}
                  onClick={() => setPaymentMethod("card")}
                  title={isOneTime ? "Pay programme fee by card" : "Pay securely by card"}
                  description={isOneTime
                    ? "Complete your programme purchase immediately with a secure card payment."
                    : "Activate your subscription immediately using a secure card payment."}
                  icon={<CreditCard className="h-5 w-5" />}
                />
              ) : null}
              {allowedMethods.includes("bank_transfer") ? (
                <MethodCard
                  id="method-bank"
                  selected={paymentMethod === "bank_transfer"}
                  onClick={() => setPaymentMethod("bank_transfer")}
                  title="Pay by bank transfer"
                  description="Transfer the amount using your unique reference. Your workspace will be activated after payment verification."
                  icon={<span className="text-base font-bold text-slate-400">₦</span>}
                />
              ) : null}
              {allowedMethods.includes("enterprise_po") ? (
                <MethodCard
                  id="method-po"
                  selected={paymentMethod === "enterprise_po"}
                  onClick={() => setPaymentMethod("enterprise_po")}
                  title="Enterprise purchase order"
                  description="Submit your organisation's purchase order for commercial review and assisted activation."
                  icon={<Building2 className="h-5 w-5" />}
                />
              ) : null}
            </div>
          </section>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <button type="button" onClick={onBack}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
            </button>
            <button type="button" onClick={handleProceed} disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 shadow-sm transition-colors">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Continue to activation <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Right column — order summary */}
        <div className="hidden lg:block">
          <div className="sticky top-24">
            <OrderSummary
              quotation={quotation}
              organisationName={orgData.organisationName}
              workspaceSlug={orgData.workspaceSlug}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConfigRow({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-slate-50 last:border-0">
      <span className="flex items-center gap-1.5 text-slate-400 shrink-0">
        {icon}
        <span className="text-xs">{label}</span>
      </span>
      <span className={`text-xs font-medium text-slate-800 truncate ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function MethodCard({ id, selected, onClick, title, description, icon }: {
  id: string; selected: boolean; onClick: () => void;
  title: string; description: string; icon: React.ReactNode;
}) {
  return (
    <button id={id} type="button" role="radio" aria-checked={selected} onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-all focus:outline-none focus:ring-2 focus:ring-orange-300 ${
        selected ? "border-orange-400 bg-orange-50 ring-1 ring-orange-200" : "border-slate-200 bg-white hover:border-slate-300"
      }`}>
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
        selected ? "bg-orange-100 text-orange-600" : "bg-slate-100 text-slate-400"
      }`} aria-hidden="true">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${selected ? "text-orange-900" : "text-slate-800"}`}>{title}</p>
        <p className="mt-0.5 text-xs text-slate-500 leading-snug">{description}</p>
      </div>
      <span className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
        selected ? "border-orange-500 bg-orange-500" : "border-slate-300"
      }`} aria-hidden="true">
        {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
      </span>
    </button>
  );
}

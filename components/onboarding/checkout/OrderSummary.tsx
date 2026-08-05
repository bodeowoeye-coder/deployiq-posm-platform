"use client";

import { Building2, Globe, Package, Users, CreditCard, Calendar } from "lucide-react";
import type { CustomerQuotation } from "@/lib/commercial/onboarding/quotation";
import { resolveCommercialModel, billingPeriodLabel, isEnterpriseModel } from "@/lib/commercial/pricing/commercialModel";
import { formatMoney } from "@/lib/commercial/checkout/billing";

type Props = {
  quotation: CustomerQuotation | null;
  organisationName: string;
  workspaceSlug: string;
  compact?: boolean;
};

const DOMAIN = "deployiq.ng";

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-xs font-semibold truncate ${accent ? "text-emerald-700" : "text-slate-700"}`}>{value}</span>
    </div>
  );
}

export function OrderSummary({ quotation, organisationName, workspaceSlug, compact }: Props) {
  const commercialModel = resolveCommercialModel(quotation?.commercialModel);
  const isOneTime = commercialModel === "one_time_programme";
  const isEnterprise = isEnterpriseModel(commercialModel) || quotation?.requiresEnterpriseReview;
  const amount = quotation?.estimatedTotal ?? null;
  const currency = quotation?.currency ?? "NGN";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="h-1.5 w-full bg-gradient-to-r from-orange-400 via-orange-500 to-amber-400" />

      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {isOneTime ? "Commercial plan summary" : "Workspace activation summary"}
        </p>
      </div>

      <div className="px-5 py-3">
        {/* Organisation */}
        {organisationName ? (
          <div className="flex items-center gap-2.5 mb-3 pb-3 border-b border-slate-100">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-sm font-bold text-white">
              {organisationName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{organisationName}</p>
              <p className="text-xs font-mono text-slate-400 truncate">{workspaceSlug}.{DOMAIN}</p>
            </div>
          </div>
        ) : null}

        {/* Line items */}
        {quotation ? (
          <div>
            <Row label="Product" value={quotation.pricingTemplateName ?? quotation.productKey} />
            <Row label="Programme quantity" value={quotation.quantity.toLocaleString("en-US")} />
            {isOneTime ? (
              <Row label="Payment basis" value="One-time payment" />
            ) : (
              <Row label="Billing period" value={billingPeriodLabel(commercialModel)} />
            )}
            {quotation.discountAmount > 0 ? (
              <Row
                label="Programme saving"
                value={`You save ${formatMoney(quotation.discountAmount, currency)}`}
                accent
              />
            ) : null}
            <Row label="VAT / Tax" value="Calculated at checkout" />
          </div>
        ) : null}
      </div>

      {/* Total */}
      <div className="border-t border-slate-200 bg-slate-50 px-5 py-4">
        {isEnterprise ? (
          <div>
            <p className="text-xs text-slate-400 mb-1">Commercial plan</p>
            <p className="text-base font-semibold text-slate-700">Enterprise pricing</p>
            <p className="text-xs text-slate-400 mt-0.5">Our team will confirm your commercial proposal.</p>
          </div>
        ) : amount !== null && quotation ? (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs text-slate-400">{isOneTime ? "Amount due" : "Amount due today"}</p>
              <div className="text-right">
                <p className="text-xl font-bold text-slate-900">{formatMoney(amount, currency)}</p>
                {isOneTime ? (
                  <p className="text-xs text-slate-400">one-time</p>
                ) : (
                  <p className="text-xs text-slate-400">
                    {quotation.billingBehaviour === "monthly" ? "/ month" : "/ year"}
                  </p>
                )}
              </div>
            </div>
            {!isOneTime && !compact ? (
              <p className="mt-2 text-xs text-slate-400">
                {quotation.renewalRequired ? "Renews automatically." : "No automatic renewal."}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}



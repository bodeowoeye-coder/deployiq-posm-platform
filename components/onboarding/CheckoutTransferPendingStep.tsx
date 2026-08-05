"use client";

import { Clock, ArrowLeft, Copy, Check as CheckIcon } from "lucide-react";
import { useState } from "react";
import type { CustomerQuotation } from "@/lib/commercial/onboarding/quotation";
import type { BillingCycle } from "@/lib/commercial/checkout/types";
import { calculateBillingQuote, getChargeForCycle, formatMoney } from "@/lib/commercial/checkout/billing";

type Props = {
  paymentReference: string;
  quotation: CustomerQuotation | null;
  billingCycle: BillingCycle;
  productName: string;
  orgName: string;
  workspaceSlug: string;
  onBack: () => void;
};

const DOMAIN = "deployiq.ng";

export function CheckoutTransferPendingStep({
  paymentReference,
  quotation,
  billingCycle,
  productName,
  orgName,
  workspaceSlug,
  onBack,
}: Props) {
  const [copied, setCopied] = useState(false);
  const quote = quotation ? calculateBillingQuote(quotation, productName) : null;
  const amount = quote ? getChargeForCycle(quote, billingCycle) : null;

  async function copyRef() {
    try {
      await navigator.clipboard.writeText(paymentReference);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  }

  return (
    <div className="mx-auto max-w-lg py-8 space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
            <Clock className="h-8 w-8 text-amber-500" aria-hidden="true" />
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Payment verification in progress
        </h1>
        <p className="text-base text-slate-500 leading-relaxed">
          We'll notify you when your transfer has been verified and your workspace is eligible for activation.
        </p>
      </div>

      {/* Status card */}
      <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
        {/* Reference */}
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 mb-0.5">Transfer reference</p>
            <p className="font-mono text-sm font-semibold text-slate-800">{paymentReference}</p>
          </div>
          <button
            type="button"
            onClick={copyRef}
            aria-label="Copy transfer reference"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:border-orange-300 hover:text-orange-600 transition-colors"
          >
            {copied ? <CheckIcon className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        {/* Amount */}
        {amount !== null && quote ? (
          <div className="px-5 py-4">
            <p className="text-xs text-slate-400 mb-0.5">Amount submitted</p>
            <p className="text-sm font-semibold text-slate-800">
              {formatMoney(amount, quote.currency)}{" "}
              <span className="text-xs font-normal text-slate-400">
                ({billingCycle === "annual" ? "annual" : "monthly"})
              </span>
            </p>
          </div>
        ) : null}

        {/* Workspace */}
        <div className="px-5 py-4">
          <p className="text-xs text-slate-400 mb-0.5">Workspace</p>
          <p className="font-mono text-sm font-semibold text-slate-800 truncate">{workspaceSlug}.{DOMAIN}</p>
        </div>

        {/* Current status */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" aria-hidden="true" />
            <p className="text-xs font-semibold text-amber-700">Awaiting finance confirmation</p>
          </div>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
            Our finance team verifies bank transfers within 1–2 business days. A confirmation email will be sent to your registered address once verified.
          </p>
        </div>
      </div>

      {/* What happens next */}
      <div className="rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 space-y-2">
        <p className="text-xs font-semibold text-slate-600">What happens next</p>
        <ol className="space-y-1.5 text-xs text-slate-500">
          <li>1. Our finance team confirms receipt of your transfer.</li>
          <li>2. Your commercial plan is activated.</li>
          <li>3. You will be able to proceed to workspace setup.</li>
        </ol>
      </div>

      {/* CTA — stays in pending state, no forward navigation to provisioning */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          aria-label="Return to activation summary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Return to activation summary
        </button>
      </div>
    </div>
  );
}

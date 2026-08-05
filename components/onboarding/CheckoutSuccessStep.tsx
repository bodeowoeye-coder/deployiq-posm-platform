"use client";

import { CheckCircle2 } from "lucide-react";
import { ProvisioningAnticipation } from "./checkout/ProvisioningAnticipation";

type Props = {
  paymentReference: string;
  orgName: string;
  productName: string;
  /** Called only after the provisioning-anticipation animation completes. */
  onContinue: () => void;
};

// Items confirmed at card-payment success — nothing that hasn't genuinely happened.
const CONFIRMATION_ITEMS = [
  "Payment confirmed",
  "Commercial plan activated",
  "Organisation details secured",
  "Administrator identity verified",
];

export function CheckoutSuccessStep({ paymentReference, orgName, productName, onContinue }: Props) {
  return (
    <div className="mx-auto max-w-lg py-8 space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" aria-hidden="true" />
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Your subscription is active.
        </h1>
        <p className="text-base text-slate-500 leading-relaxed">
          Your DeployIQ workspace is ready for the next stage.
        </p>
      </div>

      {/* Confirmation checklist */}
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Confirmed</p>
        <ul className="space-y-2">
          {CONFIRMATION_ITEMS.map((item) => (
            <li key={item} className="flex items-center gap-2.5 text-sm text-slate-700">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <div className="border-t border-slate-100 pt-2.5">
          <p className="text-xs text-slate-400">
            Reference: <span className="font-mono font-semibold text-slate-700">{paymentReference}</span>
          </p>
        </div>
      </div>

      {/* Provisioning anticipation — CTA only appears once complete */}
      <div>
        <p className="text-sm font-semibold text-slate-900 mb-4">Preparing your workspace…</p>
        <ProvisioningAnticipation onComplete={onContinue} />
      </div>
    </div>
  );
}



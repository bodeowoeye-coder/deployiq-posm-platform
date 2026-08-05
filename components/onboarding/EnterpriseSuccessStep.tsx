"use client";

import { FileCheck, ArrowRight } from "lucide-react";

type Props = {
  orgName: string;
  poNumber: string;
  /** Routes back to checkout-review — NOT to provisioning. */
  onBack?: () => void;
};

// Internal commercial-status values are unchanged. Only customer-facing labels change.
const TIMELINE = [
  {
    label: "Purchase order submitted",
    description: "Your purchase order has been received by our assisted sales team.",
    done: true,
  },
  {
    label: "Commercial review",
    description: "Our team reviews your requirements and confirms commercial terms.",
    done: false,
  },
  {
    label: "Approval and activation",
    description: "Your subscription is activated following commercial approval.",
    done: false,
  },
  {
    label: "Workspace setup",
    description: "Your DeployIQ workspace is configured and ready for your team.",
    done: false,
  },
];

export function EnterpriseSuccessStep({ orgName, poNumber, onBack }: Props) {
  return (
    <div className="mx-auto max-w-lg py-8 text-center space-y-8">
      {/* Icon */}
      <div className="flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
          <FileCheck className="h-8 w-8 text-slate-600" aria-hidden="true" />
        </div>
      </div>

      {/* Heading */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Commercial review started
        </h1>
        <p className="text-base text-slate-500 leading-relaxed">
          Our assisted sales team will review your purchase order and commercial requirements. We will contact you to confirm terms and provisioning timelines.
        </p>
      </div>

      {/* Reference */}
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left">
        <p className="text-xs text-slate-400">Purchase order reference</p>
        <p className="font-mono text-sm font-semibold text-slate-800">{poNumber}</p>
      </div>

      {/* Timeline */}
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 text-left space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">What happens next</p>
        <ol className="space-y-4" aria-label="Commercial approval timeline">
          {TIMELINE.map((step, i) => (
            <li key={i} className="flex items-start gap-3.5">
              <div
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  step.done ? "bg-orange-500" : "border border-slate-200 bg-white"
                }`}
                aria-hidden="true"
              >
                {step.done ? (
                  <FileCheck className="h-3.5 w-3.5 text-white" />
                ) : (
                  <span className="text-xs font-semibold text-slate-400">{i + 1}</span>
                )}
              </div>
              <div>
                <p className={`text-sm font-semibold ${step.done ? "text-slate-900" : "text-slate-400"}`}>
                  {step.label}
                </p>
                <p className={`text-xs mt-0.5 ${step.done ? "text-slate-500" : "text-slate-300"}`}>
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <p className="text-xs text-slate-400">
        A confirmation has been sent to your registered address. Our team will be in touch within 2 business days.
      </p>

      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <ArrowRight className="h-4 w-4" aria-hidden="true" /> Return to activation overview
        </button>
      ) : null}
    </div>
  );
}


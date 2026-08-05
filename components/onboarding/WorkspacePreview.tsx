"use client";

import { CheckCircle2 } from "lucide-react";
import type { RecommendationResult } from "@/lib/commercial/onboarding/recommendation";
import type { CustomerQuotation } from "@/lib/commercial/onboarding/quotation";

type Props = {
  organisationName: string;
  workspaceName: string;
  workspaceSlug: string;
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  recommendation: RecommendationResult | null;
  quotation: CustomerQuotation | null;
  emailVerified?: boolean;
};

const WORKSPACE_DOMAIN = "deployiq.ng";

export function WorkspacePreview({
  organisationName,
  workspaceName,
  workspaceSlug,
  adminFirstName,
  adminLastName,
  adminEmail,
  recommendation,
  quotation,
  emailVerified = false,
}: Props) {
  const displayOrg = organisationName || "Your organisation";
  const displayWorkspace = workspaceName || "Your workspace";
  const displaySlug = workspaceSlug || "your-workspace";
  const displayName =
    adminFirstName || adminLastName
      ? `${adminFirstName} ${adminLastName}`.trim()
      : "Administrator";
  const displayEmail = adminEmail || "admin@yourcompany.com";

  return (
    <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      {/* Header strip */}
      <div className="h-1.5 w-full bg-gradient-to-r from-orange-400 via-orange-500 to-amber-400" />

      {/* Browser chrome */}
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            {["bg-red-300", "bg-amber-300", "bg-emerald-300"].map((c, i) => (
              <span key={i} className={`h-2.5 w-2.5 rounded-full ${c}`} aria-hidden="true" />
            ))}
          </div>
          <div className="flex-1 rounded-md bg-white border border-slate-200 px-3 py-1 text-xs font-mono text-slate-400 truncate">
            {displaySlug}.{WORKSPACE_DOMAIN}
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Workspace identity */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-sm font-bold text-white">
            {displayOrg.slice(0, 1).toUpperCase() || "D"}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 truncate">{displayOrg}</p>
            <p className="text-xs text-slate-400 truncate">{displayWorkspace}</p>
          </div>
        </div>

        {/* Workspace URL */}
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5">
          <p className="text-xs text-slate-400 mb-0.5">Workspace URL</p>
          <p className="text-sm font-mono font-medium text-slate-800 truncate">
            {displaySlug}.{WORKSPACE_DOMAIN}
          </p>
        </div>

        {/* Product + plan */}
        {recommendation ? (
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400">Product</span>
              <span className="text-xs font-semibold text-slate-700">{recommendation.productName}</span>
            </div>
            {quotation && !quotation.requiresEnterpriseReview ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400">Estimated plan</span>
                <span className="text-xs font-semibold text-slate-700">
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: quotation.currency,
                    maximumFractionDigits: 0,
                  }).format(quotation.estimatedTotal)}
                </span>
              </div>
            ) : null}
            {quotation ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400">Deployment locations</span>
                <span className="text-xs font-semibold text-slate-700">
                  {quotation.quantity.toLocaleString("en-US")}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Administrator */}
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5">
          <p className="text-xs text-slate-400 mb-1">Primary Administrator</p>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-800 truncate">{displayName}</p>
              <p className="text-xs text-slate-400 truncate">{displayEmail}</p>
            </div>
            {emailVerified ? (
              <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-emerald-500" aria-label="Email verified" />
            ) : null}
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
          <span className="text-xs font-medium text-emerald-700">
            {emailVerified ? "Ready for checkout" : "Preparing your workspace…"}
          </span>
        </div>
      </div>
    </div>
  );
}

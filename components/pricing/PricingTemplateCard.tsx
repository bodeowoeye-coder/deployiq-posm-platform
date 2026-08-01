"use client";

import { useState } from "react";
import { Archive, ChevronDown, ChevronUp, Copy, Eye, Loader2, Pencil, Plus, Power, PowerOff } from "lucide-react";
import type { PricingTemplate } from "@/lib/commercial/pricing/types";
import { formatMoney, formatQuantity } from "@/lib/commercial/pricing/tierEditor";
import { getPricingModelLabel, resolveProductDisplayLabel } from "./wizardUtils";

const STATUS_CONFIG: Record<string, { label: string; dot: string; border: string }> = {
  draft:    { label: "Draft",    dot: "bg-slate-400",   border: "border-slate-200" },
  active:   { label: "Active",   dot: "bg-emerald-500", border: "border-emerald-200" },
  inactive: { label: "Inactive", dot: "bg-amber-400",   border: "border-amber-200" },
  archived: { label: "Archived", dot: "bg-slate-300",   border: "border-slate-100" },
};

const STATUS_BADGE: Record<string, string> = {
  draft:    "bg-slate-100 text-slate-600",
  active:   "bg-emerald-100 text-emerald-700",
  inactive: "bg-amber-100 text-amber-700",
  archived: "bg-rose-100 text-rose-500",
};

type Props = {
  template: PricingTemplate;
  actionLoading: string | null;
  onEdit: (template: PricingTemplate) => void;
  onLifecycle: (templateId: string, action: "activate" | "deactivate" | "archive" | "clone") => void;
};

/** One-line description of pricing logic for the library card. */
function buildCardSummary(template: PricingTemplate): string {
  const activeTiers = template.tiers.filter((t) => t.status !== "archived");
  if (activeTiers.length === 0) return "No pricing bands defined.";

  const sym =
    template.currency === "NGN" ? "₦" :
    template.currency === "USD" ? "$" :
    template.currency === "GBP" ? "£" :
    template.currency === "EUR" ? "€" :
    `${template.currency} `;

  const last = activeTiers[activeTiers.length - 1];
  const enterprise = last.enterprise_action === "request_quotation";

  // Build a price-range string like ₦500 → ₦450 → ₦400
  const autoPriceTiers = activeTiers.filter(
    (t) => t.enterprise_action !== "request_quotation"
  );

  if (autoPriceTiers.length === 0) {
    return "All quantities require a custom quotation.";
  }

  const priceSteps = autoPriceTiers
    .map((t) => `${sym}${t.unit_price.toLocaleString("en-US")}`)
    .join(" → ");

  if (enterprise) {
    const threshold = formatQuantity(last.minimum_quantity - 1);
    return `${priceSteps}; custom quotation above ${threshold} locations.`;
  }

  return `${priceSteps} per location.`;
}

export function PricingTemplateCard({ template, actionLoading, onEdit, onLifecycle }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const { status } = template;
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const isLoading = (a: string) => actionLoading === `${template.id}:${a}`;
  const anyLoading = !!actionLoading;
  const id = template.id ?? "";

  const btnBase =
    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50";

  function archiveButton() {
    return (
      <>
        <button
          type="button"
          disabled={anyLoading}
          onClick={() => setConfirmingArchive(true)}
          className={`${btnBase} border border-rose-200 text-rose-600 hover:bg-rose-50`}
        >
          {isLoading("archive") ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
          Archive
        </button>
        {confirmingArchive ? (
          <div className="mt-1 flex w-full flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <span className="flex-1">Archive this template? It will be removed from active use.</span>
            <button
              type="button"
              onClick={() => { setConfirmingArchive(false); onLifecycle(id, "archive"); }}
              className="rounded px-2 py-1 font-semibold text-rose-700 hover:bg-rose-100"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirmingArchive(false)}
              className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className={`overflow-hidden rounded-2xl border bg-white transition-shadow hover:shadow-md ${cfg.border}`}>
      {/* Header */}
      <div className="flex items-start gap-3 px-5 py-4">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${cfg.dot}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900 truncate">{template.name}</h3>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[status] ?? STATUS_BADGE.draft}`}>
              {cfg.label}
            </span>
            {template.is_default ? (
              <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700">Default</span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-slate-400">
            <span>{resolveProductDisplayLabel(template.product_key)}</span>
            <span aria-hidden="true">·</span>
            <span>{template.currency}</span>
            {template.country ? <><span aria-hidden="true">·</span><span>{template.country}</span></> : null}
            <span aria-hidden="true">·</span>
            <span>{template.tiers.length} tier{template.tiers.length !== 1 ? "s" : ""}</span>
            <span aria-hidden="true">·</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{getPricingModelLabel(template.pricing_method)}</span>
            {template.updated_at ? (
              <><span aria-hidden="true">·</span><span>Updated {new Date(template.updated_at).toLocaleDateString()}</span></>
            ) : null}
          </div>
          {/* One-line pricing summary */}
          {template.tiers.length > 0 ? (
            <p className="mt-1.5 text-xs text-slate-500 leading-snug">
              {buildCardSummary(template)}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Hide tier details" : "View tier details"}
          className="ml-1 shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-slate-50 hover:text-slate-500 transition-colors"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Tier expansion */}
      {expanded ? (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 pb-3.5 pt-3">
          {template.tiers.length > 0 ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="pb-2 font-semibold">Tier</th>
                  <th className="pb-2 font-semibold">From</th>
                  <th className="pb-2 font-semibold">To</th>
                  <th className="pb-2 text-right font-semibold">Unit price</th>
                  <th className="pb-2 text-right font-semibold">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {template.tiers.map((tier) => (
                  <tr key={tier.id ?? tier.sequence} className="text-slate-700">
                    <td className="py-1.5">{tier.sequence}</td>
                    <td className="py-1.5 font-mono">{formatQuantity(tier.minimum_quantity)}</td>
                    <td className="py-1.5 font-mono">{tier.maximum_quantity ? formatQuantity(tier.maximum_quantity) : "No limit"}</td>
                    <td className="py-1.5 text-right font-mono">
                      {tier.enterprise_action === "request_quotation" ? "—" : formatMoney(tier.unit_price, template.currency)}
                    </td>
                    <td className="py-1.5 text-right">
                      {tier.enterprise_action === "request_quotation"
                        ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">Quotation</span>
                        : <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">Automatic</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-slate-400">No tiers defined.</p>
          )}
        </div>
      ) : null}

      {/* Actions */}
      {id ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-4 py-2.5">
          {status === "draft" ? (
            <>
              <button type="button" onClick={() => onEdit(template)}
                className={`${btnBase} bg-slate-900 text-white hover:bg-slate-700`}>
                <Pencil className="h-3 w-3" /> Continue editing
              </button>
              <button type="button" disabled={anyLoading} onClick={() => onLifecycle(id, "clone")}
                className={`${btnBase} border border-slate-200 text-slate-600 hover:bg-slate-50`}>
                {isLoading("clone") ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
                Clone
              </button>
              {archiveButton()}
            </>
          ) : null}

          {status === "active" ? (
            <>
              <button type="button" onClick={() => onEdit(template)}
                className={`${btnBase} border border-slate-200 text-slate-600 hover:bg-slate-50`}>
                <Eye className="h-3 w-3" /> View
              </button>
              <button type="button" disabled={anyLoading} onClick={() => onLifecycle(id, "clone")}
                className={`${btnBase} border border-slate-200 text-slate-600 hover:bg-slate-50`}>
                {isLoading("clone") ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
                Clone
              </button>
              <button type="button" disabled={anyLoading} onClick={() => onLifecycle(id, "deactivate")}
                className={`${btnBase} border border-amber-200 text-amber-700 hover:bg-amber-50`}>
                {isLoading("deactivate") ? <Loader2 className="h-3 w-3 animate-spin" /> : <PowerOff className="h-3 w-3" />}
                Deactivate
              </button>
            </>
          ) : null}

          {status === "inactive" ? (
            <>
              <button type="button" onClick={() => onEdit(template)}
                className={`${btnBase} border border-slate-200 text-slate-600 hover:bg-slate-50`}>
                <Pencil className="h-3 w-3" /> Edit
              </button>
              <button type="button" disabled={anyLoading} onClick={() => onLifecycle(id, "activate")}
                className={`${btnBase} bg-emerald-600 text-white hover:bg-emerald-700`}>
                {isLoading("activate") ? <Loader2 className="h-3 w-3 animate-spin" /> : <Power className="h-3 w-3" />}
                Activate
              </button>
              <button type="button" disabled={anyLoading} onClick={() => onLifecycle(id, "clone")}
                className={`${btnBase} border border-slate-200 text-slate-600 hover:bg-slate-50`}>
                {isLoading("clone") ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
                Clone
              </button>
              {archiveButton()}
            </>
          ) : null}

          {status === "archived" ? (
            <button type="button" onClick={() => onEdit(template)}
              className={`${btnBase} border border-slate-200 text-slate-400 hover:bg-slate-50`}>
              <Eye className="h-3 w-3" /> View only
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

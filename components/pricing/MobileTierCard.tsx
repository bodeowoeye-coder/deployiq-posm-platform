"use client";

import { useState } from "react";
import { AlertCircle, Trash2 } from "lucide-react";
import {
  currencySymbol,
  formatQuantity,
  type TierFormItem,
  type TierFieldErrors,
} from "@/lib/commercial/pricing/tierEditor";

type Props = {
  tier: TierFormItem;
  index: number;
  isLast: boolean;
  canRemove: boolean;
  currency: string;
  pricingMethod?: string;
  errors: TierFieldErrors;
  showAdvancedCharges: boolean;
  onChange: (patch: Partial<TierFormItem>) => void;
  onRemove: () => void;
};

const inp =
  "block w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-orange-400";

export function MobileTierCard({
  tier, index, isLast, canRemove, currency, pricingMethod = "progressive_tiered", errors, showAdvancedCharges, onChange, onRemove,
}: Props) {
  const sym = currencySymbol(currency);
  const hasError = Object.keys(errors).length > 0;

  return (
    <div
      className={`rounded-xl border p-4 space-y-3 ${
        hasError ? "border-rose-200 bg-rose-50/40" : "border-slate-200 bg-white"
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">
          Tier {tier.sequence}
          {tier.isEnterpriseTier ? (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
              Quotation
            </span>
          ) : null}
        </span>
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove tier ${tier.sequence}`}
            className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* Quantity range — hidden for flat_rate (single-rate, no range concept) */}
      {pricingMethod !== "flat_rate" ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-xs text-slate-400">From (locations)</p>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono text-slate-500">
              {formatQuantity(tier.minimumQuantity)}
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor={`m-to-${index}`} className="block text-xs text-slate-400">
              To (locations)
            </label>
            {tier.isEnterpriseTier ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                No limit
              </div>
            ) : (
              <div className="space-y-0.5">
                <input
                  id={`m-to-${index}`}
                  type="number"
                  min={tier.minimumQuantity + 1}
                  value={tier.maximumQuantity ?? ""}
                  placeholder={isLast ? "Open" : "Required"}
                  onChange={(e) =>
                    onChange({ maximumQuantity: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  className={`${inp} ${errors.maximumQuantity ? "border-rose-300 bg-rose-50" : "border-slate-200"}`}
                />
                {errors.maximumQuantity ? (
                  <p className="flex items-center gap-1 text-xs text-rose-600" role="alert">
                    <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {errors.maximumQuantity}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Price per location */}
      {!tier.isEnterpriseTier ? (
        <div className="space-y-1">
          <label htmlFor={`m-price-${index}`} className="block text-xs text-slate-400">
            Price per location ({currency})
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-slate-400">
              {sym}
            </span>
            <input
              id={`m-price-${index}`}
              type="number"
              min="0"
              step="1"
              value={tier.unitPrice}
              onChange={(e) => onChange({ unitPrice: Number(e.target.value) })}
              className={`${inp} pl-6 ${errors.unitPrice ? "border-rose-300 bg-rose-50" : "border-slate-200"}`}
            />
          </div>
          {errors.unitPrice ? (
            <p className="flex items-center gap-1 text-xs text-rose-600" role="alert">
              <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
              {errors.unitPrice}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Advanced: fixed charge */}
      {showAdvancedCharges && !tier.isEnterpriseTier ? (
        <div className="space-y-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
          <label htmlFor={`m-fixed-${index}`} className="block text-xs text-slate-500">
            Fixed charge per tier activation ({currency})
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-slate-400">
              {sym}
            </span>
            <input
              id={`m-fixed-${index}`}
              type="number"
              min="0"
              step="1"
              value={tier.fixedCharge}
              onChange={(e) => onChange({ fixedCharge: Number(e.target.value) })}
              className={`${inp} border-slate-200 pl-6`}
            />
          </div>
        </div>
      ) : null}

      {/* Outcome */}
      {isLast ? (
        <div className="space-y-1">
          <label htmlFor={`m-outcome-${index}`} className="block text-xs text-slate-500">
            What happens above this quantity?
          </label>
          <select
            id={`m-outcome-${index}`}
            value={tier.isEnterpriseTier ? "quotation" : "automatic"}
            onChange={(e) => onChange({ isEnterpriseTier: e.target.value === "quotation" })}
            className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
          >
            <option value="automatic">
              {pricingMethod === "volume_tiered"
                ? "Full rollout uses this band's rate"
                : "Continue automatic pricing"}
            </option>
            <option value="quotation">Request a custom quotation</option>
          </select>
        </div>
      ) : (
        <div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {pricingMethod === "volume_tiered"
              ? "Full rollout uses this band's rate"
              : "Automatic pricing"}
          </span>
        </div>
      )}
    </div>
  );
}

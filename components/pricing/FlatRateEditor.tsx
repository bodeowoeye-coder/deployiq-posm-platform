"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { currencySymbol, type TierFormItem } from "@/lib/commercial/pricing/tierEditor";

type Props = {
  tiers: TierFormItem[];
  currency: string;
  onChange: (tiers: TierFormItem[]) => void;
};

const inp =
  "block w-full rounded-xl border border-slate-200 py-2.5 pl-8 pr-3.5 text-sm font-mono focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400";

export function FlatRateEditor({ tiers, currency, onChange }: Props) {
  const sym = currencySymbol(currency);
  const [showAdvanced, setShowAdvanced] = useState(() => tiers.some((t) => t.fixedCharge > 0));

  // Primary automatic tier (always sequence 1)
  const autoTier: TierFormItem = tiers.find((t) => !t.isEnterpriseTier) ?? {
    sequence: 1,
    minimumQuantity: 1,
    maximumQuantity: null,
    unitPrice: 0,
    fixedCharge: 0,
    enterpriseAction: null,
    isEnterpriseTier: false,
  };

  const enterpriseTier: TierFormItem | undefined = tiers.find((t) => t.isEnterpriseTier);
  const hasThreshold = enterpriseTier !== undefined;

  function updateAutoTier(patch: Partial<TierFormItem>) {
    const updated = { ...autoTier, ...patch };
    const newTiers: TierFormItem[] = [updated];
    // Keep enterprise tier in sync if threshold is active
    if (enterpriseTier && updated.maximumQuantity !== null) {
      newTiers.push({ ...enterpriseTier, sequence: 2, minimumQuantity: updated.maximumQuantity + 1 });
    }
    onChange(newTiers);
  }

  function toggleThreshold(enable: boolean) {
    if (enable) {
      const autoMax = autoTier.maximumQuantity ?? 50000;
      onChange([
        { ...autoTier, maximumQuantity: autoMax },
        {
          sequence: 2,
          minimumQuantity: autoMax + 1,
          maximumQuantity: null,
          unitPrice: 0,
          fixedCharge: 0,
          enterpriseAction: "request_quotation",
          isEnterpriseTier: true,
        },
      ]);
    } else {
      onChange([{ ...autoTier, maximumQuantity: null }]);
    }
  }

  return (
    <div className="space-y-5">
      {/* Description */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
        <p className="text-sm font-semibold text-slate-800">Flat-rate pricing</p>
        <p className="mt-1 text-sm text-slate-500 leading-relaxed">
          All deployment locations use the same rate, regardless of rollout size.
        </p>
      </div>

      {/* Unit price */}
      <div className="space-y-1.5">
        <label htmlFor="fr-price" className="block text-sm font-medium text-slate-700">
          Price per deployment location <span className="text-rose-500">*</span>
        </label>
        <div className="relative max-w-xs">
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-slate-400">
            {sym}
          </span>
          <input
            id="fr-price"
            type="number"
            min="0"
            step="1"
            value={autoTier.unitPrice}
            onChange={(e) => updateAutoTier({ unitPrice: Number(e.target.value) })}
            className={inp}
            placeholder="0"
            aria-describedby="fr-price-hint"
          />
        </div>
        <p id="fr-price-hint" className="text-xs text-slate-400">
          Applied to every deployment location in the rollout.
        </p>
      </div>

      {/* Advanced charges */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
        >
          <Settings2 className="h-3.5 w-3.5" />
          {showAdvanced ? "Hide fixed charges" : "Advanced charges"}
        </button>

        {showAdvanced ? (
          <div className="mt-3 space-y-1.5">
            <label htmlFor="fr-fixed" className="block text-sm font-medium text-slate-700">
              Fixed charge per quotation
            </label>
            <div className="relative max-w-xs">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-slate-400">
                {sym}
              </span>
              <input
                id="fr-fixed"
                type="number"
                min="0"
                step="1"
                value={autoTier.fixedCharge}
                onChange={(e) => updateAutoTier({ fixedCharge: Number(e.target.value) })}
                className={inp}
                placeholder="0"
                aria-describedby="fr-fixed-hint"
              />
            </div>
            <p id="fr-fixed-hint" className="text-xs text-slate-400">
              Added once to the total, in addition to the per-location rate.
            </p>
          </div>
        ) : null}
      </div>

      {/* Quotation threshold toggle */}
      <div className="space-y-2.5">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
          <input
            type="checkbox"
            checked={hasThreshold}
            onChange={(e) => toggleThreshold(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-orange-500"
            aria-describedby="fr-threshold-desc"
          />
          <div>
            <span className="block text-sm font-medium text-slate-700">
              Add a quotation threshold
            </span>
            <span id="fr-threshold-desc" className="block text-xs text-slate-400">
              Rollouts above a certain size will require a custom quotation.
            </span>
          </div>
        </label>

        {hasThreshold ? (
          <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <label htmlFor="fr-threshold" className="block text-xs font-medium text-amber-800">
              Automatic pricing applies up to (deployment locations)
            </label>
            <input
              id="fr-threshold"
              type="number"
              min="1"
              step="1"
              value={autoTier.maximumQuantity ?? ""}
              onChange={(e) =>
                updateAutoTier({ maximumQuantity: e.target.value === "" ? null : Number(e.target.value) })
              }
              className="block w-full max-w-xs rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-orange-400"
              placeholder="e.g. 50,000"
              aria-describedby="fr-threshold-qty-hint"
            />
            <p id="fr-threshold-qty-hint" className="text-xs text-amber-700">
              Rollouts above this quantity will require a custom quotation.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

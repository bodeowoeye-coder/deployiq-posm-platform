"use client";

import { useState } from "react";
import { AlertCircle, Plus, Settings2, Trash2 } from "lucide-react";
import {
  addTierAfterLast,
  currencySymbol,
  formatQuantity,
  hasValidationErrors,
  removeTierAt,
  updateTierAndPropagate,
  validateFormTiers,
  type TierFormItem,
} from "@/lib/commercial/pricing/tierEditor";
import { hasTierFixedCharges } from "./wizardUtils";
import { MobileTierCard } from "./MobileTierCard";
import { PricingMethodExplanation } from "./PricingMethodExplanation";
import { PricingRuleExplanation } from "./PricingRuleExplanation";

type Props = {
  tiers: TierFormItem[];
  currency: string;
  pricingMethod?: string;
  onChange: (tiers: TierFormItem[]) => void;
};

export function PricingTierTable({ tiers, currency, pricingMethod = "progressive_tiered", onChange }: Props) {
  const [showAdvancedCharges, setShowAdvancedCharges] = useState(
    hasTierFixedCharges(tiers)
  );

  const allErrors = validateFormTiers(tiers, pricingMethod);
  const hasErrors = hasValidationErrors(allErrors);
  const sym = currencySymbol(currency);

  function handleChange(index: number, patch: Partial<TierFormItem>) {
    let finalPatch = patch;
    if ("isEnterpriseTier" in patch) {
      const enterprise = Boolean(patch.isEnterpriseTier);
      finalPatch = {
        ...patch,
        enterpriseAction: enterprise ? "request_quotation" : null,
        ...(enterprise ? { maximumQuantity: null } : {}),
      };
    }
    onChange(updateTierAndPropagate(tiers, index, finalPatch));
  }

  return (
    <div className="space-y-5">
      {/* Progressive pricing explanation */}
      <PricingMethodExplanation pricingMethod={pricingMethod} />

      {/* Volume: concise reminder */}
      {pricingMethod === "volume_tiered" ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800" role="note">
          <span className="mt-0.5 shrink-0 text-sky-500" aria-hidden="true">ℹ</span>
          The full rollout is priced using the single quantity band it qualifies for. Earlier bands are not charged.
        </div>
      ) : null}

      {/* ── Mobile layout: stacked cards ── */}
      <div className="sm:hidden space-y-3">
        {tiers.map((tier, index) => (
          <MobileTierCard
            key={index}
            tier={tier}
            index={index}
            isLast={index === tiers.length - 1}
            canRemove={tiers.length > 1}
            currency={currency}
            pricingMethod={pricingMethod}
            errors={allErrors[index] ?? {}}
            showAdvancedCharges={showAdvancedCharges}
            onChange={(patch) => handleChange(index, patch)}
            onRemove={() => onChange(removeTierAt(tiers, index))}
          />
        ))}
      </div>

      {/* ── Desktop layout: table ── */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Tier
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                From
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                To
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Price / location
              </th>
              {showAdvancedCharges ? (
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Fixed charge
                </th>
              ) : null}
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Outcome
              </th>
              <th className="w-10 px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tiers.map((tier, index) => {
              const isLast = index === tiers.length - 1;
              const errors = allErrors[index] ?? {};
              const rowHasError = Object.keys(errors).length > 0;

              return (
                <tr key={index} className={
                  tier.isEnterpriseTier
                    ? "bg-amber-50/60"
                    : rowHasError ? "bg-rose-50/60" : "bg-white"
                }>
                  {/* Tier number */}
                  <td className="px-4 py-3 font-semibold text-slate-500">{tier.sequence}</td>

                  {/* From — always read-only */}
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm text-slate-500">
                      {formatQuantity(tier.minimumQuantity)}
                    </span>
                  </td>

                  {/* To */}
                  <td className="px-4 py-3">
                    {tier.isEnterpriseTier ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                        No limit
                      </span>
                    ) : (
                      <div className="space-y-0.5">
                        <input
                          type="number"
                          min={tier.minimumQuantity + 1}
                          step="1"
                          value={tier.maximumQuantity ?? ""}
                          placeholder={isLast ? "Open" : "Required"}
                          aria-label={`Tier ${tier.sequence} upper limit`}
                          onChange={(e) =>
                            handleChange(index, {
                              maximumQuantity: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          className={`w-28 rounded-lg border px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-orange-400 ${
                            errors.maximumQuantity
                              ? "border-rose-300 bg-rose-50"
                              : "border-slate-200"
                          }`}
                        />
                        {errors.maximumQuantity ? (
                          <p className="flex items-center gap-1 text-xs text-rose-600" role="alert">
                            <AlertCircle className="h-3 w-3 shrink-0" />
                            {errors.maximumQuantity}
                          </p>
                        ) : null}
                      </div>
                    )}
                  </td>

                  {/* Price per location */}
                  <td className="px-4 py-3">
                    {tier.isEnterpriseTier ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      <div className="space-y-0.5">
                        <div className="relative">
                          <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs text-slate-400">
                            {sym}
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={tier.unitPrice}
                            aria-label={`Tier ${tier.sequence} unit price`}
                            onChange={(e) =>
                              handleChange(index, { unitPrice: Number(e.target.value) })
                            }
                            className={`w-28 rounded-lg border py-1.5 pl-7 pr-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-orange-400 ${
                              errors.unitPrice
                                ? "border-rose-300 bg-rose-50"
                                : "border-slate-200"
                            }`}
                          />
                        </div>
                        {errors.unitPrice ? (
                          <p className="flex items-center gap-1 text-xs text-rose-600" role="alert">
                            <AlertCircle className="h-3 w-3 shrink-0" />
                            {errors.unitPrice}
                          </p>
                        ) : null}
                      </div>
                    )}
                  </td>

                  {/* Fixed charge — only when advanced charges shown */}
                  {showAdvancedCharges ? (
                    <td className="px-4 py-3">
                      {tier.isEnterpriseTier ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <div className="relative">
                          <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs text-slate-400">
                            {sym}
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={tier.fixedCharge}
                            aria-label={`Tier ${tier.sequence} fixed charge`}
                            onChange={(e) =>
                              handleChange(index, { fixedCharge: Number(e.target.value) })
                            }
                            className="w-28 rounded-lg border border-slate-200 py-1.5 pl-7 pr-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-orange-400"
                          />
                        </div>
                      )}
                    </td>
                  ) : null}

                  {/* Outcome */}
                  <td className="px-4 py-3">
                    {isLast ? (
                      <div className="space-y-0.5">
                        <p className="text-xs text-slate-400">What happens above?</p>
                        <select
                          value={tier.isEnterpriseTier ? "quotation" : "automatic"}
                          aria-label="Outcome for final tier"
                          onChange={(e) =>
                            handleChange(index, {
                              isEnterpriseTier: e.target.value === "quotation",
                            })
                          }
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                        >
                          <option value="automatic">
                            {pricingMethod === "volume_tiered"
                              ? "Full rollout uses this band's rate"
                              : "Automatic pricing"}
                          </option>
                          <option value="quotation">Custom quotation</option>
                        </select>
                      </div>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {pricingMethod === "volume_tiered"
                          ? "Full rollout uses this band's rate"
                          : "Automatic"}
                      </span>
                    )}
                  </td>

                  {/* Remove */}
                  <td className="px-2 py-3 text-center">
                    {tiers.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => onChange(removeTierAt(tiers, index))}
                        aria-label={`Remove tier ${tier.sequence}`}
                        className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Controls: Add tier + Advanced charges ── */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(addTierAfterLast(tiers))}
          className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:border-slate-400 hover:bg-slate-50 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add pricing tier
        </button>

        <button
          type="button"
          onClick={() => setShowAdvancedCharges((v) => !v)}
          aria-expanded={showAdvancedCharges}
          aria-controls="advanced-charges-hint"
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
        >
          <Settings2 className="h-3.5 w-3.5" />
          {showAdvancedCharges ? "Hide fixed charges" : "Advanced charges"}
        </button>
      </div>

      {showAdvancedCharges ? (
        <p id="advanced-charges-hint" className="text-xs text-slate-400">
          Fixed charges are applied once per tier, in addition to the per-location price.
          Use these for setup costs or minimum fees.
        </p>
      ) : null}

      {/* Error summary */}
      {hasErrors ? (
        <div
          className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Fix the highlighted errors before continuing.
        </div>
      ) : null}

      {/* ── Plain-language explanation ── */}
      <PricingRuleExplanation tiers={tiers} currency={currency} pricingMethod={pricingMethod} />
    </div>
  );
}

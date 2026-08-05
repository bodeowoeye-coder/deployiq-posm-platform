/**
 * Billing cycle calculations for CO-1C.
 * Pure functions — no React, no DB, testable with node --test.
 */
import type { CustomerQuotation } from "@/lib/commercial/onboarding/quotation";
import type { BillingCycle, BillingQuote } from "./types";

/**
 * Monthly billing carries a 15% premium over the annual equivalent.
 * i.e. paying monthly for 12 months costs 15% more than paying annually up-front.
 */
export const MONTHLY_BILLING_PREMIUM = 0.15;

/**
 * Build a complete BillingQuote from a CustomerQuotation.
 * The quotation's estimatedTotal is treated as the annual base price.
 */
export function calculateBillingQuote(
  quotation: CustomerQuotation,
  productName: string
): BillingQuote {
  const annualTotal = quotation.estimatedTotal;
  const monthlyEquivalent = annualTotal / 12;
  const monthlyBilledMonthly = Math.ceil(monthlyEquivalent * (1 + MONTHLY_BILLING_PREMIUM));
  const annualIfBilledMonthly = monthlyBilledMonthly * 12;
  const annualSavings = annualIfBilledMonthly - annualTotal;
  const annualSavingsPercent = Math.round((annualSavings / annualIfBilledMonthly) * 100);

  return {
    currency: quotation.currency,
    quantity: quotation.quantity,
    productName,
    pricingMethodLabel: quotation.pricingMethodLabel,
    annualTotal,
    monthlyEquivalent,
    monthlyBilledMonthly,
    annualSavings,
    annualSavingsPercent,
  };
}

/** Return the charge for the chosen billing cycle. */
export function getChargeForCycle(quote: BillingQuote, cycle: BillingCycle): number {
  return cycle === "annual" ? quote.annualTotal : quote.monthlyBilledMonthly;
}

/** Human-readable period suffix. */
export function getPeriodLabel(cycle: BillingCycle): string {
  return cycle === "annual" ? "/ year" : "/ month";
}

/** Renewal description shown in checkout summary. */
export function getRenewalDescription(cycle: BillingCycle): string {
  return cycle === "annual"
    ? "Renews automatically in 12 months."
    : "Renews automatically every month.";
}

/** Format a monetary amount using Intl. */
export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

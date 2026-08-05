"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft, ArrowRight, Loader2, RefreshCw, Check, AlertCircle,
} from "lucide-react";
import { WORKSPACE_CAPABILITIES, legacyCapabilityFlags } from "@/lib/commercial/onboarding/capabilities";
import type { RecommendationResult } from "@/lib/commercial/onboarding/recommendation";
import type { CustomerQuotation } from "@/lib/commercial/onboarding/quotation";
import { currencyForCountry } from "@/lib/commercial/onboarding/quotation";
import type { BillingCycle } from "@/lib/commercial/checkout/types";
import {
  calculateBillingQuote,
  formatMoney,
} from "@/lib/commercial/checkout/billing";
import { isRecurringModel, resolveCommercialModel } from "@/lib/commercial/pricing/commercialModel";
import { OrderSummary } from "./checkout/OrderSummary";
import type { DiscoveryData } from "./GuidedDiscoveryStep";

// --------------------------------------------------------------------------
// Public result type
// --------------------------------------------------------------------------

export type CommercialPlanResult = {
  quotation: CustomerQuotation;
  recommendation: RecommendationResult;
  billingCycle: BillingCycle;
  quantity: number;
  capabilities: string[];
};

// --------------------------------------------------------------------------
// Props
// --------------------------------------------------------------------------

type Props = {
  initialRecommendation: RecommendationResult;
  initialQuotation: CustomerQuotation | null;
  discovery: DiscoveryData;
  objectiveId: string;
  resumeToken: string | null;
  orgName: string;
  workspaceSlug: string;
  onConfirm: (result: CommercialPlanResult) => void;
  onBack: () => void;
};

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

export function CommercialPlanStep({
  initialRecommendation,
  initialQuotation,
  discovery,
  objectiveId,
  resumeToken,
  orgName,
  workspaceSlug,
  onConfirm,
  onBack,
}: Props) {
  // ---- UI state (entirely local — never pushed back to parent during preview) ----
  const [quantityInput, setQuantityInput] = useState(String(discovery.rolloutQuantity || ""));
  const [capabilities, setCapabilities] = useState<string[]>(discovery.capabilities ?? []);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("annual");
  const [liveRecommendation, setLiveRecommendation] = useState<RecommendationResult>(initialRecommendation);
  const [liveQuotation, setLiveQuotation] = useState<CustomerQuotation | null>(initialQuotation);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [lastCalculated, setLastCalculated] = useState<Date | null>(initialQuotation ? new Date() : null);

  // ---- Mutable-value refs (updated before effects run, always current) ----
  const quantityInputRef  = useRef(quantityInput);
  const capabilitiesRef   = useRef(capabilities);
  const recommendationRef = useRef(liveRecommendation);
  const discoveryRef      = useRef(discovery);
  const objectiveIdRef    = useRef(objectiveId);
  const resumeTokenRef    = useRef(resumeToken);

  quantityInputRef.current  = quantityInput;
  capabilitiesRef.current   = capabilities;
  recommendationRef.current = liveRecommendation;
  discoveryRef.current      = discovery;
  objectiveIdRef.current    = objectiveId;
  resumeTokenRef.current    = resumeToken;

  // ---- Request coordinator refs ----
  /**
   * Guards the initial-load so it runs exactly ONCE regardless of
   * StrictMode double-invoke or parent re-renders.
   */
  const hasInitialisedRef = useRef(false);

  /**
   * Fingerprint of the last request that was INITIATED.
   * Format: "type:productKeyOrCaps:qty:country"
   * Any new recalculate call that produces the same fingerprint is dropped.
   * Cleared on abort/error so retries are possible.
   */
  const lastFingerprintRef = useRef<string | null>(null);

  /** AbortController for the currently active request pair. */
  const activeControllerRef = useRef<AbortController | null>(null);

  /** Skip the quantity effect on the very first render. */
  const isFirstQuantityRenderRef = useRef(true);

  // ---- Fingerprint builder ----
  function buildFP(typeKey: string, qty: number, country: string): string {
    return `${typeKey}:${qty}:${country}`;
  }

  // ---- Core recalculate implementation (fresh on every render via ref) ----
  type RecalcOpts = { forQuantity?: number; forCapabilities?: string[] };

  async function recalculateImpl(opts: RecalcOpts = {}) {
    const qty  = opts.forQuantity   ?? parseInt(quantityInputRef.current, 10);
    const caps = opts.forCapabilities ?? capabilitiesRef.current;
    const disc = discoveryRef.current;

    if (!qty || qty <= 0) return;
    if (!recommendationRef.current.pricingReady) return;

    // Build a fingerprint for this request.
    // Capability changes use sorted caps as the key so order doesn't matter.
    const typeKey = opts.forCapabilities !== undefined
      ? `caps:${[...caps].sort().join(",")}`
      : `qty:${recommendationRef.current.productKey}`;
    const fp = buildFP(typeKey, qty, disc.country);

    // Deduplicate: skip if this exact request is already in-flight or was last completed.
    if (fp === lastFingerprintRef.current) return;
    lastFingerprintRef.current = fp;

    // Cancel any previous in-flight request before starting the new one.
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeControllerRef.current = controller;
    const { signal } = controller;

    setCalculating(true);
    setCalcError(null);

    try {
      // ── Step 1: Re-run recommendation when capabilities explicitly changed ──
      let nextRecommendation = recommendationRef.current;

      if (opts.forCapabilities !== undefined) {
        const legacyFlags = legacyCapabilityFlags(caps);
        const recRes = await fetch("/api/onboarding/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            resumeToken: resumeTokenRef.current,
            objectiveId: objectiveIdRef.current,
            country:     disc.country,
            industry:    disc.industry,
            quantity:    qty,
            adminCount:  parseInt(disc.adminCount, 10) || 1,
            capabilities: caps,
            ...legacyFlags,
          }),
        });

        if (recRes.ok) {
          const recPayload = await recRes.json();
          // Only update state when the product genuinely changes — prevents spurious re-renders.
          if (
            recPayload.recommendation &&
            recPayload.recommendation.productKey !== recommendationRef.current.productKey
          ) {
            nextRecommendation = recPayload.recommendation;
            setLiveRecommendation(nextRecommendation);
            recommendationRef.current = nextRecommendation;
          }
        }
        // Soft failure: proceed with existing recommendation
      }

      // ── Step 2: Fetch quotation with resolved product + quantity ──
      const quotRes = await fetch("/api/onboarding/quotation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          resumeToken: resumeTokenRef.current,
          productKey:  nextRecommendation.productKey,
          quantity:    qty,
          country:     disc.country,
          currency:    currencyForCountry(disc.country),
        }),
      });

      if (!quotRes.ok) {
        const p = await quotRes.json().catch(() => ({}));
        lastFingerprintRef.current = null; // allow retry
        setCalcError((p as { error?: string }).error ?? "Unable to calculate pricing.");
        return;
      }

      const quotPayload = await quotRes.json();
      if (quotPayload.quotation) {
        setLiveQuotation(quotPayload.quotation);
        setLastCalculated(new Date());
        setCalcError(null);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        // This request was superseded by a newer one.
        // Clear the fingerprint only if it still matches this request,
        // so the superseding request is not blocked.
        if (lastFingerprintRef.current === fp) {
          lastFingerprintRef.current = null;
        }
        return;
      }
      lastFingerprintRef.current = null; // allow retry
      setCalcError("Unable to update pricing. Check your connection.");
    } finally {
      // Only clear the loading indicator for the request that is still active.
      if (activeControllerRef.current === controller) {
        setCalculating(false);
      }
    }
  }

  /**
   * Stable ref to recalculateImpl — always holds the latest version.
   * Effects call through this ref so they never need recalculate in their dep array.
   */
  const recalculateRef = useRef(recalculateImpl);
  recalculateRef.current = recalculateImpl;

  // ---- Stable wrapper for event handlers ----
  const recalculate = useCallback((opts?: RecalcOpts) => {
    void recalculateRef.current(opts);
  }, []); // stable: never recreated

  // -------------------------------------------------------------------------
  // Initial load — fires exactly once per component instance.
  // hasInitialisedRef guards against StrictMode's double-invoke of effects.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (hasInitialisedRef.current) return;
    hasInitialisedRef.current = true;

    if (!initialQuotation) {
      // No quotation yet — fetch one.
      recalculate({ forCapabilities: capabilitiesRef.current });
    } else {
      // We already have a quotation.
      // Pre-populate the fingerprint so the quantity effect's first timer
      // (fired by StrictMode's second mount) is deduplicated.
      const disc = discoveryRef.current;
      const fp = buildFP(
        `qty:${recommendationRef.current.productKey}`,
        parseInt(quantityInputRef.current, 10) || 0,
        disc.country
      );
      lastFingerprintRef.current = fp;
    }

    return () => {
      if (activeControllerRef.current) activeControllerRef.current.abort();
    };
  }, []); // EMPTY — runs once; hasInitialisedRef handles StrictMode

  // -------------------------------------------------------------------------
  // Quantity change — debounced, skips the initial render.
  // recalculate is NOT in deps (called through stable recalculateRef).
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isFirstQuantityRenderRef.current) {
      isFirstQuantityRenderRef.current = false;
      return;
    }

    const qty = parseInt(quantityInput, 10);
    if (!qty || qty <= 0) return;

    const timer = setTimeout(() => {
      recalculate({ forQuantity: qty });
    }, 600);

    return () => clearTimeout(timer);
  }, [quantityInput]); // recalculate excluded — called through stable ref

  // -------------------------------------------------------------------------
  // Capability toggle — immediate, calls through the stable wrapper
  // -------------------------------------------------------------------------
  function handleToggleCapability(id: string) {
    const next = capabilities.includes(id)
      ? capabilities.filter((c) => c !== id)
      : [...capabilities, id];
    setCapabilities(next);
    recalculate({ forCapabilities: next });
  }

  // -------------------------------------------------------------------------
  // Confirm — updates shell state once, then navigates
  // -------------------------------------------------------------------------
  function handleConfirm() {
    if (!liveQuotation) return;
    if (!liveRecommendation.pricingReady) return;
    const qty = parseInt(quantityInput, 10) || parseInt(discovery.rolloutQuantity, 10);
    onConfirm({
      quotation: liveQuotation,
      recommendation: liveRecommendation,
      billingCycle,
      quantity: qty,
      capabilities,
    });
  }

  const isEnterprise =
    liveRecommendation.deploymentMode === "ENTERPRISE" ||
    liveQuotation?.requiresEnterpriseReview;
  const commercialModel = resolveCommercialModel(liveQuotation?.commercialModel);
  const isRecurring = isRecurringModel(commercialModel);

  const billingQuote =
    liveQuotation && !isEnterprise
      ? calculateBillingQuote(liveQuotation, liveRecommendation.productName)
      : null;

  const quantityNum = parseInt(quantityInput, 10);
  const canConfirm = !!liveQuotation && !calculating && !!quantityNum && quantityNum > 0;

  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-0">
      <div className="mb-8 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
          Activate Workspace
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Your commercial plan
        </h1>
        <p className="text-base text-slate-500 leading-relaxed">
          Review and finalise your configuration. Adjust quantity or capabilities — your commercial plan updates in real time.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* ------------------------------------------------------------------ */}
        {/* Left: configurator                                                  */}
        {/* ------------------------------------------------------------------ */}
        <div className="space-y-7 min-w-0">

          {/* Product */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
              DeployIQ product
            </p>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-sm font-bold text-white">
                {liveRecommendation.productName.slice(0, 1)}
              </div>
              <div>
                <p className="text-base font-semibold text-slate-900">{liveRecommendation.productName}</p>
                <p className="text-xs text-slate-400">
                  {liveRecommendation.deploymentMode === "ENTERPRISE"
                    ? "Enterprise assisted setup"
                    : "Self-service activation"}
                </p>
              </div>
              {calculating ? (
                <Loader2 className="ml-auto h-4 w-4 animate-spin text-slate-300" aria-label="Recalculating" />
              ) : lastCalculated ? (
                <span className="ml-auto flex items-center gap-1 text-xs text-emerald-600">
                  <Check className="h-3 w-3" aria-hidden="true" /> Pricing current
                </span>
              ) : null}
            </div>
            {calcError ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-rose-600" role="alert">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {calcError}
              </p>
            ) : null}
          </section>

          {/* Deployment quantity */}
          <section>
            <label
              htmlFor="cp-quantity"
              className="mb-2 block text-sm font-semibold text-slate-900"
            >
              Deployment locations
            </label>
            <div className="flex items-center gap-3">
              <div className="flex flex-1 items-center gap-0">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => {
                    const v = Math.max(1, (parseInt(quantityInput, 10) || 0) - 100);
                    setQuantityInput(String(v));
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-l-xl border border-r-0 border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors text-lg font-semibold"
                >
                  −
                </button>
                <input
                  id="cp-quantity"
                  type="number"
                  min="1"
                  step="1"
                  value={quantityInput}
                  onChange={(e) => setQuantityInput(e.target.value)}
                  className="flex-1 rounded-none border border-slate-200 px-3.5 py-2.5 text-center text-sm font-semibold placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                  aria-label="Number of deployment locations"
                />
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => {
                    const v = (parseInt(quantityInput, 10) || 0) + 100;
                    setQuantityInput(String(v));
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-r-xl border border-l-0 border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors text-lg font-semibold"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={() => void recalculate({ forQuantity: parseInt(quantityInput, 10) })}
                disabled={calculating || !parseInt(quantityInput, 10)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                aria-label="Recalculate pricing"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${calculating ? "animate-spin" : ""}`} aria-hidden="true" />
                Recalculate
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              Each outlet, site, vehicle, or asset counts as one deployment location. Pricing updates as you change this value.
            </p>
          </section>

          {/* Capabilities */}
          <section>
            <p className="mb-3 text-sm font-semibold text-slate-900">
              Included capabilities
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {WORKSPACE_CAPABILITIES.map((cap) => {
                const selected = capabilities.includes(cap.id);
                return (
                  <button
                    key={cap.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => handleToggleCapability(cap.id)}
                    className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-orange-300 ${
                      selected
                        ? "border-orange-400 bg-orange-50 ring-1 ring-orange-200"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        selected ? "border-orange-500 bg-orange-500" : "border-slate-300 bg-white"
                      }`}
                      aria-hidden="true"
                    >
                      {selected ? (
                        <Check className="h-3 w-3 text-white" />
                      ) : null}
                    </span>
                    <div className="min-w-0">
                      <span className={`block text-xs font-medium ${selected ? "text-orange-900" : "text-slate-700"}`}>
                        {cap.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-slate-400">
                        {cap.description}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Capability changes may adjust your recommended product and commercial plan.
            </p>
          </section>

          {/* Billing period — only for recurring self-service models */}
          {!isEnterprise && isRecurring && billingQuote ? (
            <section>
              <p className="mb-3 text-sm font-semibold text-slate-900">Billing period</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <BillingOption
                  selected={billingCycle === "annual"}
                  recommended
                  onClick={() => setBillingCycle("annual")}
                  title="Annual"
                  price={formatMoney(billingQuote.annualTotal, billingQuote.currency)}
                  period="/ year"
                  badge={billingQuote.annualSavingsPercent > 0 ? `Save ${billingQuote.annualSavingsPercent}%` : undefined}
                  sub={`${formatMoney(billingQuote.monthlyEquivalent, billingQuote.currency)} / month equivalent`}
                />
                <BillingOption
                  selected={billingCycle === "monthly"}
                  onClick={() => setBillingCycle("monthly")}
                  title="Monthly"
                  price={formatMoney(billingQuote.monthlyBilledMonthly, billingQuote.currency)}
                  period="/ month"
                  sub="Billed monthly. Cancel anytime."
                />
              </div>
            </section>
          ) : null}

          {/* Enterprise notice */}
          {isEnterprise ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-700">Enterprise pricing</p>
              <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
                Your configuration qualifies for an enterprise commercial proposal. After confirming, our assisted sales team will prepare a tailored plan.
              </p>
            </div>
          ) : null}

          {/* Navigation */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 shadow-sm transition-colors"
              aria-label={isEnterprise ? "Confirm and proceed to purchase order" : "Confirm commercial plan"}
            >
              {calculating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {isEnterprise ? "Confirm for review" : "Confirm commercial plan"}
              {!calculating ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Right: live order summary                                           */}
        {/* ------------------------------------------------------------------ */}
        <div className="hidden lg:block">
          <div className="sticky top-24">
            {calculating ? (
              <div className="relative">
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/80 backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Updating commercial plan…
                  </div>
                </div>
                <OrderSummary
                  quotation={liveQuotation}
                  organisationName={orgName}
                  workspaceSlug={workspaceSlug}
                />
              </div>
            ) : (
              <OrderSummary
                quotation={liveQuotation}
                organisationName={orgName}
                workspaceSlug={workspaceSlug}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Billing option card (copied from CheckoutReviewStep to avoid coupling)
// --------------------------------------------------------------------------

function BillingOption({
  selected, recommended, onClick, title, price, period, badge, sub,
}: {
  selected: boolean;
  recommended?: boolean;
  onClick: () => void;
  title: string;
  price: string;
  period: string;
  badge?: string;
  sub?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`relative flex flex-col items-start gap-1 rounded-xl border px-4 py-4 text-left transition-all focus:outline-none focus:ring-2 focus:ring-orange-300 w-full ${
        selected
          ? "border-orange-400 bg-orange-50 ring-1 ring-orange-200"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      {recommended ? (
        <span className="absolute -top-2 right-3 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">
          Recommended
        </span>
      ) : null}
      <div className="flex items-center gap-2 w-full">
        <span
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
            selected ? "border-orange-500 bg-orange-500" : "border-slate-300"
          }`}
          aria-hidden="true"
        >
          {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
        </span>
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        {badge ? (
          <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="ml-6">
        <span className="text-xl font-bold text-slate-900">{price}</span>
        <span className="ml-1 text-xs text-slate-400">{period}</span>
      </div>
      {sub ? <p className="ml-6 text-xs text-slate-400">{sub}</p> : null}
    </button>
  );
}

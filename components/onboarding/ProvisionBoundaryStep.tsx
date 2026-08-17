"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, CheckCircle2, Loader2, RefreshCw, Rocket, ShieldCheck, AlertCircle } from "lucide-react";
import type { RecommendationResult } from "@/lib/commercial/onboarding/recommendation";
import type { CustomerQuotation } from "@/lib/commercial/onboarding/quotation";
import type { BillingCycle } from "@/lib/commercial/checkout/types";
import { getChargeForCycle, calculateBillingQuote, formatMoney, getPeriodLabel } from "@/lib/commercial/checkout/billing";
import { billingPeriodLabel, isRecurringModel, resolveCommercialModel } from "@/lib/commercial/pricing/commercialModel";
import type { IdentityOrgData } from "./IdentityOrganisationStep";
import type { IdentityAdminData } from "./IdentityAdminStep";

const DOMAIN = "deployiq.ng";

type Props = {
  orgData: IdentityOrgData;
  adminData: IdentityAdminData;
  recommendation: RecommendationResult | null;
  quotation: CustomerQuotation | null;
  billingCycle: BillingCycle;
  paymentReference: string | null;
  resumeToken: string | null;
  /** Must be true before the workspace setup experience is shown. */
  readyForProvisioning: boolean;
  saveRecoveryLabel?: string | null;
  provisioningError?: {
    message: string;
    reference: string | null;
    failedStage: string | null;
    retryable: boolean;
  } | null;
  activationStarted?: boolean;
  shadowPlanning?: {
    status: string;
    provider?: string;
    model?: string;
    fallbackUsed?: boolean;
    validation?: { status?: string };
    proposedPlan?: {
      customer?: { organisation?: string; country?: string; deploymentScale?: number };
      commercial?: { productKey?: string; approvedCapabilities?: string[] };
      configuration?: { modules?: string[] };
      administration?: { verifiedAdministratorEmail?: string };
      interpretation?: { summary?: string; rationale?: string[]; humanReviewRecommended?: boolean };
    } | null;
  } | null;
  provisioningJob?: { status?: string; current_stage?: string; progress_percent?: number } | null;
  workspaceLaunchUrl?: string | null;
  browserAuthenticated: boolean;
  onLaunchWorkspace?: () => void;
  onContinue: () => Promise<void> | void;
};

const PROVISION_STEPS = [
  "Creating organisation",
  "Configuring administrator account",
  "Preparing workspace URL",
  "Applying subscription",
  "Finalising workspace",
];

const WORKSPACE_NEXT_STEPS = [
  "Invite team members",
  "Configure user roles",
  "Import deployment locations",
  "Create first project",
  "Invite installers",
  "Launch first deployment",
];

const PROVISIONING_TIMEOUT_MS = 20000;
const PROVISIONING_POLL_MS = 15000;

export function ProvisionBoundaryStep({
  orgData, adminData, recommendation, quotation, billingCycle, paymentReference,
  resumeToken, readyForProvisioning, saveRecoveryLabel, provisioningError, activationStarted = false, shadowPlanning, onContinue,
  provisioningJob, workspaceLaunchUrl, browserAuthenticated, onLaunchWorkspace,
}: Props) {
  const [provisioningStarted, setProvisioningStarted] = useState(activationStarted);
  const [timedOut, setTimedOut] = useState(false);
  const [planAcknowledged, setPlanAcknowledged] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [notificationRequested, setNotificationRequested] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const autoRefreshInFlight = useRef(false);
  const notificationRequestInFlight = useRef(false);
  const restoredStatusCheckInFlight = useRef(false);
  const quote = quotation && recommendation ? calculateBillingQuote(quotation, recommendation.productName) : null;
  const commercialModel = resolveCommercialModel(quotation?.commercialModel);
  const isRecurring = isRecurringModel(commercialModel);
  const amountDue = quotation?.estimatedTotal ?? null;
  const hasCompletedBackendResult = provisioningJob?.status === "completed" && Boolean(shadowPlanning);
  const delayed = !hasCompletedBackendResult && (timedOut || (!readyForProvisioning && provisioningError && !provisioningError.retryable));
  const retryableFailure = provisioningError?.retryable === true;

  function ShadowPlanSummary() {
    const plan = shadowPlanning?.proposedPlan;
    if (!shadowPlanning || !plan) return null;
    return (
      <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-left" aria-label="DeployIQ AI provisioning plan">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">DeployIQ AI · Shadow Mode</p>
        <h3 className="mt-1 text-lg font-bold text-slate-950">Understanding your requirements</h3>
        <p className="mt-2 text-sm leading-6 text-slate-700">{plan.interpretation?.summary || "Your approved commercial and operational requirements have been translated into a constrained workspace proposal."}</p>
        {plan.interpretation?.rationale?.length ? (
          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Why this configuration</p>
            <ul className="mt-2 grid gap-2 text-sm text-slate-700">
              {plan.interpretation.rationale.map((reason) => <li key={reason} className="flex gap-2"><span className="text-indigo-500" aria-hidden="true">•</span>{reason}</li>)}
            </ul>
          </div>
        ) : null}
        <h4 className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">Proposed workspace</h4>
        <ol className="mt-4 grid gap-2 text-sm" aria-label="Completed DeployIQ AI planning stages">
          {["Understanding your requirements", "Reviewing your approved configuration", "Preparing workspace configuration", "Validating capabilities", "Provisioning plan ready"].map((stage) => (
            <li key={stage} className="flex items-center gap-2 text-slate-700"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />{stage}</li>
          ))}
        </ol>
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <span className="text-slate-500">Organisation</span><span className="font-semibold text-slate-900">{plan.customer?.organisation || "—"}</span>
          <span className="text-slate-500">Approved solution</span><span className="font-semibold text-slate-900">{plan.commercial?.productKey || "—"}</span>
          <span className="text-slate-500">Market</span><span className="font-semibold text-slate-900">{plan.customer?.country || "—"}</span>
          <span className="text-slate-500">Scale</span><span className="font-semibold text-slate-900">{plan.customer?.deploymentScale ?? "—"}</span>
          <span className="text-slate-500">Verified administrator</span><span className="font-semibold text-emerald-700">{plan.administration?.verifiedAdministratorEmail || "Verified"}</span>
        </div>
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Approved capabilities</p>
          <p className="mt-1 text-sm text-slate-700">{plan.commercial?.approvedCapabilities?.join(", ") || "Platform defaults"}</p>
        </div>
        <div className="mt-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Workspace modules</p>
          <p className="mt-1 text-sm text-slate-700">{plan.configuration?.modules?.join(", ") || "Manifest defaults"}</p>
        </div>
        <div className="mt-5 rounded-xl border border-emerald-200 bg-white/70 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">DeployIQ policy check</p>
          <ul className="mt-2 grid gap-1.5 text-sm text-slate-700">
            {["Product entitlement validated", "Commercial configuration validated", "Capabilities validated", "Workspace configuration allowed"].map((check) => <li key={check} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />{check}</li>)}
          </ul>
          <p className="mt-3 text-sm font-semibold text-emerald-700">Plan {shadowPlanning.validation?.status || "validated"} against DeployIQ business rules</p>
        </div>
        <p className="mt-4 text-xs text-slate-500">{shadowPlanning.fallbackUsed ? "A deterministic plan was used because the model provider was unavailable or outside policy. " : ""}DeployIQ’s deterministic provisioning engine remains authoritative.</p>
      </section>
    );
  }

  useEffect(() => {
    if (!resumeToken || !browserAuthenticated) return;
    fetch(`/api/acquisition/provision/notification?token=${encodeURIComponent(resumeToken)}`)
      .then((res) => res.ok ? res.json() : null)
      .then((payload) => {
        if (payload?.requested === true) setNotificationRequested(true);
      })
      .catch(() => {});
  }, [resumeToken, browserAuthenticated]);

  useEffect(() => {
    if (!browserAuthenticated || !timedOut || retryableFailure || notificationRequested || notificationRequestInFlight.current) return;
    void requestNotification();
  }, [browserAuthenticated, timedOut, retryableFailure, notificationRequested]);

  useEffect(() => {
    if (!browserAuthenticated || !provisioningStarted || retryableFailure) return;
    const timeoutTimer = window.setTimeout(() => {
      setTimedOut(true);
    }, PROVISIONING_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutTimer);
    };
  }, [browserAuthenticated, provisioningStarted, retryableFailure]);

  useEffect(() => {
    if (hasCompletedBackendResult) setTimedOut(false);
  }, [hasCompletedBackendResult]);

  useEffect(() => {
    if (!browserAuthenticated || !activationStarted || retryableFailure || restoredStatusCheckInFlight.current) return;
    restoredStatusCheckInFlight.current = true;
    setProvisioningStarted(true);
    setCheckingStatus(true);
    Promise.resolve(onContinue()).finally(() => {
      setCheckingStatus(false);
    });
  }, [activationStarted, browserAuthenticated, onContinue, retryableFailure]);

  useEffect(() => {
    if (!browserAuthenticated || !delayed || retryableFailure) return;

    const pollTimer = window.setInterval(() => {
      if (autoRefreshInFlight.current) return;
      autoRefreshInFlight.current = true;
      Promise.resolve(onContinue()).finally(() => {
        autoRefreshInFlight.current = false;
      });
    }, PROVISIONING_POLL_MS);

    return () => window.clearInterval(pollTimer);
  }, [browserAuthenticated, delayed, onContinue, retryableFailure]);

  async function startProvisioning() {
    setProvisioningStarted(true);
    setTimedOut(false);
    setCheckingStatus(true);
    try {
      await onContinue();
    } finally {
      setCheckingStatus(false);
    }
  }

  async function requestNotification() {
    if (!browserAuthenticated || !resumeToken || notificationRequested || notificationRequestInFlight.current) return;
    notificationRequestInFlight.current = true;
    setNotificationLoading(true);
    setNotificationError(null);
    try {
      const response = await fetch("/api/acquisition/provision/notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeToken }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setNotificationError(payload.error ?? "Could not request notification. Please try again.");
        return;
      }
      setNotificationRequested(true);
    } catch {
      setNotificationError("Could not request notification. Please try again.");
    } finally {
      notificationRequestInFlight.current = false;
      setNotificationLoading(false);
    }
  }

  function NotificationAction() {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={requestNotification}
          disabled={notificationLoading || notificationRequested}
          className={`inline-flex items-center justify-center gap-2 rounded-xl border px-6 py-3 text-sm font-semibold ${
            notificationRequested
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          } disabled:cursor-not-allowed disabled:opacity-80`}
        >
          {notificationLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Bell className="h-4 w-4" aria-hidden="true" />}
          {notificationRequested ? "Notification requested" : "Notify me when ready"}
        </button>
        {notificationRequested ? (
          <p className="text-xs font-semibold text-emerald-700">We’ll email you as soon as your DeployIQ workspace is ready.</p>
        ) : null}
        {notificationError ? (
          <p className="text-xs text-rose-600" role="alert">{notificationError}</p>
        ) : null}
      </div>
    );
  }

  if (!browserAuthenticated && readyForProvisioning) {
    return (
      <div className="mx-auto max-w-2xl space-y-7 py-12 text-center">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-50">
            <ShieldCheck className="h-8 w-8 text-orange-500" aria-hidden="true" />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-900">Sign in to continue your workspace setup</h2>
          <p className="text-sm leading-relaxed text-slate-500">
            Your account and workspace configuration are ready. Sign in on this device to continue with DeployIQ AI planning and workspace setup.
          </p>
        </div>
        <a
          href="/login?returnTo=%2Fonboarding"
          className="inline-flex items-center justify-center rounded-xl bg-orange-500 px-6 py-3 text-sm font-semibold text-white hover:bg-orange-600"
        >
          Sign in to continue
        </a>
      </div>
    );
  }

  // Guard: only render the provisioning experience if eligibility is confirmed.
  if (!readyForProvisioning || delayed) {
    const message = provisioningError?.message
      ?? "Your DeployIQ workspace is currently being prepared. This is taking a little longer than expected.";
    return (
      <div className="mx-auto max-w-2xl py-12 text-center space-y-7">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-50">
            {retryableFailure ? (
              <AlertCircle className="h-8 w-8 text-rose-500" aria-hidden="true" />
            ) : (
              <Loader2 className="h-8 w-8 animate-spin text-orange-500" aria-hidden="true" />
            )}
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-900">
            {retryableFailure ? "Workspace setup needs another try" : "Your DeployIQ workspace is almost ready."}
          </h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            {retryableFailure
              ? message
              : "We’re preparing your DeployIQ workspace in the background."}
          </p>
          {!retryableFailure ? (
            <div className="space-y-2 text-sm leading-relaxed text-slate-500">
              <p>If provisioning completes while this page remains open, we’ll automatically launch your workspace.</p>
              <p>If it takes a little longer than expected, you can safely close this page. We’ve sent a confirmation email containing a secure link that will take you directly into your DeployIQ workspace once provisioning is complete.</p>
            </div>
          ) : null}
          {provisioningError?.reference ? (
            <p className="text-xs text-slate-400">Reference: <span className="font-mono">{provisioningError.reference}</span></p>
          ) : null}
        </div>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={startProvisioning}
            disabled={checkingStatus}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {checkingStatus ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            {workspaceLaunchUrl ? "Continue to Admin Workspace" : "Check Workspace Status"}
          </button>
          <NotificationAction />
        </div>
        <ShadowPlanSummary />
        <p className="text-xs text-slate-400">Refresh automatically is active while this page remains open.</p>
      </div>
    );
  }

  if (provisioningStarted) {
    const planValidated = Boolean(shadowPlanning && shadowPlanning.validation?.status !== "rejected");
    const deterministicCompleted = provisioningJob?.status === "completed";
    if (planValidated && !planAcknowledged) {
      return (
        <div className="mx-auto max-w-2xl space-y-8 py-8">
          <div className="text-center space-y-3">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" aria-hidden="true" />
              </div>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">DeployIQ AI plan validated</h1>
            <p className="text-base leading-relaxed text-slate-500">
              Review the trusted configuration below before continuing to deterministic workspace setup.
            </p>
          </div>
          <ShadowPlanSummary />
          <div className="text-center">
            <button
              type="button"
              onClick={() => setPlanAcknowledged(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-8 py-4 text-base font-semibold text-white hover:bg-orange-600"
            >
              Continue with Workspace Setup
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-2xl space-y-8 py-8">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-50">
              <Loader2 className="h-8 w-8 animate-spin text-orange-500" aria-hidden="true" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {planValidated ? (deterministicCompleted ? "Your DeployIQ workspace is ready" : "Preparing your DeployIQ workspace") : "DeployIQ AI is preparing your workspace"}
          </h1>
          <p className="text-base text-slate-500 leading-relaxed">
            {planValidated
              ? "DeployIQ policy approved the proposed plan. Deterministic provisioning remains the only workspace writer."
              : "Your trusted commercial and identity context is being reviewed. No AI stage is marked complete until the backend returns its validated plan."}
          </p>
        </div>

        {shadowPlanning ? (
          <ol className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm" aria-label="Deterministic provisioning stages">
            {PROVISION_STEPS.map((step, index) => (
              <li key={step} className="flex items-center gap-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${deterministicCompleted ? "bg-emerald-500 text-white" : index === 0 ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-400"}`}>
                  {deterministicCompleted ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : index === 0 ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : index + 1}
                </span>
                <span className={`text-sm font-semibold ${deterministicCompleted || index === 0 ? "text-slate-900" : "text-slate-400"}`}>{step}</span>
              </li>
            ))}
          </ol>
        ) : null}

        {deterministicCompleted && workspaceLaunchUrl ? (
          <div className="text-center">
            <button type="button" onClick={onLaunchWorkspace} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-8 py-4 text-base font-semibold text-white hover:bg-orange-600">
              Continue to Admin Workspace
            </button>
          </div>
        ) : null}

        <p className="text-center text-xs text-slate-400">
          {saveRecoveryLabel ?? "Your secure activation state is saved while provisioning runs."}
        </p>
        <div className="text-center">
          <NotificationAction />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-50">
            <Rocket className="h-8 w-8 text-orange-500" aria-hidden="true" />
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Your workspace is ready to set up.
        </h1>
        <p className="text-base text-slate-500 leading-relaxed">
          Your commercial plan is confirmed. The next step creates your live DeployIQ workspace.
        </p>
      </div>

      {/* Commercial plan card */}
      {provisioningError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-rose-800">{provisioningError.message}</p>
              <div className="mt-2 grid gap-1 text-xs text-rose-700 sm:grid-cols-2">
                {provisioningError.reference ? (
                  <>
                    <span>Provisioning reference</span>
                    <span className="font-mono font-semibold">{provisioningError.reference}</span>
                  </>
                ) : null}
                {provisioningError.failedStage ? (
                  <>
                    <span>Failed safe stage</span>
                    <span className="font-mono font-semibold">{provisioningError.failedStage}</span>
                  </>
                ) : null}
              </div>
              {provisioningError.retryable ? (
                <button
                  type="button"
                  onClick={startProvisioning}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                >
                  Retry workspace setup
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" aria-hidden="true" />
          <p className="text-sm font-semibold text-emerald-800">Commercial plan confirmed</p>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <span className="text-emerald-600">Product</span>
          <span className="font-semibold text-emerald-800">{recommendation?.productName ?? "DeployIQ"}</span>
          <span className="text-emerald-600">Workspace</span>
          <span className="font-mono font-semibold text-emerald-800">{orgData.workspaceSlug}.{DOMAIN}</span>
          {quote && !quotation?.requiresEnterpriseReview ? (
            <>
              <span className="text-emerald-600">{isRecurring ? "Subscription" : "Programme fee"}</span>
              <span className="font-semibold text-emerald-800">
                {isRecurring
                  ? `${formatMoney(getChargeForCycle(quote, billingCycle), quote.currency)} ${getPeriodLabel(billingCycle)}`
                  : `${formatMoney(amountDue ?? quote.annualTotal, quote.currency)} — ${billingPeriodLabel(commercialModel)}`}
              </span>
            </>
          ) : null}
          {paymentReference ? (
            <>
              <span className="text-emerald-600">Reference</span>
              <span className="font-mono font-semibold text-emerald-800 truncate">{paymentReference}</span>
            </>
          ) : null}
        </div>
      </div>

      {/* What happens next */}
      <div className="space-y-4">
        <p className="text-sm font-semibold text-slate-900">What you'll do next in Admin Workspace</p>
        <ol className="space-y-2.5">
          {WORKSPACE_NEXT_STEPS.map((step, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-400" aria-hidden="true">
                {i + 1}
              </span>
              <span className="text-sm text-slate-700">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* CTA */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={startProvisioning}
          className="inline-flex items-center gap-3 rounded-xl bg-orange-500 px-10 py-4 text-base font-semibold text-white hover:bg-orange-600 shadow-sm transition-colors"
          aria-label="Set up my DeployIQ workspace"
        >
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          Set up my workspace
        </button>
      </div>

      {saveRecoveryLabel ? (
        <p className="text-center text-xs text-slate-400">
          {saveRecoveryLabel}
        </p>
      ) : null}
    </div>
  );
}

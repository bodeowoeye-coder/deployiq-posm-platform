"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OnboardingProgress } from "./OnboardingProgress";
import { BusinessObjectiveStep } from "./BusinessObjectiveStep";
import { GuidedDiscoveryStep, type DiscoveryData, legacyCapabilityFlags } from "./GuidedDiscoveryStep";
import { RecommendationStep } from "./RecommendationStep";
import { CommercialDecisionStep } from "./CommercialDecisionStep";
import { LiveQuotationStep } from "./LiveQuotationStep";
import { EnterpriseAssistanceStep } from "./EnterpriseAssistanceStep";
import { IdentityOrganisationStep, type IdentityOrgData } from "./IdentityOrganisationStep";
import { IdentityAdminStep, type IdentityAdminData } from "./IdentityAdminStep";
import { IdentityVerificationStep } from "./IdentityVerificationStep";
import { CheckoutBoundaryStep } from "./CheckoutBoundaryStep";
import { CommercialPlanStep } from "./CommercialPlanStep";
import type { CommercialPlanResult } from "./CommercialPlanStep";
import { CheckoutReviewStep } from "./CheckoutReviewStep";
import { CheckoutPaymentStep } from "./CheckoutPaymentStep";
import { CheckoutSuccessStep } from "./CheckoutSuccessStep";
import { EnterpriseSuccessStep } from "./EnterpriseSuccessStep";
import { ProvisionBoundaryStep } from "./ProvisionBoundaryStep";
import { CheckoutTransferPendingStep } from "./CheckoutTransferPendingStep";
import type { RecommendationResult } from "@/lib/commercial/onboarding/recommendation";
import { shouldRequestQuotation } from "@/lib/commercial/onboarding/flow";
import type { CustomerQuotation } from "@/lib/commercial/onboarding/quotation";
import { currencyForCountry } from "@/lib/commercial/onboarding/quotation";
import type { BillingCycle, PaymentMethod } from "@/lib/commercial/checkout/types";

type OnboardingStep =
  | "objective"
  | "discovery"
  | "recommendation"
  | "decision"
  | "quotation"
  | "enterprise"
  | "setup"
  | "next-steps"
  | "identity-organisation"
  | "identity-admin"
  | "identity-verification"
  | "checkout-boundary"
  | "commercial-plan"
  | "checkout-review"
  | "checkout-payment"
  | "checkout-success"
  | "checkout-enterprise"
  | "checkout-transfer-pending"
  | "provision-boundary";

const PROGRESS_STEPS = ["Your goal", "Requirements", "Recommendation", "Your path", "Your workspace", "Activate Workspace"];

const PROGRESS_INDEX: Partial<Record<OnboardingStep, number>> = {
  objective: 0,
  discovery: 1,
  recommendation: 2,
  decision: 3,
  quotation: 3,
  setup: 3,
  "next-steps": 3,
  "identity-organisation": 4,
  "identity-admin": 4,
  "identity-verification": 4,
  "checkout-boundary": 4,
  "commercial-plan": 5,
  "checkout-review": 5,
  "checkout-payment": 5,
  "checkout-success": 5,
  "checkout-enterprise": 5,
  "checkout-transfer-pending": 5,
  "provision-boundary": 5,
};

export function OnboardingShell() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [step, setStep] = useState<OnboardingStep>("objective");
  const [resumeToken, setResumeToken] = useState<string | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryData>({
    country: "",
    industry: "",
    rolloutQuantity: "",
    adminCount: "1",
    capabilities: [],
  });
  const [objectiveId, setObjectiveId] = useState<string>("");
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);
  const [quotation, setQuotation] = useState<CustomerQuotation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [identityOrg, setIdentityOrg] = useState<IdentityOrgData>({
    organisationName: "",
    workspaceName: "",
    workspaceSlug: "",
    country: "",
    timezone: "",
  });
  const [identityAdmin, setIdentityAdmin] = useState<IdentityAdminData>({
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    acceptedTerms: false,
    acceptedPrivacy: false,
  });
  const [identityVerified, setIdentityVerified] = useState(false);
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("annual");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [paymentReference, setPaymentReference] = useState<string | null>(null);
  const [enterprisePONumber, setEnterprisePONumber] = useState<string | null>(null);
  const [readyForProvisioning, setReadyForProvisioning] = useState(false);
  const [provisioningError, setProvisioningError] = useState<{
    message: string;
    reference: string | null;
    failedStage: string | null;
    retryable: boolean;
  } | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) return;
    setResumeToken(token);
    setResuming(true);
    fetch(`/api/onboarding/resume?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((payload) => {
        const draft = payload.draft;
        if (!draft) return;
        const data = draft.draft_data ?? {};
        if (data.country) setDiscovery((d) => ({ ...d, country: String(data.country ?? "") }));
        if (data.objectiveId) setObjectiveId(String(data.objectiveId ?? ""));
        if (data.quantity) setDiscovery((d) => ({ ...d, rolloutQuantity: String(data.quantity ?? "") }));
        if (data.objectiveId) setStep("discovery");
      })
      .catch(() => {})
      .finally(() => setResuming(false));
  }, [searchParams]);

  async function ensureDraft(): Promise<string> {
    if (resumeToken) return resumeToken;
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: "welcome", email: null }),
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? "Could not start session.");
    const token: string = payload.draft?.resume_token;
    if (token) setResumeToken(token);
    return token;
  }

  async function handleObjectiveSelect(id: string) {
    setObjectiveId(id);
    setError(null);
    setLoading(true);
    try {
      await ensureDraft();
      setStep("discovery");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start session.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDiscoverySubmit(data: DiscoveryData) {
    setDiscovery(data);
    setError(null);
    setLoading(true);
    try {
      const token = await ensureDraft();
      const legacyFlags = legacyCapabilityFlags(data.capabilities ?? []);
      const res = await fetch("/api/onboarding/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: token,
          objectiveId,
          country: data.country,
          industry: data.industry,
          quantity: parseInt(data.rolloutQuantity, 10),
          adminCount: parseInt(data.adminCount, 10),
          capabilities: data.capabilities,
          ...legacyFlags,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Could not process requirements.");
      setRecommendation(payload.recommendation);
      setStep("recommendation");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to process requirements.");
    } finally {
      setLoading(false);
    }
  }

  // Recommendation confirmed → go to Commercial Decision step
  function handleRecommendationConfirm() {
    setStep("decision");
  }

  // Commercial Decision: self-service path
  async function handleContinueSetup() {
    if (!recommendation) return;
    if (!shouldRequestQuotation(recommendation)) {
      setStep("enterprise");
      return;
    }
    setError(null);
    setProvisioningError(null);
    setLoading(true);
    try {
      const token = await ensureDraft();
      const res = await fetch("/api/onboarding/quotation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: token,
          productKey: recommendation.productKey,
          quantity: parseInt(discovery.rolloutQuantity, 10),
          country: discovery.country,
          currency: currencyForCountry(discovery.country),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Unable to calculate pricing.");

      if (payload.quotation) {
        setQuotation(payload.quotation);
      }
      // Proceed to CO-1B identity flow
      setStep("identity-organisation");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to continue.");
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    setError(null);
    if (step === "discovery") setStep("objective");
    else if (step === "recommendation") setStep("discovery");
    else if (step === "decision") setStep("recommendation");
    else if (step === "quotation") setStep("decision");
    else if (step === "setup") setStep("decision");
    else if (step === "enterprise") setStep("decision");
    else if (step === "next-steps") setStep("setup");
    else if (step === "identity-organisation") setStep("decision");
    else if (step === "identity-admin") setStep("identity-organisation");
    else if (step === "identity-verification") setStep("identity-admin");
    else if (step === "checkout-boundary") setStep("identity-verification");
    else if (step === "commercial-plan") setStep("checkout-boundary");
    else if (step === "checkout-review") setStep("commercial-plan");
    else if (step === "checkout-payment") setStep("checkout-review");
    else if (step === "checkout-transfer-pending") setStep("checkout-review");
  }

  /** Reset all state and start a completely fresh onboarding journey. */
  function startNewJourney() {
    setStep("objective");
    setObjectiveId("");
    setRecommendation(null);
    setQuotation(null);
    setDiscovery({
      country: "",
      industry: "",
      rolloutQuantity: "",
      adminCount: "1",
      capabilities: [],
    });
    setError(null);
    setResumeToken(null);
    setIdentityOrg({ organisationName: "", workspaceName: "", workspaceSlug: "", country: "", timezone: "" });
    setIdentityAdmin({ firstName: "", lastName: "", email: "", mobile: "", acceptedTerms: false, acceptedPrivacy: false });
    setIdentityVerified(false);
    setDebugOtp(null);
    setBillingCycle("annual");
    setPaymentMethod("card");
    setPaymentReference(null);
    setEnterprisePONumber(null);
    setReadyForProvisioning(false);
    router.replace("/onboarding");
  }

  async function handleIdentityOrgSubmit(data: IdentityOrgData) {
    setIdentityOrg(data);
    if (!resumeToken) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/acquisition/identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken,
          organisationName: data.organisationName,
          workspaceName: data.workspaceName,
          workspaceSlug: data.workspaceSlug,
          country: data.country,
          timezone: data.timezone,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Could not save organisation details.");
        return;
      }
      setStep("identity-admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to continue.");
    } finally {
      setLoading(false);
    }
  }

  async function handleIdentityAdminSubmit(data: IdentityAdminData) {
    setIdentityAdmin(data);
    if (!resumeToken) return;
    setError(null);
    setLoading(true);
    try {
      // Send combined org + admin payload matching the route's expected shape.
      // Org fields go at root; admin fields go under adminData.
      const identityRes = await fetch("/api/acquisition/identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken,
          // Re-include org fields so the route can validate and persist the full record.
          organisationName: identityOrg.organisationName,
          workspaceName: identityOrg.workspaceName,
          workspaceSlug: identityOrg.workspaceSlug,
          country: identityOrg.country,
          timezone: identityOrg.timezone,
          adminData: {
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            mobile: data.mobile,
            acceptedTerms: data.acceptedTerms,
            acceptedPrivacy: data.acceptedPrivacy,
            acceptedTermsAt: data.acceptedTermsAt,
            acceptedPrivacyAt: data.acceptedPrivacyAt,
          },
        }),
      });
      const identityPayload = await identityRes.json();
      if (!identityRes.ok) {
        setError(identityPayload.error ?? "Could not save account details.");
        return;
      }
      // Trigger OTP send
      const verifyRes = await fetch("/api/acquisition/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeToken }),
      });
      const verifyPayload = await verifyRes.json();
      if (!verifyRes.ok) {
        setError(verifyPayload.error ?? "Could not send verification code.");
        return;
      }
      if (verifyPayload.debug_otp) setDebugOtp(verifyPayload.debug_otp);
      setStep("identity-verification");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to continue.");
    } finally {
      setLoading(false);
    }
  }

  function handleVerificationComplete() {
    setIdentityVerified(true);
    setStep("checkout-boundary");
  }

  async function handleProvisionWorkspace() {
    if (!resumeToken) {
      setError("Your setup session has expired. Please restart workspace setup.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/acquisition/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeToken }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setProvisioningError({
          message: payload.error ?? "Unable to finish workspace setup.",
          reference: typeof payload.provisioningReference === "string" ? payload.provisioningReference : null,
          failedStage: typeof payload.failedStage === "string" ? payload.failedStage : null,
          retryable: payload.retryable !== false,
        });
        return;
      }
      setReadyForProvisioning(false);
      setStep("next-steps");
    } catch (err) {
      setProvisioningError({
        message: err instanceof Error ? err.message : "Unable to finish workspace setup.",
        reference: null,
        failedStage: null,
        retryable: true,
      });
    } finally {
      setLoading(false);
    }
  }

  const progressIndex = PROGRESS_INDEX[step] ?? 0;
  const identitySteps: OnboardingStep[] = ["identity-organisation", "identity-admin", "identity-verification", "checkout-boundary"];
  const checkoutSteps: OnboardingStep[] = ["commercial-plan", "checkout-review", "checkout-payment", "checkout-success", "checkout-enterprise", "checkout-transfer-pending", "provision-boundary"];
  const isWideStep = identitySteps.includes(step) || checkoutSteps.includes(step);
  const showProgress = step !== "enterprise" && step !== "setup" && step !== "next-steps"
    && step !== "checkout-success" && step !== "checkout-enterprise"
    && step !== "checkout-transfer-pending" && step !== "provision-boundary";

  if (resuming) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-400">Resuming your session…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={startNewJourney}
              aria-label="Start a new DeployIQ setup"
              className="text-lg font-bold tracking-tight text-slate-900 hover:text-orange-600 transition-colors"
            >
              DeployIQ
            </button>
            <button
              type="button"
              onClick={startNewJourney}
              aria-label="Return to onboarding start"
              className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700 hover:bg-orange-200 transition-colors"
            >
              Get started
            </button>
          </div>
          {resumeToken ? (
            <p className="text-xs text-slate-400">Progress saved</p>
          ) : null}
        </div>
      </header>

      {/* Progress indicator */}
      {showProgress ? (
        <OnboardingProgress steps={PROGRESS_STEPS} currentIndex={progressIndex} />
      ) : null}

      {/* Main content — wider for identity and checkout steps */}
      <main className={`mx-auto px-4 py-8 sm:py-12 ${
        isWideStep ? "max-w-5xl" : "max-w-2xl"
      }`}>
        {error ? (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
            {error}
          </div>
        ) : null}

        {step === "objective" && (
          <BusinessObjectiveStep onSelect={handleObjectiveSelect} loading={loading} />
        )}

        {step === "discovery" && (
          <GuidedDiscoveryStep
            initialData={discovery}
            onSubmit={handleDiscoverySubmit}
            onBack={() => setStep("objective")}
            loading={loading}
          />
        )}

        {step === "recommendation" && recommendation ? (
          <RecommendationStep
            recommendation={recommendation}
            quantity={parseInt(discovery.rolloutQuantity, 10) || 0}
            country={discovery.country}
            onConfirm={handleRecommendationConfirm}
            onBack={() => setStep("discovery")}
            onEnterpriseAssistance={() => setStep("enterprise")}
          />
        ) : null}

        {step === "decision" && recommendation ? (
          <CommercialDecisionStep
            recommendation={recommendation}
            onContinueSetup={handleContinueSetup}
            onRequestProposal={() => setStep("enterprise")}
            onTalkToSales={() => setStep("enterprise")}
            onBack={() => setStep("recommendation")}
          />
        ) : null}

        {step === "quotation" && quotation ? (
          <LiveQuotationStep
            quotation={quotation}
            recommendation={recommendation}
            onContinue={() => setStep("setup")}
            onAdjust={() => setStep("discovery")}
            onEnterpriseAssistance={() => setStep("enterprise")}
            onBack={goBack}
          />
        ) : null}

        {step === "enterprise" && (
          <EnterpriseAssistanceStep
            recommendation={recommendation}
            quantity={parseInt(discovery.rolloutQuantity, 10) || 0}
            country={discovery.country}
            resumeToken={resumeToken}
            onBack={goBack}
          />
        )}

        {/* CO-1B: Identity — Organisation */}
        {step === "identity-organisation" && (
          <IdentityOrganisationStep
            initialData={identityOrg}
            prefilledCountry={discovery.country}
            recommendation={recommendation}
            quotation={quotation}
            onSubmit={handleIdentityOrgSubmit}
            onBack={goBack}
            adminPreview={{ firstName: identityAdmin.firstName, lastName: identityAdmin.lastName, email: identityAdmin.email }}
          />
        )}

        {/* CO-1B: Identity — Admin */}
        {step === "identity-admin" && (
          <IdentityAdminStep
            initialData={identityAdmin}
            orgData={identityOrg}
            recommendation={recommendation}
            quotation={quotation}
            onSubmit={handleIdentityAdminSubmit}
            onBack={goBack}
          />
        )}

        {/* CO-1B: Identity — Email Verification */}
        {step === "identity-verification" && (
          <IdentityVerificationStep
            email={identityAdmin.email}
            resumeToken={resumeToken ?? ""}
            debugOtp={debugOtp}
            onVerified={handleVerificationComplete}
            onChangeEmail={() => setStep("identity-admin")}
            onBack={goBack}
          />
        )}

        {/* CO-1B: Checkout Boundary */}
        {step === "checkout-boundary" && (
          <CheckoutBoundaryStep
            orgData={identityOrg}
            adminData={identityAdmin}
            recommendation={recommendation}
            quotation={quotation}
            onContinue={() => setStep("commercial-plan")}
          />
        )}

        {/* Commercial Plan — live quotation configurator */}
        {step === "commercial-plan" && recommendation ? (
          <CommercialPlanStep
            initialRecommendation={recommendation}
            initialQuotation={quotation}
            discovery={discovery}
            objectiveId={objectiveId}
            resumeToken={resumeToken}
            orgName={identityOrg.organisationName}
            workspaceSlug={identityOrg.workspaceSlug}
            onConfirm={async (result: CommercialPlanResult) => {
              // Apply confirmed plan to shell state
              setQuotation(result.quotation);
              setRecommendation(result.recommendation);
              setBillingCycle(result.billingCycle);
              setDiscovery((d) => ({
                ...d,
                rolloutQuantity: String(result.quantity),
                capabilities: result.capabilities,
              }));
              // Persist confirmed quotation and generate commercial reference server-side
              if (resumeToken) {
                try {
                  await fetch("/api/acquisition/checkout/confirm-plan", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ resumeToken, quotation: result.quotation }),
                  });
                } catch {
                  // Non-blocking — plan proceeds; reference will be generated at payment
                }
              }
              setStep("checkout-review");
            }}
            onBack={goBack}
          />
        ) : null}

        {/* CO-1C: Checkout Review */}
        {step === "checkout-review" && (
          <CheckoutReviewStep
            orgData={identityOrg}
            adminData={identityAdmin}
            recommendation={recommendation}
            quotation={quotation}
            initialBillingCycle={billingCycle}
            resumeToken={resumeToken}
            loading={loading}
            onProceed={(cycle, method) => {
              setBillingCycle(cycle);
              setPaymentMethod(method);
              setStep("checkout-payment");
            }}
            onBack={goBack}
          />
        )}

        {/* CO-1C: Checkout Payment */}
        {step === "checkout-payment" && (
          <CheckoutPaymentStep
            orgData={identityOrg}
            recommendation={recommendation}
            quotation={quotation}
            billingCycle={billingCycle}
            paymentMethod={paymentMethod}
            resumeToken={resumeToken}
            onPaymentSuccess={(ref) => {
              setPaymentReference(ref);
              setReadyForProvisioning(true);
              setStep("checkout-success");
            }}
            onTransferSubmitted={(ref) => {
              setPaymentReference(ref);
              setReadyForProvisioning(false);
              setStep("checkout-transfer-pending");
            }}
            onEnterpriseSubmitted={() => setStep("checkout-enterprise")}
            onBack={goBack}
          />
        )}

        {/* CO-1C: Card Payment Success — subscription active, provisioning anticipation */}
        {step === "checkout-success" && (
          <CheckoutSuccessStep
            paymentReference={paymentReference ?? ""}
            orgName={identityOrg.organisationName}
            productName={recommendation?.productName ?? "DeployIQ"}
            onContinue={async () => {
              // Server-side eligibility guard before entering provision-boundary
              if (!resumeToken) {
                if (readyForProvisioning) setStep("provision-boundary");
                return;
              }
              setLoading(true);
              try {
                const res = await fetch(
                  `/api/acquisition/checkout/eligibility?token=${encodeURIComponent(resumeToken)}`
                );
                const payload = await res.json();
                if (res.ok && payload.readyForProvisioning) {
                  setReadyForProvisioning(true);
                  setStep("provision-boundary");
                } else {
                  setError("Your workspace is not yet eligible for setup. Please check your activation status.");
                  setStep("checkout-review");
                }
              } catch {
                // Network fallback — trust local state set during card payment
                if (readyForProvisioning) {
                  setStep("provision-boundary");
                } else {
                  setError("Unable to confirm eligibility. Please try again.");
                }
              } finally {
                setLoading(false);
              }
            }}
          />
        )}

        {/* CO-1C: Bank Transfer Pending — awaiting finance verification */}
        {step === "checkout-transfer-pending" && (
          <CheckoutTransferPendingStep
            paymentReference={paymentReference ?? ""}
            quotation={quotation}
            billingCycle={billingCycle}
            productName={recommendation?.productName ?? "DeployIQ"}
            orgName={identityOrg.organisationName}
            workspaceSlug={identityOrg.workspaceSlug}
            onBack={() => setStep("checkout-review")}
          />
        )}

        {/* CO-1C: Enterprise PO Submitted — commercial review in progress */}
        {step === "checkout-enterprise" && (
          <EnterpriseSuccessStep
            orgName={identityOrg.organisationName}
            poNumber={enterprisePONumber ?? ""}
            onBack={() => setStep("checkout-review")}
          />
        )}

        {/* CO-1C: Provision Boundary — guarded: only reached via card payment success */}
        {step === "provision-boundary" && (
          <ProvisionBoundaryStep
            orgData={identityOrg}
            adminData={identityAdmin}
            recommendation={recommendation}
            quotation={quotation}
            billingCycle={billingCycle}
            paymentReference={paymentReference}
            readyForProvisioning={readyForProvisioning}
            provisioningError={provisioningError}
            onReturnToActivation={() => setStep("checkout-review")}
            onContinue={() => {
              void handleProvisionWorkspace();
            }}
          />
        )}

        {/* Legacy setup placeholder (accessed via quotation path) */}
        {step === "setup" && (
          <SetupPlaceholder
            productName={recommendation?.productName ?? "DeployIQ"}
            quotation={quotation}
            resumeToken={resumeToken}
            onBack={() => setStep("decision")}
          />
        )}

        {step === "next-steps" && (
          <div className="space-y-8">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500" aria-hidden="true">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-emerald-900">You're all set</h2>
              <p className="mt-2 text-sm text-emerald-700">Account creation and workspace setup will be available in the next step.</p>
            </div>
            {resumeToken ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs text-slate-500">Your save link</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-700">/onboarding?token={resumeToken}</p>
              </div>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CO-1B Placeholder — Journey Preview
// ---------------------------------------------------------------------------

const JOURNEY_STEPS = [
  { label: "Solution selected", done: true },
  { label: "Create your organisation", done: false, current: true },
  { label: "Verify your identity", done: false },
  { label: "Configure your workspace", done: false },
  { label: "Review your commercial plan", done: false },
  { label: "Secure checkout", done: false },
  { label: "Workspace ready", done: false },
  { label: "Launch your first project", done: false },
];

const SETUP_BENEFITS = [
  "Create your organisation",
  "Verify your identity",
  "Configure your workspace",
  "Invite your team",
  "Review your commercial plan",
  "Launch your first project",
];

function SetupPlaceholder({
  productName,
  quotation,
  resumeToken,
  onBack,
}: {
  productName: string;
  quotation: CustomerQuotation | null;
  resumeToken: string | null;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div className="h-1.5 w-full bg-gradient-to-r from-emerald-400 to-emerald-600" />
        <div className="px-8 py-10">
          <span className="inline-block rounded-full border border-emerald-200 bg-emerald-50 px-3 py-0.5 text-xs font-semibold text-emerald-700 mb-5">
            {productName}
          </span>
          <h2 className="text-4xl font-bold tracking-tight text-slate-900 leading-tight">
            You're almost<br />ready.
          </h2>
          <p className="mt-4 text-base text-slate-500 leading-relaxed max-w-sm">
            The next step will prepare your DeployIQ workspace. You will be able to:
          </p>
          <ul className="mt-6 space-y-2.5" role="list">
            {SETUP_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-center gap-3 text-sm text-slate-700">
                <svg className="h-4 w-4 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {benefit}
              </li>
            ))}
          </ul>

          {quotation && !quotation.requiresEnterpriseReview ? (
            <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Your estimated commercial plan
              </p>
              <p className="text-2xl font-bold text-slate-900">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: quotation.currency,
                  maximumFractionDigits: 0,
                }).format(quotation.estimatedTotal)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                for {quotation.quantity.toLocaleString("en-US")} deployment locations
              </p>
            </div>
          ) : null}
        </div>

        {/* Journey preview */}
        <div className="border-t border-slate-100 px-8 py-6">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Your workspace journey
          </p>
          <ol className="space-y-2.5" role="list">
            {JOURNEY_STEPS.map((jStep, i) => (
              <li key={i} className="flex items-center gap-3">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    jStep.done
                      ? "bg-emerald-500 text-white"
                      : jStep.current
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 bg-white text-slate-300"
                  }`}
                  aria-hidden="true"
                >
                  {jStep.done ? "✓" : i + 1}
                </span>
                <span
                  className={`text-sm font-medium ${
                    jStep.done
                      ? "text-emerald-600 line-through decoration-emerald-300"
                      : jStep.current
                      ? "text-slate-900"
                      : "text-slate-300"
                  }`}
                >
                  {jStep.label}
                  {jStep.current ? (
                    <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-600 no-underline">
                      Next
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="border-t border-slate-100 bg-slate-50 px-8 py-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            {resumeToken ? (
              <p className="text-xs text-slate-400">
                Progress saved
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

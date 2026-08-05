"use client";

import { useState } from "react";
import { ArrowLeft, Loader2, CreditCard, Eye, EyeOff, Copy, Check as CheckIcon, Upload, Building2 } from "lucide-react";
import type { RecommendationResult } from "@/lib/commercial/onboarding/recommendation";
import type { CustomerQuotation } from "@/lib/commercial/onboarding/quotation";
import type { BillingCycle, PaymentMethod, EnterprisePOSubmission } from "@/lib/commercial/checkout/types";
import { formatMoney } from "@/lib/commercial/checkout/billing";
import { resolveCommercialModel, isEnterpriseModel, isRecurringModel, billingPeriodLabel } from "@/lib/commercial/pricing/commercialModel";
import { OrderSummary } from "./checkout/OrderSummary";
import type { IdentityOrgData } from "./IdentityOrganisationStep";

type Props = {
  orgData: IdentityOrgData;
  recommendation: RecommendationResult | null;
  quotation: CustomerQuotation | null;
  billingCycle: BillingCycle;
  paymentMethod: PaymentMethod;
  resumeToken: string | null;
  onPaymentSuccess: (reference: string) => void;
  onTransferSubmitted: (reference: string) => void;
  onEnterpriseSubmitted: () => void;
  onBack: () => void;
};

const inputClass =
  "block w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400";

// ---------------------------------------------------------------------------
// Card Payment Form
// ---------------------------------------------------------------------------

function CardPaymentForm({
  amount,
  currency,
  productName,
  resumeToken,
  onSuccess,
}: {
  amount: number;
  currency: string;
  productName: string;
  resumeToken: string | null;
  onSuccess: (ref: string) => void;
}) {
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [showCvv, setShowCvv] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function formatCardNumber(val: string) {
    return val.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
  }
  function formatExpiry(val: string) {
    return val.replace(/\D/g, "").slice(0, 4).replace(/^(\d{2})(\d)/, "$1/$2");
  }

  async function handlePay() {
    if (!resumeToken) { setError("Session expired. Please refresh."); return; }
    if (!cardholderName.trim() || cardNumber.replace(/\s/g, "").length < 13) {
      setError("Please complete all card fields."); return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/acquisition/checkout/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeToken, paymentMethod: "card" }),
      });
      const payload = await res.json();
      if (!res.ok) { setError("Your payment could not be completed. No charge was confirmed. Review your details and try again."); return; }
      onSuccess(payload.reference);
    } catch {
      setError("Your payment could not be completed. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm font-semibold text-slate-900">Secure card details</p>

      <div className="space-y-1.5">
        <label htmlFor="card-name" className="block text-xs font-medium text-slate-600">Cardholder name</label>
        <input id="card-name" type="text" value={cardholderName}
          onChange={(e) => setCardholderName(e.target.value)}
          className={inputClass} placeholder="Full name as on card"
          autoComplete="cc-name" name="ccname" />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="card-number" className="block text-xs font-medium text-slate-600">Card number</label>
        <div className="relative">
          <input id="card-number" type="text" inputMode="numeric"
            value={cardNumber}
            onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
            className={`${inputClass} pr-10 font-mono`}
            placeholder="0000 0000 0000 0000"
            autoComplete="cc-number" name="cardnumber" />
          <CreditCard className="absolute inset-y-0 right-3 my-auto h-4 w-4 text-slate-300" aria-hidden="true" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="card-expiry" className="block text-xs font-medium text-slate-600">Expiry</label>
          <input id="card-expiry" type="text" inputMode="numeric"
            value={expiry}
            onChange={(e) => setExpiry(formatExpiry(e.target.value))}
            className={`${inputClass} font-mono`} placeholder="MM/YY"
            autoComplete="cc-exp" name="ccexp" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="card-cvv" className="block text-xs font-medium text-slate-600">CVV</label>
          <div className="relative">
            <input id="card-cvv" type={showCvv ? "text" : "password"} inputMode="numeric"
              value={cvv}
              onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className={`${inputClass} pr-10 font-mono`} placeholder="•••"
              autoComplete="cc-csc" name="cvc" />
            <button type="button" onClick={() => setShowCvv((v) => !v)}
              className="absolute inset-y-0 right-3 flex items-center text-slate-400"
              aria-label={showCvv ? "Hide CVV" : "Show CVV"}>
              {showCvv ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {error ? <p className="text-xs text-rose-600" role="alert">{error}</p> : null}

      <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 flex items-center gap-2">
        <svg className="h-4 w-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <p className="text-xs text-slate-500">Payments are processed securely. Card details are never stored on DeployIQ servers.</p>
      </div>

      <button
        type="button"
        onClick={handlePay}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-3.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 shadow-sm transition-colors"
        aria-label={`Activate subscription — pay ${formatMoney(amount, currency)}`}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CreditCard className="h-4 w-4" aria-hidden="true" />}
        {loading ? "Confirming activation…" : `Activate subscription — ${formatMoney(amount, currency)}`}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bank Transfer Panel
// ---------------------------------------------------------------------------

const BANK_DETAILS = {
  bankName: "Zenith Bank PLC",
  accountName: "DeployIQ Technologies Limited",
  accountNumber: "1234567890",
};

function BankTransferPanel({
  reference,
  amount,
  currency,
  resumeToken,
  onConfirm,
}: {
  reference: string;
  amount: number;
  currency: string;
  resumeToken: string | null;
  onConfirm: (reference: string) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  }

  function CopyButton({ text, id }: { text: string; id: string }) {
    return (
      <button type="button" onClick={() => copy(text, id)}
        aria-label={`Copy ${id}`}
        className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:border-orange-300 hover:text-orange-600 transition-colors">
        {copied === id ? <CheckIcon className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        {copied === id ? "Copied" : "Copy"}
      </button>
    );
  }

  async function handleConfirmTransfer() {
    if (!resumeToken) {
      setError("Session expired. Please refresh.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/acquisition/checkout/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeToken, paymentMethod: "bank_transfer" }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Unable to record transfer submission.");
        return;
      }
      onConfirm(payload.reference ?? reference);
    } catch {
      setError("Unable to record transfer submission. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-xs font-semibold text-amber-800">Bank transfer reference</p>
        <p className="mt-1 text-xs text-amber-700">
          Make your transfer using the details below and include your reference number exactly as shown. Your workspace will be activated once our finance team confirms receipt.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {[
          { label: "Bank", value: BANK_DETAILS.bankName, id: "bank" },
          { label: "Account name", value: BANK_DETAILS.accountName, id: "acname" },
          { label: "Account number", value: BANK_DETAILS.accountNumber, id: "accnum" },
          { label: "Amount", value: formatMoney(amount, currency), id: "amount" },
          { label: "Reference (required)", value: reference, id: "ref", accent: true },
        ].map(({ label, value, id, accent }) => (
          <div key={id} className="flex items-center gap-2 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-400">{label}</p>
              <p className={`text-sm font-mono font-semibold truncate ${accent ? "text-orange-700" : "text-slate-800"}`}>{value}</p>
            </div>
            <CopyButton text={value} id={id} />
          </div>
        ))}
      </div>

      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-orange-500" />
        <span className="text-sm text-slate-600">
          I have made the bank transfer using the reference number above.
        </span>
      </label>

      {error ? <p className="text-xs text-rose-600" role="alert">{error}</p> : null}

      <button
        type="button"
        onClick={handleConfirmTransfer}
        disabled={!confirmed || loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
        {loading ? "Recording transfer…" : "Confirm transfer submitted"}
      </button>

      <p className="text-center text-xs text-slate-400">
        Verification typically takes 1–2 business days after transfer is received.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Enterprise PO Form
// ---------------------------------------------------------------------------

function EnterprisePOForm({
  resumeToken,
  onSubmitted,
}: {
  resumeToken: string | null;
  onSubmitted: () => void;
}) {
  const [form, setForm] = useState({ poNumber: "", expectedApprovalDate: "", procurementContact: "", notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  function patch(field: keyof typeof form, value: string) {
    setForm((c) => ({ ...c, [field]: value }));
    setErrors((c) => ({ ...c, [field]: "" }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!resumeToken) return;
    const next: Record<string, string> = {};
    if (!form.poNumber.trim()) next.poNumber = "PO number is required.";
    if (!form.expectedApprovalDate) next.expectedApprovalDate = "Expected approval date is required.";
    if (!form.procurementContact.trim()) next.procurementContact = "Procurement contact is required.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    setApiError(null);
    try {
      const res = await fetch("/api/acquisition/checkout/enterprise-po", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeToken, ...form }),
      });
      const payload = await res.json();
      if (!res.ok) { setApiError(payload.error ?? "Submission failed."); return; }
      onSubmitted();
    } catch {
      setApiError("Unable to submit. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
        <p className="text-xs text-slate-500 leading-relaxed">
          Submit your purchase order for review by our commercial team. We will contact you to finalise terms and provisioning timelines.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="po-number" className="block text-xs font-medium text-slate-600">
          Company PO number <span className="text-rose-500" aria-hidden="true">*</span>
        </label>
        <input id="po-number" type="text" value={form.poNumber}
          onChange={(e) => patch("poNumber", e.target.value)}
          className={inputClass} placeholder="e.g. PO-2026-00123" />
        {errors.poNumber ? <p className="text-xs text-rose-600" role="alert">{errors.poNumber}</p> : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="po-date" className="block text-xs font-medium text-slate-600">
          Expected approval date <span className="text-rose-500" aria-hidden="true">*</span>
        </label>
        <input id="po-date" type="date" value={form.expectedApprovalDate}
          onChange={(e) => patch("expectedApprovalDate", e.target.value)}
          className={inputClass}
          min={new Date().toISOString().split("T")[0]} />
        {errors.expectedApprovalDate ? <p className="text-xs text-rose-600" role="alert">{errors.expectedApprovalDate}</p> : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="po-contact" className="block text-xs font-medium text-slate-600">
          Procurement contact name <span className="text-rose-500" aria-hidden="true">*</span>
        </label>
        <input id="po-contact" type="text" value={form.procurementContact}
          onChange={(e) => patch("procurementContact", e.target.value)}
          className={inputClass} placeholder="Full name of procurement officer" />
        {errors.procurementContact ? <p className="text-xs text-rose-600" role="alert">{errors.procurementContact}</p> : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="po-notes" className="block text-xs font-medium text-slate-600">
          Additional notes
        </label>
        <textarea id="po-notes" value={form.notes}
          onChange={(e) => patch("notes", e.target.value)}
          className={`${inputClass} resize-none`} rows={3}
          placeholder="Any relevant procurement notes or requirements." />
      </div>

      {apiError ? <p className="text-xs text-rose-600" role="alert">{apiError}</p> : null}

      <button type="submit" disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Building2 className="h-4 w-4" aria-hidden="true" />}
        {loading ? "Submitting…" : "Submit purchase order"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const METHOD_TITLES: Record<PaymentMethod, string> = {
  card: "Confirm your activation",
  bank_transfer: "Bank transfer details",
  enterprise_po: "Purchase order submission",
};

export function CheckoutPaymentStep({
  orgData,
  recommendation,
  quotation,
  billingCycle,
  paymentMethod,
  resumeToken,
  onPaymentSuccess,
  onTransferSubmitted,
  onEnterpriseSubmitted,
  onBack,
}: Props) {
  // Amount comes from the confirmed quotation — no synthetic billing-cycle calculation.
  const commercialModel = resolveCommercialModel(quotation?.commercialModel);
  const amount = quotation?.estimatedTotal ?? 0;
  const currency = quotation?.currency ?? "NGN";
  const isEnterprise = isEnterpriseModel(commercialModel) || quotation?.requiresEnterpriseReview || recommendation?.deploymentMode === "ENTERPRISE";

  // Generate a stable bank transfer reference from the resume token
  const bankReference = resumeToken
    ? `DPQ-${new Date().getFullYear()}-${resumeToken.slice(-6).toUpperCase().replace(/[^A-Z0-9]/g, "X")}`
    : "DPQ-PENDING";

  return (
    <div className="space-y-0">
      <div className="mb-8 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">Activate Workspace</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          {METHOD_TITLES[paymentMethod]}
        </h1>
        {paymentMethod === "card" && quotation && !isEnterprise ? (
          <p className="text-base text-slate-500">
            {formatMoney(amount, currency)} — {billingPeriodLabel(commercialModel)}
          </p>
        ) : null}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          <button type="button" onClick={onBack}
            className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Change payment method
          </button>

          {paymentMethod === "card" && (
            <CardPaymentForm
              amount={amount}
              currency={currency}
              productName={recommendation?.productName ?? "DeployIQ"}
              resumeToken={resumeToken}
              onSuccess={onPaymentSuccess}
            />
          )}

          {paymentMethod === "bank_transfer" && (
            <BankTransferPanel
              reference={bankReference}
              amount={amount}
              currency={currency}
              resumeToken={resumeToken}
              onConfirm={onTransferSubmitted}
            />
          )}

          {paymentMethod === "enterprise_po" && (
            <EnterprisePOForm
              resumeToken={resumeToken}
              onSubmitted={onEnterpriseSubmitted}
            />
          )}
        </div>

        <div className="hidden lg:block">
          <div className="sticky top-24">
            <OrderSummary
              quotation={quotation}
              organisationName={orgData.organisationName}
              workspaceSlug={orgData.workspaceSlug}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * CO-1C Checkout types.
 * No React or server dependencies — fully portable.
 */

export type BillingCycle = "monthly" | "annual";

export type PaymentMethod = "card" | "bank_transfer" | "enterprise_po";

export type PaymentStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "awaiting_verification"  // bank transfer awaiting finance sign-off
  | "awaiting_approval";     // enterprise PO awaiting commercial team

export type CommercialStatus =
  | "pending"
  | "checkout_initiated"
  | "payment_pending"
  | "payment_submitted"
  | "payment_verified"
  | "enterprise_submitted"
  | "enterprise_approved"
  | "approved";

export type SubscriptionStatus = "inactive" | "activating" | "active";

/** Fields added to onboarding_drafts.draft_data during CO-1C. */
export type CheckoutDraftFields = {
  billingCycle: BillingCycle;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  commercialStatus: CommercialStatus;
  subscriptionStatus: SubscriptionStatus;
  paymentReference: string | null;
  checkoutCompletedAt: string | null;
  readyForProvisioning: boolean;
};

export type BillingQuote = {
  currency: string;
  quantity: number;
  productName: string;
  pricingMethodLabel: string;
  /** Annual price — the base figure from the quotation. */
  annualTotal: number;
  /** Equivalent monthly cost if on annual plan (annualTotal / 12). */
  monthlyEquivalent: number;
  /** Actual charge per month if customer selects monthly billing (includes premium). */
  monthlyBilledMonthly: number;
  /** Money saved per year by choosing annual over monthly billing. */
  annualSavings: number;
  /** annualSavings expressed as a rounded percentage. */
  annualSavingsPercent: number;
};

export type CardPaymentIntent = {
  provider: string;
  reference: string;
  amount: number;
  currency: string;
};

export type BankTransferDetails = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  reference: string;
};

export type EnterprisePOSubmission = {
  poNumber: string;
  expectedApprovalDate: string;
  procurementContact: string;
  notes: string;
};

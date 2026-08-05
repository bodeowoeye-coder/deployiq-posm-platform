/**
 * Payment Provider abstraction for CO-1C.
 *
 * The checkout UI depends ONLY on these interfaces — never on a concrete gateway.
 * Swapping Paystack → Flutterwave → Stripe → Adyen requires only a new
 * class implementing PaymentProvider, with no UI code changes.
 */

export interface InitiatePaymentParams {
  amount: number;
  currency: string;
  reference: string;
  customerEmail: string;
  description: string;
}

export interface PaymentResult {
  success: boolean;
  reference: string;
  /** Provider's own transaction ID, if available. */
  providerReference?: string;
  error?: string;
}

export interface PaymentProvider {
  readonly name: string;
  initiatePayment(params: InitiatePaymentParams): Promise<PaymentResult>;
}

// ---------------------------------------------------------------------------
// Reference generation
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic, human-readable payment reference from the
 * acquisition draft's resume token.
 * Format: DPQ-{YEAR}-{TOKEN_SUFFIX_6}-{RANDOM_4}
 */
export function generatePaymentReference(resumeToken: string): string {
  const year = new Date().getFullYear();
  const suffix = resumeToken.slice(-6).toUpperCase().replace(/[^A-Z0-9]/g, "X");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DPQ-${year}-${suffix}-${rand}`;
}

// ---------------------------------------------------------------------------
// Mock Provider (used for development until a real gateway is wired in)
// ---------------------------------------------------------------------------

/**
 * MockPaymentProvider simulates a successful card payment.
 * No real money moves. Replace with a concrete gateway provider for production.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  async initiatePayment(params: InitiatePaymentParams): Promise<PaymentResult> {
    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 900));
    return {
      success: true,
      reference: params.reference,
      providerReference: `MOCK-${Date.now()}`,
    };
  }
}

/**
 * Active payment provider used by server routes.
 * Replace this with a real provider import when integrating a gateway.
 */
export function getActivePaymentProvider(): PaymentProvider {
  return new MockPaymentProvider();
}

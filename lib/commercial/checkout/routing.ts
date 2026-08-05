import type { PaymentMethod } from "./types";

export type CheckoutActivationRoute =
  | "checkout-success"
  | "checkout-transfer-pending"
  | "checkout-enterprise"
  | "checkout-review";

export type CheckoutActivationState = {
  paymentMethod: PaymentMethod;
  paymentStatus: string;
  commercialStatus: string;
  readyForProvisioning: boolean;
};

export function resolveCheckoutActivationRoute(state: CheckoutActivationState): CheckoutActivationRoute {
  if (
    state.paymentMethod === "card" &&
    state.paymentStatus === "succeeded" &&
    state.commercialStatus === "payment_verified" &&
    state.readyForProvisioning
  ) {
    return "checkout-success";
  }

  if (
    state.paymentMethod === "bank_transfer" &&
    state.paymentStatus === "awaiting_verification" &&
    state.commercialStatus === "payment_pending" &&
    !state.readyForProvisioning
  ) {
    return "checkout-transfer-pending";
  }

  if (
    state.paymentMethod === "enterprise_po" &&
    state.paymentStatus === "awaiting_approval" &&
    state.commercialStatus === "enterprise_submitted" &&
    !state.readyForProvisioning
  ) {
    return "checkout-enterprise";
  }

  return "checkout-review";
}

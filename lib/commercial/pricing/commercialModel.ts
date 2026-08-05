/**
 * Commercial model and billing behaviour — canonical types and helpers.
 * No React, no DB, no HTTP — fully testable with node --test.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommercialModel =
  | "one_time_programme"
  | "monthly_subscription"
  | "annual_subscription"
  | "enterprise_contract";

export type BillingBehaviour =
  | "single_payment"
  | "monthly"
  | "annual"
  | "contract";

// ---------------------------------------------------------------------------
// Catalogues
// ---------------------------------------------------------------------------

export const COMMERCIAL_MODEL_OPTIONS = [
  { value: "one_time_programme"   as CommercialModel, label: "One-time Programme",    billingBehaviour: "single_payment" as BillingBehaviour, renewalRequired: false },
  { value: "monthly_subscription" as CommercialModel, label: "Monthly Subscription",  billingBehaviour: "monthly"        as BillingBehaviour, renewalRequired: true  },
  { value: "annual_subscription"  as CommercialModel, label: "Annual Subscription",   billingBehaviour: "annual"         as BillingBehaviour, renewalRequired: true  },
  { value: "enterprise_contract"  as CommercialModel, label: "Enterprise Contract",   billingBehaviour: "contract"       as BillingBehaviour, renewalRequired: false },
] as const;

export const BILLING_BEHAVIOUR_OPTIONS = [
  { value: "single_payment" as BillingBehaviour, label: "Single Payment"  },
  { value: "monthly"        as BillingBehaviour, label: "Monthly"         },
  { value: "annual"         as BillingBehaviour, label: "Annual"          },
  { value: "contract"       as BillingBehaviour, label: "Contract"        },
] as const;

export const PAYMENT_METHOD_OPTIONS = [
  { value: "card",           label: "Credit / debit card"  },
  { value: "bank_transfer",  label: "Bank transfer"         },
  { value: "enterprise_po",  label: "Enterprise purchase order" },
] as const;

/** All valid commercial model identifiers. */
export const VALID_COMMERCIAL_MODELS: ReadonlyArray<CommercialModel> = [
  "one_time_programme",
  "monthly_subscription",
  "annual_subscription",
  "enterprise_contract",
];

/** All valid billing behaviour identifiers. */
export const VALID_BILLING_BEHAVIOURS: ReadonlyArray<BillingBehaviour> = [
  "single_payment",
  "monthly",
  "annual",
  "contract",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * When no commercial model is explicitly configured, fall back to
 * one_time_programme. This preserves backward compatibility for legacy
 * templates that predate this column.
 */
export function resolveCommercialModel(value: string | null | undefined): CommercialModel {
  if (!value) return "one_time_programme";
  if (VALID_COMMERCIAL_MODELS.includes(value as CommercialModel)) return value as CommercialModel;
  return "one_time_programme";
}

export function resolveAllowedPaymentMethods(value: string[] | null | undefined): string[] {
  if (Array.isArray(value) && value.length > 0) return value;
  // Default: all self-service methods
  return ["card", "bank_transfer"];
}

/** Customer-facing label for a commercial model. */
export function commercialModelLabel(model: CommercialModel): string {
  return COMMERCIAL_MODEL_OPTIONS.find((o) => o.value === model)?.label ?? "Commercial plan";
}

/**
 * Whether this commercial model uses recurring billing (subscriptions).
 * Returns false for one-time programmes and enterprise contracts.
 */
export function isRecurringModel(model: CommercialModel): boolean {
  return model === "monthly_subscription" || model === "annual_subscription";
}

/**
 * Whether this commercial model routes through the assisted/enterprise workflow.
 */
export function isEnterpriseModel(model: CommercialModel): boolean {
  return model === "enterprise_contract";
}

/**
 * Return the canonical billing period label for customer-facing UI.
 */
export function billingPeriodLabel(model: CommercialModel): string {
  switch (model) {
    case "one_time_programme":   return "One-time payment";
    case "monthly_subscription": return "Monthly subscription";
    case "annual_subscription":  return "Annual subscription";
    case "enterprise_contract":  return "Enterprise contract";
  }
}

/**
 * Validate that commercial_model and billing_behaviour are a compatible pair.
 * Returns an error message or null.
 */
export function validateCommercialModelCombination(
  model: CommercialModel,
  behaviour: BillingBehaviour,
): string | null {
  const expected = COMMERCIAL_MODEL_OPTIONS.find((o) => o.value === model)?.billingBehaviour;
  if (expected && expected !== behaviour) {
    return `Billing behaviour '${behaviour}' is incompatible with commercial model '${model}'. Expected '${expected}'.`;
  }
  return null;
}

/**
 * Default billing behaviour for a given commercial model.
 */
export function defaultBillingBehaviour(model: CommercialModel): BillingBehaviour {
  return COMMERCIAL_MODEL_OPTIONS.find((o) => o.value === model)?.billingBehaviour ?? "single_payment";
}

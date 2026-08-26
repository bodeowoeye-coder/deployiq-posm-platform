import type { CustomerQuotation } from "./quotation.ts";
import { parseCanonicalProductKey } from "../products/catalogue.ts";

export type AuthoritativePricingSnapshot = {
  id: string;
  onboarding_draft_id: string | null;
  product_key: string;
  pricing_template_id: string;
  pricing_template_name: string;
  currency: string;
  quantity: number | string;
  subtotal: number | string;
  discount: number | string;
  total: number | string;
  included_admin_users: number | string;
  requires_enterprise_review: boolean;
  expires_at: string | null;
  status: string;
};

export type QuotationAuthorityResult =
  | { ok: true; productKey: string }
  | { ok: false; code: string; message: string };

function amount(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

export function validateQuotationAgainstSnapshot(input: {
  draftId: string;
  selectedProduct: string | null;
  snapshot: AuthoritativePricingSnapshot | null;
  quotation: CustomerQuotation;
}): QuotationAuthorityResult {
  const { draftId, snapshot, quotation } = input;
  if (!snapshot) return { ok: false, code: "pricing_snapshot_required", message: "The commercial plan must be recalculated before it can be confirmed." };
  if (snapshot.onboarding_draft_id !== draftId) return { ok: false, code: "pricing_snapshot_draft_mismatch", message: "The commercial plan does not belong to this acquisition journey." };
  if (!["calculated", "accepted"].includes(snapshot.status)) return { ok: false, code: "pricing_snapshot_not_current", message: "The commercial plan is no longer current. Please recalculate it." };

  const selectedProduct = parseCanonicalProductKey(input.selectedProduct);
  const snapshotProduct = parseCanonicalProductKey(snapshot.product_key);
  const quotationProduct = parseCanonicalProductKey(quotation.productKey);
  if (!selectedProduct || !snapshotProduct || !quotationProduct || selectedProduct !== snapshotProduct || snapshotProduct !== quotationProduct) {
    return { ok: false, code: "commercial_product_mismatch", message: "The commercial plan does not match the selected product." };
  }

  const matches =
    quotation.pricingTemplateId === snapshot.pricing_template_id
    && quotation.pricingTemplateName === snapshot.pricing_template_name
    && quotation.currency === snapshot.currency
    && quotation.quantity === amount(snapshot.quantity)
    && quotation.subtotal === amount(snapshot.subtotal)
    && quotation.discountAmount === amount(snapshot.discount)
    && quotation.estimatedTotal === amount(snapshot.total)
    && quotation.includedAdminUsers === amount(snapshot.included_admin_users)
    && quotation.requiresEnterpriseReview === snapshot.requires_enterprise_review
    && quotation.quotationExpiry === snapshot.expires_at;

  if (!matches) return { ok: false, code: "commercial_configuration_mismatch", message: "The commercial plan has changed. Please recalculate it before continuing." };
  return { ok: true, productKey: snapshotProduct };
}

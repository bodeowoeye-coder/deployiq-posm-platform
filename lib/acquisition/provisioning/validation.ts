import type { CustomerQuotation } from "../../commercial/onboarding/quotation.ts";
import type { OnboardingDraft } from "../../commercial/onboarding/types.ts";
import { objectiveToProductKey } from "../../commercial/onboarding/objectives.ts";
import { resolveProductKey, getCanonicalProduct } from "../../commercial/products/catalogue.ts";
import { getProductProvisioningManifest, isProvisioningBlueprintEnabled } from "./registry.ts";

export type ProvisioningEligibilityResult =
  | { ok: true; productKey: string; quotation: CustomerQuotation; workspaceSlug: string; commercialReference: string }
  | { ok: false; code: string; message: string };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isAllowedPaymentMethod(quotation: CustomerQuotation, method: string): boolean {
  const allowed = quotation.allowedPaymentMethods?.length ? quotation.allowedPaymentMethods : ["card", "bank_transfer"];
  return allowed.includes(method);
}

export function validateProvisioningProductChain(draft: OnboardingDraft, quotation: CustomerQuotation) {
  const data = draft.draft_data ?? {};
  const selectedProduct = resolveProductKey(draft.selected_product ?? (text(data.recommendedProductKey) || quotation.productKey));
  const objectiveProduct = text(data.objectiveId) ? resolveProductKey(objectiveToProductKey(text(data.objectiveId)) ?? selectedProduct) : selectedProduct;
  const recommendationProduct = text(data.recommendedProductKey) ? resolveProductKey(text(data.recommendedProductKey)) : selectedProduct;
  const quotationProduct = resolveProductKey(quotation.productKey);
  const product = getCanonicalProduct(selectedProduct);
  const manifest = getProductProvisioningManifest(selectedProduct);

  const productKeys = [selectedProduct, objectiveProduct, recommendationProduct, quotationProduct];
  if (!productKeys.every((key) => key === selectedProduct)) {
    return {
      ok: false as const,
      code: "product_chain_mismatch",
      message: "The selected product does not match the confirmed commercial plan.",
      details: { selectedProduct, objectiveProduct, recommendationProduct, quotationProduct },
    };
  }

  if (!product || !manifest || product.provisioningManifestKey !== manifest.manifestKey || manifest.productKey !== selectedProduct) {
    return {
      ok: false as const,
      code: "manifest_product_mismatch",
      message: "Workspace setup is not configured for this product yet.",
      details: {
        selectedProduct,
        catalogueProductKey: product?.productKey ?? null,
        manifestProductKey: manifest?.productKey ?? null,
        provisioningManifestKey: product?.provisioningManifestKey ?? null,
        manifestKey: manifest?.manifestKey ?? null,
      },
    };
  }

  if (!isProvisioningBlueprintEnabled(selectedProduct)) {
    return {
      ok: false as const,
      code: "provisioning_blueprint_not_enabled",
      message: "Workspace setup for this solution is handled by our assisted provisioning team.",
      details: {
        selectedProduct,
        manifestProductKey: manifest.productKey,
        manifestKey: manifest.manifestKey,
        provisioningStatus: manifest.provisioningStatus,
        isPlaceholder: manifest.isPlaceholder,
      },
    };
  }

  return { ok: true as const, productKey: selectedProduct };
}

export function validateProvisioningEligibility(draft: OnboardingDraft): ProvisioningEligibilityResult {
  const data = draft.draft_data ?? {};
  const quotation = data.confirmedQuotation as CustomerQuotation | undefined;
  const commercialReference = text(data.commercialReference);
  const workspaceSlug = text(data.workspaceSlug).toLowerCase();
  const paymentStatus = text(data.paymentStatus);
  const commercialStatus = text(data.commercialStatus);
  const paymentMethod = text(data.paymentMethod) || "card";

  if (data.readyForProvisioning !== true) {
    return { ok: false, code: "not_ready", message: "Your workspace is not yet eligible for setup." };
  }
  const approvedAssisted = commercialStatus === "enterprise_approved" || commercialStatus === "approved";
  if (!(paymentStatus === "succeeded" || approvedAssisted)) {
    return { ok: false, code: "payment_not_verified", message: "Payment or commercial approval must be confirmed before workspace setup." };
  }
  if (!(commercialStatus === "payment_verified" || approvedAssisted)) {
    return { ok: false, code: "commercial_not_verified", message: "Commercial approval must be confirmed before workspace setup." };
  }
  if (!quotation) {
    return { ok: false, code: "missing_quotation", message: "No confirmed commercial plan was found." };
  }
  if (!commercialReference) {
    return { ok: false, code: "missing_commercial_reference", message: "No commercial reference was found for this activation." };
  }
  if (!workspaceSlug) {
    return { ok: false, code: "missing_workspace_slug", message: "No workspace URL was found for this activation." };
  }
  if (!isAllowedPaymentMethod(quotation, paymentMethod)) {
    return { ok: false, code: "payment_method_not_allowed", message: "The selected payment method is not allowed for this commercial plan." };
  }

  const quoteExpiry = quotation.quotationExpiry ? new Date(quotation.quotationExpiry).getTime() : null;
  if (quoteExpiry && Number.isFinite(quoteExpiry) && quoteExpiry < Date.now()) {
    return { ok: false, code: "quotation_expired", message: "The confirmed commercial plan has expired. Please refresh your quotation." };
  }

  const productChain = validateProvisioningProductChain(draft, quotation);
  if (!productChain.ok) return { ok: false, code: productChain.code, message: productChain.message };

  return { ok: true, productKey: productChain.productKey, quotation, workspaceSlug, commercialReference };
}

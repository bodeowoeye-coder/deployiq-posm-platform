import type { CanonicalProduct } from "../../lib/commercial/products/catalogue.ts";
import { resolveProductKey } from "../../lib/commercial/products/catalogue.ts";
import { commercialModelLabel, resolveCommercialModel } from "../../lib/commercial/pricing/commercialModel.ts";
import type { PricingTemplate } from "../../lib/commercial/pricing/types.ts";
import { getPricingModelLabel } from "./wizardUtils.ts";

export type ProductCommercialSummary = {
  productKey: string;
  productName: string;
  setupStatus: "Instant Setup" | "Assisted Setup";
  activeTemplateCount: number;
  draftTemplateCount: number;
  archivedTemplateCount: number;
  countriesConfigured: string[];
  activeCommercialModels: string[];
  activePricingMethods: string[];
  activePricingMetrics: string[];
  paymentMethods: string[];
  discountRules: string;
  lastUpdated: string | null;
  lastPublished: string | null;
  totalQuotationsGenerated: number;
  templatesPendingReview: number;
  hasActivePricing: boolean;
};

function productTemplates(product: CanonicalProduct, templates: PricingTemplate[]): PricingTemplate[] {
  return templates.filter((template) => resolveProductKey(template.product_key) === product.productKey);
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
}

function latestDate(values: Array<string | null | undefined>): string | null {
  const timestamps = values
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

export function getTemplatesForProduct(product: CanonicalProduct, templates: PricingTemplate[]): PricingTemplate[] {
  return productTemplates(product, templates);
}

export function buildProductCommercialSummary(
  product: CanonicalProduct,
  templates: PricingTemplate[]
): ProductCommercialSummary {
  const scoped = productTemplates(product, templates);
  const active = scoped.filter((template) => template.status === "active");
  const draft = scoped.filter((template) => template.status === "draft");
  const archived = scoped.filter((template) => template.status === "archived");
  const pendingReview = scoped.filter((template) => template.status === "draft" || template.status === "inactive");

  return {
    productKey: product.productKey,
    productName: product.productName,
    setupStatus: active.length > 0 ? "Instant Setup" : "Assisted Setup",
    activeTemplateCount: active.length,
    draftTemplateCount: draft.length,
    archivedTemplateCount: archived.length,
    countriesConfigured: unique(scoped.map((template) => template.country ?? "Global")),
    activeCommercialModels: unique(active.map((template) => commercialModelLabel(resolveCommercialModel(template.commercial_model)))),
    activePricingMethods: unique(active.map((template) => getPricingModelLabel(template.pricing_method))),
    activePricingMetrics: unique(active.map((template) => {
      const metric = product.supportedPricingMetrics.find((item) => item.value === template.pricing_metric);
      return metric?.label ?? String(template.pricing_metric);
    })),
    paymentMethods: unique(active.flatMap((template) => template.allowed_payment_methods ?? ["card", "bank_transfer"])),
    discountRules: "None",
    lastUpdated: latestDate(scoped.map((template) => template.updated_at ?? template.created_at)),
    lastPublished: latestDate(active.map((template) => template.activated_at)),
    totalQuotationsGenerated: 0,
    templatesPendingReview: pendingReview.length,
    hasActivePricing: active.length > 0,
  };
}

export function formatSummaryDate(value: string | null): string {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString();
}

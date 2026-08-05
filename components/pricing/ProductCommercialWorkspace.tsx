"use client";

import {
  Archive,
  ArrowLeft,
  Building2,
  ClipboardCheck,
  Copy,
  FileUp,
  HardHat,
  Loader2,
  MapPinned,
  PackageCheck,
  Plus,
  Settings,
  Store,
  Truck,
} from "lucide-react";
import { useState, type ComponentType } from "react";
import type { CanonicalProduct } from "@/lib/commercial/products/catalogue";
import type { PricingTemplate } from "@/lib/commercial/pricing/types";
import { commercialModelLabel, resolveCommercialModel } from "@/lib/commercial/pricing/commercialModel";
import { PricingTemplateCard } from "./PricingTemplateCard";
import {
  buildProductCommercialSummary,
  formatSummaryDate,
  getTemplatesForProduct,
} from "./productWorkspaceUtils";
import { getPricingModelLabel } from "./wizardUtils";

type LifecycleAction = "activate" | "deactivate" | "archive" | "clone";

type Props = {
  products: CanonicalProduct[];
  selectedProduct: CanonicalProduct | null;
  templates: PricingTemplate[];
  loading: boolean;
  actionLoading: string | null;
  onSelectProduct: (product: CanonicalProduct) => void;
  onBack: () => void;
  onCreateTemplate: (product: CanonicalProduct) => void;
  onEditTemplate: (template: PricingTemplate) => void;
  onCloneTemplate: (template: PricingTemplate) => void;
  onLifecycleAction: (id: string, action: LifecycleAction) => void;
};

const PRODUCT_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  retail: Store,
  build: HardHat,
  location_audit: MapPinned,
  assets_audit: PackageCheck,
  fleet: Truck,
  field_operations: ClipboardCheck,
};

function ProductIcon({ productKey, className = "h-5 w-5" }: { productKey: string; className?: string }) {
  const Icon = PRODUCT_ICONS[productKey] ?? Building2;
  return <Icon className={className} aria-hidden="true" />;
}

function joinOrDash(values: string[], fallback = "Not configured") {
  return values.length > 0 ? values.join(", ") : fallback;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

export function ProductCommercialWorkspace({
  products,
  selectedProduct,
  templates,
  loading,
  actionLoading,
  onSelectProduct,
  onBack,
  onCreateTemplate,
  onEditTemplate,
  onCloneTemplate,
  onLifecycleAction,
}: Props) {
  const [showArchived, setShowArchived] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center gap-2.5 py-12 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading product pricing…
      </div>
    );
  }

  if (!selectedProduct) {
    return (
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">Product commercial centre</h1>
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
              Admin
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Manage commercial readiness, pricing coverage and product-specific templates.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => {
            const summary = buildProductCommercialSummary(product, templates);
            return (
              <button
                key={product.productKey}
                type="button"
                onClick={() => onSelectProduct(product)}
                className="rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-orange-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-orange-300"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                    <ProductIcon productKey={product.productKey} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-bold text-slate-900">{product.productName}</h2>
                    <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      summary.hasActivePricing ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {summary.setupStatus}
                    </span>
                  </div>
                </div>
                <p className="mt-3 line-clamp-3 text-sm leading-5 text-slate-500">{product.description}</p>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Stat label="Active" value={summary.activeTemplateCount} />
                  <Stat label="Draft" value={summary.draftTemplateCount} />
                  <Stat label="Archived" value={summary.archivedTemplateCount} />
                </div>
                <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                  <p><span className="font-semibold text-slate-700">Countries:</span> {joinOrDash(summary.countriesConfigured)}</p>
                  <p><span className="font-semibold text-slate-700">Model:</span> {joinOrDash(summary.activeCommercialModels)}</p>
                  <p><span className="font-semibold text-slate-700">Pricing:</span> {joinOrDash(summary.activePricingMethods)}</p>
                  <p><span className="font-semibold text-slate-700">Updated:</span> {formatSummaryDate(summary.lastUpdated)}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const productTemplates = getTemplatesForProduct(selectedProduct, templates);
  const summary = buildProductCommercialSummary(selectedProduct, templates);
  const activeTemplate = productTemplates.find((template) => template.status === "active") ?? null;
  const visibleTemplates = productTemplates.filter((template) => showArchived || template.status !== "archived");
  const archivedTemplates = productTemplates.filter((template) => template.status === "archived");

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Products
      </button>

      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
            <ProductIcon productKey={selectedProduct.productKey} className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{selectedProduct.productName}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500">{selectedProduct.description}</p>
            <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
              summary.hasActivePricing ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}>
              {summary.setupStatus}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onCreateTemplate(selectedProduct)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700"
        >
          <Plus className="h-4 w-4" />
          Create Template
        </button>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Commercial Dashboard</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Active Template" value={activeTemplate?.name ?? "None"} />
          <Stat label="Countries" value={joinOrDash(summary.countriesConfigured)} />
          <Stat label="Commercial Model" value={joinOrDash(summary.activeCommercialModels)} />
          <Stat label="Pricing Method" value={joinOrDash(summary.activePricingMethods)} />
          <Stat label="Pricing Metric" value={joinOrDash(summary.activePricingMetrics)} />
          <Stat label="Payment Methods" value={joinOrDash(summary.paymentMethods)} />
          <Stat label="Discount Rules" value={summary.discountRules} />
          <Stat label="Last Published" value={formatSummaryDate(summary.lastPublished)} />
          <Stat label="Quotations" value={summary.totalQuotationsGenerated} />
          <Stat label="Pending Review" value={summary.templatesPendingReview} />
          <Stat label="Without Active Pricing" value={summary.hasActivePricing ? "No" : selectedProduct.productName} />
          <Stat label="Last Updated" value={formatSummaryDate(summary.lastUpdated)} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Templates</h2>
          {visibleTemplates.length > 0 ? (
            visibleTemplates.map((template) => (
              <PricingTemplateCard
                key={template.id ?? template.name}
                template={template}
                actionLoading={actionLoading}
                onEdit={onEditTemplate}
                onLifecycle={(id, action) => {
                  if (action === "clone") {
                    onCloneTemplate(template);
                    return;
                  }
                  onLifecycleAction(id, action);
                }}
              />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-10 text-center">
              <p className="text-sm font-semibold text-slate-600">No templates for this product</p>
              <button
                type="button"
                onClick={() => onCreateTemplate(selectedProduct)}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
              >
                <Plus className="h-4 w-4" />
                Create Template
              </button>
            </div>
          )}
        </div>

        <aside className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Actions</h2>
          <button
            type="button"
            onClick={() => onCreateTemplate(selectedProduct)}
            className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Create Template
          </button>
          <button
            type="button"
            disabled={productTemplates.length === 0}
            onClick={() => productTemplates[0] ? onCloneTemplate(productTemplates[0]) : undefined}
            className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Copy className="h-4 w-4" />
            Clone Template
          </button>
          <button
            type="button"
            disabled
            className="flex w-full cursor-not-allowed items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-400"
          >
            <FileUp className="h-4 w-4" />
            Import Template
          </button>
          <button
            type="button"
            disabled={archivedTemplates.length === 0}
            onClick={() => setShowArchived((value) => !value)}
            className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:opacity-60"
          >
            <Archive className="h-4 w-4" />
            {showArchived ? "Hide Archived" : "Archived Templates"}
          </button>
          <button
            type="button"
            disabled
            className="flex w-full cursor-not-allowed items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-400"
          >
            <Settings className="h-4 w-4" />
            Commercial Settings
          </button>
          {activeTemplate ? (
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs text-slate-500">
              <p className="font-semibold text-slate-700">{activeTemplate.name}</p>
              <p className="mt-1">{commercialModelLabel(resolveCommercialModel(activeTemplate.commercial_model))}</p>
              <p>{getPricingModelLabel(activeTemplate.pricing_method)}</p>
            </div>
          ) : null}
        </aside>
      </section>
    </div>
  );
}

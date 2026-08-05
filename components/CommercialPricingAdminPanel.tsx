"use client";

import { useCallback, useEffect, useState } from "react";
import type { PricingTemplate } from "@/lib/commercial/pricing/types";
import { getCanonicalProductCatalog, type CanonicalProduct } from "@/lib/commercial/products/catalogue";
import { resolveProductKey } from "@/lib/commercial/products/catalogue";
import { ProductCommercialWorkspace } from "./pricing/ProductCommercialWorkspace";
import { PricingWizard } from "./pricing/PricingWizard";
import { CloneTemplateDialog } from "./pricing/CloneTemplateDialog";

type View =
  | { type: "products"; selectedProductKey: string | null }
  | { type: "wizard"; template: PricingTemplate | null; isReadOnly: boolean; lockedProductKey: string };

export function CommercialPricingAdminPanel() {
  const products = getCanonicalProductCatalog();
  const [templates, setTemplates] = useState<PricingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [view, setView] = useState<View>({ type: "products", selectedProductKey: null });
  const [cloneSource, setCloneSource] = useState<PricingTemplate | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/commercial/pricing-templates");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load pricing templates.");
      setTemplates(payload.templates ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load pricing templates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadTemplates(); }, [loadTemplates]);

  async function handleLifecycleAction(
    templateId: string,
    action: "activate" | "deactivate" | "archive" | "clone",
    destinationProductKey?: string
  ) {
    setError(null);
    setSuccess(null);
    setActionLoading(`${templateId}:${action}`);
    try {
      const response = await fetch(
        `/api/admin/commercial/pricing-templates/${templateId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: action === "clone" ? JSON.stringify({ destinationProductKey }) : undefined,
        }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Unable to ${action} template.`);
      setSuccess(
        action === "clone"
          ? `Cloned as "${payload.template?.name ?? "new template"}".`
          : `Template ${action}d successfully.`
      );
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to ${action} template.`);
    } finally {
      setActionLoading(null);
    }
  }

  function handleNewTemplate(product: CanonicalProduct) {
    setError(null);
    setSuccess(null);
    setView({ type: "wizard", template: null, isReadOnly: false, lockedProductKey: product.productKey });
  }

  function handleEditTemplate(template: PricingTemplate) {
    setError(null);
    setSuccess(null);
    const isReadOnly = template.status === "active" || template.status === "archived";
    setView({ type: "wizard", template, isReadOnly, lockedProductKey: resolveProductKey(template.product_key) });
  }

  function handleWizardClose(reload?: boolean) {
    setView((current) => ({
      type: "products",
      selectedProductKey: current.type === "wizard" ? current.lockedProductKey : null,
    }));
    if (reload) {
      setSuccess("Template saved successfully.");
      void loadTemplates();
    }
  }

  async function handleCloneConfirm(destinationProductKey: string) {
    if (!cloneSource?.id) return;
    await handleLifecycleAction(cloneSource.id, "clone", destinationProductKey);
    setCloneSource(null);
  }

  if (view.type === "wizard") {
    return (
      <PricingWizard
        initialTemplate={view.template}
        isReadOnly={view.isReadOnly}
        lockedProductKey={view.lockedProductKey}
        onClose={handleWizardClose}
      />
    );
  }

  const selectedProduct = view.selectedProductKey
    ? products.find((product) => product.productKey === view.selectedProductKey) ?? null
    : null;

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
          {success}
        </div>
      ) : null}
      <ProductCommercialWorkspace
        products={products}
        selectedProduct={selectedProduct}
        templates={templates}
        loading={loading}
        actionLoading={actionLoading}
        onSelectProduct={(product) => setView({ type: "products", selectedProductKey: product.productKey })}
        onBack={() => setView({ type: "products", selectedProductKey: null })}
        onCreateTemplate={handleNewTemplate}
        onEditTemplate={handleEditTemplate}
        onCloneTemplate={setCloneSource}
        onLifecycleAction={handleLifecycleAction}
      />
      {cloneSource ? (
        <CloneTemplateDialog
          sourceTemplate={cloneSource}
          products={products}
          actionLoading={actionLoading}
          onCancel={() => setCloneSource(null)}
          onConfirm={handleCloneConfirm}
        />
      ) : null}
    </div>
  );
}

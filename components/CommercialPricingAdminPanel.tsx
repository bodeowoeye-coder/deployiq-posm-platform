"use client";

import { useCallback, useEffect, useState } from "react";
import type { PricingTemplate } from "@/lib/commercial/pricing/types";
import { PricingTemplateLibrary } from "./pricing/PricingTemplateLibrary";
import { PricingWizard } from "./pricing/PricingWizard";

type View =
  | { type: "library" }
  | { type: "wizard"; template: PricingTemplate | null; isReadOnly: boolean };

export function CommercialPricingAdminPanel() {
  const [templates, setTemplates] = useState<PricingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [view, setView] = useState<View>({ type: "library" });

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
    action: "activate" | "deactivate" | "archive" | "clone"
  ) {
    setError(null);
    setSuccess(null);
    setActionLoading(`${templateId}:${action}`);
    try {
      const response = await fetch(
        `/api/admin/commercial/pricing-templates/${templateId}/${action}`,
        { method: "POST", headers: { "Content-Type": "application/json" } }
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

  function handleNewTemplate() {
    setError(null);
    setSuccess(null);
    setView({ type: "wizard", template: null, isReadOnly: false });
  }

  function handleEditTemplate(template: PricingTemplate) {
    setError(null);
    setSuccess(null);
    const isReadOnly = template.status === "active" || template.status === "archived";
    setView({ type: "wizard", template, isReadOnly });
  }

  function handleWizardClose(reload?: boolean) {
    setView({ type: "library" });
    if (reload) {
      setSuccess("Template saved successfully.");
      void loadTemplates();
    }
  }

  if (view.type === "wizard") {
    return (
      <PricingWizard
        initialTemplate={view.template}
        isReadOnly={view.isReadOnly}
        onClose={handleWizardClose}
      />
    );
  }

  return (
    <PricingTemplateLibrary
      templates={templates}
      loading={loading}
      error={error}
      success={success}
      actionLoading={actionLoading}
      onNewTemplate={handleNewTemplate}
      onEditTemplate={handleEditTemplate}
      onLifecycleAction={handleLifecycleAction}
    />
  );
}

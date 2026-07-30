"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2, Plus, Sparkles } from "lucide-react";
import type { PricingTemplate } from "@/lib/commercial/pricing/types";

const EMPTY_TIERS = [{ sequence: 1, minimumQuantity: 1, maximumQuantity: 5000, unitPrice: 500, fixedCharge: 0, enterpriseAction: null }];

type FormState = {
  name: string;
  description: string;
  productKey: string;
  currency: string;
  country: string;
  region: string;
  customerSegment: string;
  campaignType: string;
  pricingMetric: string;
  pricingMethod: string;
  status: string;
  isDefault: boolean;
  quotationValidityDays: string;
  tiers: Array<{
    sequence: number;
    minimumQuantity: number;
    maximumQuantity: number | null;
    unitPrice: number;
    fixedCharge: number;
    enterpriseAction: string | null;
  }>;
};

function createDefaultState(): FormState {
  return {
    name: "",
    description: "",
    productKey: "retail",
    currency: "NGN",
    country: "Nigeria",
    region: "",
    customerSegment: "",
    campaignType: "",
    pricingMetric: "deployment_location",
    pricingMethod: "progressive_tiered",
    status: "draft",
    isDefault: false,
    quotationValidityDays: "14",
    tiers: EMPTY_TIERS.map((tier) => ({ ...tier }))
  };
}

export function CommercialPricingAdminPanel() {
  const [templates, setTemplates] = useState<PricingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(createDefaultState());
  const [quantity, setQuantity] = useState("1000");
  const [preview, setPreview] = useState<null | { total: number; includedAdminUsers: number; quotationStatus: string }>(null);

  useEffect(() => {
    void loadTemplates();
  }, []);

  async function loadTemplates() {
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
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/admin/commercial/pricing-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          quotationValidityDays: form.quotationValidityDays ? Number(form.quotationValidityDays) : null,
          tiers: form.tiers.map((tier) => ({
            sequence: tier.sequence,
            minimumQuantity: tier.minimumQuantity,
            maximumQuantity: tier.maximumQuantity,
            unitPrice: tier.unitPrice,
            fixedCharge: tier.fixedCharge,
            enterpriseAction: tier.enterpriseAction
          }))
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save pricing template.");
      setSuccess(`Saved ${payload.template?.name ?? "pricing template"}.`);
      setForm(createDefaultState());
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save pricing template.");
    } finally {
      setSaving(false);
    }
  }

  const previewSummary = useMemo(() => {
    if (!preview) return null;
    return { total: preview.total.toLocaleString("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }), includedAdminUsers: preview.includedAdminUsers, quotationStatus: preview.quotationStatus };
  }, [preview]);

  async function handlePreview() {
    const parsed = Number(quantity);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter a positive quantity to preview pricing.");
      return;
    }
    try {
      const response = await fetch("/api/admin/commercial/pricing-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pricingTemplateId: templates[0]?.id, quantity: parsed })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to preview pricing.");
      setPreview({ total: payload.result.total, includedAdminUsers: payload.result.included_admin_users, quotationStatus: payload.result.quotation_status });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to preview pricing.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold leading-snug">Commercial pricing templates</h2>
            <p className="mt-2 text-sm leading-snug text-slate-600">Create and maintain platform-wide pricing templates for onboarding and future commercial products.</p>
          </div>
          <div className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-orange-700">Admin only</div>
        </div>

        {error ? <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
        {success ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}

        {loading ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading templates…</div>
        ) : (
          <div className="mt-5 space-y-3">
            {templates.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-600">No pricing templates yet.</div> : null}
            {templates.map((template) => (
              <div key={template.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-900">{template.name}</div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{template.product_key} • {template.currency} • {template.status}</div>
                  </div>
                  <div className="text-right text-sm text-slate-600">
                    <div>{template.tiers.length} tiers</div>
                    <div>{template.is_default ? "Default" : "Not default"}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-orange-500" />
          <h2 className="text-base font-bold leading-snug">Create template</h2>
        </div>
        <form className="mt-4 space-y-4" onSubmit={handleCreate}>
          <div className="grid gap-3">
            <input className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Template name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
            <textarea className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Product key" value={form.productKey} onChange={(event) => setForm((current) => ({ ...current, productKey: event.target.value }))} required />
              <input className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Currency" value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))} required />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Country" value={form.country} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} />
              <input className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Region" value={form.region} onChange={(event) => setForm((current) => ({ ...current, region: event.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Customer segment" value={form.customerSegment} onChange={(event) => setForm((current) => ({ ...current, customerSegment: event.target.value }))} />
              <input className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Campaign type" value={form.campaignType} onChange={(event) => setForm((current) => ({ ...current, campaignType: event.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Quotation validity days" value={form.quotationValidityDays} onChange={(event) => setForm((current) => ({ ...current, quotationValidityDays: event.target.value }))} />
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-700">
                <input type="checkbox" checked={form.isDefault} onChange={(event) => setForm((current) => ({ ...current, isDefault: event.target.checked }))} />
                Set as default
              </label>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">Tiers</div>
              <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm" onClick={() => setForm((current) => ({ ...current, tiers: [...current.tiers, { sequence: current.tiers.length + 1, minimumQuantity: 1, maximumQuantity: null, unitPrice: 0, fixedCharge: 0, enterpriseAction: null }] }))}>
                <Plus className="h-4 w-4" />Add tier
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {form.tiers.map((tier, index) => (
                <div key={`${tier.sequence}-${index}`} className="grid gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-2">
                  <input className="min-h-10 rounded border border-slate-200 px-2 text-sm" placeholder="Sequence" type="number" value={tier.sequence} onChange={(event) => setForm((current) => ({ ...current, tiers: current.tiers.map((entry, entryIndex) => entryIndex === index ? { ...entry, sequence: Number(event.target.value) } : entry) }))} />
                  <input className="min-h-10 rounded border border-slate-200 px-2 text-sm" placeholder="Min quantity" type="number" value={tier.minimumQuantity} onChange={(event) => setForm((current) => ({ ...current, tiers: current.tiers.map((entry, entryIndex) => entryIndex === index ? { ...entry, minimumQuantity: Number(event.target.value) } : entry) }))} />
                  <input className="min-h-10 rounded border border-slate-200 px-2 text-sm" placeholder="Max quantity" type="number" value={tier.maximumQuantity ?? ""} onChange={(event) => setForm((current) => ({ ...current, tiers: current.tiers.map((entry, entryIndex) => entryIndex === index ? { ...entry, maximumQuantity: event.target.value ? Number(event.target.value) : null } : entry) }))} />
                  <input className="min-h-10 rounded border border-slate-200 px-2 text-sm" placeholder="Unit price" type="number" value={tier.unitPrice} onChange={(event) => setForm((current) => ({ ...current, tiers: current.tiers.map((entry, entryIndex) => entryIndex === index ? { ...entry, unitPrice: Number(event.target.value) } : entry) }))} />
                </div>
              ))}
            </div>
          </div>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={saving}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : "Save template"}
          </button>
        </form>

        <div className="mt-6 rounded-lg border border-slate-200 p-3">
          <div className="text-sm font-semibold">Preview calculation</div>
          <div className="mt-3 flex gap-2">
            <input className="min-h-11 flex-1 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Quantity" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            <button type="button" className="inline-flex min-h-11 items-center rounded-lg bg-orange-500 px-3 text-sm font-semibold text-white" onClick={() => { void handlePreview(); }}>
              Preview
            </button>
          </div>
          {previewSummary ? <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><div>Total: {previewSummary.total}</div><div>Included admin users: {previewSummary.includedAdminUsers}</div><div>Status: {previewSummary.quotationStatus}</div></div> : null}
        </div>
      </div>
    </div>
  );
}

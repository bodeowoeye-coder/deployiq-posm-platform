"use client";

import { useState } from "react";
import { Copy, Loader2, X } from "lucide-react";
import type { CanonicalProduct } from "@/lib/commercial/products/catalogue";
import { resolveProductKey } from "@/lib/commercial/products/catalogue";
import type { PricingTemplate } from "@/lib/commercial/pricing/types";

type Props = {
  sourceTemplate: PricingTemplate;
  products: CanonicalProduct[];
  actionLoading: string | null;
  onCancel: () => void;
  onConfirm: (destinationProductKey: string) => Promise<void>;
};

export function CloneTemplateDialog({
  sourceTemplate,
  products,
  actionLoading,
  onCancel,
  onConfirm,
}: Props) {
  const sourceProductKey = resolveProductKey(sourceTemplate.product_key);
  const [destinationProductKey, setDestinationProductKey] = useState<string>(sourceProductKey);
  const loading = actionLoading === `${sourceTemplate.id}:clone`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="Clone pricing template">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Clone Template</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">{sourceTemplate.name}</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close clone dialog"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label htmlFor="clone-destination-product" className="mt-5 block text-sm font-semibold text-slate-700">
          Destination product
        </label>
        <select
          id="clone-destination-product"
          value={destinationProductKey}
          onChange={(event) => setDestinationProductKey(event.target.value)}
          className="mt-2 block w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
        >
          {products.map((product) => (
            <option key={product.productKey} value={product.productKey}>
              {product.productName}
            </option>
          ))}
        </select>

        <p className="mt-3 text-xs leading-5 text-slate-500">
          The copy will become a draft owned by the selected product. Unsupported metrics and default status are reset.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onConfirm(destinationProductKey)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            Clone
          </button>
        </div>
      </div>
    </div>
  );
}

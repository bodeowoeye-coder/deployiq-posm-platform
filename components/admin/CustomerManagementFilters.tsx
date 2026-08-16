"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Facets = {
  products: string[];
  plans: string[];
  workspaceStatuses: string[];
  provisioningStatuses: string[];
};

type FilterState = {
  search: string;
  product: string;
  plan: string;
  workspaceStatus: string;
  provisioningStatus: string;
};

export function CustomerManagementFilters({ facets, initial, basePath = "/admin/customers" }: { facets: Facets; initial: FilterState; basePath?: string }) {
  const router = useRouter();
  const [filters, setFilters] = useState<FilterState>(initial);

  function apply(next: FilterState) {
    setFilters(next);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
    }
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  function selectClass() {
    return "min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-200";
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <form
        className="grid gap-3 md:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          apply(filters);
        }}
      >
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Search
          <input
            className={selectClass()}
            placeholder="Organisation, customer ID, workspace URL or administrator email"
            value={filters.search}
            onChange={(event) => setFilters({ ...filters, search: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Product
          <select className={selectClass()} value={filters.product} onChange={(event) => apply({ ...filters, product: event.target.value })}>
            <option value="">All</option>
            {facets.products.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Plan
          <select className={selectClass()} value={filters.plan} onChange={(event) => apply({ ...filters, plan: event.target.value })}>
            <option value="">All</option>
            {facets.plans.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Workspace
          <select className={selectClass()} value={filters.workspaceStatus} onChange={(event) => apply({ ...filters, workspaceStatus: event.target.value })}>
            <option value="">All</option>
            {facets.workspaceStatuses.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Provisioning
          <select className={selectClass()} value={filters.provisioningStatus} onChange={(event) => apply({ ...filters, provisioningStatus: event.target.value })}>
            <option value="">All</option>
            {facets.provisioningStatuses.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="inline-flex min-h-10 items-center rounded-lg bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800">Search</button>
          <button
            type="button"
            onClick={() => apply({ search: "", product: "", plan: "", workspaceStatus: "", provisioningStatus: "" })}
            className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:border-orange-300 hover:bg-orange-50"
          >
            Reset
          </button>
        </div>
      </form>
    </section>
  );
}

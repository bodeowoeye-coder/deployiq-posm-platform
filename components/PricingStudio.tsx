"use client";

import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { CommercialPricingAdminPanel } from "./CommercialPricingAdminPanel";

type Props = {
  currentUserEmail: string | null;
};

export function PricingStudio({ currentUserEmail }: Props) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Sticky studio header ── */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          {/* Breadcrumb nav */}
          <nav className="flex min-w-0 items-center gap-1.5 text-sm" aria-label="Breadcrumb">
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-300"
            >
              <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Admin Dashboard</span>
              <span className="sm:hidden">Admin</span>
            </Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden="true" />
            <span className="hidden text-slate-400 sm:inline">Commercial</span>
            <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-slate-300 sm:block" aria-hidden="true" />
            <span className="font-semibold text-slate-900" aria-current="page">
              Pricing Studio
            </span>
          </nav>

          {/* Right: role badge + email */}
          <div className="flex shrink-0 items-center gap-2.5">
            {currentUserEmail ? (
              <span className="hidden text-xs text-slate-400 lg:block truncate max-w-[180px]">
                {currentUserEmail}
              </span>
            ) : null}
            <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700">
              Platform Admin
            </span>
          </div>
        </div>
      </header>

      {/* ── Main workspace ── */}
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <CommercialPricingAdminPanel />
      </main>
    </div>
  );
}

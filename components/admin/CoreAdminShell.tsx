"use client";

import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { DashboardSidebar, type DashboardView } from "@/components/DashboardSidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { ThemeToggle } from "@/components/ThemeToggle";

// Core Admin chrome for route-based admin modules that do not go through AdminRoutePage.
export function CoreAdminShell({ children, activeView = "clients" }: { children: React.ReactNode; activeView?: DashboardView }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-[min(1380px,calc(100%-28px))] items-center justify-between gap-4 py-3">
          <Link href="/admin" className="flex items-center gap-3">
            <BrandMark compact />
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600">Core Admin</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto flex min-w-0 w-[min(1380px,calc(100%-28px))] flex-col gap-4 py-4 lg:flex-row lg:items-start lg:py-6">
        <DashboardSidebar audience="admin" activeView={activeView} />
        <section className="min-w-0 flex-1">{children}</section>
      </div>
    </div>
  );
}

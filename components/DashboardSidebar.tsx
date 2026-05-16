"use client";

import { LayoutDashboard, MapPinned, Menu, Settings2, Table2, X } from "lucide-react";
import { useState } from "react";
import { SignOutButton } from "@/components/SignOutButton";

type NavItem = {
  href: string;
  view: DashboardView;
  label: string;
  icon: typeof LayoutDashboard;
};

export type DashboardView = "overview" | "reports" | "map" | "analytics" | "exports" | "profile";

const adminItems: NavItem[] = [
  { href: "#overview", view: "overview", label: "Executive Dashboard", icon: LayoutDashboard },
  { href: "#reports", view: "reports", label: "Deployment Reports", icon: Table2 },
  { href: "#map", view: "map", label: "Deployment Map", icon: MapPinned },
  { href: "#profile", view: "profile", label: "Settings/Profile", icon: Settings2 }
];

const clientItems: NavItem[] = [
  { href: "#overview", view: "overview", label: "Executive Dashboard", icon: LayoutDashboard },
  { href: "#reports", view: "reports", label: "Deployment Reports", icon: Table2 },
  { href: "#map", view: "map", label: "Deployment Map", icon: MapPinned },
  { href: "#profile", view: "profile", label: "Account", icon: Settings2 }
];

export function DashboardSidebar({
  audience,
  activeView,
  onSelectView
}: {
  audience: "admin" | "client";
  activeView?: DashboardView;
  onSelectView?: (view: DashboardView) => void;
}) {
  const [open, setOpen] = useState(false);
  const items = audience === "admin" ? adminItems : clientItems;

  return (
    <>
      <button
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold transition hover:border-orange-200 hover:bg-orange-50 lg:hidden"
        type="button"
        onClick={() => setOpen(true)}
      >
        <Menu aria-hidden size={16} />
        Menu
      </button>

      {open ? <button className="fixed inset-0 z-30 bg-slate-950/35 lg:hidden" aria-label="Close navigation" onClick={() => setOpen(false)} /> : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[min(280px,calc(100%-48px))] min-w-0 flex-col border-r border-slate-200 bg-white p-4 shadow-xl transition-transform lg:sticky lg:top-24 lg:z-0 lg:h-[calc(100vh-7rem)] lg:w-52 lg:translate-x-0 lg:rounded-lg lg:border lg:shadow-sm ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-4 flex items-center justify-between gap-2 lg:hidden">
          <span className="text-sm font-bold">Navigation</span>
          <button className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200" aria-label="Close navigation" onClick={() => setOpen(false)}>
            <X aria-hidden size={16} />
          </button>
        </div>

        <nav className="grid gap-2">
          {items.map(({ href, view, label, icon: Icon }) =>
            onSelectView ? (
              <button
                key={href}
                type="button"
                onClick={() => {
                  onSelectView(view);
                  setOpen(false);
                }}
                className={`flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition hover:bg-orange-50 hover:text-slate-950 ${
                  activeView === view ? "bg-orange-50 text-slate-950" : "text-slate-700"
                }`}
              >
                <Icon aria-hidden size={17} className="shrink-0 text-orange-500" />
                <span className="min-w-0 whitespace-normal break-words leading-snug">{label}</span>
              </button>
            ) : (
              <a
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-orange-50 hover:text-slate-950"
              >
                <Icon aria-hidden size={17} className="shrink-0 text-orange-500" />
                <span className="min-w-0 whitespace-normal break-words leading-snug">{label}</span>
              </a>
            )
          )}
        </nav>

        <div className="mt-auto border-t border-slate-200 pt-4">
          <SignOutButton />
        </div>
      </aside>
    </>
  );
}

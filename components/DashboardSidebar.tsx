"use client";

import {
  Bell,
  BriefcaseBusiness,
  ChevronDown,
  CircleUserRound,
  LayoutDashboard,
  MapPinned,
  Menu,
  Settings2,
  Table2,
  UsersRound,
  X
} from "lucide-react";
import { useState } from "react";
import { SignOutButton } from "@/components/SignOutButton";

type NavItem = {
  view: DashboardView;
  label: string;
  icon: typeof LayoutDashboard;
};

export type DashboardView =
  | "dashboard"
  | "deployments"
  | "analytics"
  | "reports"
  | "alerts"
  | "clients"
  | "installers"
  | "map"
  | "profile"
  | "create-project"
  | "campaigns"
  | "installer-portal"
  | "user-management"
  | "agencies"
  | "regions"
  | "preferences"
  | "audit-logs"
  | "overview";

const adminPrimaryItems: NavItem[] = [
  { view: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { view: "deployments", label: "Deployments", icon: MapPinned },
  { view: "analytics", label: "Analytics", icon: BriefcaseBusiness },
  { view: "reports", label: "Reports", icon: Table2 },
  { view: "alerts", label: "Alerts", icon: Bell },
  { view: "clients", label: "Clients", icon: UsersRound },
  { view: "installers", label: "Installers", icon: CircleUserRound }
];

const adminSettingsItems: NavItem[] = [
  { view: "profile", label: "Profile", icon: CircleUserRound },
  { view: "create-project", label: "Create Project", icon: BriefcaseBusiness },
  { view: "campaigns", label: "Campaign Management", icon: Table2 },
  { view: "installer-portal", label: "Installer Portal", icon: MapPinned },
  { view: "user-management", label: "User Management", icon: UsersRound },
  { view: "agencies", label: "Agencies", icon: UsersRound },
  { view: "regions", label: "Regions & Territories", icon: MapPinned },
  { view: "preferences", label: "System Preferences", icon: Settings2 },
  { view: "audit-logs", label: "Audit Logs", icon: Table2 }
];

const clientItems: NavItem[] = [
  { view: "overview", label: "Executive Dashboard", icon: LayoutDashboard },
  { view: "reports", label: "Deployment Reports", icon: Table2 },
  { view: "map", label: "Deployment Map", icon: MapPinned },
  { view: "profile", label: "Account", icon: Settings2 }
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
  const [settingsOpen, setSettingsOpen] = useState(
    Boolean(activeView && adminSettingsItems.some((item) => item.view === activeView))
  );
  const items = audience === "admin" ? adminPrimaryItems : clientItems;

  function renderItem({ view, label, icon: Icon }: NavItem) {
    return (
      <button
        key={view}
        type="button"
        onClick={() => {
          onSelectView?.(view);
          setOpen(false);
        }}
        className={`flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition hover:bg-orange-50 hover:text-slate-950 ${
          activeView === view ? "bg-white text-slate-950 shadow-sm" : "text-slate-700"
        }`}
      >
        <Icon aria-hidden size={17} className="shrink-0 text-orange-500" />
        <span className="min-w-0 whitespace-normal break-words leading-snug">{label}</span>
      </button>
    );
  }

  return (
    <>
      <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold transition hover:border-orange-200 hover:bg-orange-50 lg:hidden" type="button" onClick={() => setOpen(true)}>
        <Menu aria-hidden size={16} />
        Menu
      </button>

      {open ? <button className="fixed inset-0 z-30 bg-slate-950/35 lg:hidden" aria-label="Close navigation" onClick={() => setOpen(false)} /> : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[min(300px,calc(100%-48px))] min-w-0 flex-col border-r border-slate-200 bg-slate-100 p-4 shadow-xl transition-transform lg:sticky lg:top-24 lg:z-0 lg:h-[calc(100vh-7rem)] lg:w-60 lg:translate-x-0 lg:rounded-lg lg:border lg:border-slate-200 lg:bg-slate-100 lg:shadow-sm ${
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
          {items.map(renderItem)}
          {audience === "admin" ? (
            <div className="mt-3 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => setSettingsOpen((current) => !current)}
                className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-orange-50"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Settings2 aria-hidden size={17} className="shrink-0 text-orange-500" />
                  <span className="min-w-0 whitespace-normal break-words leading-snug">Account Settings</span>
                </span>
                <ChevronDown aria-hidden size={16} className={`shrink-0 transition ${settingsOpen ? "rotate-180" : ""}`} />
              </button>
              {settingsOpen ? <div className="mt-2 grid gap-1 pl-2">{adminSettingsItems.map(renderItem)}</div> : null}
            </div>
          ) : null}
        </nav>

        <div className="mt-auto border-t border-slate-200 pt-4">
          <SignOutButton />
        </div>
      </aside>
    </>
  );
}

"use client";

import {
  BriefcaseBusiness,
  LayoutDashboard,
  MapPinned,
  Menu,
  Settings2,
  UsersRound,
  X,
  FileText
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SignOutButton } from "@/components/SignOutButton";

type NavItem = {
  view: DashboardView;
  label: string;
  icon: typeof LayoutDashboard;
  href?: string;
  status?: "ready" | "coming-soon";
  // Real Next.js routes must navigate. Only the dashboard host swaps views via history.pushState.
  routeNavigation?: boolean;
};

export type DashboardView =
  | "dashboard"
  | "deployments"
  | "analytics"
  | "reports"
  | "submissions"
  | "alerts"
  | "clients"
  | "customer-360"
  | "workspaces"
  | "installers"
  | "map"
  | "profile"
  | "create-project"
  | "campaigns"
  | "outlet-directory"
  | "user-management"
  | "agencies"
  | "regions"
  | "preferences"
  | "demo-data"
  | "audit-logs"
  | "commercial-pricing"
  | "overview";

// Core Admin is the DeployIQ platform-owner control plane. Customer operational modules
// (reports, submissions, map, analytics, alerts, installers) live in Customer Workspace and are
// reachable per customer through Customer Management -> Customer 360. Their views and routes are
// retained inside AdminDashboard; only the global navigation entries were removed.
const adminPrimaryItems: NavItem[] = [
  { view: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/admin", routeNavigation: true },
  { view: "clients", label: "Customer Management", icon: UsersRound, href: "/admin/customers", routeNavigation: true },
  { view: "customer-360", label: "Customer 360", icon: BriefcaseBusiness, href: "/admin/customer-360", routeNavigation: true },
  { view: "workspaces", label: "Workspaces", icon: MapPinned, href: "/admin/workspaces", routeNavigation: true },
  { view: "commercial-pricing", label: "Commercial & Pricing", icon: Settings2, href: "/admin/commercial/pricing", routeNavigation: true }
];

const clientItems: NavItem[] = [
  { view: "overview", label: "Executive Dashboard", icon: LayoutDashboard, href: "/client" },
  { view: "reports", label: "Deployment Reports", icon: FileText, href: "/client/reports" },
  { view: "map", label: "Deployment Map", icon: MapPinned, href: "/client/map" },
  { view: "analytics", label: "Analytics", icon: BriefcaseBusiness, href: "/client/analytics" },
  { view: "profile", label: "Account", icon: Settings2, href: "/client/account" }
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
  const [optimisticPathname, setOptimisticPathname] = useState("");
  const [open, setOpen] = useState(false);
  const items = audience === "admin" ? adminPrimaryItems : clientItems;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updatePathname = () => setOptimisticPathname(window.location.pathname);
    updatePathname();
    window.addEventListener("popstate", updatePathname);

    return () => {
      window.removeEventListener("popstate", updatePathname);
    };
  }, []);

  function renderItem({ view, label, icon: Icon, href, status = "ready", routeNavigation = false }: NavItem, variant: "primary" | "submenu" = "primary") {
    const activePathname = optimisticPathname;
    const isRootRoute = href === "/admin" || href === "/client";
    const isRouteActive = href ? (isRootRoute ? activePathname === href : activePathname === href || activePathname.startsWith(`${href}/`)) : false;
    const isActive = audience === "admin" && activeView ? activeView === view : isRouteActive || (!href && activeView === view);
    const isSubmenu = variant === "submenu";
    const className = `group flex w-full items-center gap-3 rounded-lg text-left text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-orange-300 ${
      isSubmenu ? "min-h-9 px-3" : "min-h-10 px-3"
    } ${
      isActive
        ? "bg-white text-orange-700 shadow-sm ring-1 ring-orange-200"
        : "text-slate-700 hover:bg-white/80 hover:text-slate-950"
    }`;
    const content = (
      <>
        <Icon aria-hidden size={isSubmenu ? 16 : 18} className={`shrink-0 ${isActive ? "text-orange-600" : "text-slate-500 group-hover:text-orange-600"}`} />
        <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">{label}</span>
        {status === "coming-soon" ? (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${isActive ? "bg-orange-100 text-orange-700" : "bg-slate-200 text-slate-600"}`}>
            Soon
          </span>
        ) : null}
      </>
    );

    if (href) {
      return (
        <Link
          key={`${label}-${view}`}
          href={href}
          prefetch
          className={className}
          onClick={(event) => {
            setOptimisticPathname(href);
            if (routeNavigation) {
              setOpen(false);
              return;
            }
            onSelectView?.(view);
            if (audience === "admin" && onSelectView) {
              event.preventDefault();
              window.history.pushState(null, "", href);
              window.dispatchEvent(new PopStateEvent("popstate"));
            }
            setOpen(false);
          }}
        >
          {content}
        </Link>
      );
    }

    // View-only items are inert without a view handler, so route-based admin shells send them
    // back to the dashboard that owns those views instead of rendering a dead control.
    if (!onSelectView && audience === "admin") {
      return (
        <Link key={`${label}-${view}`} href="/admin" prefetch className={className} onClick={() => setOpen(false)}>
          {content}
        </Link>
      );
    }

    return (
      <button
        key={`${label}-${view}`}
        type="button"
        onClick={() => {
          onSelectView?.(view);
          setOpen(false);
        }}
        className={className}
      >
        {content}
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
        className={`fixed inset-y-0 left-0 z-40 w-full transform transition lg:relative lg:translate-x-0 lg:w-72 lg:flex-none ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="deployiq-nav-surface flex h-full min-h-0 w-full flex-col border-r p-4 text-slate-950 lg:h-[calc(100vh-4rem)] lg:rounded-lg lg:border lg:shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-2 lg:hidden">
          <span className="text-sm font-bold">Navigation</span>
          <button className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200" aria-label="Close navigation" onClick={() => setOpen(false)}>
            <X aria-hidden size={16} />
          </button>
        </div>

        <nav className="mt-4 grid gap-2">
          {items.map((item) => renderItem(item))}
        </nav>

        {audience === "client" ? (
          <div className="mt-auto border-t border-slate-200 pt-4">
            <div className="px-1">
              <SignOutButton className="w-full" />
            </div>
          </div>
        ) : null}
        </div>
      </aside>
    </>
  );
}

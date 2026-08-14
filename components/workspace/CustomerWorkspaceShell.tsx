"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { ChevronDown, CircleHelp, Moon, Search, Settings, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { NotificationCenter } from "@/components/NotificationCenter";
import { SignOutButton } from "@/components/SignOutButton";
import { applyCustomerWorkspaceAppearance, readCustomerWorkspaceAppearance, writeCustomerWorkspaceAppearance } from "@/components/workspace/WorkspaceSettingsClient";
import { CUSTOMER_ADMIN_ACCOUNT_SETTINGS_NAV_ITEMS } from "@/lib/workspace/customerAdminFoundation";
import type { CustomerWorkspaceContext } from "@/lib/workspace/customerAdmin";

type Props = {
  workspace: CustomerWorkspaceContext;
  children: React.ReactNode;
};

const SECTION_DESCRIPTIONS: Record<string, string> = {
  "Home / Dashboard": "Monitor workspace operations and current deployment activity.",
  "Deployment Reports": "Review tenant reports and export operational summaries.",
  Submissions: "Review deployment submissions and field evidence.",
  "Deployment Map": "View tenant-scoped deployment coverage.",
  Analytics: "Review tenant-scoped project, location and deployment analytics.",
  Alerts: "Review tenant-scoped project and deployment exceptions.",
  Installers: "Review installer performance, accuracy and operational workload.",
  Notifications: "Review workspace updates and alerts.",
};

const ACCOUNT_SECTION_DESCRIPTIONS: Record<string, string> = {
  Profile: "Manage your workspace profile and account details.",
  "Create Project": "Create a tenant-scoped draft project.",
  "Campaign Management": "Manage campaign metadata and project lifecycle settings.",
  "Outlet Directory": "Manage your approved outlet directory.",
  "User Management": "Manage workspace members, roles and assignments.",
  Agencies: "Manage agency records and resource planning.",
  "Workspace Settings": "Manage workspace preferences, access and branding.",
  "Billing & Plan": "Review your active subscription and product entitlement.",
  "Audit Logs": "Review workspace configuration activity.",
};

type EffectiveTheme = "light" | "dark";

type WorkspaceSearchResult = {
  group: string;
  label: string;
  sublabel?: string;
  href: string;
};

function normalizePath(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/workspace/admin";
}

function currentNavItem(pathname: string, navigation: CustomerWorkspaceContext["navigation"]) {
  const normalized = normalizePath(pathname);
  return [...navigation]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => normalized === item.href || normalized.startsWith(`${item.href}/`));
}

function currentAccountItem(pathname: string) {
  const normalized = normalizePath(pathname);
  const configuredItem = [...CUSTOMER_ADMIN_ACCOUNT_SETTINGS_NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => normalized === item.href || normalized.startsWith(`${item.href}/`));
  if (configuredItem) return configuredItem;
  if (/^\/workspace\/admin\/projects\/[^/]+\/edit$/.test(normalized)) {
    return CUSTOMER_ADMIN_ACCOUNT_SETTINGS_NAV_ITEMS.find((item) => item.label === "Campaign Management");
  }
  if (normalized === "/workspace/admin/projects" || normalized.startsWith("/workspace/admin/projects/")) {
    return { label: "Create Project", href: "/workspace/admin/projects", status: "available" } as const;
  }
  return undefined;
}

function resolveEffectiveTheme(themePreference: string): EffectiveTheme {
  if (themePreference === "dark") return "dark";
  if (themePreference === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function CustomerWorkspaceShell({ workspace, children }: Props) {
  const pathname = usePathname();
  const [quickTheme, setQuickTheme] = useState<EffectiveTheme>("light");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<WorkspaceSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const activeItem = useMemo(() => currentNavItem(pathname, workspace.navigation), [pathname, workspace.navigation]);
  const activeAccountItem = useMemo(() => currentAccountItem(pathname), [pathname]);
  const sectionLabel = activeAccountItem?.label ?? activeItem?.label ?? "Customer Workspace";
  const sectionDescription = activeAccountItem
    ? ACCOUNT_SECTION_DESCRIPTIONS[activeAccountItem.label] ?? "Manage this Customer Workspace configuration area."
    : activeItem ? SECTION_DESCRIPTIONS[activeItem.label] ?? "Manage this Customer Workspace module." : "Manage this Customer Workspace configuration area.";
  const groupedSearchResults = useMemo(() => searchResults.reduce<Record<string, WorkspaceSearchResult[]>>((groups, result) => {
    groups[result.group] = [...(groups[result.group] ?? []), result];
    return groups;
  }, {}), [searchResults]);

  useLayoutEffect(() => {
    const appearance = readCustomerWorkspaceAppearance(workspace.userId);
    applyCustomerWorkspaceAppearance(appearance);
    setQuickTheme(resolveEffectiveTheme(appearance.themePreference));
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemThemeChange = () => {
      const current = readCustomerWorkspaceAppearance(workspace.userId);
      if (current.themePreference === "system") {
        applyCustomerWorkspaceAppearance(current);
        setQuickTheme(resolveEffectiveTheme(current.themePreference));
      }
    };
    media.addEventListener("change", onSystemThemeChange);
    return () => media.removeEventListener("change", onSystemThemeChange);
  }, [workspace.userId]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const response = await fetch(`/api/workspace/search?q=${encodeURIComponent(query)}`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error || "Search failed.");
        setSearchResults(Array.isArray(body?.results) ? body.results : []);
        setSearchOpen(true);
      } catch (error) {
        if ((error as { name?: string })?.name !== "AbortError") {
          setSearchResults([]);
          setSearchOpen(true);
        }
      } finally {
        setSearchLoading(false);
      }
    }, 275);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [searchQuery]);

  function toggleQuickTheme() {
    const current = readCustomerWorkspaceAppearance(workspace.userId);
    const nextTheme = quickTheme === "dark" ? "light" : "dark";
    const next = { ...current, themePreference: nextTheme };
    writeCustomerWorkspaceAppearance(workspace.userId, next);
    applyCustomerWorkspaceAppearance(next);
    setQuickTheme(nextTheme);
  }

  return (
    <main className="customer-workspace-shell min-h-screen text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <aside className="customer-workspace-sidebar border-r px-5 py-5 text-slate-950 shadow-[1px_0_0_rgba(15,23,42,0.04)]">
          <BrandMark />
          <nav className="mt-8 space-y-1" aria-label="Workspace navigation">
            {workspace.navigation.map((item) => {
              const active = activeItem?.href === item.href;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  prefetch
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-10 items-center justify-between rounded-lg px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-300 ${
                    active ? "bg-white text-orange-700 ring-1 ring-orange-200 shadow-sm" : "text-slate-700 hover:bg-white/80 hover:text-slate-950"
                  }`}
                >
                  <span>{item.label}</span>
                  {item.status === "available" ? <span className="text-[10px] uppercase tracking-widest text-orange-600">Open</span> : null}
                </Link>
              );
            })}
          </nav>
        </aside>

        <section className="flex min-w-0 flex-col">
          <header className="customer-workspace-header border-b px-5 py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <nav aria-label="Breadcrumb" className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  <Link href="/workspace/admin" prefetch className="text-orange-600 hover:text-orange-700">Home</Link>
                  {activeAccountItem ? <span className="text-slate-400"> &gt; Account Settings &gt; {activeAccountItem.label}</span> : activeItem && activeItem.href !== "/workspace/admin" ? <span className="text-slate-400"> &gt; {activeItem.label}</span> : null}
                </nav>
                <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-orange-600">DeployIQ Admin Workspace</p>
                <h1 className="mt-1 text-2xl font-bold">{activeItem?.href === "/workspace/admin" && !activeAccountItem ? workspace.workspaceName : sectionLabel}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{sectionDescription}</p>
                <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
                  <div><dt className="inline font-semibold">Product:</dt> <dd className="inline">{workspace.productName}</dd></div>
                  <div><dt className="inline font-semibold">Plan:</dt> <dd className="inline">{workspace.planName}</dd></div>
                  <div><dt className="inline font-semibold">Status:</dt> <dd className="inline">{workspace.activationStatus}</dd></div>
                  <div><dt className="inline font-semibold">URL:</dt> <dd className="inline font-mono">{workspace.workspaceUrl}</dd></div>
                </dl>
              </div>

              <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap xl:justify-end">
                <div className="relative">
                  <label className="relative block">
                    <span className="sr-only">Search workspace</span>
                    <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(event) => {
                        setSearchQuery(event.target.value);
                        setSearchOpen(true);
                      }}
                      onFocus={() => setSearchOpen(true)}
                      placeholder="Search workspace"
                      aria-label="Search workspace"
                      aria-expanded={searchOpen && searchQuery.trim().length >= 2}
                      className="workspace-search-input w-56 pl-10"
                    />
                  </label>
                  {searchOpen && searchQuery.trim().length >= 2 ? (
                    <div className="workspace-search-results absolute right-0 top-12 z-30 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white py-2 text-sm shadow-xl" role="listbox" aria-label="Workspace search results">
                      {searchLoading ? <p className="px-4 py-3 text-slate-600">Searching...</p> : null}
                      {!searchLoading && searchResults.length === 0 ? <p className="px-4 py-3 text-slate-600">No workspace results found.</p> : null}
                      {!searchLoading ? Object.entries(groupedSearchResults).map(([group, results]) => (
                        <div key={group} className="py-1">
                          <p className="px-4 py-1 text-xs font-semibold uppercase tracking-widest text-slate-500">{group}</p>
                          {results.map((result) => (
                            <Link
                              key={`${result.group}:${result.href}:${result.label}`}
                              href={result.href}
                              prefetch
                              className="block px-4 py-2 hover:bg-orange-50 focus:bg-orange-50 focus:outline-none"
                              onClick={() => {
                                setSearchOpen(false);
                                setSearchQuery("");
                              }}
                              role="option"
                            >
                              <span className="block font-bold text-slate-900">{result.label}</span>
                              {result.sublabel ? <span className="block text-xs text-slate-500">{result.sublabel}</span> : null}
                            </Link>
                          ))}
                        </div>
                      )) : null}
                    </div>
                  ) : null}
                </div>
                <NotificationCenter enabled />
                <Link href="/workspace/admin/help" prefetch aria-label="Help" className="workspace-header-button">
                  <CircleHelp className="h-4 w-4" aria-hidden="true" />
                  Help
                </Link>
                <button type="button" onClick={toggleQuickTheme} aria-label={quickTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"} className="workspace-header-button">
                  {quickTheme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
                  {quickTheme === "dark" ? "Light" : "Dark"}
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setAccountMenuOpen((open) => !open)}
                    aria-expanded={accountMenuOpen}
                    aria-haspopup="menu"
                    className={`workspace-header-button ${activeAccountItem ? "border-orange-200 bg-orange-50 text-orange-700" : ""}`}
                  >
                    <Settings className="h-4 w-4" aria-hidden="true" />
                    Account Settings
                    <ChevronDown className={`h-4 w-4 transition ${accountMenuOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                  {accountMenuOpen ? (
                    <div className="absolute right-0 top-12 z-40 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-xl" role="menu" aria-label="Account Settings">
                      <p className="px-3 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-orange-600">Configuration</p>
                      {CUSTOMER_ADMIN_ACCOUNT_SETTINGS_NAV_ITEMS.map((item) => {
                        const active = activeAccountItem?.href === item.href;
                        const planned = item.status !== "available";
                        return (
                          <Link
                            key={item.label}
                            href={item.href}
                            prefetch
                            role="menuitem"
                            aria-current={active ? "page" : undefined}
                            className={`flex min-h-10 items-center justify-between rounded-lg px-3 font-bold focus:outline-none focus:ring-2 focus:ring-orange-200 ${
                              active ? "bg-orange-50 text-orange-800" : planned ? "text-slate-400" : "text-slate-700 hover:bg-slate-50 hover:text-slate-950"
                            }`}
                            onClick={() => setAccountMenuOpen(false)}
                          >
                            <span>{item.label}</span>
                            {planned ? <span className="text-[10px] uppercase tracking-widest">Soon</span> : null}
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                <div aria-label="Workspace identity" className="workspace-identity-static flex min-h-10 items-center gap-2 px-2.5 py-1.5 text-left">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-900 text-xs font-black text-white">
                    {workspace.branding.logoUrl ? (
                      <img src={workspace.branding.logoUrl} alt="" className="h-full w-full object-contain" />
                    ) : (
                      workspace.branding.workspaceInitials
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block max-w-44 truncate text-sm font-bold text-slate-950">{workspace.branding.organisationDisplayName}</span>
                    <span className="block font-mono text-[11px] font-semibold text-slate-500">{workspace.customerId}</span>
                  </span>
                </div>
                <SignOutButton className="workspace-button-secondary min-h-9 px-3 text-xs shadow-none focus:ring-slate-400 focus:ring-offset-white" />
              </div>
            </div>
          </header>

          <div className="flex-1 px-5 py-6">{children}</div>

          <footer className="customer-workspace-footer border-t px-5 py-4 text-sm text-slate-600">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-semibold">DeployIQ Workspace v2.1</p>
              <div className="flex flex-wrap gap-4">
                <span>Workspace status: {workspace.activationStatus}</span>
                <Link href="/workspace/admin/support" prefetch className="font-semibold text-orange-600 hover:text-orange-700">Support</Link>
                <Link href="/workspace/admin/help" prefetch className="font-semibold text-orange-600 hover:text-orange-700">Documentation</Link>
              </div>
            </div>
          </footer>
        </section>
      </div>
    </main>
  );
}

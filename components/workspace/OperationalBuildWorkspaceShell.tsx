"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { SignOutButton } from "@/components/SignOutButton";
import type { OperationalBuildAccess } from "@/lib/workspace/operationalBuildAccess";

const NAVIGATION = [
  { label: "My Projects", href: "/workspace/build/projects" },
  { label: "Notifications", href: "/workspace/notifications" },
] as const;

function roleLabel(roleKey: string) {
  if (roleKey === "workspace_administrator") return "Administrator";
  if (roleKey === "project_manager") return "Project Manager";
  if (roleKey === "supervisor") return "Supervisor";
  if (roleKey === "agency_manager" || roleKey === "field_coordinator") return "Field Coordinator";
  if (roleKey === "client_viewer") return "Viewer";
  return "Operational User";
}

export function OperationalBuildWorkspaceShell({ access, children }: { access: OperationalBuildAccess; children: React.ReactNode }) {
  const pathname = usePathname();
  return <main className="min-h-[100dvh] bg-slate-100 text-slate-950">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-4"><BrandMark/><div className="border-l border-slate-200 pl-4"><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">DeployIQ Build</p><p className="text-sm font-semibold text-slate-600">{roleLabel(access.roleKey)}{access.readOnly ? " · Read only" : ""}</p></div></div>
        <div className="flex items-center gap-2"><Link href="/workspace/notifications" className="min-h-11 rounded-lg px-3 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100">Notifications</Link><SignOutButton className="min-h-11 rounded-lg px-4 text-sm"/></div>
      </div>
    </header>
    <div className="mx-auto grid max-w-[1500px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[230px_minmax(0,1fr)]">
      <aside className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-5 lg:h-fit">
        <nav aria-label="Build workspace navigation" className="flex gap-2 overflow-x-auto lg:grid">
          {NAVIGATION.map((item) => { const active = pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`min-h-11 whitespace-nowrap rounded-lg px-4 py-3 text-sm font-bold ${active ? "bg-orange-50 text-orange-900" : "text-slate-700 hover:bg-slate-50"}`}>{item.label}</Link>; })}
        </nav>
        <div className="mt-3 hidden border-t border-slate-100 px-3 pt-3 text-xs text-slate-500 lg:block">{access.projects.length} authorized Build project{access.projects.length === 1 ? "" : "s"}</div>
      </aside>
      <section className="min-w-0">{children}</section>
    </div>
  </main>;
}

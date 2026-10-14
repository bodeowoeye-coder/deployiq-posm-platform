import Link from "next/link";
import { listMobileBuildActivities } from "@/lib/build/mobile/activities";
import { resolveOperationalBuildAccess } from "@/lib/workspace/operationalBuildAccess";

export const dynamic = "force-dynamic";

const GROUPS = [
  ["Attention", ["changes_required", "blocked", "submitted_for_review"]],
  ["In progress", ["in_progress"]],
  ["Upcoming", ["not_started"]],
  ["Completed", ["completed", "approved"]],
] as const;

export default async function MobileBuildActivitiesPage() {
  const access = await resolveOperationalBuildAccess();
  const activities = await listMobileBuildActivities(access);
  return <div className="space-y-5 pb-24 lg:pb-0">
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Operational Build Workspace</p><h1 className="mt-2 text-3xl font-black">My Activities</h1><p className="mt-2 text-sm text-slate-600">Activities are limited to your current tenant, authorized projects and durable operational responsibility.</p></section>
    {GROUPS.map(([label, statuses]) => {
      const items = activities.filter((item) => (statuses as readonly string[]).includes(item.status));
      if (!items.length) return null;
      return <section key={label} className="space-y-3"><h2 className="px-1 text-sm font-black uppercase tracking-widest text-slate-500">{label} · {items.length}</h2><ul className="grid gap-3 xl:grid-cols-2">{items.map((item) => <li key={item.id}><Link href={`/workspace/build/projects/${item.projectId}/activities/${item.id}`} className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-orange-300"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-bold uppercase tracking-wider text-slate-500">{item.projectName} · {item.siteName}</p><h3 className="mt-2 text-lg font-black text-slate-950">{item.name}</h3><p className="mt-1 text-sm text-slate-600">{item.workPackageName} · {item.code}</p></div><span className="shrink-0 rounded-full bg-orange-50 px-3 py-1 text-xs font-bold capitalize text-orange-900">{item.status.replaceAll("_", " ")}</span></div><p className="mt-4 text-xs font-bold uppercase tracking-widest text-orange-700">{item.relevance.replaceAll("_", " ")}</p></Link></li>)}</ul></section>;
    })}
    {!activities.length ? <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">No authorized Activities are currently assigned or visible to your operational role.</section> : null}
  </div>;
}

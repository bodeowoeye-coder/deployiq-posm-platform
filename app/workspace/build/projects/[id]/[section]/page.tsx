import Link from "next/link";
import { notFound } from "next/navigation";
import { BuildExceptionRegister } from "@/components/workspace/BuildExceptionRegister";
import { BuildRuntimeWorkPlan } from "@/components/workspace/BuildRuntimeWorkPlan";
import { getBuildManagementSummary, type BuildExceptionFilters } from "@/lib/build/management/service";
import { getBuildProjectWorkspaceOverview } from "@/lib/build/projects/workspaceOverview";
import { getWorkPlan } from "@/lib/build/runtime/service";

export const dynamic = "force-dynamic";
const SECTIONS = new Set(["sites", "work-packages", "work-plans", "activities", "inspections", "exceptions", "attention"]);

export default async function OperationalBuildProjectSectionPage({ params, searchParams }: { params: { id: string; section: string }; searchParams: BuildExceptionFilters & { workPackage?: string } }) {
  if (!SECTIONS.has(params.section)) notFound();
  const overview = await getBuildProjectWorkspaceOverview(params.id);
  const base = `/workspace/build/projects/${overview.project.id}`;
  if (params.section === "sites") return <List title="Sites" empty="No active Sites are available." rows={overview.sites.map((site) => ({ id: site.id, title: site.name, detail: `${site.siteCode} · ${site.status}${site.state ? ` · ${site.state}` : ""}` }))}/>;
  if (params.section === "work-packages") return <List title="Work Packages" empty="No active Work Packages are available." rows={overview.workPackages.map((item) => ({ id: item.id, title: item.name, detail: `${item.code} · ${item.status} · ${overview.sites.find((site) => site.id === item.siteId)?.name ?? "Site unavailable"}` }))}/>;
  if (params.section === "work-plans" || params.section === "activities") {
    const selected = overview.workPackages.find((item) => item.id === searchParams.workPackage) ?? overview.workPackages[0] ?? null;
    const site = selected ? overview.sites.find((item) => item.id === selected.siteId) ?? null : null;
    const plan = selected && site ? await getWorkPlan({ projectId: overview.project.id, siteId: site.id, workPackageId: selected.id }) : null;
    return <BuildRuntimeWorkPlan overview={overview} selectedWorkPackageId={selected?.id ?? null} plan={plan} activityBase={`${base}/activities`} canManagePlan={false}/>;
  }
  const management = await getBuildManagementSummary(params.id);
  if (params.section === "exceptions") return <BuildExceptionRegister projectId={params.id} management={management} filters={searchParams} routeBase={base}/>;
  if (params.section === "inspections") {
    const rows = management.activityDetails.filter((activity) => activity.requiresApproval || ["submitted_for_review", "changes_required", "approved"].includes(activity.status));
    return <List title="Inspections" empty="No Activities currently have an inspection context." rows={rows.map((activity) => ({ id: activity.id, title: activity.name, detail: activity.status.replaceAll("_", " "), href: `${base}/activities/${activity.id}?view=inspection` }))}/>;
  }
  return <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-black">Management Attention</h2><p className="mt-2 text-sm text-slate-600">Authoritative project obligations requiring operational attention.</p><ul className="mt-5 space-y-3">{management.managementAttentionItems.map((item) => <li key={item.key} className="rounded-lg border border-slate-200 p-4"><p className="font-bold">{item.activityName} · {item.type.replaceAll("_", " ")}</p><p className="mt-1 text-sm text-slate-600">{item.condition}{item.expectedNextAction ? ` · ${item.expectedNextAction}` : ""}</p>{item.activityId ? <Link href={`${base}/activities/${item.activityId}`} className="mt-2 inline-block text-sm font-bold text-orange-700">Open Activity</Link> : null}</li>)}</ul>{!management.managementAttentionItems.length ? <p className="mt-4 text-sm text-slate-500">No current Management Attention items.</p> : null}</section>;
}

function List({ title, rows, empty }: { title: string; rows: Array<{ id: string; title: string; detail: string; href?: string }>; empty: string }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-black">{title}</h2>{rows.length ? <ul className="mt-5 divide-y divide-slate-100">{rows.map((row) => <li key={row.id} className="py-4"><p className="font-bold">{row.href ? <Link href={row.href} className="text-orange-700">{row.title}</Link> : row.title}</p><p className="mt-1 text-sm capitalize text-slate-600">{row.detail}</p></li>)}</ul> : <p className="mt-4 text-sm text-slate-500">{empty}</p>}</section>;
}

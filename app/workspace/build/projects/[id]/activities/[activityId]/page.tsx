import { notFound } from "next/navigation";
import { BuildRuntimeActivityExecution, type BuildActivityView } from "@/components/workspace/BuildRuntimeActivityExecution";
import { getBuildProjectWorkspaceOverview } from "@/lib/build/projects/workspaceOverview";
import { getRuntimeActivityExecution, getRuntimeActivityProjectScope } from "@/lib/build/runtime/service";
import { resolveOperationalBuildAccess } from "@/lib/workspace/operationalBuildAccess";

export const dynamic = "force-dynamic";
const VIEWS = new Set<BuildActivityView>(["overview", "responsibility", "execution", "checklist", "evidence", "inspection", "exceptions", "resources", "history"]);

export default async function OperationalBuildActivityPage({ params, searchParams }: { params: { id: string; activityId: string }; searchParams: { view?: string } }) {
  const view = (searchParams.view ?? "overview") as BuildActivityView;
  if (!VIEWS.has(view)) notFound();
  const access = await resolveOperationalBuildAccess();
  if (!access.authorizedProjectIds.includes(params.id)) notFound();
  const overview = await getBuildProjectWorkspaceOverview(params.id);
  const scope = await getRuntimeActivityProjectScope({ clientId: access.clientId, projectId: params.id, activityId: params.activityId });
  const workPackage = overview.workPackages.find((item) => item.id === scope.workPackageId);
  const site = overview.sites.find((item) => item.id === scope.siteId);
  if (!workPackage || !site || workPackage.siteId !== site.id) notFound();
  const execution = await getRuntimeActivityExecution({ projectId: params.id, siteId: site.id, workPackageId: workPackage.id, activityId: params.activityId });
  const routeBase = `/workspace/build/projects/${params.id}/activities/${params.activityId}`;
  const assignedSupervisor = execution.activity.supervisor_user_id === access.userId;
  const canUseExecution = access.roleKey === "project_manager" || (access.roleKey === "supervisor" && assignedSupervisor);
  if (!canUseExecution) return <ReadOnlyActivity execution={execution} routeBase={routeBase}/>;
  return <BuildRuntimeActivityExecution execution={execution} scope={{ projectId: params.id, siteId: site.id, workPackageId: workPackage.id }} context={{ projectName: overview.project.project_name, siteName: site.name, workPackageName: workPackage.name }} activeView={view} routeBase={routeBase} backHref={`/workspace/build/projects/${params.id}/activities?workPackage=${workPackage.id}`}/>;
}

function ReadOnlyActivity({ execution, routeBase }: { execution: Awaited<ReturnType<typeof getRuntimeActivityExecution>>; routeBase: string }) {
  const activity = execution.activity;
  return <div className="space-y-4"><section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Read-only Activity</p><h2 className="mt-2 text-2xl font-black">{activity.name}</h2><p className="mt-2 text-sm text-slate-600">Your role can inspect this authorized Activity but cannot perform lifecycle actions.</p><dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Fact label="Status" value={activity.status.replaceAll("_", " ")}/><Fact label="Owner" value={execution.owner?.name ?? "Unassigned"}/><Fact label="Supervisor" value={execution.supervisor?.name ?? "Unassigned"}/><Fact label="Checklist" value={`${activity.checklist_resolved_count}/${activity.checklist_count} resolved`}/><Fact label="Evidence" value={String(execution.evidence.length)}/><Fact label="Inspections" value={String(execution.inspections.length)}/><Fact label="Exceptions" value={String(execution.exceptions.length)}/><Fact label="History events" value={String(execution.events.length)}/></dl></section><nav className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-bold text-orange-700"><a href={`${routeBase}?view=overview`}>Activity record</a></nav></div>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</dt><dd className="mt-1 font-semibold capitalize text-slate-900">{value}</dd></div>; }

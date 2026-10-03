import { notFound } from "next/navigation";
import { BuildRuntimeActivityExecution, type BuildActivityView } from "@/components/workspace/BuildRuntimeActivityExecution";
import { getAuthenticatedBuildNotificationConsumption } from "@/lib/build/notifications/repository";
import { getRuntimeActivityExecution, getRuntimeActivityProjectScope } from "@/lib/build/runtime/service";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { requireOperationalNotificationContext } from "@/lib/workspace/operationalNotifications";

export const dynamic = "force-dynamic";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export default async function OperationalNotificationPage({ params, searchParams }: { params: { notificationId: string }; searchParams: { view?: string } }) {
  try {
    const member = await requireOperationalNotificationContext();
    const destination = await getAuthenticatedBuildNotificationConsumption(params.notificationId);
    const scope = await getRuntimeActivityProjectScope({ clientId: member.clientId, projectId: destination.projectId, activityId: destination.activityId });
    const execution = await getRuntimeActivityExecution({ projectId: destination.projectId, siteId: scope.siteId, workPackageId: scope.workPackageId, activityId: destination.activityId });
    const supabase = createAdminSupabase();
    const [{ data: project }, { data: site }, { data: workPackage }] = await Promise.all([
      supabase.from("projects").select("project_name,client_id").eq("id", destination.projectId).eq("client_id", member.clientId).maybeSingle(),
      supabase.from("build_sites").select("name").eq("id", scope.siteId).eq("project_id", destination.projectId).eq("client_id", member.clientId).is("archived_at", null).maybeSingle(),
      supabase.from("build_work_packages").select("name").eq("id", scope.workPackageId).eq("site_id", scope.siteId).eq("project_id", destination.projectId).eq("client_id", member.clientId).is("archived_at", null).maybeSingle(),
    ]);
    if (!project || !site || !workPackage) notFound();
    const requested = searchParams.view;
    const activeView = (requested === "execution" || requested === "inspection" || requested === "exceptions" ? requested : destination.view) as BuildActivityView;
    const routeBase = `/workspace/notifications/${encodeURIComponent(params.notificationId)}`;
    return <div className="space-y-5"><nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><a href="/workspace/notifications" className="text-orange-700 hover:underline">Notifications</a><span>›</span><span>{text(project.project_name)}</span><span>›</span><span>{execution.activity.name}</span></nav><section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Authorized notification destination</p><h1 className="mt-2 text-2xl font-black">{execution.activity.name}</h1><p className="mt-2 text-sm text-slate-600">{text(project.project_name)} · {text(site.name)} · {text(workPackage.name)}</p></section><BuildRuntimeActivityExecution execution={execution} scope={{ projectId: destination.projectId, siteId: scope.siteId, workPackageId: scope.workPackageId }} context={{ projectName: text(project.project_name), siteName: text(site.name), workPackageName: text(workPackage.name) }} activeView={activeView} routeBase={routeBase} /></div>;
  } catch {
    notFound();
  }
}

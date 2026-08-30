import { notFound } from "next/navigation";
import { BuildProjectShell } from "@/components/workspace/BuildProjectShell";
import { BuildRuntimeActivityExecution, type BuildActivityView } from "@/components/workspace/BuildRuntimeActivityExecution";
import { getRuntimeActivityExecution, getRuntimeActivityProjectScope } from "@/lib/build/runtime/service";
import { getBuildProjectWorkspaceOverview } from "@/lib/build/projects/workspaceOverview";

export const dynamic = "force-dynamic";
const SERVER_ACTIVITY_VIEWS = new Set<BuildActivityView>(["overview", "responsibility", "execution", "checklist", "evidence", "resources", "history"]);

export default async function BuildRuntimeActivityPage({ params, searchParams }: {
  params: { id: string; activityId: string };
  searchParams: { view?: string };
}) {
  const activeView = (searchParams.view ?? "overview") as BuildActivityView;
  if (!SERVER_ACTIVITY_VIEWS.has(activeView)) notFound();
  const overview = await getBuildProjectWorkspaceOverview(params.id);
  const scope = await getRuntimeActivityProjectScope({ clientId: overview.project.client_id, projectId: overview.project.id, activityId: params.activityId });
  const workPackage = overview.workPackages.find((item) => item.id === scope.workPackageId);
  const site = overview.sites.find((item) => item.id === scope.siteId);
  if (!workPackage || !site || workPackage.siteId !== site.id) notFound();
  const execution = await getRuntimeActivityExecution({ projectId: overview.project.id, siteId: site.id, workPackageId: workPackage.id, activityId: params.activityId });
  const routeBase = `/workspace/admin/projects/${overview.project.id}/activities/${execution.activity.id}`;
  return <BuildProjectShell project={overview.project} activeSection="activities">
    <BuildRuntimeActivityExecution execution={execution} scope={{ projectId: overview.project.id, siteId: site.id, workPackageId: workPackage.id }} context={{ projectName: overview.project.project_name, siteName: site.name, workPackageName: workPackage.name }} activeView={activeView} routeBase={routeBase}/>
  </BuildProjectShell>;
}

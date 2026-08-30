import { notFound } from "next/navigation";
import { BuildProjectShell } from "@/components/workspace/BuildProjectShell";
import { BuildTemplateConfiguration } from "@/components/workspace/BuildTemplateConfiguration";
import { getBuildProjectWorkspaceOverview } from "@/lib/build/projects/workspaceOverview";
import { getResources } from "@/lib/build/resources/service";
import { instantiateTemplate } from "@/lib/build/templates/service";

export const dynamic = "force-dynamic";

export default async function WorkspaceBuildTemplatePage({ params }: { params: { id: string; workPackageId: string } }) {
  const overview = await getBuildProjectWorkspaceOverview(params.id);
  const workPackage = overview.workPackages.find((item) => item.id === params.workPackageId);
  if (!workPackage?.templateId) notFound();
  const site = overview.sites.find((item) => item.id === workPackage.siteId);
  if (!site) notFound();

  const [configuration, resources] = await Promise.all([
    instantiateTemplate({ projectId: overview.project.id, siteId: site.id, workPackageId: workPackage.id, templateId: workPackage.templateId }),
    getResources({ projectId: overview.project.id, siteId: site.id, workPackageId: workPackage.id, includeGlobal: true }),
  ]);
  const canConfigure = !configuration.bundle.template.is_global
    && configuration.bundle.template.client_id === overview.project.client_id;

  return (
    <BuildProjectShell project={overview.project} activeSection="work-packages">
      <BuildTemplateConfiguration
        project={overview.project}
        site={site}
        workPackage={workPackage}
        configuration={configuration}
        resources={resources}
        canConfigure={canConfigure}
      />
    </BuildProjectShell>
  );
}

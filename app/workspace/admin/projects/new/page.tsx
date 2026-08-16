import { redirect } from "next/navigation";
import { ProjectCreateWizard } from "@/components/workspace/ProjectCreateWizard";
import { CustomerWorkspaceRedirect } from "@/lib/workspace/customerAdmin";
import { getCustomerProjectDashboard } from "@/lib/workspace/projects";
import { getAgencyDashboard, getAssignableInstallers } from "@/lib/workspace/fieldResources";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NewWorkspaceProjectPage() {
  let dashboard;
  try {
    const [projectDashboard, agencyDashboard, installers] = await Promise.all([
      getCustomerProjectDashboard(),
      getAgencyDashboard(),
      getAssignableInstallers(),
    ]);
    dashboard = { ...projectDashboard, agencyDashboard, installers };
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Customer Workspace</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950">Create Project</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Create the canonical project and its initial campaign information for this workspace.</p>
      </div>
      <ProjectCreateWizard
        productName={dashboard.workspace.productName}
        productKey={dashboard.workspace.productKey}
        directory={dashboard.directory}
        resources={{ agencies: dashboard.agencyDashboard.agencies, installers: dashboard.installers }}
      />
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Workspace Projects</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Projects in this Workspace</h2>
          </div>
          <span className="text-sm text-slate-500">{dashboard.projects.length} configured</span>
        </div>
        {dashboard.projects.length === 0 ? (
          <p className="mt-5 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No projects configured yet.</p>
        ) : (
          <div className="mt-5 grid gap-3">
            {dashboard.filteredProjects.map((project) => (
              <article key={project.id} className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-950">{project.project_name}</h3><span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-bold text-orange-700">{project.customerStatus}</span></div>
                  <p className="mt-1 text-sm text-slate-600">{project.campaign_name || "No campaign metadata"} · Target {project.target_quantity}</p>
                  <p className="mt-1 text-xs text-slate-500">{project.productName} · {project.deploymentType} · {project.stateCount} states</p>
                </div>
                <div className="flex flex-wrap gap-2"><Link href={`/workspace/admin/projects/${project.id}`} className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:border-orange-300 hover:bg-orange-50">View</Link><Link href={`/workspace/admin/projects/${project.id}/edit`} className="inline-flex min-h-9 items-center rounded-lg bg-slate-950 px-3 text-sm font-bold text-white hover:bg-slate-800">Edit</Link></div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

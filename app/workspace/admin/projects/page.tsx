import Link from "next/link";
import { redirect } from "next/navigation";
import { CustomerWorkspaceRedirect } from "@/lib/workspace/customerAdmin";
import { CUSTOMER_PROJECT_STATUSES, getCustomerProjectDashboard } from "@/lib/workspace/projects";

export const dynamic = "force-dynamic";

function badgeClass(status: string) {
  if (status === "Active") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "Completed") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "On Hold") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "Archived" || status === "Cancelled") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-orange-200 bg-orange-50 text-orange-800";
}

export default async function WorkspaceProjectsPage({
  searchParams,
}: {
  searchParams?: { search?: string; status?: string; product?: string; state?: string; deploymentType?: string; sort?: string; page?: string };
}) {
  let dashboard;
  try {
    dashboard = await getCustomerProjectDashboard({
      search: searchParams?.search,
      status: searchParams?.status,
      product: searchParams?.product,
      state: searchParams?.state,
      deploymentType: searchParams?.deploymentType,
      sort: searchParams?.sort,
      page: Number(searchParams?.page ?? 1),
    });
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-bold">Projects</h2>
          <p className="mt-2 text-sm text-slate-600">Create and manage canonical workspace projects and their campaign metadata.</p>
        </div>
        <Link href="/workspace/admin/projects/new" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-600">
          Create Project
        </Link>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-7" aria-label="Project KPIs">
        {dashboard.kpis.map((item) => (
          <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{item.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{item.value}</p>
          </div>
        ))}
      </section>

      <form className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 lg:grid-cols-[2fr_repeat(5,1fr)_auto]" action="/workspace/admin/projects">
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Search
          <input name="search" defaultValue={dashboard.filters.search ?? ""} className="workspace-search-input normal-case tracking-normal" />
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Status
          <select name="status" defaultValue={dashboard.filters.status ?? ""} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm normal-case tracking-normal">
            <option value="">All</option>
            {CUSTOMER_PROJECT_STATUSES.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Product
          <input name="product" defaultValue={dashboard.filters.product ?? ""} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm normal-case tracking-normal" />
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
          State
          <input name="state" defaultValue={dashboard.filters.state ?? ""} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm normal-case tracking-normal" />
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Deployment Type
          <input name="deploymentType" defaultValue={dashboard.filters.deploymentType ?? ""} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm normal-case tracking-normal" />
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Sort
          <select name="sort" defaultValue={dashboard.filters.sort ?? "updated"} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm normal-case tracking-normal">
            <option value="updated">Last Updated</option>
            <option value="created">Created</option>
            <option value="name">Project Name</option>
            <option value="status">Status</option>
          </select>
        </label>
        <button className="self-end rounded-lg bg-slate-950 px-4 text-sm font-bold text-white">Apply</button>
      </form>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {dashboard.projects.length === 0 ? (
          <div className="p-8 text-center">
            <h2 className="text-lg font-bold">No projects yet.</h2>
            <p className="mt-2 text-sm text-slate-600">Create your first project to begin managing deployments.</p>
            <Link href="/workspace/admin/projects/new" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-orange-500 px-4 text-sm font-bold text-white">
              Create Project
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-500">
                <tr>
                  {["Project Name", "Product", "Campaign", "Deployment Type", "States", "Progress", "Status", "Created", "Last Updated", "Actions"].map((heading) => (
                    <th key={heading} className="px-4 py-3">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dashboard.filteredProjects.map((project) => (
                  <tr key={project.id} className="align-top">
                    <td className="px-4 py-3 font-bold text-slate-950">{project.project_name}</td>
                    <td className="px-4 py-3">{project.productName}</td>
                    <td className="px-4 py-3">{project.campaign_name ?? "Not set"}</td>
                    <td className="px-4 py-3">{project.deploymentType}</td>
                    <td className="px-4 py-3">{project.stateCount}</td>
                    <td className="px-4 py-3">
                      <div className="h-2 w-28 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-orange-500" style={{ width: `${project.progressPercent}%` }} />
                      </div>
                      <span className="mt-1 block text-xs text-slate-500">{project.progressPercent}%</span>
                    </td>
                    <td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-bold ${badgeClass(project.customerStatus)}`}>{project.customerStatus}</span></td>
                    <td className="px-4 py-3">{project.created_at ? new Date(project.created_at).toLocaleDateString() : "Not available"}</td>
                    <td className="px-4 py-3">{project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : "Not available"}</td>
                    <td className="px-4 py-3">
                      <Link href={`/workspace/admin/projects/${project.id}`} className="font-bold text-orange-600 hover:text-orange-700">Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

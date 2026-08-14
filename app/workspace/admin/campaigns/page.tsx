import Link from "next/link";
import { redirect } from "next/navigation";
import { CustomerWorkspaceRedirect, resolveCustomerWorkspaceContext } from "@/lib/workspace/customerAdmin";
import { CUSTOMER_CAMPAIGN_STATUSES, getWorkspaceCampaignDashboard } from "@/lib/workspace/campaigns";

export const dynamic = "force-dynamic";

function badgeClass(status: string) {
  if (status === "Active") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "Completed") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "Paused" || status === "Scheduled") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "Archived") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-orange-200 bg-orange-50 text-orange-800";
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString() : "Not set";
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams?: { search?: string; status?: string; project?: string; brand?: string; state?: string; dateFrom?: string; dateTo?: string; sort?: string };
}) {
  let dashboard;
  try {
    const workspace = await resolveCustomerWorkspaceContext();
    dashboard = await getWorkspaceCampaignDashboard({
      search: searchParams?.search,
      status: searchParams?.status,
      project: searchParams?.project,
      brand: searchParams?.brand,
      state: searchParams?.state,
      dateFrom: searchParams?.dateFrom,
      dateTo: searchParams?.dateTo,
      sort: searchParams?.sort,
    }, workspace);
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-bold">Campaign Management</h2>
          <p className="mt-2 text-sm text-slate-600">Manage campaign details across your projects.</p>
        </div>
      </div>

      <form className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 lg:grid-cols-[2fr_repeat(3,1fr)_auto]" action="/workspace/admin/campaigns">
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Search
          <input name="search" defaultValue={dashboard.filters.search} className="workspace-search-input normal-case tracking-normal" />
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Status
          <select name="status" defaultValue={dashboard.filters.status} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm normal-case tracking-normal">
            <option value="">All</option>
            {CUSTOMER_CAMPAIGN_STATUSES.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Brand
          <input name="brand" defaultValue={dashboard.filters.brand} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm normal-case tracking-normal" />
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
          State
          <input name="state" defaultValue={dashboard.filters.state} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm normal-case tracking-normal" />
        </label>
        <button className="self-end rounded-lg bg-slate-950 px-4 text-sm font-bold text-white">Apply</button>
      </form>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {dashboard.campaigns.length === 0 ? (
          <div className="p-8 text-center">
            <h2 className="text-lg font-bold">No projects yet</h2>
            <p className="mt-2 text-sm text-slate-600">Create a project to configure its campaign metadata and deployment targets.</p>
            <Link href="/workspace/admin/projects/new" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-orange-500 px-4 text-sm font-bold text-white">
              Create Project
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-500">
                <tr>
                  {["Campaign", "Project", "Brand", "Status", "Target", "Start Date", "End Date", "Region / State", "Actions"].map((heading) => (
                    <th key={heading} className="px-4 py-3">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dashboard.filteredCampaigns.map((campaign) => (
                  <tr key={campaign.id} className="align-top">
                    <td className="px-4 py-3 font-bold text-slate-950">{campaign.campaign_name}</td>
                    <td className="px-4 py-3">{campaign.projectName}</td>
                    <td className="px-4 py-3">{campaign.brand_name}</td>
                    <td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-bold ${badgeClass(campaign.customerStatus)}`}>{campaign.customerStatus}</span></td>
                    <td className="px-4 py-3">{campaign.target_quantity} {campaign.target_unit}</td>
                    <td className="px-4 py-3">{formatDate(campaign.start_date)}</td>
                    <td className="px-4 py-3">{formatDate(campaign.end_date)}</td>
                    <td className="px-4 py-3">{[...campaign.regions, ...campaign.states].join(", ") || "Not set"}</td>
                    <td className="px-4 py-3">
                      <Link href={`/workspace/admin/projects/${campaign.project_id}/edit`} className="font-bold text-orange-600 hover:text-orange-700">Review / Edit</Link>
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

import Link from "next/link";
import { listPlatformCustomers } from "@/lib/admin/customerControl";
import { requireRole } from "@/lib/auth";
import { CustomerManagementFilters } from "@/components/admin/CustomerManagementFilters";

export const dynamic = "force-dynamic";

function badgeClass(value: string) {
  if (value === "Active" || value === "Completed" || value === "Paid") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (value === "Failed") return "border-rose-200 bg-rose-50 text-rose-800";
  if (value === "Running" || value === "Pending" || value === "Awaiting Payment") return "border-amber-200 bg-amber-50 text-amber-900";
  if (value === "Suspended" || value === "Archived" || value === "Inactive") return "border-slate-300 bg-slate-100 text-slate-700";
  return "border-slate-200 bg-white text-slate-600";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function CustomerManagementPage({
  searchParams,
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  await requireRole(["admin"], "/admin/customers");
  const dashboard = await listPlatformCustomers({
    search: searchParams?.search ?? null,
    product: searchParams?.product ?? null,
    plan: searchParams?.plan ?? null,
    workspaceStatus: searchParams?.workspaceStatus ?? null,
    provisioningStatus: searchParams?.provisioningStatus ?? null,
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">DeployIQ Core Admin</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">Customer Management</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Platform-wide governance for every customer organisation created through the commercial, provisioning and workspace lifecycle. Customer operations stay inside each Customer 360.
          </p>
        </div>
      </header>

        <section className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
          {dashboard.kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{kpi.label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-950">{kpi.value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Recent Provisioning Activity</h2>
          {dashboard.recentProvisioning.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No provisioning activity recorded.</p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {dashboard.recentProvisioning.map((job) => (
                <li key={job.jobId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-semibold text-slate-950">{job.organisation}</span>
                  <span className="text-slate-600">{job.stage}</span>
                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${badgeClass(job.status === "completed" ? "Completed" : job.status === "failed" ? "Failed" : "Pending")}`}>{job.status}</span>
                  <span className="text-xs text-slate-500">{formatDate(job.updatedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <CustomerManagementFilters
          facets={dashboard.facets}
          initial={{
            search: searchParams?.search ?? "",
            product: searchParams?.product ?? "",
            plan: searchParams?.plan ?? "",
            workspaceStatus: searchParams?.workspaceStatus ?? "",
            provisioningStatus: searchParams?.provisioningStatus ?? "",
          }}
        />

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-bold text-slate-950">Customers</h2>
            <span className="text-sm text-slate-500">{dashboard.filteredCustomers.length} of {dashboard.customers.length}</span>
          </div>
          {dashboard.filteredCustomers.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-slate-500">No customers found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-500">
                  <tr>
                    {["Organisation", "Product", "Plan", "Workspace", "Workspace URL", "Primary Administrator", "Projects", "Users", "Provisioning", "Created", ""].map((heading) => (
                      <th key={heading} className="px-4 py-3">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dashboard.filteredCustomers.map((customer) => (
                    <tr key={customer.clientId} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link href={`/admin/customers/${customer.clientId}`} className="font-bold text-slate-950 hover:text-orange-700">{customer.organisation}</Link>
                        <span className="block text-xs text-slate-500">{customer.source}</span>
                      </td>
                      <td className="px-4 py-3">{customer.productName ?? customer.productKey ?? "—"}</td>
                      <td className="px-4 py-3">{customer.plan ?? "—"}</td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${badgeClass(customer.workspaceStatus)}`}>{customer.workspaceStatus}</span></td>
                      <td className="px-4 py-3 text-slate-600">{customer.workspaceUrl ?? "—"}</td>
                      <td className="px-4 py-3">
                        {customer.primaryAdministrator ?? "—"}
                        {customer.primaryAdministratorEmail ? <span className="block text-xs text-slate-500">{customer.primaryAdministratorEmail}</span> : null}
                      </td>
                      <td className="px-4 py-3">{customer.projectCount}</td>
                      <td className="px-4 py-3">
                        {customer.userCount}
                        {customer.pendingInvitationCount > 0 ? <span className="block text-xs text-amber-700">{customer.pendingInvitationCount} pending</span> : null}
                      </td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${badgeClass(customer.provisioningStatus)}`}>{customer.provisioningStatus}</span></td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(customer.createdAt)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/customers/${customer.clientId}`} className="inline-flex min-h-9 items-center rounded-lg bg-slate-950 px-3 text-xs font-bold text-white hover:bg-slate-800">Open</Link>
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

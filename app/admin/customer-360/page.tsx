import Link from "next/link";
import { CoreAdminShell } from "@/components/admin/CoreAdminShell";
import { CustomerManagementFilters } from "@/components/admin/CustomerManagementFilters";
import { listPlatformCustomers } from "@/lib/admin/customerControl";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Selector only. The canonical Customer 360 remains /admin/customers/[clientId].
export default async function Customer360IndexPage({
  searchParams,
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  await requireRole(["admin"], "/admin/customer-360");
  const dashboard = await listPlatformCustomers({
    search: searchParams?.search ?? null,
    product: searchParams?.product ?? null,
    plan: searchParams?.plan ?? null,
    workspaceStatus: searchParams?.workspaceStatus ?? null,
    provisioningStatus: searchParams?.provisioningStatus ?? null,
  });

  return (
    <CoreAdminShell activeView="customer-360">
      <div className="space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">DeployIQ Platform</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">Customer 360</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Select a customer to view their complete DeployIQ relationship.
          </p>
        </header>

        <CustomerManagementFilters
          basePath="/admin/customer-360"
          facets={dashboard.facets}
          initial={{
            search: searchParams?.search ?? "",
            product: searchParams?.product ?? "",
            plan: searchParams?.plan ?? "",
            workspaceStatus: searchParams?.workspaceStatus ?? "",
            provisioningStatus: searchParams?.provisioningStatus ?? "",
          }}
        />

        {dashboard.filteredCustomers.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">No customers found.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {dashboard.filteredCustomers.map((customer) => (
              <li key={customer.clientId} className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold text-slate-950">{customer.organisation}</h2>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-slate-500">{customer.source}</p>
                  <dl className="mt-4 grid gap-2 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">Product</dt><dd className="font-semibold text-slate-950">{customer.productName ?? customer.productKey ?? "—"}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">Plan</dt><dd className="font-semibold text-slate-950">{customer.plan ?? "—"}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">Workspace</dt><dd className="font-semibold text-slate-950">{customer.workspaceStatus}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">Commercial</dt><dd className="font-semibold text-slate-950">{customer.commercialStatus}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">Provisioning</dt><dd className="font-semibold text-slate-950">{customer.provisioningStatus}</dd></div>
                  </dl>
                </div>
                <Link
                  href={`/admin/customers/${customer.clientId}`}
                  className="mt-5 inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800"
                >
                  View Customer 360
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </CoreAdminShell>
  );
}

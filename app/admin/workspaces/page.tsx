import Link from "next/link";
import { CoreAdminShell } from "@/components/admin/CoreAdminShell";
import { OpenWorkspaceSupportAccess } from "@/components/admin/OpenWorkspaceSupportAccess";
import { listPlatformCustomers } from "@/lib/admin/customerControl";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function badgeClass(value: string) {
  if (value === "Active" || value === "Completed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (value === "Failed") return "border-rose-200 bg-rose-50 text-rose-800";
  if (value === "Running" || value === "Pending") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-slate-300 bg-slate-100 text-slate-700";
}

// The workspace estate: provisioned tenant environments, as opposed to the customer register.
export default async function WorkspacesPage() {
  const context = await requireRole(["admin"], "/admin/workspaces");
  const dashboard = await listPlatformCustomers();
  const workspaces = dashboard.customers.filter((customer) => Boolean(customer.workspaceSlug));
  const adminName = context.user.email ?? "DeployIQ Platform Administrator";

  return (
    <CoreAdminShell activeView="workspaces">
      <div className="space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">DeployIQ Platform</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">Workspaces</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Every provisioned DeployIQ tenant environment. Entering a workspace always starts an audited support session.
          </p>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          {[
            { label: "Provisioned Workspaces", value: workspaces.length },
            { label: "Active", value: workspaces.filter((item) => item.workspaceStatus === "Active").length },
            { label: "Activation Pending", value: workspaces.filter((item) => item.activationStatus === "Pending").length },
            { label: "Suspended / Archived", value: workspaces.filter((item) => item.workspaceStatus === "Suspended" || item.workspaceStatus === "Archived").length },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{kpi.label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-950">{kpi.value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-bold text-slate-950">Workspace Register</h2>
            <span className="text-sm text-slate-500">{workspaces.length} provisioned</span>
          </div>
          {workspaces.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-slate-500">No workspaces have been provisioned yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-500">
                  <tr>
                    {["Customer", "Workspace", "Product", "Plan", "Status", "Activation", "Provisioning", "Provisioned", "Users", "Projects", "Actions"].map((heading) => (
                      <th key={heading} className="px-4 py-3">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {workspaces.map((workspace) => (
                    <tr key={workspace.clientId} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-bold text-slate-950">{workspace.organisation}</td>
                      <td className="px-4 py-3 text-slate-600">{workspace.workspaceUrl ?? workspace.workspaceSlug}</td>
                      <td className="px-4 py-3 text-slate-600">{workspace.productName ?? workspace.productKey ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{workspace.plan ?? "—"}</td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${badgeClass(workspace.workspaceStatus)}`}>{workspace.workspaceStatus}</span></td>
                      <td className="px-4 py-3 text-slate-600">{workspace.activationStatus}</td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${badgeClass(workspace.provisioningStatus)}`}>{workspace.provisioningStatus}</span></td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(workspace.activatedAt)}</td>
                      <td className="px-4 py-3 text-slate-600">{workspace.userCount}</td>
                      <td className="px-4 py-3 text-slate-600">{workspace.projectCount}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/admin/customers/${workspace.clientId}`} className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:border-orange-300 hover:bg-orange-50">View Customer 360</Link>
                          <OpenWorkspaceSupportAccess
                            clientId={workspace.clientId}
                            organisation={workspace.organisation}
                            adminName={adminName}
                            provisioned
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </CoreAdminShell>
  );
}

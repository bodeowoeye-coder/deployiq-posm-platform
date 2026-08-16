import Link from "next/link";
import { Suspense } from "react";
import { CoreAdminShell } from "@/components/admin/CoreAdminShell";
import { getPlatformDashboard } from "@/lib/admin/platformDashboard";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function statusClass(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "completed" || normalized === "active") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (normalized === "failed") return "border-rose-200 bg-rose-50 text-rose-800";
  if (normalized === "running" || normalized === "queued" || normalized === "pending") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-white text-slate-600";
}

function Card({ title, description, children, action }: { title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-lg font-bold text-slate-950">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</p>;
}

// Only metrics with a real destination are clickable; the rest stay informational.
function Metric({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </>
  );
  if (!href) return <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">{body}</div>;
  return (
    <Link href={href} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-orange-300 hover:bg-orange-50">
      {body}
    </Link>
  );
}

const KPI_DESTINATIONS: Record<string, string | undefined> = {
  "Total Customers": "/admin/customers",
  "Active Workspaces": "/admin/customers?workspaceStatus=Active",
  "Provisioning Pending": "/admin/customers?provisioningStatus=Pending",
  "Provisioning Failed": "/admin/customers?provisioningStatus=Failed",
  "Legacy / Unknown": "/admin/customers",
};

async function PlatformDashboardContent() {
  const dashboard = await getPlatformDashboard();
  const attention = [
    dashboard.provisioningAttention.length > 0
      ? { label: `${dashboard.provisioningAttention.length} provisioning ${dashboard.provisioningAttention.length === 1 ? "job requires" : "jobs require"} attention`, href: "/admin/customers?provisioningStatus=Failed" }
      : null,
    dashboard.estate.pendingActivation > 0
      ? { label: `${dashboard.estate.pendingActivation} ${dashboard.estate.pendingActivation === 1 ? "customer is" : "customers are"} pending activation`, href: "/admin/customers" }
      : null,
    dashboard.customersWithAlerts > 0
      ? { label: `${dashboard.customersWithAlerts} ${dashboard.customersWithAlerts === 1 ? "customer has" : "customers have"} active alerts`, href: "/admin/customers" }
      : null,
    dashboard.users.pendingInvitations > 0
      ? { label: `${dashboard.users.pendingInvitations} pending workspace ${dashboard.users.pendingInvitations === 1 ? "invitation" : "invitations"}`, href: "/admin/customers" }
      : null,
    dashboard.estate.legacy > 0
      ? { label: `${dashboard.estate.legacy} legacy customer records require reconciliation`, href: "/admin/customers" }
      : null,
  ].filter(Boolean) as Array<{ label: string; href: string }>;

  return (
    <>
      <section className="grid gap-3 md:grid-cols-4">
        {dashboard.kpis.map((kpi) => (
          <Metric key={kpi.label} label={kpi.label} value={kpi.value} href={KPI_DESTINATIONS[kpi.label]} />
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          title="Customer Estate"
          description="How the DeployIQ customer base is distributed today."
          action={<Link href="/admin/customers" className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:border-orange-300 hover:bg-orange-50">View Customer Management</Link>}
        >
          <dl className="grid gap-3 md:grid-cols-5">
            <Metric label="Total" value={dashboard.estate.total} />
            <Metric label="Provisioned" value={dashboard.estate.provisioned} />
            <Metric label="Active" value={dashboard.estate.active} />
            <Metric label="Pending Activation" value={dashboard.estate.pendingActivation} />
            <Metric label="Legacy / Unknown" value={dashboard.estate.legacy} />
          </dl>
        </Card>

        <Card title="Platform Attention" description="Conditions measurable from canonical platform data.">
          {attention.length === 0 ? (
            <Empty>No provisioning jobs require attention.</Empty>
          ) : (
            <ul className="grid gap-2">
              {attention.map((item) => (
                <li key={item.label}>
                  <Link href={item.href} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-950 transition hover:bg-orange-50">
                    {item.label}
                    <span aria-hidden className="text-orange-600">&rarr;</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Provisioning &amp; Workspace Health" description="Jobs that are pending, running or failed. Select a customer to open Customer 360 &rarr; Provisioning.">
        {dashboard.provisioningAttention.length === 0 ? (
          <Empty>No provisioning jobs require attention.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-500">
                <tr>{["Customer", "Product", "Status", ""].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dashboard.provisioningAttention.map((item) => (
                  <tr key={item.clientId}>
                    <td className="px-4 py-3 font-semibold text-slate-950">{item.organisation}</td>
                    <td className="px-4 py-3 text-slate-600">{item.product ?? "—"}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${statusClass(item.status)}`}>{item.status}</span></td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/customers/${item.clientId}?tab=provisioning`} className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:border-orange-300 hover:bg-orange-50">View Provisioning</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Recent Provisioning Activity" description="The most recent provisioning jobs across the platform.">
        {dashboard.recentProvisioning.length === 0 ? (
          <Empty>No recent provisioning activity.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-500">
                <tr>{["Customer", "Product", "Provisioning Status", "Updated", "Action"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dashboard.recentProvisioning.map((job) => (
                  <tr key={job.jobId}>
                    <td className="px-4 py-3 font-semibold text-slate-950">{job.organisation}</td>
                    <td className="px-4 py-3 text-slate-600">{job.product}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${statusClass(job.status)}`}>{job.status}</span></td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(job.updatedAt)}</td>
                    <td className="px-4 py-3">
                      {job.clientId ? (
                        <Link href={`/admin/customers/${job.clientId}?tab=provisioning`} className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:border-orange-300 hover:bg-orange-50">View Customer 360</Link>
                      ) : <span className="text-xs text-slate-500">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title="Active Projects" description="Platform-wide project visibility. Project management stays inside Customer 360 and the Customer Workspace.">
          <dl className="grid gap-3 md:grid-cols-4">
            <Metric label="Active" value={dashboard.projectSummary.active} />
            <Metric label="Planning" value={dashboard.projectSummary.planning} />
            <Metric label="On Hold" value={dashboard.projectSummary.onHold} />
            <Metric label="Completed" value={dashboard.projectSummary.completed} />
          </dl>
          {dashboard.activeProjects.length === 0 ? (
            <div className="mt-4"><Empty>No active projects.</Empty></div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-500">
                  <tr>{["Project", "Customer", "Status", "Target", "Updated"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dashboard.activeProjects.map((project) => (
                    <tr key={project.id}>
                      <td className="px-4 py-3 font-semibold text-slate-950">{project.projectName}</td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/customers/${project.clientId}?tab=projects`} className="font-semibold text-slate-700 hover:text-orange-700">{project.organisation}</Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{project.status}</td>
                      <td className="px-4 py-3 text-slate-600">{project.targetQuantity}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(project.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="grid gap-6">
          <Card title="Platform Users" description="Workspace membership across all customers.">
            <dl className="grid gap-3 md:grid-cols-2">
              <Metric label="Active Users" value={dashboard.users.active} />
              <Metric label="Pending Invitations" value={dashboard.users.pendingInvitations} />
            </dl>
          </Card>

          <Card title="Recent Platform Activity" description="Customer-attributable events from the existing audit records.">
            {dashboard.platformActivity.length === 0 ? (
              <Empty>No recent platform activity.</Empty>
            ) : (
              <ul className="grid gap-2">
                {dashboard.platformActivity.map((event, index) => (
                  <li key={`${event.actionType}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <p className="font-semibold text-slate-950">{event.label}</p>
                    <p className="text-xs text-slate-500">
                      {event.clientId && event.organisation ? (
                        <Link href={`/admin/customers/${event.clientId}?tab=audit`} className="font-semibold text-slate-600 hover:text-orange-700">{event.organisation}</Link>
                      ) : "Platform"}
                      {" · "}{formatDate(event.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-4" aria-busy="true" aria-label="Loading platform dashboard">
      {Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-lg bg-slate-100" />)}
    </div>
  );
}

export default async function AdminPage() {
  await requireRole(["admin"], "/admin");

  return (
    <CoreAdminShell activeView="dashboard">
      <div className="space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">DeployIQ Platform</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">Platform Dashboard</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Global visibility across customers, workspaces and provisioning. Customer operations live inside Customer 360 and each Customer Workspace.
          </p>
        </header>
        <Suspense fallback={<DashboardSkeleton />}>
          <PlatformDashboardContent />
        </Suspense>
      </div>
    </CoreAdminShell>
  );
}

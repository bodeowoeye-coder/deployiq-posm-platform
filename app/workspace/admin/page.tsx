import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  CUSTOMER_ADMIN_QUICK_ACTIONS,
  CUSTOMER_ADMIN_RECENT_ACTIVITY,
  CUSTOMER_ADMIN_SUPPORT_LINKS,
  CustomerWorkspaceRedirect,
  resolveCustomerWorkspaceContext,
  resolveCustomerWorkspaceHomeContext,
} from "@/lib/workspace/customerAdmin";
import { getWorkspaceAnalytics } from "@/lib/workspace/analytics";
import { getWorkspaceAlertsDashboard } from "@/lib/workspace/alerts";
import { hasValidGps } from "@/lib/reporting";

export const dynamic = "force-dynamic";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function statusClass(status: string) {
  if (status === "Completed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function displayMilestoneStatus(status: string) {
  return status === "Completed" ? "Completed" : "Not Started";
}

export default async function WorkspaceAdminPage({ searchParams }: { searchParams?: { projectId?: string } }) {
  let workspace;
  let dashboard;
  let alerts;
  try {
    workspace = await resolveCustomerWorkspaceContext();
    [dashboard, alerts] = await Promise.all([getWorkspaceAnalytics({ projectId: searchParams?.projectId }), getWorkspaceAlertsDashboard(searchParams?.projectId)]);
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }

  const primaryAdminName = workspace.email ?? "Administrator";

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-bold">Welcome to DeployIQ Retail</h2>
        <p className="mt-2 text-sm text-slate-600">{greeting()}, {primaryAdminName}. Your workspace has been successfully activated. Let&apos;s prepare your first deployment.</p>
      </div>
      <WorkspaceOperationalSnapshot dashboard={dashboard} alerts={alerts} />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Suspense fallback={<WorkspaceHomeMetricsSkeleton />}>
          <WorkspaceHomeMetrics />
        </Suspense>

        <aside className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Workspace information</p>
            <dl className="mt-4 space-y-3 text-sm">
              <Info label="Organisation" value={workspace.client.name} />
              <Info label="Workspace URL" value={workspace.workspaceUrl} mono />
              <Info label="Product" value={workspace.productName} />
              <Info label="Plan" value={workspace.planName} />
              <Info label="Primary administrator" value={primaryAdminName} />
              <Info label="Activation status" value={workspace.activationStatus} />
            </dl>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-sm font-bold text-emerald-900">Workspace access protected</p>
            <p className="mt-2 text-sm leading-6 text-emerald-800">
              Your workspace is connected to your organisation and protected by your administrator membership.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Need help?</p>
            <div className="mt-4 grid gap-2">
              {CUSTOMER_ADMIN_SUPPORT_LINKS.map((item) => (
                <a key={item.label} href={item.href} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function WorkspaceOperationalSnapshot({ dashboard, alerts }: { dashboard: Awaited<ReturnType<typeof getWorkspaceAnalytics>>; alerts: Awaited<ReturnType<typeof getWorkspaceAlertsDashboard>> }) {
  const analytics = dashboard.analytics;
  if (dashboard.queryStatus === "error" || !analytics) {
    return <section className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-rose-950"><h2 className="text-lg font-bold">Operational snapshot unavailable</h2><p className="mt-2 text-sm">{dashboard.loadError || "Dashboard data could not be loaded."}</p></section>;
  }

  const awaitingReview = analytics.submissions.filter((submission) => ["Pending", "Flagged"].includes(submission.status)).length;
  const correctionRequests = analytics.submissions.filter((submission) => submission.status === "Correction Requested").length;
  const gpsExceptions = analytics.submissions.filter((submission) => !hasValidGps(submission)).length;
  const projectsRequiringAttention = analytics.projectProgress.filter((project) => project.expected > project.actual).slice(0, 5);

  return (
    <section className="space-y-4" aria-label="Operational snapshot">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Operational snapshot</p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">How is deployment performing right now?</h2>
        </div>
        <a href="/workspace/admin/analytics" className="text-sm font-bold text-orange-600 hover:text-orange-700">Analyse performance</a>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OperationalMetric label="Expected / target deployments" value={analytics.portfolio.expected} />
        <OperationalMetric label="Actual deployments" value={analytics.kpis.actual} />
        <OperationalMetric label="Outstanding" value={analytics.kpis.outstanding} />
        <OperationalMetric label="Completion" value={`${analytics.kpis.completion}%`} />
        <OperationalMetric label="Approved" value={analytics.kpis.approved} />
        <OperationalMetric label="Pending" value={analytics.kpis.pending} />
        <OperationalMetric label="Rejected" value={analytics.kpis.rejected} />
        <OperationalMetric label="GPS verified" value={`${analytics.kpis.gpsVerifiedPercent}%`} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <AttentionPanel title="Needs review" items={[`${awaitingReview} submissions awaiting review`, `${correctionRequests} correction requests`, `${gpsExceptions} GPS exceptions`]} href="/workspace/admin/submissions" />
        <AttentionPanel title="Active alerts" items={alerts.alerts.length > 0 ? alerts.alerts.slice(0, 3).map((alert) => alert.title) : ["No active alerts"]} href="/workspace/admin/alerts" />
        <AttentionPanel title="Projects requiring attention" items={projectsRequiringAttention.length > 0 ? projectsRequiringAttention.map((project) => `${project.project}: ${project.completion}% complete`) : ["No projects require attention"]} href="/workspace/admin/projects" />
      </div>
    </section>
  );
}

function OperationalMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-950">{value}</p></div>;
}

function AttentionPanel({ title, items, href }: { title: string; items: string[]; href: string }) {
  return <section className="rounded-lg border border-slate-200 bg-white p-5"><div className="flex items-start justify-between gap-3"><h3 className="text-base font-bold text-slate-950">{title}</h3><a href={href} className="text-xs font-bold text-orange-600 hover:text-orange-700">Open</a></div><ul className="mt-4 space-y-2 text-sm text-slate-600">{items.map((item) => <li key={item} className="flex gap-2"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-orange-500" /><span>{item}</span></li>)}</ul></section>;
}

async function WorkspaceHomeMetrics() {
  let workspace;
  try {
    workspace = await resolveCustomerWorkspaceHomeContext();
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }

  const progress = workspace.setupProgress;
  const primaryAction = workspace.primaryAction;

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Workspace setup progress</p>
            <h2 className="mt-2 text-xl font-bold">Become operational</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Complete the workspace milestones in order to prepare your team for the first deployment.
            </p>
          </div>
          <a href={primaryAction.href} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-600">
            {primaryAction.primaryCta}
          </a>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-700">{progress.completed} of {progress.total} completed</span>
            <span className="font-bold text-slate-900">{progress.percent}%</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-orange-500" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>

        <ol className="mt-6 grid gap-3 sm:grid-cols-2">
          {workspace.setupSteps.map((item, index) => {
            const milestoneStatus = displayMilestoneStatus(item.status);
            const recommended = item.key === primaryAction.key && item.status !== "Completed";
            return (
              <li key={item.key} className={`rounded-lg border p-4 ${statusClass(milestoneStatus)}`}>
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-900">
                    {index + 1}
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold">{item.label}</p>
                      {recommended ? (
                        <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-orange-700">
                          Recommended
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-widest">{milestoneStatus}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Workspace health</p>
          <div className="mt-4 grid gap-2">
            {workspace.health.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <span className="font-semibold text-slate-800">{item.label}</span>
                <span className={`rounded-full px-2 py-1 text-xs font-bold ${item.state === "Completed" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{item.state}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Recent activity</p>
          <ul className="mt-4 space-y-3 text-sm">
            {CUSTOMER_ADMIN_RECENT_ACTIVITY.map((item) => (
              <li key={item} className="flex items-center gap-3 text-slate-700">
                <span className="h-2 w-2 rounded-full bg-orange-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Quick actions</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CUSTOMER_ADMIN_QUICK_ACTIONS.map((item) => (
            <a key={item.label} href={item.href} className="flex min-h-11 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-800 hover:border-orange-300 hover:bg-orange-50">
              {item.label}
            </a>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Field readiness</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Total Agencies" value={String(workspace.setupMetrics.agencyCount ?? 0)} />
          <Metric label="Total Installers" value={String(workspace.setupMetrics.installerCount ?? 0)} />
          <Metric label="Available Installers" value={String(workspace.setupMetrics.availableInstallerCount ?? 0)} />
          <Metric label="Busy Installers" value={String(workspace.setupMetrics.busyInstallerCount ?? 0)} />
          <Metric label="Campaigns Ready for Deployment" value={String(workspace.setupMetrics.campaignsReadyForDeployment ?? 0)} />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Deployment activity</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Today's Deployments" value={String(workspace.setupMetrics.todaysDeployments ?? 0)} />
          <Metric label="Pending Approvals" value={String(workspace.setupMetrics.pendingApprovals ?? 0)} />
          <Metric label="Rejected Today" value={String(workspace.setupMetrics.rejectedToday ?? 0)} />
          <Metric label="Installers Active" value={String(workspace.setupMetrics.installersActive ?? 0)} />
          <Metric label="Campaigns Running" value={String(workspace.setupMetrics.campaignsRunning ?? 0)} />
        </div>
      </div>
    </section>
  );
}

function WorkspaceHomeMetricsSkeleton() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-600" aria-label="Loading workspace setup">
      Loading workspace setup...
    </section>
  );
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</dt>
      <dd className={`mt-1 break-words font-semibold text-slate-900 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-950">{value}</p>
    </div>
  );
}

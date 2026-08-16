import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getPlatformCustomer360, getPlatformCustomerOperations } from "@/lib/admin/customer360";
import { UNAVAILABLE } from "@/lib/admin/customerControl";
import { OpenWorkspaceSupportAccess } from "@/components/admin/OpenWorkspaceSupportAccess";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TABS = ["overview", "workspace", "projects", "users", "operations", "commercial", "provisioning", "audit"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  workspace: "Workspace",
  projects: "Projects",
  users: "Users",
  operations: "Operations",
  commercial: "Commercial",
  provisioning: "Provisioning",
  audit: "Audit",
};

function formatDate(value: string | null) {
  if (!value) return UNAVAILABLE;
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function value(input: string | number | null | undefined) {
  if (input === null || input === undefined || input === "") return UNAVAILABLE;
  return String(input);
}

function Card({ title, description, children, actions }: { title: string; description?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-lg font-bold text-slate-950">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
        </div>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-3">
      <dt className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-slate-950">{children}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</p>;
}

// Every drill-down stays inside Customer 360 so the selected customer context is never lost.
function tabHref(clientId: string, tab: Tab) {
  return tab === "overview" ? `/admin/customers/${clientId}` : `/admin/customers/${clientId}?tab=${tab}`;
}

async function OperationsPanel({ clientId, compact }: { clientId: string; compact?: boolean }) {
  const operations = await getPlatformCustomerOperations(clientId);
  return (
    <>
      <dl className="grid gap-3 md:grid-cols-4">
        <Info label="Expected / Target">{operations.expected}</Info>
        <Info label="Actual Deployments">{operations.actual}</Info>
        <Info label="Outstanding">{operations.outstanding}</Info>
        <Info label="Completion">{operations.completionPercent}%</Info>
        {compact ? null : (
          <>
            <Info label="Approved">{operations.approved}</Info>
            <Info label="Pending Reviews">{operations.pending}</Info>
            <Info label="Rejected">{operations.rejected}</Info>
            <Info label="GPS Verified">{operations.gpsVerified}</Info>
          </>
        )}
        <Info label="Active Alerts">{operations.alerts}</Info>
      </dl>
      {compact ? null : (
        <>
          <h3 className="mt-6 text-sm font-bold text-slate-950">Recent Submission Activity</h3>
          {operations.recentSubmissions.length === 0 ? (
            <div className="mt-3"><Empty>No submission activity recorded for this customer.</Empty></div>
          ) : (
            <ul className="mt-3 grid gap-2">
              {operations.recentSubmissions.map((submission) => (
                <li key={submission.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-semibold text-slate-950">{submission.projectName}</span>
                  <span className="text-slate-600">{submission.installerName}</span>
                  <span className="text-slate-600">{submission.status}</span>
                  <span className="text-xs text-slate-500">{formatDate(submission.submittedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

async function AuditPanel({ clientId }: { clientId: string }) {
  const operations = await getPlatformCustomerOperations(clientId);
  if (operations.activity.length === 0) return <Empty>No customer activity recorded yet.</Empty>;
  return (
    <ul className="grid gap-2">
      {operations.activity.map((event, index) => (
        <li key={`${event.actionType}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="font-semibold text-slate-950">{event.actionType}</span>
          <span className="text-xs text-slate-500">{formatDate(event.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}

function PanelSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-4" aria-busy="true" aria-label="Loading customer operations">
      {Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-lg bg-slate-100" />)}
    </div>
  );
}

export default async function Customer360Page({
  params,
  searchParams,
}: {
  params: { clientId: string };
  searchParams?: { tab?: string };
}) {
  const context = await requireRole(["admin"], `/admin/customers/${params.clientId}`);
  const customer = await getPlatformCustomer360(params.clientId);
  if (!customer) notFound();

  const { organisation, workspace, commercial, people, projects } = customer;
  const clientId = organisation.clientId;
  const requestedTab = (searchParams?.tab ?? "") as Tab;
  const tab: Tab = TABS.includes(requestedTab) ? requestedTab : "overview";
  const adminName = context.user.email ?? "DeployIQ Platform Administrator";

  return (
    <div className="space-y-6">
      <header className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/admin/customers" className="text-xs font-semibold uppercase tracking-widest text-orange-600 hover:text-orange-700">Customer 360</Link>
            <h1 className="mt-2 text-2xl font-bold text-slate-950">{organisation.name}</h1>
            <p className="mt-1 text-sm font-semibold text-slate-600">
              {workspace.status} · {workspace.productName ?? workspace.productKey ?? UNAVAILABLE} · {workspace.plan ?? UNAVAILABLE}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <OpenWorkspaceSupportAccess
              clientId={clientId}
              organisation={organisation.name}
              adminName={adminName}
              provisioned={workspace.exists}
            />
            <Link href={tabHref(clientId, "projects")} className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:border-orange-300 hover:bg-orange-50">Projects</Link>
            <Link href={tabHref(clientId, "users")} className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:border-orange-300 hover:bg-orange-50">Users</Link>
          </div>
        </div>
        {workspace.exists ? (
          <p className="mt-3 text-xs font-medium text-slate-500">
            Opening the workspace starts a recorded DeployIQ support session. You remain signed in as yourself.
          </p>
        ) : null}

        <nav aria-label="Customer 360 sections" className="mt-5 flex flex-wrap gap-1 border-t border-slate-200 pt-4">
          {TABS.map((item) => (
            <Link
              key={item}
              href={tabHref(clientId, item)}
              aria-current={tab === item ? "page" : undefined}
              className={`inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-bold transition ${
                tab === item ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }`}
            >
              {TAB_LABELS[item]}
            </Link>
          ))}
        </nav>
      </header>

      {tab === "overview" ? (
        <>
          <Card title="Customer Overview" description="Identity, workspace status, commercial position and deployment performance at a glance.">
            <dl className="grid gap-3 md:grid-cols-4">
              <Info label="Organisation">{organisation.name}</Info>
              <Info label="Customer / Client ID"><code className="text-xs">{clientId}</code></Info>
              <Info label="Workspace Status">{workspace.status}</Info>
              <Info label="Activation">{workspace.activationStatus}</Info>
              <Info label="Product">{value(workspace.productName ?? workspace.productKey)}</Info>
              <Info label="Plan">{value(workspace.plan)}</Info>
              <Info label="Commercial Status">{commercial.commercialStatus}</Info>
              <Info label="Provisioning Status">{commercial.provisioningStatus}</Info>
              <Info label="Projects">{projects.total}</Info>
              <Info label="Active Members">{people.activeCount}</Info>
              <Info label="Pending Invitations">{people.invitedCount}</Info>
              <Info label="Customer Source">{organisation.source}</Info>
            </dl>
          </Card>
          <Card title="Deployment Performance" description="Live operational snapshot for this customer.">
            <Suspense fallback={<PanelSkeleton />}>
              <OperationsPanel clientId={clientId} compact />
            </Suspense>
          </Card>
          <Card title="Organisation" description="The customer organisation record. Distinct from the workspace and from the primary administrator.">
            <dl className="grid gap-3 md:grid-cols-3">
              <Info label="Organisation Name">{organisation.name}</Info>
              <Info label="Customer / Client ID"><code className="text-xs">{clientId}</code></Info>
              <Info label="Organisation Status">{organisation.status}</Info>
              <Info label="Commercial Reference">{value(organisation.commercialReference)}</Info>
              <Info label="Primary Contact">{value(organisation.contactPerson)}</Info>
              <Info label="Contact Email">{value(organisation.contactEmail)}</Info>
              <Info label="Phone">{value(organisation.contactPhone)}</Info>
              <Info label="Created">{formatDate(organisation.createdAt)}</Info>
              <Info label="Customer Source">{organisation.source}</Info>
            </dl>
          </Card>
        </>
      ) : null}

      {tab === "workspace" ? (
        <Card title="Workspace" description="The provisioned Customer Workspace tenant.">
          {!workspace.exists ? (
            <Empty>Workspace has not been provisioned for this customer.</Empty>
          ) : (
            <dl className="grid gap-3 md:grid-cols-3">
              <Info label="Workspace URL">{value(workspace.url)}</Info>
              <Info label="Workspace / Client ID"><code className="text-xs">{workspace.clientId}</code></Info>
              <Info label="Display Name">{value(workspace.displayName)}</Info>
              <Info label="Product">{value(workspace.productName ?? workspace.productKey)}</Info>
              <Info label="Plan">{value(workspace.plan)}</Info>
              <Info label="Workspace Status">{workspace.status}</Info>
              <Info label="Activation Status">{workspace.activationStatus}</Info>
              <Info label="Provisioned">{formatDate(workspace.provisionedAt)}</Info>
              <Info label="Workspace Version">{value(workspace.manifestVersion)}</Info>
              <Info label="Country / Timezone">{value(workspace.country)} · {value(workspace.timezone)}</Info>
              <Info label="Enabled Modules">{workspace.enabledModules.length > 0 ? workspace.enabledModules.join(", ") : UNAVAILABLE}</Info>
              <Info label="Lifecycle Statuses">{workspace.lifecycleStatuses.length > 0 ? `${workspace.lifecycleStatuses.length} configured` : UNAVAILABLE}</Info>
            </dl>
          )}
        </Card>
      ) : null}

      {tab === "projects" ? (
        <Card title="Projects & Campaigns" description="Workspace → Project → Campaign, scoped to this customer only.">
          <dl className="grid gap-3 md:grid-cols-5">
            <Info label="Total Projects">{projects.total}</Info>
            <Info label="Active">{projects.active}</Info>
            <Info label="Planning">{projects.planning}</Info>
            <Info label="On Hold">{projects.onHold}</Info>
            <Info label="Completed">{projects.completed}</Info>
          </dl>
          {projects.items.length === 0 ? (
            <div className="mt-4"><Empty>No projects configured.</Empty></div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-500">
                  <tr>{["Project", "Campaign", "Brand", "Status", "Target", "Regions", "States", "Agency", "Lead Installer", "Start", "Expected End"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {projects.items.map((project) => (
                    <tr key={project.id}>
                      <td className="px-4 py-3 font-semibold text-slate-950">{project.projectName}</td>
                      <td className="px-4 py-3 text-slate-600">{value(project.campaignName)}</td>
                      <td className="px-4 py-3 text-slate-600">{value(project.brand)}</td>
                      <td className="px-4 py-3 text-slate-600">{project.status}</td>
                      <td className="px-4 py-3 text-slate-600">{project.targetQuantity}</td>
                      <td className="px-4 py-3 text-slate-600">{project.regions.length > 0 ? project.regions.join(", ") : "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{project.states.length > 0 ? project.states.join(", ") : "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{value(project.agencyName)}</td>
                      <td className="px-4 py-3 text-slate-600">{value(project.leadInstallerName)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(project.startDate)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(project.endDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {tab === "users" ? (
        <Card title="Administrators & Users" description="Read-only view of the canonical workspace membership roster for this customer.">
          <dl className="grid gap-3 md:grid-cols-4">
            <Info label="Primary Administrator">{value(people.primaryAdministrator?.fullName)}</Info>
            <Info label="Administrator Email">{value(people.primaryAdministrator?.email)}</Info>
            <Info label="Active Members">{people.activeCount}</Info>
            <Info label="Pending Invitations">{people.invitedCount}</Info>
          </dl>
          {people.members.length === 0 ? (
            <div className="mt-4"><Empty>No workspace users yet.</Empty></div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-500">
                  <tr>{["Name", "Email", "Role", "Status"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {people.members.map((member) => (
                    <tr key={member.userId}>
                      <td className="px-4 py-3 font-semibold text-slate-950">{member.fullName}</td>
                      <td className="px-4 py-3 text-slate-600">{value(member.email)}</td>
                      <td className="px-4 py-3 text-slate-600">{member.roleKey}</td>
                      <td className="px-4 py-3 text-slate-600">{member.membershipStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {tab === "operations" ? (
        <Card title="Operational Health" description="Customer health snapshot using the existing canonical operations calculations.">
          <Suspense fallback={<PanelSkeleton />}>
            <OperationsPanel clientId={clientId} />
          </Suspense>
        </Card>
      ) : null}

      {tab === "commercial" ? (
        <Card title="Commercial" description="Linked to the existing commercial journey. No values are inferred.">
          <dl className="grid gap-3 md:grid-cols-3">
            <Info label="Commercial Status">{commercial.commercialStatus}</Info>
            <Info label="Commercial Reference">{value(commercial.commercialReference)}</Info>
            <Info label="Onboarding Draft ID"><code className="text-xs">{value(commercial.onboardingDraftId)}</code></Info>
            <Info label="Product Selected">{value(commercial.productKey)}</Info>
            <Info label="Plan Selected">{value(commercial.plan)}</Info>
            <Info label="Programme Quantity">{value(commercial.programmeQuantity)}</Info>
            <Info label="Entitlement Status">{value(commercial.entitlementStatus)}</Info>
            <Info label="Activation Date">{formatDate(commercial.activationDate)}</Info>
          </dl>
        </Card>
      ) : null}

      {tab === "provisioning" ? (
        <Card title="Provisioning" description="The existing provisioning job and its event history.">
          <dl className="grid gap-3 md:grid-cols-3">
            <Info label="Provisioning Job ID"><code className="text-xs">{value(commercial.provisioningJobId)}</code></Info>
            <Info label="Provisioning Status">{commercial.provisioningStatus}</Info>
            <Info label="Provisioning Stage">{value(commercial.provisioningStage)}</Info>
            <Info label="Progress">{commercial.progressPercent === null ? UNAVAILABLE : `${commercial.progressPercent}%`}</Info>
            <Info label="Attempts / Retries">{value(commercial.attemptCount)}</Info>
            <Info label="Started">{formatDate(commercial.startedAt)}</Info>
            <Info label="Completed">{formatDate(commercial.completedAt)}</Info>
            <Info label="Failed">{formatDate(commercial.failedAt)}</Info>
          </dl>
          {commercial.failureMessage ? (
            <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
              Provisioning failure ({value(commercial.failureCode)}): {commercial.failureMessage}
            </p>
          ) : null}
          {commercial.shadowPlanning ? (
            <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm">
              <p className="font-bold text-indigo-900">DeployIQ AI Shadow Mode plan generated</p>
              <dl className="mt-3 grid gap-2 md:grid-cols-3">
                <Info label="Validation">{value(commercial.shadowPlanning.validationStatus)}</Info>
                <Info label="Provider">{value(commercial.shadowPlanning.providerVersion)}</Info>
                <Info label="Generated">{formatDate(commercial.shadowPlanning.generatedAt)}</Info>
              </dl>
              {commercial.shadowPlanning.differences.length ? <p className="mt-3 text-xs text-indigo-800">Comparison: {commercial.shadowPlanning.differences.map((item) => item.classification).join(", ")}</p> : null}
            </div>
          ) : null}
          <h3 className="mt-6 text-sm font-bold text-slate-950">Provisioning History</h3>
          {commercial.events.length === 0 ? (
            <div className="mt-3"><Empty>Provisioning record not available.</Empty></div>
          ) : (
            <ul className="mt-3 grid gap-2">
              {commercial.events.map((event, index) => (
                <li key={`${event.stage}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-semibold text-slate-950">{event.stage}</span>
                  <span className="text-slate-600">{event.message}</span>
                  <span className="text-xs text-slate-500">{formatDate(event.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === "audit" ? (
        <Card title="Recent Activity" description="Customer-level activity from the existing audit records.">
          <Suspense fallback={<PanelSkeleton />}>
            <AuditPanel clientId={clientId} />
          </Suspense>
        </Card>
      ) : null}

      <Card title="Platform Controls" description="Safe controls supported by the current architecture. Impersonation and destructive actions are intentionally not available in this pass.">
        <div className="flex flex-wrap gap-2">
          <Link href={tabHref(clientId, "projects")} className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:border-orange-300 hover:bg-orange-50">View Projects</Link>
          <Link href={tabHref(clientId, "users")} className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:border-orange-300 hover:bg-orange-50">View Users</Link>
          <Link href={tabHref(clientId, "operations")} className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:border-orange-300 hover:bg-orange-50">Reports &amp; Submissions</Link>
          <Link href={tabHref(clientId, "provisioning")} className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:border-orange-300 hover:bg-orange-50">Provisioning History</Link>
          <Link href={tabHref(clientId, "commercial")} className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:border-orange-300 hover:bg-orange-50">Commercial Record</Link>
        </div>
        <p className="mt-4 text-xs font-medium leading-5 text-slate-500">
          Impersonation, destructive delete, billing override and subscription cancellation are not available. Resend activation and provisioning retry are deferred until the existing retry path is exposed as an admin-safe action.
        </p>
      </Card>
    </div>
  );
}

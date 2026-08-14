import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CampaignActionsPanel } from "@/components/workspace/CampaignActionsPanel";
import { CampaignLocationsClient } from "@/components/workspace/CampaignLocationsClient";
import { CustomerWorkspaceRedirect, resolveCustomerWorkspaceContext } from "@/lib/workspace/customerAdmin";
import { getWorkspaceCampaign } from "@/lib/workspace/campaigns";
import { getCampaignLocationDashboard } from "@/lib/workspace/campaignLocations";

export const dynamic = "force-dynamic";

const tabs = ["Overview", "Deployment Locations", "Team", "Submissions", "Reports", "Analytics", "Activity", "Settings"] as const;

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString() : "Not set";
}

function listValue(values: string[] | null | undefined) {
  return values && values.length > 0 ? values.join(", ") : "Not set";
}

function daysRemaining(endDate: string) {
  const diff = new Date(endDate).getTime() - Date.now();
  if (!Number.isFinite(diff)) return "Not set";
  const days = Math.ceil(diff / 86_400_000);
  if (days < 0) return "Completed window";
  if (days === 0) return "Ends today";
  return `${days} days remaining`;
}

function readinessClass(passed: boolean, category: string) {
  if (passed) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (category === "Required before launch") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { tab?: string };
}) {
  let result;
  let locationDashboard = null;
  try {
    const workspace = await resolveCustomerWorkspaceContext();
    result = await getWorkspaceCampaign(params.id, workspace);
    if ((searchParams?.tab ?? "").toLowerCase() === "deployment locations") {
      locationDashboard = await getCampaignLocationDashboard(params.id, {}, workspace);
    }
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }
  if (!result) notFound();
  const campaign = result.campaign;
  const activeTab = tabs.find((tab) => tab.toLowerCase() === (searchParams?.tab ?? "").toLowerCase()) ?? "Overview";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Campaign Details</p>
          <h2 className="mt-2 text-2xl font-bold">{campaign.campaign_name}</h2>
          <p className="mt-2 text-sm text-slate-600">{campaign.projectName} | {campaign.brand_name} | {campaign.customerStatus}</p>
        </div>
        <Link href={`/workspace/admin/projects/${campaign.project_id}`} className="workspace-button-secondary">Open Project</Link>
      </div>

      <nav className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-3" aria-label="Campaign sections">
        {tabs.map((tab) => (
          <Link
            key={tab}
            href={`/workspace/admin/campaigns/${campaign.id}?tab=${encodeURIComponent(tab)}`}
            aria-current={activeTab === tab ? "page" : undefined}
            className={`rounded-lg border px-3 py-2 text-sm font-bold ${activeTab === tab ? "border-orange-300 bg-orange-50 text-orange-900" : "border-slate-200 bg-white text-slate-700"}`}
          >
            {tab}
          </Link>
        ))}
      </nav>

      {activeTab === "Overview" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <section className="space-y-6">
            <div className="grid gap-3 md:grid-cols-3">
              <Metric label="Status" value={campaign.customerStatus} />
              <Metric label="Progress %" value={`${campaign.progressPercent}%`} />
              <Metric label="Expected Deployments" value={String(campaign.target_quantity)} />
              <Metric label="Actual Deployments" value={String(campaign.actualDeployments)} />
              <Metric label="Outstanding" value={String(campaign.outstanding)} />
              <Metric label="Approved" value={String(campaign.approved)} />
              <Metric label="Pending" value={String(campaign.pending)} />
              <Metric label="Rejected" value={String(campaign.rejected)} />
              <Metric label="GPS Verified" value={String(campaign.gpsVerified)} />
              <Metric label="Start Date" value={formatDate(campaign.start_date)} />
              <Metric label="End Date" value={formatDate(campaign.end_date)} />
              <Metric label="Days Remaining" value={daysRemaining(campaign.end_date)} />
            </div>

            <DossierSection title="Campaign Identity">
              <Info label="Campaign Name" value={campaign.campaign_name} />
              <Info label="Brand" value={campaign.brand_name} />
              <Info label="Deployment Type" value={campaign.deployment_type} />
              <Info label="Project" value={campaign.projectName} />
              <Info label="Status" value={campaign.customerStatus} />
              <Info label="Description" value={campaign.description ?? "Not set"} />
            </DossierSection>

            <DossierSection title="Geography">
              <Info label="States" value={listValue(campaign.states)} />
              <Info label="Regions" value={listValue(campaign.regions)} />
              <Info label="Cities" value={listValue(campaign.cities)} />
            </DossierSection>

            <DossierSection title="Team & Execution">
              <Info label="Assigned Manager" value={campaign.campaign_manager_user_id ? "Assigned" : "Not assigned"} />
              <Info label="Assigned Field Resources" value={String(campaign.assignedResourceCount)} />
              <Info label="Agency" value={campaign.agency_name ?? "Not assigned"} />
              <Info label="Installer team / field team" value={campaign.field_team_name ?? "Not assigned"} />
            </DossierSection>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-bold">Campaign Readiness</h3>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {campaign.readiness.checks.map((check) => (
                  <div key={check.key} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${readinessClass(check.passed, check.category)}`}>
                    <span className="block">{check.label}: {check.passed ? "Ready" : "Missing"}</span>
                    <span className="text-xs opacity-80">{check.category}</span>
                  </div>
                ))}
              </div>
              {!campaign.readiness.ready ? <p className="mt-4 text-sm text-amber-800">Complete the required readiness items before activating this campaign.</p> : null}
            </section>
          </section>

          <aside className="space-y-4">
            <CampaignActionsPanel campaignId={campaign.id} status={campaign.customerStatus} readiness={campaign.readiness} />
          </aside>
        </div>
      ) : activeTab === "Deployment Locations" && locationDashboard ? (
        <CampaignLocationsClient initialDashboard={locationDashboard} />
      ) : (
        <DossierSection title={activeTab}>
          <Info label="Campaign" value={campaign.campaign_name} />
          <Info label="Project" value={campaign.projectName} />
          <Info label="Status" value={campaign.customerStatus} />
          <Info label="Availability" value="Workspace activity will appear here as setup progresses." />
        </DossierSection>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-bold text-slate-950">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function DossierSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-bold text-slate-950">{title}</h3>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-3">{children}</dl>
    </section>
  );
}

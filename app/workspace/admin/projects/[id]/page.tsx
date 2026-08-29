import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProjectActionsPanel } from "@/components/workspace/ProjectActionsPanel";
import { BuildProjectShell } from "@/components/workspace/BuildProjectShell";
import { getBuildProjectWorkspaceOverview, type BuildProjectWorkspaceOverview } from "@/lib/build/projects/workspaceOverview";
import { isBuildProjectType } from "@/lib/build/projects/types";
import { CustomerWorkspaceRedirect, resolveCustomerWorkspaceContext } from "@/lib/workspace/customerAdmin";
import { getCustomerProject } from "@/lib/workspace/projects";
import { getCustomerWorkspaceProjectScope } from "@/lib/workspace/projectScope";

export const dynamic = "force-dynamic";

export default async function WorkspaceProjectDetailPage({
  params,
}: {
  params: { id: string };
}) {
  let workspace;
  try {
    workspace = await resolveCustomerWorkspaceContext();
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }
  const projectScope = await getCustomerWorkspaceProjectScope(workspace, params.id);
  const canonicalProject = projectScope.selectedProject;
  if (!canonicalProject) notFound();
  if (isBuildProjectType(canonicalProject.project_type)) {
    const overview = await getBuildProjectWorkspaceOverview(canonicalProject.id);
    return <BuildProjectOverview overview={overview} />;
  }
  if (canonicalProject.project_type !== "Retail Deployment") notFound();

  let result;
  try {
    result = await getCustomerProject(params.id);
  } catch (error) {
    if (error instanceof CustomerWorkspaceRedirect) redirect(error.redirectTo);
    throw error;
  }
  if (!result) notFound();

  const projectFilter = `projectId=${encodeURIComponent(result.project.id)}`;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">PROJECT DETAILS</p>
        <h2 className="mt-2 text-2xl font-bold">{result.project.project_name}</h2>
        <p className="mt-2 text-sm text-slate-600">Review operational status, coverage, evidence performance and project activity.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="space-y-6">
          <div className="grid gap-3 md:grid-cols-3">
            <Metric label="Project Status" value={result.project.customerStatus} />
            <Metric label="Progress" value={`${result.project.progressPercent}%`} />
            <Metric label="Expected Deployments" value={String(result.overview.expectedDeployments)} />
            <Metric label="Completed" value={String(result.overview.completed)} />
            <Metric label="Pending" value={String(result.overview.pending)} />
            <Metric label="Rejected" value={String(result.overview.rejected)} />
            <Metric label="GPS Verified" value={String(result.overview.gpsVerified)} />
            <Metric label="States" value={result.overview.states.length > 0 ? result.overview.states.join(", ") : "Not defined"} />
            <Metric label="Project Health" value={result.overview.health} />
          </div>

          <DossierSection title="Project Overview">
            <Info label="Project Name" value={result.project.project_name} />
            <Info label="Campaign" value={result.project.campaign_name ?? "Not set"} />
            <Info label="Product" value={result.project.productName} />
            <Info label="Deployment Type" value={result.project.deploymentType} />
            <Info label="Status" value={result.project.customerStatus} />
            <Info label="Owner" value={result.project.project_manager ?? "Workspace administrator"} />
            <Info label="Created Date" value={formatDate(result.project.created_at)} />
            <Info label="Launch Date" value={formatDate(result.project.start_date)} />
          </DossierSection>

          <DossierSection title="Coverage & Directory">
            <Info label="States" value={listValue(result.overview.states)} />
            <Info label="Regions" value={listValue(result.overview.regions)} />
            <Info label="Cities" value={listValue(result.overview.cities)} />
            <Info label="LGAs" value={listValue(result.overview.lgas)} />
            <Info label="Imported Records" value={String(result.overview.directory.importedRecords)} />
            <Info label="Validation Status" value={result.overview.directory.validationStatus} />
          </DossierSection>

          <DossierSection title="Resources">
            <Info label="Assigned Agency" value={result.resources.agencyName ?? "No agency assigned"} />
            <Info label="Lead Installer" value={result.resources.leadInstallerName ?? "No lead installer assigned"} />
            <Info label="Assigned Installers" value={listValue(result.project.assigned_installers ?? [])} />
            <Info label="Assignment Source" value="User Management" />
          </DossierSection>

          <DossierSection title="Recent Activity">
            <Info label="Created" value={formatDate(result.project.created_at)} />
            <Info label="Updated" value={formatDate(result.project.updatedAt)} />
            <Info label="Imported" value={formatDate(result.overview.directory.importDate)} />
            <Info label="Archived" value={result.project.archived_at ? formatDate(result.project.archived_at) : "Not archived"} />
          </DossierSection>
        </section>

        <aside className="space-y-4">
          <ProjectActionsPanel projectId={result.project.id} launchReady={result.project.readiness.ready} />
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Open Shared Modules</p>
            <div className="mt-4 grid gap-2">
              <Link href={`/workspace/admin/reports?${projectFilter}`} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">View Reports</Link>
              <Link href={`/workspace/admin/submissions?${projectFilter}`} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">View Submissions</Link>
              <Link href={`/workspace/admin/analytics?${projectFilter}`} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">View Analytics</Link>
              <Link href={`/workspace/admin/map?${projectFilter}`} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">View Deployment Map</Link>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Configuration</p>
            <div className="mt-4 grid gap-2">
              <Link href={`/workspace/admin/projects/${result.project.id}/edit`} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">Edit</Link>
              <Link href="/workspace/admin/campaigns" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">Campaign Management</Link>
              <Link href="/workspace/admin/team" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">User Management</Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function BuildProjectOverview({ overview }: { overview: BuildProjectWorkspaceOverview }) {
  const metrics = [
    ["Sites", overview.counts.sites],
    ["Work Packages", overview.counts.workPackages],
    ["Templates", overview.counts.templates],
    ["Categories", overview.counts.categories],
    ["Activities", overview.counts.activities],
    ["Checklists", overview.counts.checklists],
    ["Resources", overview.counts.resources],
    ["Dependencies", overview.counts.dependencies],
  ] as const;
  return (
    <BuildProjectShell project={overview.project} activeSection="overview">
      <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Build foundation</p>
          <h3 className="mt-1 text-xl font-bold text-slate-950">Project Overview</h3>
          <p className="mt-2 text-sm text-slate-600">Authoritative foundation records currently assigned to this project.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map(([label, value]) => <Metric key={label} label={label} value={String(value)} />)}
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <FoundationList
            title="Sites"
            empty="No active Build Sites are assigned."
            rows={overview.sites.map((site) => ({ id: site.id, name: site.name, detail: [site.siteCode, site.status].filter(Boolean).join(" · ") }))}
          />
          <FoundationList
            title="Work Packages"
            empty="No active Work Packages are assigned."
            rows={overview.workPackages.map((workPackage) => ({ id: workPackage.id, name: workPackage.name, detail: [workPackage.code, workPackage.templateName, workPackage.status].filter(Boolean).join(" · ") }))}
          />
        </div>
      </section>
    </BuildProjectShell>
  );
}

function FoundationList({ title, empty, rows }: { title: string; empty: string; rows: Array<{ id: string; name: string; detail: string }> }) {
  return <section className="rounded-lg border border-slate-200 p-5"><h4 className="font-bold text-slate-950">{title}</h4>{rows.length === 0 ? <p className="mt-3 text-sm text-slate-600">{empty}</p> : <ul className="mt-3 divide-y divide-slate-100">{rows.map((row) => <li key={row.id} className="py-3"><p className="font-semibold text-slate-900">{row.name}</p><p className="mt-1 text-xs text-slate-500">{row.detail || "No additional details"}</p></li>)}</ul>}</section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-bold text-slate-950">{value}</p>
    </div>
  );
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString() : "Not set";
}

function listValue(values: string[] | null | undefined) {
  return values && values.length > 0 ? values.join(", ") : "Not set";
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

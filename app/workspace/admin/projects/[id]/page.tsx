import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProjectActionsPanel } from "@/components/workspace/ProjectActionsPanel";
import { BuildProjectShell } from "@/components/workspace/BuildProjectShell";
import { getBuildProjectWorkspaceOverview, type BuildProjectWorkspaceOverview } from "@/lib/build/projects/workspaceOverview";
import { getBuildManagementSummary, type BuildManagementSummary } from "@/lib/build/management/service";
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
    const [overview, management] = await Promise.all([
      getBuildProjectWorkspaceOverview(canonicalProject.id),
      getBuildManagementSummary(canonicalProject.id),
    ]);
    return <BuildProjectOverview overview={overview} management={management} />;
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

function BuildProjectOverview({ overview, management }: { overview: BuildProjectWorkspaceOverview; management: BuildManagementSummary }) {
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
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Project execution</p>
          <h3 className="mt-1 text-xl font-bold text-slate-950">Current operational state</h3>
        </div>
        {!management.hasWorkPlans ? <p className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600">No runtime Work Plans exist for this Project yet.</p> : <>
          <section><h4 className="font-bold text-slate-950">Activity Execution</h4><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[["Total Activities",management.activities.total],["Not Started",management.activities.not_started],["In Progress",management.activities.in_progress],["Completed",management.activities.completed],["Blocked",management.activities.blocked],["Awaiting Review",management.activities.submitted_for_review],["Changes Required",management.activities.changes_required],["Approved",management.activities.approved]].map(([label,value])=><Metric key={label} label={String(label)} value={String(value)}/>) }
          </div></section>
          <section><h4 className="font-bold text-slate-950">Schedule Performance</h4><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[["Scheduled Activities",management.schedule.scheduled,false],["Currently Overdue",management.schedule.currentlyOverdue,true],["Completed On Time",management.schedule.completedOnTime,false],["Completed Late",management.schedule.completedLate,false]].map(([label,value,attention])=><Metric key={String(label)} label={String(label)} value={String(value)} attention={Boolean(attention) && Number(value) > 0}/>) }
          </div>{management.schedule.dataIncomplete > 0 ? <p className="mt-3 text-sm font-semibold text-amber-800">{management.schedule.dataIncomplete} {countLabel(management.schedule.dataIncomplete, "Activity has", "Activities have")} incomplete schedule history or dates.</p> : null}</section>
          <section className="rounded-lg border border-slate-200 p-5"><h4 className="font-bold text-slate-950">Schedule Attention</h4><div className="mt-3 grid gap-3 sm:grid-cols-3"><Metric label="Work Packages with overdue work" value={String(management.schedule.workPackagesOverdue)} attention={management.schedule.workPackagesOverdue > 0}/><Metric label="Blocked and overdue" value={String(management.schedule.blockedOverdue)} attention={management.schedule.blockedOverdue > 0}/><Metric label="Changes Required and overdue" value={String(management.schedule.changesRequiredOverdue)} attention={management.schedule.changesRequiredOverdue > 0}/></div></section>
          <section aria-labelledby="delay-dependencies-heading" className="rounded-lg border border-slate-200 p-5">
            <div>
              <h4 id="delay-dependencies-heading" className="font-bold text-slate-950">Delay &amp; Dependencies</h4>
              <p className="mt-1 text-sm text-slate-600">Dependency conditions are derived from the confirmed Work Plan schedule and recorded runtime milestones.</p>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label={countLabel(management.dependencyFacts.unreleasedConstraints, "Unreleased Constraint", "Unreleased Constraints")} value={String(management.dependencyFacts.unreleasedConstraints)} attention={management.dependencyFacts.unreleasedConstraints > 0}/>
              <Metric label={countLabel(management.dependencyFacts.downstreamActivitiesExposed, "Activity Exposed", "Activities Exposed")} value={String(management.dependencyFacts.downstreamActivitiesExposed)} attention={management.dependencyFacts.downstreamActivitiesExposed > 0}/>
              <Metric label={countLabel(management.dependencyFacts.overdueSuccessorsWithUnreleasedConstraints, "Overdue Activity with Unreleased Dependency", "Overdue Activities with Unreleased Dependencies")} value={String(management.dependencyFacts.overdueSuccessorsWithUnreleasedConstraints)} attention={management.dependencyFacts.overdueSuccessorsWithUnreleasedConstraints > 0}/>
              <Metric label={countLabel(management.dependencyFacts.workPackagesWithDependencyExceptions, "Work Package with Dependency Exceptions", "Work Packages with Dependency Exceptions")} value={String(management.dependencyFacts.workPackagesWithDependencyExceptions)} attention={management.dependencyFacts.workPackagesWithDependencyExceptions > 0}/>
            </div>
            <p className="mt-3 text-sm text-slate-600">{management.dependencyFacts.totalConstraints} {countLabel(management.dependencyFacts.totalConstraints, "total Dependency Constraint", "total Dependency Constraints")} · {management.dependencyFacts.latePredecessorActivities} {countLabel(management.dependencyFacts.latePredecessorActivities, "Late Predecessor", "Late Predecessors")}</p>
            {management.dependencyFacts.dataIncompleteConstraints > 0 ? <p className="mt-1 text-sm font-semibold text-amber-800">{management.dependencyFacts.dataIncompleteConstraints} {countLabel(management.dependencyFacts.dataIncompleteConstraints, "Dependency Condition has", "Dependency Conditions have")} incomplete source data.</p> : null}
            <p className="mt-1 text-xs text-slate-500">Exposed Activities have at least one unreleased dependency constraint. This does not mean the Activity is already overdue.</p>
          </section>
          <section><h4 className="font-bold text-slate-950">Exception Health</h4><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
            {[["Open Exceptions",management.exceptions.active],["Overdue Exceptions",management.exceptions.overdue]].map(([label,value])=><Metric key={label} label={String(label)} value={String(value)}/>) }
          </div></section>
          <ManagementAttention management={management} projectId={overview.project.id}/>
          <section><h4 className="font-bold text-slate-950">Work Package Execution</h4><div className="mt-3 max-w-full overflow-x-auto overscroll-x-contain rounded-lg border border-slate-200 pb-2"><table className="min-w-[1600px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-slate-500"><tr>{["Work Package","Site","Activities","Not Started","In Progress","Completed","Blocked","Awaiting Review","Changes Required","Approved","Scheduled","Not Yet Due","On Schedule","Schedule Overdue","Completed On Time","Completed Late","Dependency Exceptions","Active Exceptions","Exception Overdue"].map((label)=><th key={label} className="whitespace-nowrap border-b px-3 py-3">{label}</th>)}</tr></thead><tbody>{management.workPackages.map((item)=><tr key={item.id} className="border-b border-slate-100 last:border-b-0"><td className="min-w-56 whitespace-nowrap px-3 py-3"><Link className="font-bold text-orange-700" href={`/workspace/admin/projects/${overview.project.id}/activities?workPackage=${item.id}`}>{item.name}</Link></td><td className="min-w-52 whitespace-nowrap px-3 py-3">{item.siteName}</td>{[item.activities.total,item.activities.not_started,item.activities.in_progress,item.activities.completed,item.activities.blocked,item.activities.submitted_for_review,item.activities.changes_required,item.activities.approved,item.schedule.scheduled,item.schedule.notYetDue,item.schedule.onSchedule,item.schedule.overdue,item.schedule.completedOnTime,item.schedule.completedLate].map((value,index)=><td key={index} className="whitespace-nowrap px-3 py-3">{value}</td>)}<td className={item.dependencies.hasDependencyExceptions ? "whitespace-nowrap px-3 py-3 font-semibold text-orange-700" : "whitespace-nowrap px-3 py-3"}>{item.dependencies.unreleasedConstraints}</td>{[item.activeExceptions,item.overdueExceptions].map((value,index)=><td key={index} className="whitespace-nowrap px-3 py-3">{value}</td>)}</tr>)}</tbody></table></div></section>
          <section className="border-t border-slate-200 pt-5"><h4 className="font-bold text-slate-950">Schedule Responsibility</h4>{management.scheduleResponsibility.length?<ul className="mt-2 divide-y divide-slate-100">{management.scheduleResponsibility.map((item)=><li key={item.ownerUserId} className="py-3"><p className="font-semibold text-slate-900">{item.ownerName}</p><p className="mt-1 text-sm text-slate-600">{item.assignedScheduled} scheduled · {item.overdueToStart} overdue to start · {item.overdueToComplete} overdue to complete · {item.completedLate} completed late · {item.blockedOverdue} blocked and overdue · {item.awaitingReview} awaiting review</p></li>)}</ul>:<p className="mt-3 text-sm text-slate-600">No scheduled Activity responsibility.</p>}</section>
        </>}
      </section>
      <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Build foundation</p>
          <h3 className="mt-1 text-xl font-bold text-slate-950">Project Overview</h3>
          <p className="mt-2 text-sm text-slate-600">Current foundation records assigned to this project.</p>
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

function ManagementAttention({management,projectId}:{management:BuildManagementSummary;projectId:string}) {
  const summary = management.managementAttention;
  const categories = [
    ["Schedule Overdue",summary.categoryCounts.scheduleOverdue], ["Execution Blocks",summary.categoryCounts.executionBlocks],
    ["Corrective Action Required",summary.categoryCounts.correctiveActionsRequired], ["Active Exceptions",summary.categoryCounts.activeExceptions],
    ["Overdue Exceptions",summary.categoryCounts.overdueExceptions], ["Reviews Pending",summary.categoryCounts.reviewsPending],
    ["Assignments Missing",summary.categoryCounts.assignmentsMissing], ["Dependency Attention",summary.categoryCounts.dependencyAttention],
    ["Data Incomplete",summary.categoryCounts.dataIncomplete],
  ] as const;
  return <section aria-labelledby="management-attention-heading" className="rounded-lg border border-slate-200 p-5">
    <div><h4 id="management-attention-heading" className="font-bold text-slate-950">Management Attention</h4><p className="mt-1 text-sm text-slate-600">Factual unresolved operational obligations derived from current Project records.</p></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Outstanding Obligations" value={String(summary.outstandingObligations)} attention={summary.outstandingObligations > 0}/>
      <Metric label="Overdue Obligations" value={String(summary.overdueObligations)} attention={summary.overdueObligations > 0}/>
      <Metric label="Activities Affected" value={String(summary.activitiesAffected)}/>
      <Metric label="Work Packages Affected" value={String(summary.workPackagesAffected)}/>
      <Metric label="Unassigned Obligations" value={String(summary.unassignedObligations)} attention={summary.unassignedObligations > 0}/>
    </div>
    {summary.outstandingObligations ? <>
      <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{categories.filter(([,count])=>count>0).map(([label,count])=><div key={label} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"><dt className="text-sm text-slate-600">{label}</dt><dd className="font-bold text-slate-950">{count}</dd></div>)}</dl>
      <div className="mt-5 border-t border-slate-200 pt-4"><h5 className="text-sm font-bold text-slate-950">Attention preview</h5><ul className="mt-3 grid gap-3">{management.managementAttentionPreview.map((item)=><li key={item.key} className={item.overdue ? "rounded-lg border border-orange-200 bg-orange-50/50 p-4" : "rounded-lg border border-slate-200 p-4"}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="font-bold text-slate-950">{item.exceptionTitle ?? item.activityName}</p><p className="mt-1 text-xs text-slate-500">{item.siteName} · {item.workPackageName}</p></div><span className={item.overdue ? "w-fit rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-900" : "w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700"}>{item.overdue ? "Overdue" : item.condition}</span></div>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Owner</dt><dd className="mt-1 font-semibold text-slate-800">{item.ownerDisplayName ?? "Unassigned"}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Expected next action</dt><dd className="mt-1 text-slate-700">{item.expectedNextAction ?? "Awaiting action"}</dd></div></dl>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">Expected actor: {expectedActorLabel(item.expectedActor, item.expectedActorDisplayName)}</p><Link href={item.route} className="text-sm font-bold text-orange-700">Open details</Link></div>
      </li>)}</ul></div>
    </> : <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600">No outstanding management attention items.</p>}
  </section>;
}

function expectedActorLabel(actor: BuildManagementSummary["managementAttentionPreview"][number]["expectedActor"], name: string | null) {
  if (actor === "activity_owner") return name ?? "Activity Owner";
  if (actor === "assigned_supervisor_or_management") return name ? `${name} or authorized project management` : "Assigned Supervisor or authorized project management";
  if (actor === "exception_owner_or_management") return name ? `${name} or authorized project management` : "Exception Owner or authorized project management";
  if (actor === "independent_reviewer") return "Independent authorized reviewer";
  if (actor === "project_management") return "Authorized project management";
  if (actor === "system_time") return "Dependency timing";
  return "Not specified";
}

function FoundationList({ title, empty, rows }: { title: string; empty: string; rows: Array<{ id: string; name: string; detail: string }> }) {
  return <section className="rounded-lg border border-slate-200 p-5"><h4 className="font-bold text-slate-950">{title}</h4>{rows.length === 0 ? <p className="mt-3 text-sm text-slate-600">{empty}</p> : <ul className="mt-3 divide-y divide-slate-100">{rows.map((row) => <li key={row.id} className="py-3"><p className="font-semibold text-slate-900">{row.name}</p><p className="mt-1 text-xs text-slate-500">{row.detail || "No additional details"}</p></li>)}</ul>}</section>;
}

function Metric({ label, value, attention = false }: { label: string; value: string; attention?: boolean }) {
  return (
    <div className={attention ? "rounded-lg border border-orange-200 bg-orange-50/60 p-4" : "rounded-lg border border-slate-200 bg-white p-4"}>
      <p className={attention ? "text-xs font-semibold uppercase tracking-widest text-orange-700" : "text-xs font-semibold uppercase tracking-widest text-slate-500"}>{label}</p>
      <p className={attention ? "mt-2 text-lg font-bold text-orange-900" : "mt-2 text-lg font-bold text-slate-950"}>{value}</p>
    </div>
  );
}

function countLabel(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
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

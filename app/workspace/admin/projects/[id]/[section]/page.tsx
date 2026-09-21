import { notFound } from "next/navigation";
import { BuildProjectShell, type BuildProjectSection } from "@/components/workspace/BuildProjectShell";
import { BuildProjectManagement } from "@/components/workspace/BuildProjectManagement";
import { BuildRuntimeWorkPlan } from "@/components/workspace/BuildRuntimeWorkPlan";
import { BuildExceptionRegister } from "@/components/workspace/BuildExceptionRegister";
import { BuildManagementReport } from "@/components/workspace/BuildManagementReport";
import { BuildWorkPackageReport } from "@/components/workspace/BuildWorkPackageReport";
import { BuildExecutionHistoryReport } from "@/components/workspace/BuildExecutionHistoryReport";
import { getWorkPlan } from "@/lib/build/runtime/service";
import { getBuildExecutionHistory, getBuildManagementSummary, type BuildExceptionFilters } from "@/lib/build/management/service";
import { composeBuildExecutionHistoryReport, parseExecutionHistoryQuery } from "@/lib/build/reporting/executionHistoryReport";
import { composeBuildManagementReport } from "@/lib/build/reporting/managementReport";
import { composeBuildWorkPackageReport } from "@/lib/build/reporting/workPackageReport";
import { getBuildProjectWorkspaceOverview, type BuildProjectWorkspaceOverview } from "@/lib/build/projects/workspaceOverview";
import { ExecutiveIntelligenceShell } from "@/components/workspace/ExecutiveIntelligenceShell";
import { requireCustomerWorkspace } from "@/lib/workspace/customerAdmin";
import { getCustomerWorkspaceProjectScope } from "@/lib/workspace/projectScope";
import { getLocalExecutivePresentationFixture } from "@/lib/build/ai/executivePresentationFixture";

export const dynamic = "force-dynamic";

const BUILD_PROJECT_SECTIONS = new Set<BuildProjectSection>([
  "sites",
  "work-packages",
  "activities",
  "exceptions",
  "resources",
  "documents",
  "reports",
  "analytics",
  "executive-intelligence",
  "settings",
]);

export default async function BuildProjectSectionPage({
  params,
  searchParams,
}: {
  params: { id: string; section: string };
  searchParams: { workPackage?: string; status?: string; severity?: string; owner?: string; due?: string; site?: string; view?: string; from?: string; through?: string; cadence?: string; timezone?: string };
}) {
  if (!BUILD_PROJECT_SECTIONS.has(params.section as BuildProjectSection)) notFound();

  const section = params.section as BuildProjectSection;
  const overview = await getBuildProjectWorkspaceOverview(params.id);
  return (
    <BuildProjectShell project={overview.project} activeSection={section}>
      <BuildProjectSectionContent section={section} overview={overview} selectedWorkPackageId={searchParams.workPackage} filters={searchParams} />
    </BuildProjectShell>
  );
}

async function BuildProjectSectionContent({
  section,
  overview,
  selectedWorkPackageId,
  filters,
}: {
  section: BuildProjectSection;
  overview: BuildProjectWorkspaceOverview;
  selectedWorkPackageId?: string;
  filters: BuildExceptionFilters & { view?: string; from?: string; through?: string; cadence?: string; timezone?: string };
}) {
  if (section === "sites") {
    return <BuildProjectManagement mode="sites" overview={overview} />;
  }

  if (section === "work-packages") {
    return <BuildProjectManagement mode="work-packages" overview={overview} />;
  }

  if (section === "activities") {
    const selected = overview.workPackages.find((item) => item.id === selectedWorkPackageId)
      ?? overview.workPackages[0]
      ?? null;
    const site = selected ? overview.sites.find((item) => item.id === selected.siteId) ?? null : null;
    const plan = selected && site
      ? await getWorkPlan({ projectId: overview.project.id, siteId: site.id, workPackageId: selected.id })
      : null;
    return <BuildRuntimeWorkPlan overview={overview} selectedWorkPackageId={selected?.id ?? null} plan={plan} />;
  }

  if (section === "exceptions") {
    const management = await getBuildManagementSummary(overview.project.id);
    return <BuildExceptionRegister projectId={overview.project.id} management={management} filters={filters}/>;
  }

  if (section === "executive-intelligence") {
    // Future explicit executive-intelligence capability belongs here; never infer access from a job title.
    const workspace = await requireCustomerWorkspace();
    const scope = await getCustomerWorkspaceProjectScope(workspace, overview.project.id);
    if (!scope.selectedProject || overview.project.client_id !== workspace.clientId) notFound();
    return <ExecutiveIntelligenceShell key={`${workspace.userId}:${workspace.clientId}:${overview.project.id}`} projectId={overview.project.id} today={new Date().toISOString().slice(0, 10)} initialView={getLocalExecutivePresentationFixture(overview.project.id)} />;
  }

  if (section === "reports") {
    if (selectedWorkPackageId && !overview.workPackages.some((item) => item.id === selectedWorkPackageId)) notFound();
    if (filters.view && filters.view !== "history") notFound();
    if (filters.view === "history") {
      const query = parseExecutionHistoryQuery(filters);
      if (query.state === "invalid") notFound();
      const selectedWorkPackage = selectedWorkPackageId ? overview.workPackages.find((item) => item.id === selectedWorkPackageId) : undefined;
      const site = selectedWorkPackage ? overview.sites.find((item) => item.id === selectedWorkPackage.siteId) : undefined;
      if ((selectedWorkPackage && !site) || (selectedWorkPackageId && !selectedWorkPackage)) notFound();
      const workPackage = selectedWorkPackage && site ? { id: selectedWorkPackage.id, name: selectedWorkPackage.name, siteName: site.name } : undefined;
      if (query.state === "selection") return <BuildExecutionHistoryReport project={overview.project} workPackage={workPackage} query={query}/>;
      const history = await getBuildExecutionHistory({ projectId: overview.project.id, periodStart: new Date(query.periodStart), periodEnd: new Date(query.periodEnd), cadence: query.cadence });
      const report = composeBuildExecutionHistoryReport({ project: overview.project, history, period: query, generatedAt: new Date(), workPackage: workPackage ? { ...workPackage, clientId: overview.project.client_id, projectId: overview.project.id } : undefined });
      return <BuildExecutionHistoryReport report={report} project={overview.project} workPackage={workPackage} query={query}/>;
    }
    const asOf = new Date();
    const management = await getBuildManagementSummary(overview.project.id, asOf);
    if (selectedWorkPackageId) {
      const report = composeBuildWorkPackageReport({ project: overview.project, management, workPackageId: selectedWorkPackageId, asOf, generatedAt: new Date() });
      return <BuildWorkPackageReport report={report}/>;
    }
    const report = composeBuildManagementReport({ project: overview.project, management, asOf, generatedAt: new Date() });
    return <BuildManagementReport report={report}/>;
  }

  const foundationCopy: Record<Exclude<BuildProjectSection, "overview" | "sites" | "work-packages" | "activities" | "exceptions" | "reports" | "executive-intelligence">, { title: string; description: string }> = {
    resources: {
      title: "Resources",
      description: `${overview.counts.resources} eligible resource definition${overview.counts.resources === 1 ? " is" : "s are"} available to this tenant. Project resource planning arrives in a later Build phase.`,
    },
    documents: {
      title: "Documents",
      description: "Build document controls are planned for a later phase. No document records are fabricated here.",
    },
    analytics: {
      title: "Analytics",
      description: "Build analytics are planned for a later phase. Retail deployment analytics are intentionally not reused.",
    },
    settings: {
      title: "Settings",
      description: "Build project settings are planned for a later phase. Shared account and user administration remain available from the Customer Workspace.",
    },
  };
  const copy = foundationCopy[section as keyof typeof foundationCopy];
  if (!copy) notFound();
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Controlled foundation state</p>
      <h3 className="mt-2 text-xl font-bold text-slate-950">{copy.title}</h3>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{copy.description}</p>
    </section>
  );
}

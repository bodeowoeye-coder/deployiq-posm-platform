import { notFound } from "next/navigation";
import { BuildProjectShell, type BuildProjectSection } from "@/components/workspace/BuildProjectShell";
import { BuildProjectManagement } from "@/components/workspace/BuildProjectManagement";
import { BuildRuntimeWorkPlan } from "@/components/workspace/BuildRuntimeWorkPlan";
import { getWorkPlan } from "@/lib/build/runtime/service";
import { getBuildProjectWorkspaceOverview, type BuildProjectWorkspaceOverview } from "@/lib/build/projects/workspaceOverview";

export const dynamic = "force-dynamic";

const BUILD_PROJECT_SECTIONS = new Set<BuildProjectSection>([
  "sites",
  "work-packages",
  "activities",
  "resources",
  "documents",
  "reports",
  "analytics",
  "settings",
]);

export default async function BuildProjectSectionPage({
  params,
  searchParams,
}: {
  params: { id: string; section: string };
  searchParams: { workPackage?: string };
}) {
  if (!BUILD_PROJECT_SECTIONS.has(params.section as BuildProjectSection)) notFound();

  const section = params.section as BuildProjectSection;
  const overview = await getBuildProjectWorkspaceOverview(params.id);
  return (
    <BuildProjectShell project={overview.project} activeSection={section}>
      <BuildProjectSectionContent section={section} overview={overview} selectedWorkPackageId={searchParams.workPackage} />
    </BuildProjectShell>
  );
}

async function BuildProjectSectionContent({
  section,
  overview,
  selectedWorkPackageId,
}: {
  section: BuildProjectSection;
  overview: BuildProjectWorkspaceOverview;
  selectedWorkPackageId?: string;
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

  const foundationCopy: Record<Exclude<BuildProjectSection, "overview" | "sites" | "work-packages" | "activities">, { title: string; description: string }> = {
    resources: {
      title: "Resources",
      description: `${overview.counts.resources} eligible resource definition${overview.counts.resources === 1 ? " is" : "s are"} available to this tenant. Project resource planning arrives in a later Build phase.`,
    },
    documents: {
      title: "Documents",
      description: "Build document controls are planned for a later phase. No document records are fabricated here.",
    },
    reports: {
      title: "Reports",
      description: "Build reporting is planned for a later phase. Retail deployment reports are intentionally not reused.",
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

import { notFound } from "next/navigation";
import { BuildProjectShell, type BuildProjectSection } from "@/components/workspace/BuildProjectShell";
import { BuildProjectManagement } from "@/components/workspace/BuildProjectManagement";
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
}: {
  params: { id: string; section: string };
}) {
  if (!BUILD_PROJECT_SECTIONS.has(params.section as BuildProjectSection)) notFound();

  const section = params.section as BuildProjectSection;
  const overview = await getBuildProjectWorkspaceOverview(params.id);
  return (
    <BuildProjectShell project={overview.project} activeSection={section}>
      <BuildProjectSectionContent section={section} overview={overview} />
    </BuildProjectShell>
  );
}

function BuildProjectSectionContent({
  section,
  overview,
}: {
  section: BuildProjectSection;
  overview: BuildProjectWorkspaceOverview;
}) {
  if (section === "sites") {
    return <BuildProjectManagement mode="sites" overview={overview} />;
  }

  if (section === "work-packages") {
    return <BuildProjectManagement mode="work-packages" overview={overview} />;
  }

  const foundationCopy: Record<Exclude<BuildProjectSection, "overview" | "sites" | "work-packages">, { title: string; description: string }> = {
    activities: {
      title: "Activities",
      description: `${overview.counts.activities} activity definition${overview.counts.activities === 1 ? " is" : "s are"} available in the assigned Build template foundation. Customer activity execution arrives in a later Build phase.`,
    },
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

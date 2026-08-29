import { notFound } from "next/navigation";
import { BuildProjectShell, type BuildProjectSection } from "@/components/workspace/BuildProjectShell";
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
    return (
      <ReadOnlyFoundationList
        eyebrow="Build foundation"
        title="Sites"
        description="Read-only sites assigned to this project. Site authoring is not included in this sprint."
        empty="No active Build Sites are assigned to this project."
        rows={overview.sites.map((site) => ({
          id: site.id,
          name: site.name,
          detail: [site.siteCode, site.status].filter(Boolean).join(" · "),
        }))}
      />
    );
  }

  if (section === "work-packages") {
    return (
      <ReadOnlyFoundationList
        eyebrow="Build foundation"
        title="Work Packages"
        description="Read-only work packages assigned to this project. Work-package authoring is not included in this sprint."
        empty="No active Work Packages are assigned to this project."
        rows={overview.workPackages.map((workPackage) => ({
          id: workPackage.id,
          name: workPackage.name,
          detail: [workPackage.code, workPackage.templateName, workPackage.status].filter(Boolean).join(" · "),
        }))}
      />
    );
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

function ReadOnlyFoundationList({
  eyebrow,
  title,
  description,
  empty,
  rows,
}: {
  eyebrow: string;
  title: string;
  description: string;
  empty: string;
  rows: Array<{ id: string; name: string; detail: string }>;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">{eyebrow}</p>
      <h3 className="mt-2 text-xl font-bold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      {rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600">{empty}</p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {rows.map((row) => (
            <li key={row.id} className="p-4">
              <p className="font-bold text-slate-950">{row.name}</p>
              <p className="mt-1 text-xs text-slate-500">{row.detail || "No additional details"}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

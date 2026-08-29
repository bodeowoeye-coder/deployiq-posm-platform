import Link from "next/link";
import type { CanonicalBuildProject } from "@/lib/build/projects/types";

export const BUILD_PROJECT_NAVIGATION = [
  { key: "overview", label: "Overview", segment: "" },
  { key: "sites", label: "Sites", segment: "sites" },
  { key: "work-packages", label: "Work Packages", segment: "work-packages" },
  { key: "activities", label: "Activities", segment: "activities" },
  { key: "resources", label: "Resources", segment: "resources" },
  { key: "documents", label: "Documents", segment: "documents" },
  { key: "reports", label: "Reports", segment: "reports" },
  { key: "analytics", label: "Analytics", segment: "analytics" },
  { key: "settings", label: "Settings", segment: "settings" },
] as const;

export type BuildProjectSection = (typeof BUILD_PROJECT_NAVIGATION)[number]["key"];

export function BuildProjectShell({
  project,
  activeSection,
  children,
}: {
  project: CanonicalBuildProject;
  activeSection: BuildProjectSection;
  children: React.ReactNode;
}) {
  const base = `/workspace/admin/projects/${project.id}`;
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">DeployIQ Build Project</p>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">{project.project_name}</h2>
            <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <ProjectIdentity label="Type" value={project.project_type} />
              <ProjectIdentity label="Status" value={project.status || "Not set"} />
              <ProjectIdentity label="Project code" value={project.project_code || "Not set"} mono />
              <ProjectIdentity label="Client reference" value={project.client_project_reference || "Not set"} mono />
            </dl>
          </div>
          <Link href="/workspace/admin/projects" className="text-sm font-bold text-orange-600 hover:text-orange-700">Back to Projects</Link>
        </div>
      </section>

      <nav className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2" aria-label="Build project navigation">
        <div className="flex min-w-max gap-1">
          {BUILD_PROJECT_NAVIGATION.map((item) => {
            const href = item.segment ? `${base}/${item.segment}` : base;
            const active = activeSection === item.key;
            return (
              <Link
                key={item.key}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-bold ${active ? "bg-orange-50 text-orange-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {children}
    </div>
  );
}

function ProjectIdentity({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</dt><dd className={`mt-1 font-bold text-slate-900 ${mono ? "font-mono" : ""}`}>{value}</dd></div>;
}

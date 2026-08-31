import Link from "next/link";
import type { CanonicalBuildProject } from "@/lib/build/projects/types";

export const BUILD_PROJECT_NAVIGATION = [
  { key: "overview", label: "Overview", segment: "" },
  { key: "sites", label: "Sites", segment: "sites" },
  { key: "work-packages", label: "Work Packages", segment: "work-packages" },
  { key: "activities", label: "Activities", segment: "activities" },
  { key: "exceptions", label: "Exceptions", segment: "exceptions" },
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
  const activeLabel = BUILD_PROJECT_NAVIGATION.find((item) => item.key === activeSection)?.label ?? "Overview";
  return (
    <div className="space-y-4">
      <nav aria-label="Build project breadcrumb" className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
        <Link href="/workspace/admin/projects" className="text-orange-700 hover:text-orange-800">Projects</Link>
        <span aria-hidden="true">›</span><Link href={base} className="text-orange-700 hover:text-orange-800">{project.project_name}</Link>
        {activeSection !== "overview" ? <><span aria-hidden="true">›</span><span>{activeLabel}</span></> : null}
      </nav>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-orange-600">DeployIQ Build Project · {activeLabel}</p>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">{project.project_name}</h2>
            <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <ProjectIdentity label="Type" value={project.project_type} />
              <ProjectIdentity label="Status" value={project.status || "Not set"} />
              <ProjectIdentity label="Project code" value={project.project_code || "Not set"} mono />
              <ProjectIdentity label="Client reference" value={project.client_project_reference || "Not set"} mono />
            </dl>
          </div>
          <Link href="/workspace/admin/projects" className="text-sm font-bold text-orange-600 hover:text-orange-700">Back to Projects</Link>
        </div>
      </section>

      <nav className="overflow-x-auto rounded-xl border border-slate-300 bg-white p-2 shadow-sm" aria-label="Build project navigation">
        <p className="px-2 pb-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Build operational navigation</p>
        <div className="flex min-w-max gap-1">
          {BUILD_PROJECT_NAVIGATION.map((item) => {
            const href = item.segment ? `${base}/${item.segment}` : base;
            const active = activeSection === item.key;
            return (
              <Link
                key={item.key}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg border-b-2 px-3 py-2 text-sm font-bold transition ${active ? "border-orange-600 bg-orange-50 text-orange-900 shadow-sm" : "border-transparent text-slate-700 hover:border-orange-200 hover:bg-slate-50 hover:text-slate-950"}`}
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

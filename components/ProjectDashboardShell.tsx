import Link from "next/link";
import type { Project } from "@/lib/types";

const dashboardTabs = [
  "Overview",
  "Activities",
  "Supplies",
  "Progress",
  "Documents",
  "Team",
  "Reports",
  "Analytics",
  "Settings"
] as const;

type DashboardTab = (typeof dashboardTabs)[number];

function normalizedTab(value: string | null | undefined): DashboardTab {
  const candidate = (value ?? "").trim();
  const matched = dashboardTabs.find((tab) => tab.toLowerCase() === candidate.toLowerCase());
  return matched ?? "Overview";
}

function projectTypeLabel(project: Project) {
  return project.project_type || "Retail Deployment";
}

export function ProjectDashboardShell({
  project,
  audience,
  activeTab,
  basePath
}: {
  project: Project;
  audience: "admin" | "client";
  activeTab?: string;
  basePath: string;
}) {
  const selectedTab = normalizedTab(activeTab);

  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-4 py-6 text-[var(--text-primary)] sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--card-bg)] p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">DeployIQ Build Foundation</p>
          <h1 className="mt-2 text-2xl font-semibold">{project.project_name}</h1>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-[var(--text-muted)]">
            <span>Project Type: {projectTypeLabel(project)}</span>
            <span>Status: {project.status}</span>
            <span>Code: {project.project_code || "Not set"}</span>
            <span>Client Ref: {project.client_project_reference || "Not set"}</span>
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--card-bg)] p-3 shadow-sm">
          <nav className="flex flex-wrap gap-2" aria-label="Project dashboard tabs">
            {dashboardTabs.map((tab) => {
              const href = `${basePath}?tab=${encodeURIComponent(tab)}`;
              const isActive = tab === selectedTab;
              return (
                <Link
                  key={tab}
                  href={href}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "border-orange-300 bg-orange-50 text-orange-900"
                      : "border-[var(--border-soft)] bg-white text-[var(--text-primary)] hover:border-orange-200 hover:bg-orange-50"
                  }`}
                >
                  {tab}
                </Link>
              );
            })}
          </nav>
        </section>

        <section className="rounded-xl border border-dashed border-[var(--border-soft)] bg-[var(--card-bg)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{selectedTab}</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            This tab is intentionally a foundation placeholder for DeployIQ Build. Functional workflows will be added in a later sprint.
          </p>
          <p className="mt-4 text-xs uppercase tracking-[0.14em] text-slate-500">Audience: {audience}</p>
        </section>
      </div>
    </main>
  );
}

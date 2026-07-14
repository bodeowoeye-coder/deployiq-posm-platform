import Link from "next/link";
import { buildResourceTypeConfig, buildResourceTypeOrder, type BuildResourceType } from "@/lib/build/resources/types";
import type { Project } from "@/lib/types";
import type { BuildSite } from "@/lib/build/sites/types";
import type { BuildWorkPackage } from "@/lib/build/workPackages/types";

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

function isBuildProject(project: Project) {
  return projectTypeLabel(project).toLowerCase() !== "retail deployment";
}

export function ProjectDashboardShell({
  project,
  audience,
  activeTab,
  basePath,
  sites,
  clientName,
  businessUnitName,
  portfolioName,
  currentSiteName,
  selectedSiteId,
  workPackages,
  templateCategoryMap,
  templateResourceSummaryMap
}: {
  project: Project;
  audience: "admin" | "client";
  activeTab?: string;
  basePath: string;
  sites?: BuildSite[];
  clientName?: string | null;
  businessUnitName?: string | null;
  portfolioName?: string | null;
  currentSiteName?: string | null;
  selectedSiteId?: string | null;
  workPackages?: BuildWorkPackage[];
  templateCategoryMap?: Record<string, string[]>;
  templateResourceSummaryMap?: Record<string, { total: number } & Record<BuildResourceType, number>>;
}) {
  const selectedTab = normalizedTab(activeTab);
  const buildProject = isBuildProject(project);
  const availableSites = sites ?? [];
  const breadcrumb = [clientName, businessUnitName, portfolioName, project.project_name, currentSiteName]
    .map((item) => (item ?? "").trim())
    .filter(Boolean);
  const selectedSite = selectedSiteId ? availableSites.find((site) => site.id === selectedSiteId) ?? null : null;
  const availableWorkPackages = workPackages ?? [];
  const categoryMap = templateCategoryMap ?? {};
  const resourceSummaryMap = templateResourceSummaryMap ?? {};

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
          {buildProject && breadcrumb.length > 0 ? (
            <p className="mt-3 text-xs text-slate-500">{breadcrumb.join(" / ")}</p>
          ) : null}
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

          {buildProject && selectedTab === "Overview" ? (
            <div className="mt-6 rounded-lg border border-[var(--border-soft)] bg-white p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Sites</h3>
              {availableSites.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--text-muted)]">No Sites configured yet.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-[var(--text-muted)]">
                  {availableSites.slice(0, 5).map((site) => (
                    <li key={site.id}>
                      {site.site_code} - {site.name}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-slate-500">Site context is prepared for future Build modules in Sprint 2.</p>
            </div>
          ) : null}

          {buildProject && selectedTab === "Overview" ? (
            <div className="mt-4 rounded-lg border border-[var(--border-soft)] bg-white p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Work Packages</h3>
              {!selectedSite ? (
                <p className="mt-2 text-sm text-[var(--text-muted)]">Select a Site to view Work Packages.</p>
              ) : availableWorkPackages.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--text-muted)]">No Work Packages yet.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-[var(--text-muted)]">
                  {availableWorkPackages.slice(0, 8).map((workPackage) => (
                    <li key={workPackage.id}>
                      {workPackage.code} - {workPackage.name} - Template: {workPackage.template_name || "No Template Assigned"}
                      {workPackage.template_id ? (
                        <div className="mt-1 text-xs text-slate-500">
                          Categories: {(categoryMap[workPackage.id] && categoryMap[workPackage.id].length > 0
                            ? categoryMap[workPackage.id]
                            : ["Preparation", "Execution", "Inspection", "Close-Out"]
                          ).join(" / ")}
                        </div>
                      ) : null}
                      {workPackage.template_id ? (
                        <div className="mt-1 text-xs text-slate-500">
                          {(() => {
                            const summary = resourceSummaryMap[workPackage.id] ?? {
                              total: 0,
                              labour: 0,
                              material: 0,
                              equipment: 0,
                              vehicle: 0,
                              contractor: 0,
                              service: 0
                            };
                            const detail = buildResourceTypeOrder
                              .map((resourceType) => `${buildResourceTypeConfig[resourceType].shortLabel}: ${summary[resourceType]}`)
                              .join(" | ");
                            return `Required Resources: ${summary.total} | ${detail}`;
                          })()}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

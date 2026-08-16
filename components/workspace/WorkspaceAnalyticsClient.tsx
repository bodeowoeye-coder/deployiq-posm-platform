"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { WorkspaceAnalyticsDashboard } from "@/lib/workspace/analytics";
import { buildWorkspaceAnalytics, type WorkspaceAnalyticsFilters } from "@/lib/workspace/analyticsCore";
import { EmptyState } from "@/components/EmptyState";

const statusOptions = ["Pending", "Flagged", "Approved", "Rejected", "Correction Requested"];
const controlClass = "min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-300 dark:bg-white dark:text-slate-900";

type Props = {
  dashboard: WorkspaceAnalyticsDashboard;
};

export function WorkspaceAnalyticsClient({ dashboard }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState<WorkspaceAnalyticsFilters>(dashboard.filters);
  const analytics = useMemo(
    () => dashboard.source
      ? buildWorkspaceAnalytics({ ...dashboard.source, filters })
      : dashboard.analytics,
    [dashboard.analytics, dashboard.source, filters]
  );
  const selectedProject = dashboard.source?.projects.find((project) => project.id === filters.projectId) ?? null;
  const scopedRows = selectedProject ? analytics?.submissions ?? [] : dashboard.source?.submissions ?? [];
  const brandOptions = Array.from(new Set(scopedRows.map((item) => item.brand_name || "Unassigned").filter(Boolean))).sort();
  const regionOptions = selectedProject ? Array.from(new Set(scopedRows.map((item) => item.installer_region || "").filter(Boolean))).sort() : dashboard.available.regions;
  const stateOptions = selectedProject ? Array.from(new Set([...(selectedProject.regions_covered ?? []), ...(selectedProject.primary_target_state ? [selectedProject.primary_target_state] : []), ...scopedRows.map((item) => item.resolved_state || item.installer_state || item.state_region || "")].filter(Boolean))).sort() : dashboard.available.states;
  useEffect(() => {
    setFilters((current) => ({ ...current, brand: current.brand && brandOptions.includes(current.brand) ? current.brand : undefined, region: current.region && regionOptions.includes(current.region) ? current.region : undefined, state: current.state && stateOptions.includes(current.state) ? current.state : undefined }));
  }, [selectedProject?.id, brandOptions.join("|"), regionOptions.join("|"), stateOptions.join("|")]);

  if (dashboard.queryStatus === "error" || !analytics) {
    return (
      <section className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-rose-950 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100">
        <h2 className="text-lg font-bold">Analytics unavailable</h2>
        <p className="mt-2 text-sm leading-6">{dashboard.loadError || "Deployment analytics could not be loaded."}</p>
      </section>
    );
  }

  const hasFilteredRows = analytics.submissions.length > 0;
  const setFilter = (key: keyof WorkspaceAnalyticsFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value || undefined }));
    if (key === "projectId") router.push(`${pathname}${value ? `?projectId=${encodeURIComponent(value)}` : ""}`);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-200 dark:bg-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Customer Workspace</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-950 dark:text-slate-950">Deployment Performance</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-600">Core DeployIQ operational analytics for {dashboard.workspace.organisationName}, scoped to this workspace.</p>
          </div>
          <span className="text-xs font-medium text-slate-500">Up to 500 recent active submissions</span>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-200 dark:bg-white">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Filter label="Project">
            <select value={filters.projectId ?? ""} onChange={(event) => setFilter("projectId", event.target.value)} className={controlClass}>
              <option value="">All projects</option>
              {dashboard.available.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </Filter>
          <Filter label="Brand">
            <select value={filters.brand ?? ""} onChange={(event) => setFilter("brand", event.target.value)} className={controlClass}>
              <option value="">All brands</option>
              {brandOptions.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
            </select>
          </Filter>
          <Filter label="Region"><select value={filters.region ?? ""} onChange={(event) => setFilter("region", event.target.value)} className={controlClass}><option value="">All regions</option>{regionOptions.map((region) => <option key={region} value={region}>{region}</option>)}</select></Filter>
          <Filter label="State / region">
            <select value={filters.state ?? ""} onChange={(event) => setFilter("state", event.target.value)} className={controlClass}>
              <option value="">All states</option>
              {stateOptions.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          </Filter>
          <Filter label="Installer">
            <select value={filters.installer ?? ""} onChange={(event) => setFilter("installer", event.target.value)} className={controlClass}>
              <option value="">All installers</option>
              {dashboard.available.installers.map((installer) => <option key={installer} value={installer}>{installer}</option>)}
            </select>
          </Filter>
          <Filter label="Status">
            <select value={filters.status ?? ""} onChange={(event) => setFilter("status", event.target.value)} className={controlClass}>
              <option value="">All statuses</option>
              {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </Filter>
          <Filter label="Date from">
            <input type="date" value={filters.dateFrom ?? ""} onChange={(event) => setFilter("dateFrom", event.target.value)} className={controlClass} />
          </Filter>
          <Filter label="Date to">
            <input type="date" value={filters.dateTo ?? ""} onChange={(event) => setFilter("dateTo", event.target.value)} className={controlClass} />
          </Filter>
          <div className="flex items-end">
            <button type="button" onClick={() => setFilters({})} className={`${controlClass} font-semibold hover:border-orange-300 hover:bg-orange-50`}>Clear filters</button>
          </div>
        </div>
      </section>

      {!hasFilteredRows ? (
        <EmptyState
          title={dashboard.isEmpty && Object.keys(filters).length === 0 ? "No deployment analytics yet" : "No matching analytics"}
          message={dashboard.isEmpty && Object.keys(filters).length === 0 ? "Analytics will populate after deployment evidence is submitted." : "Try widening the current filters to see more deployment activity."}
        />
      ) : null}
      <>
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
            <AnalyticsPanel title="Deployment trend">
              {analytics.trend.length === 0 ? <ChartState /> : <ResponsiveContainer width="100%" height={280}>
                <LineChart data={analytics.trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line dataKey="submissions" name="Deployments" stroke="#ea580c" strokeWidth={2} />
                  <Line dataKey="approved" name="Approved" stroke="#059669" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>}
            </AnalyticsPanel>
            <AnalyticsPanel title="Deployment by project">
              {analytics.projectProgress.length === 0 ? <ChartState /> : <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.projectProgress} layout="vertical" margin={{ left: 16, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis dataKey="project" type="category" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="expected" name="Target" fill="#cbd5e1" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="actual" name="Actual" fill="#ea580c" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>}
            </AnalyticsPanel>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <AnalyticsPanel title="State / region performance">
              {analytics.regionPerformance.length === 0 ? <ChartState /> : <ResponsiveContainer width="100%" height={260}>
                <BarChart data={analytics.regionPerformance.slice(0, 8)} layout="vertical" margin={{ left: 16, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} unit="%" />
                  <YAxis dataKey="region" type="category" width={90} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="score" name="Approved" fill="#ea580c" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>}
            </AnalyticsPanel>
            <AnalyticsPanel title="Brand compliance">
              {analytics.brandCompliance.length === 0 ? <ChartState /> : <ResponsiveContainer width="100%" height={260}>
                <BarChart data={analytics.brandCompliance.slice(0, 8)} layout="vertical" margin={{ left: 16, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} unit="%" />
                  <YAxis dataKey="brand" type="category" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="score" name="Compliance" fill="#ea580c" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>}
            </AnalyticsPanel>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <AnalyticsPanel title="Installer performance">
              {analytics.installerPerformance.length === 0 ? <ChartState /> : <ResponsiveContainer width="100%" height={260}>
                <BarChart data={analytics.installerPerformance.slice(0, 8)} layout="vertical" margin={{ left: 16, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} unit="%" />
                  <YAxis dataKey="installer" type="category" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="score" name="Accuracy" fill="#ea580c" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>}
            </AnalyticsPanel>
            <AnalyticsPanel title="GPS quality">
              {analytics.submissions.length === 0 ? <ChartState /> : <div className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={analytics.gpsQuality} dataKey="count" nameKey="label" cx="50%" cy="50%" innerRadius={58} outerRadius={88} paddingAngle={3}>
                      {analytics.gpsQuality.map((entry, index) => <Cell key={entry.label} fill={index === 0 ? "#059669" : "#cbd5e1"} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>}
            </AnalyticsPanel>
          </section>
          <section className="grid gap-5 lg:grid-cols-2">
            <AnalyticsPanel title="Approval and rejection pattern">
              {analytics.submissions.length === 0 ? <ChartState /> : <ResponsiveContainer width="100%" height={240}>
                <BarChart data={analytics.statusCounts}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="status" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="Submissions" fill="#ea580c" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>}
            </AnalyticsPanel>
            <AnalyticsPanel title="Performance detail">
              <SimpleRows rows={analytics.projectProgress.map((row) => [row.project, `${row.actual}/${row.expected} - ${row.completion}%`])} />
            </AnalyticsPanel>
          </section>
      </>
    </div>
  );
}

function ChartState() {
  return <div className="grid h-[240px] place-items-center text-center text-sm text-slate-500"><p>No data yet.<br />Analytics will populate after deployment evidence is submitted.</p></div>;
}

function Filter({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-semibold text-slate-700 dark:text-slate-700"><span className="mb-1.5 block text-xs uppercase tracking-widest text-slate-500">{label}</span>{children}</label>;
}

function AnalyticsPanel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-200 dark:bg-white"><h3 className="mb-4 text-base font-bold text-slate-950 dark:text-slate-950">{title}</h3>{children}</section>;
}

function SimpleRows({ rows }: { rows: Array<[string, string]> }) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">No data for the current filters.</p>;
  return <div className="divide-y divide-slate-100 dark:divide-slate-200">{rows.map(([label, value]) => <div key={label} className="flex min-w-0 items-center justify-between gap-4 py-3 text-sm"><span className="min-w-0 break-words text-slate-700 dark:text-slate-700">{label}</span><span className="shrink-0 font-semibold text-slate-950 dark:text-slate-950">{value}</span></div>)}</div>;
}

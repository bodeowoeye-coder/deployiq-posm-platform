"use client";

import { Download, FileText, Inbox, Loader2, Search } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getBrandCounts,
  getDailyCounts,
  getExecutiveMetrics,
  getProjectCounts,
  getRegionCounts,
  getStateCounts,
  getTrendSeries
} from "@/lib/reporting";
import type { Client, DeploymentProgress, Project, ProjectTarget, Submission } from "@/lib/types";
import { DeploymentMap } from "@/components/DeploymentMap";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { BrandMark } from "@/components/BrandMark";
import { EmptyState } from "@/components/EmptyState";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/components/ToastProvider";
import { NIGERIA_REGIONS, NIGERIA_STATES } from "@/lib/geography";
import { DEFAULT_PROJECT_NAME, displayProjectName } from "@/lib/projects";
import { DashboardSidebar, type DashboardView } from "@/components/DashboardSidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { getPortfolioOperations, getProjectOperations, getStageTotals } from "@/lib/operations";

type Filters = {
  query: string;
  startDate: string;
  endDate: string;
  state: string;
  region: string;
  project: string;
  campaign: string;
  brand: string;
};

const blankFilters: Filters = {
  query: "",
  startDate: "",
  endDate: "",
  state: "",
  region: "",
  project: "",
  campaign: "",
  brand: ""
};

function buildExportQuery(filters: Filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value.trim()) params.set(key, value.trim());
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function ClientDashboard({
  client,
  submissions,
  availableBrands,
  projects,
  projectTargets,
  deploymentProgress
}: {
  client: Client;
  submissions: Submission[];
  availableBrands: string[];
  projects: Project[];
  projectTargets: ProjectTarget[];
  deploymentProgress: DeploymentProgress[];
}) {
  const [filters, setFilters] = useState<Filters>(blankFilters);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const contentTopRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    setLastUpdated(new Date().toLocaleString());
  }, []);

  useEffect(() => {
    contentTopRef.current?.scrollIntoView({ block: "start" });
  }, [activeView]);

  const filtered = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    return submissions.filter((item) => {
      const date = item.installation_date ?? item.submitted_at.slice(0, 10);
      const searchable = [
        item.brand_name,
        item.project_name,
        item.salon_name,
        item.address,
        item.installer_state,
        item.installer_region,
        item.installer_lga,
        item.state_region,
        item.status,
        item.ocr_text,
        item.ai_raw_text
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!query || searchable.includes(query)) &&
        (!filters.startDate || date >= filters.startDate) &&
        (!filters.endDate || date <= filters.endDate) &&
        (!filters.state || item.installer_state === filters.state) &&
        (!filters.region || item.installer_region === filters.region) &&
        (!filters.project || displayProjectName(item.project_name) === filters.project) &&
        (!filters.campaign ||
          projects.find((project) => project.id === item.project_id || project.project_name === item.project_name)?.campaign_name === filters.campaign) &&
        (!filters.brand || item.brand_name === filters.brand)
      );
    });
  }, [filters, submissions]);

  const dailyCounts = getDailyCounts(filtered);
  const regionCounts = getRegionCounts(filtered);
  const brandCounts = getBrandCounts(filtered);
  const stateCounts = getStateCounts(filtered);
  const projectCounts = getProjectCounts(filtered);
  const pendingCount = filtered.filter((item) => item.status === "Pending").length;
  const mappedCount = filtered.filter((item) => item.gps_latitude !== null && item.gps_longitude !== null).length;
  const exportQuery = buildExportQuery(filters);
  const metrics = getExecutiveMetrics(filtered);
  const trendSeries = getTrendSeries(filtered);
  const projectOptions = Array.from(new Set(submissions.map((item) => displayProjectName(item.project_name)))).sort();
  const campaignOptions = Array.from(new Set(projects.map((project) => project.campaign_name).filter(Boolean) as string[])).sort();
  const activeProjectName = filters.project || DEFAULT_PROJECT_NAME;
  const clientDisplayName = client.name.startsWith("Godrej") ? "Godrej" : client.name;
  const projectOperations = getProjectOperations(projects, projectTargets, filtered, deploymentProgress);
  const portfolio = getPortfolioOperations(projectOperations);
  const stageTotals = getStageTotals(projectOperations);

  function setFilter(key: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function downloadExport(href: string, label: string) {
    setExportError("");
    setExporting(label);
    try {
      const response = await fetch(href, { credentials: "include" });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Could not generate report.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename=([^;]+)/i)?.[1]?.replaceAll('"', "") ?? "deployment-report";
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      showToast(`${label} generated.`);
    } catch (downloadError) {
      const message = downloadError instanceof Error ? downloadError.message : "Could not generate report.";
      setExportError(message);
      showToast(message, "error");
    } finally {
      setExporting("");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-[min(1180px,calc(100%-28px))] min-w-0 flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <BrandMark />
            <p className="mt-2 whitespace-normal break-words text-sm leading-snug text-slate-500">
              {clientDisplayName} — {activeProjectName}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-w-0 w-[min(1380px,calc(100%-28px))] flex-col gap-4 py-4 lg:flex-row lg:items-start lg:py-6">
        <DashboardSidebar audience="client" activeView={activeView} onSelectView={setActiveView} />
      <section className="min-w-0 flex-1">
        <div ref={contentTopRef} className="mb-5 scroll-mt-24">
          <h1 className="whitespace-normal break-words text-2xl font-bold leading-snug sm:text-3xl">{activeProjectName} Deployment View</h1>
          <p className="mt-2 whitespace-normal break-words text-sm leading-snug text-slate-600">Review your own installations, evidence, and downloadable reports.</p>
          <p className="mt-2 text-xs font-medium text-slate-500">Last updated: {lastUpdated || "Loading..."}</p>
        </div>

        <div className={`${activeView === "overview" ? "grid" : "hidden"} min-w-0 gap-3 sm:grid-cols-3`}>
          <SummaryCard label="Total installs" value={filtered.length} />
          <SummaryCard label="Pending" value={pendingCount} />
          <SummaryCard label="Avg. turnaround" value={metrics.approvalTurnaroundHours} suffix="h" />
        </div>

        <div className={`${activeView === "overview" ? "grid" : "hidden"} mt-5 min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4`}>
          <SummaryCard label="Expected deployments" value={portfolio.expected} />
          <SummaryCard label="Actual deployments" value={portfolio.actual} />
          <SummaryCard label="Completion" value={portfolio.completion} suffix="%" />
          <SummaryCard label="Outstanding" value={portfolio.outstanding} />
        </div>

        <div className={`${activeView === "overview" ? "block" : "hidden"} mt-5 min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4`}>
          <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-8">
            <FilterField label="Search">
              <div className="relative">
                <Search className="absolute left-3 top-3 text-slate-400" aria-hidden size={16} />
                <input className="min-h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm" value={filters.query} onChange={(event) => setFilter("query", event.target.value)} placeholder="Store, OCR, location" />
              </div>
            </FilterField>
            <FilterField label="Start date">
              <input className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" type="date" value={filters.startDate} onChange={(event) => setFilter("startDate", event.target.value)} />
            </FilterField>
            <FilterField label="End date">
              <input className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" type="date" value={filters.endDate} onChange={(event) => setFilter("endDate", event.target.value)} />
            </FilterField>
            <FilterField label="State">
              <select className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" value={filters.state} onChange={(event) => setFilter("state", event.target.value)}>
                <option value="">All states</option>
                {NIGERIA_STATES.map((state) => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Region">
              <select className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" value={filters.region} onChange={(event) => setFilter("region", event.target.value)}>
                <option value="">All regions</option>
                {NIGERIA_REGIONS.map((region) => (
                  <option key={region} value={region}>{region}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Project">
              <select className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" value={filters.project} onChange={(event) => setFilter("project", event.target.value)}>
                <option value="">All projects</option>
                {projectOptions.map((project) => (
                  <option key={project} value={project}>{project}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Campaign">
              <select className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" value={filters.campaign} onChange={(event) => setFilter("campaign", event.target.value)}>
                <option value="">All campaigns</option>
                {campaignOptions.map((campaign) => (
                  <option key={campaign} value={campaign}>{campaign}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Brand">
              <select className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" value={filters.brand} onChange={(event) => setFilter("brand", event.target.value)}>
                <option value="">All brands</option>
                {availableBrands.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
            </FilterField>
          </div>

          <div className="mt-4 flex min-w-0 flex-wrap gap-2">
            <button className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold transition hover:border-orange-200 hover:bg-orange-50" onClick={() => setFilters(blankFilters)}>
              Clear filters
            </button>
            <ExportButton onClick={() => downloadExport("/api/client/exports/excel", "Full Excel report")} icon="excel" label="Full Excel report" loading={exporting === "Full Excel report"} />
            <ExportButton onClick={() => downloadExport(`/api/client/exports/excel${exportQuery}`, "Filtered Excel report")} icon="excel" label="Filtered Excel report" loading={exporting === "Filtered Excel report"} />
            <ExportButton onClick={() => downloadExport("/api/client/exports/pdf", "Full PDF report")} icon="pdf" label="Full PDF report" loading={exporting === "Full PDF report"} />
            <ExportButton onClick={() => downloadExport(`/api/client/exports/pdf${exportQuery}`, "Filtered PDF report")} icon="pdf" label="Filtered PDF report" loading={exporting === "Filtered PDF report"} />
          </div>
          {exportError ? <p className="mt-3 whitespace-normal break-words text-sm leading-snug text-rose-700">{exportError}</p> : null}
        </div>

        <div className={`${activeView === "overview" ? "grid" : "hidden"} mt-5 min-w-0 gap-4 lg:grid-cols-3`}>
          <ChartPanel title="Installations by region" data={regionCounts} xKey="region" />
          <ChartPanel title="Installations by brand" data={brandCounts} xKey="brand" color="#7c3aed" />
          <ChartPanel title="Daily uploads" data={dailyCounts} xKey="date" color="#2563eb" />
        </div>

        <div className={`${activeView === "overview" ? "block" : "hidden"} mt-5 min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4`}>
          <h2 className="mb-3 whitespace-normal break-words text-base font-bold leading-snug">Deployment progress trend</h2>
          <div className="min-w-0 overflow-hidden">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendSeries}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line dataKey="submissions" stroke="#2563eb" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
          </div>
        </div>

        <div className={`${activeView === "overview" ? "grid" : "hidden"} mt-5 min-w-0 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]`}>
          <ProjectPortfolioPanel rows={projectOperations} />
          <FunnelPanel rows={stageTotals} />
        </div>

        {activeView === "map" ? (
          <div className="grid min-w-0 gap-4">
            <DeploymentMap submissions={filtered} audience="client" variant="hero" />
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="Mapped installs" value={mappedCount} />
              <SummaryCard label="States covered" value={stateCounts.filter((item) => item.state !== "Unknown").length} />
              <SummaryCard label="Regions covered" value={regionCounts.filter((item) => item.region !== "Unknown").length} />
              <SummaryCard label="Brands represented" value={brandCounts.length} />
            </div>
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <BreakdownPanel title="State coverage" rows={stateCounts.map((item) => [item.state, item.count])} />
              <BreakdownPanel title="Region coverage" rows={regionCounts.map((item) => [item.region, item.count])} />
              <BreakdownPanel title="Brand distribution" rows={brandCounts.map((item) => [item.brand, item.count])} />
              <BreakdownPanel title="Project distribution" rows={projectCounts.map((item) => [displayProjectName(item.project), item.count])} />
            </div>
          </div>
        ) : null}

        <div className={`${activeView === "reports" ? "block" : "hidden"} min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white`}>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <h2 className="min-w-0 break-words text-base font-bold leading-snug">Latest installations</h2>
            <span className="text-sm text-slate-500">{filtered.length} shown</span>
          </div>
          <div className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title={submissions.length === 0 ? "No submissions yet" : "No filtered results"}
                  message={submissions.length === 0 ? "New installation evidence will appear here once available." : "Try widening the current filters to see more installations."}
                  icon={<Inbox aria-hidden size={22} />}
                />
              </div>
            ) : null}
            {filtered.map((item) => (
              <article className="grid min-w-0 gap-3 overflow-hidden p-4 sm:grid-cols-[96px_minmax(0,1fr)]" key={item.id}>
                <button className="h-24 w-24 overflow-hidden rounded-lg border border-slate-200" onClick={() => setLightboxIndex(filtered.findIndex((record) => record.id === item.id))}>
                  <img className="h-full w-full object-cover" src={item.image_url} alt={item.salon_name || "Uploaded board"} />
                </button>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h3 className="min-w-0 whitespace-normal break-words text-base font-bold leading-snug">{item.salon_name || "Name not visible"}</h3>
                  </div>
                  <p className="mt-1 whitespace-normal break-words text-sm leading-snug text-slate-600">{item.address || "Address not visible"}</p>
                  <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-500">
                    {item.brand_name || "Unassigned brand"} | {item.installer_region || "Unknown region"}
                  </p>
                  <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-500">
                    Project: {displayProjectName(item.project_name)}
                  </p>
                  <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-500">
                    {item.installer_state || "Unknown state"}{item.installer_lga ? ` | ${item.installer_lga}` : ""}
                  </p>
                  <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-500">
                    GPS: {item.gps_latitude ?? "n/a"}, {item.gps_longitude ?? "n/a"} | {item.installation_date ?? item.submitted_at.slice(0, 10)} {item.installation_time ?? ""}
                  </p>
                  <p className="mt-2 whitespace-normal break-words text-sm leading-snug text-slate-600">OCR: {item.ocr_text || item.ai_raw_text || "No extracted text"}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className={`${activeView === "profile" ? "block" : "hidden"} min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4`}>
          <h2 className="whitespace-normal break-words text-base font-bold leading-snug">Account</h2>
          <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
            <AccountItem label="Client" value={clientDisplayName} />
            <AccountItem label="Project" value={activeProjectName} />
            <AccountItem label="Platform" value="POSM Deployment & Intelligence Platform" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase leading-snug text-slate-500">Appearance</p>
              <div className="mt-2">
                <ThemeToggle />
              </div>
            </div>
          </div>
          <div className="mt-5 border-t border-slate-200 pt-4">
            <SignOutButton />
          </div>
        </div>
      </section>
      </div>
      <PhotoLightbox submissions={filtered} activeIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} onNavigate={setLightboxIndex} audience="client" />
    </main>
  );
}

function SummaryCard({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
      <div className="whitespace-normal break-words text-xs font-semibold uppercase leading-snug text-slate-500">{label}</div>
      <div className="mt-2 whitespace-normal break-words text-3xl font-bold leading-snug">
        {value}
        {suffix}
      </div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1 whitespace-normal break-words text-xs font-semibold leading-snug text-slate-600">
      {label}
      {children}
    </label>
  );
}

function ExportButton({ onClick, icon, label, loading }: { onClick: () => void; icon: "excel" | "pdf"; label: string; loading: boolean }) {
  const Icon = icon === "excel" ? Download : FileText;
  return (
    <button className="inline-flex min-h-10 min-w-0 items-center justify-center gap-2 whitespace-normal break-words rounded-lg border border-slate-200 bg-white px-4 text-center text-sm font-semibold leading-snug transition hover:border-orange-200 hover:bg-orange-50 disabled:cursor-wait disabled:opacity-70" onClick={onClick} type="button" disabled={loading}>
      {loading ? <Loader2 className="animate-spin" aria-hidden size={16} /> : <Icon aria-hidden size={16} />}
      {loading ? "Generating..." : label}
    </button>
  );
}

function ChartPanel({ title, data, xKey, color = "#0b7c59" }: { title: string; data: Record<string, string | number>[]; xKey: string; color?: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 whitespace-normal break-words text-base font-bold leading-snug">{title}</h2>
      {data.length === 0 ? <EmptyState title="No chart data" message="This chart will populate once matching submissions are available." /> : <div className="min-w-0 overflow-x-auto overflow-y-hidden">
      <div className="w-[420px] sm:w-full">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={56} />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      </div>
      </div>}
    </div>
  );
}

function BreakdownPanel({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 whitespace-normal break-words text-base font-bold leading-snug">{title}</h2>
      {rows.length === 0 ? (
        <EmptyState title="No summary data" message="This summary will populate once matching submissions are available." />
      ) : (
        <div className="grid min-w-0 gap-2">
          {rows.map(([label, value]) => (
            <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2" key={label}>
              <span className="min-w-0 whitespace-normal break-words text-sm leading-snug text-slate-600">{label}</span>
              <span className="shrink-0 text-sm font-semibold text-slate-950">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase leading-snug text-slate-500">{label}</p>
      <p className="mt-1 whitespace-normal break-words text-sm font-semibold leading-snug text-slate-950">{value}</p>
    </div>
  );
}

function ProjectPortfolioPanel({ rows }: { rows: ReturnType<typeof getProjectOperations> }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 whitespace-normal break-words text-base font-bold leading-snug">Project progress</h2>
      <div className="grid gap-3">
        {rows.length === 0 ? <div className="text-sm text-slate-500">No active projects yet.</div> : null}
        {rows.map((row) => (
          <div className="grid min-w-0 gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto]" key={row.project.id}>
            <div className="min-w-0">
              <p className="whitespace-normal break-words text-sm font-semibold leading-snug">{row.project.project_name}</p>
              <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-500">
                {row.project.campaign_name || "Campaign"} | {row.project.status}
              </p>
            </div>
            <div className="grid grid-cols-4 gap-2 text-right text-xs sm:min-w-[280px]">
              <MiniMetric label="Expected" value={row.expected} />
              <MiniMetric label="Actual" value={row.actual} />
              <MiniMetric label="Complete" value={`${row.completion}%`} />
              <MiniMetric label="Open" value={row.outstanding} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FunnelPanel({ rows }: { rows: Array<{ stage: string; quantity: number }> }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 whitespace-normal break-words text-base font-bold leading-snug">Deployment flow</h2>
      <div className="grid gap-2">
        {rows.map((row) => (
          <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2" key={row.stage}>
            <span className="whitespace-normal break-words text-sm leading-snug">
              {row.stage
                .split("_")
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ")}
            </span>
            <strong className="shrink-0 text-sm">{row.quantity}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <div className="whitespace-normal break-words text-[10px] font-semibold uppercase leading-snug text-slate-500">{label}</div>
      <div className="mt-1 whitespace-normal break-words text-sm font-bold leading-snug">{value}</div>
    </div>
  );
}

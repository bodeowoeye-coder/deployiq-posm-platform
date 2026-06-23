"use client";

import { Download, FileText, Inbox, Loader2, MapPin, Search } from "lucide-react";
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
import { NIGERIA_REGIONS } from "@/lib/geography";
import { displayProjectName, FALLBACK_PROJECT_NAME } from "@/lib/projects";
import { DashboardSidebar, type DashboardView } from "@/components/DashboardSidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { getPortfolioOperations, getProjectOperations, getStageTotals } from "@/lib/operations";
import { StateCombobox } from "@/components/StateCombobox";
import { displaySubmissionDate } from "@/lib/dateUtils";
import { NotificationCenter } from "@/components/NotificationCenter";

type Filters = {
  query: string;
  startDate: string;
  endDate: string;
  state: string;
  region: string;
  lga: string;
  project: string;
  campaign: string;
  brand: string;
  gpsStatus: "all_gps" | "gps_verified" | "gps_missing";
};
type ReportStatusFilter = "all" | "approved" | "pending" | "rejected";

type InsightView = "rejections";

const blankFilters: Filters = {
  query: "",
  startDate: "",
  endDate: "",
  state: "",
  region: "",
  lga: "",
  project: "",
  campaign: "",
  brand: "",
  gpsStatus: "all_gps"
};

function buildExportQuery(filters: Filters, statusFilter: ReportStatusFilter = "all") {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (key === "gpsStatus") {
      const gpsValue = String(value).trim();
      if (gpsValue && gpsValue !== "all_gps") params.set("gpsFilter", gpsValue);
      return;
    }
    if (value.trim()) params.set(key, value.trim());
  });
  if (statusFilter !== "all") params.set("quickFilter", statusFilter);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function hasVerifiedGps(item: Submission) {
  if (item.gps_latitude === null || item.gps_longitude === null) return false;
  const lat = Number(item.gps_latitude);
  const lng = Number(item.gps_longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function clientViewTitle(view: DashboardView) {
  const titles: Partial<Record<DashboardView, string>> = {
    overview: "Executive Dashboard",
    reports: "Deployment Reports",
    map: "Deployment Map",
    analytics: "Analytics",
    profile: "Account"
  };
  return titles[view] ?? "Executive Dashboard";
}

function clientViewDescription(view: DashboardView) {
  const descriptions: Partial<Record<DashboardView, string>> = {
    overview: "Review deployment progress, evidence, filters, and downloadable reports.",
    reports: "Browse submitted deployment evidence and installation records.",
    map: "View mapped installation locations and geographic coverage.",
    analytics: "Review client-safe deployment trends, coverage, and brand progress.",
    profile: "Client account, project, and platform preferences."
  };
  return descriptions[view] ?? "Review deployment progress and installation visibility.";
}

function clientStatusClass(status: string) {
  if (status === "Approved") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (status === "Rejected") return "bg-rose-100 text-rose-800 border-rose-200";
  if (status === "Flagged") return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-amber-100 text-amber-800 border-amber-200";
}

export function ClientDashboard({
  client,
  submissions,
  availableBrands,
  projects,
  projectTargets,
  deploymentProgress,
  initialView,
  initialProjectName,
  notificationsEnabled
}: {
  client: Client;
  submissions: Submission[];
  availableBrands: string[];
  projects: Project[];
  projectTargets: ProjectTarget[];
  deploymentProgress: DeploymentProgress[];
  initialView?: DashboardView;
  initialProjectName?: string | undefined;
  notificationsEnabled?: boolean;
}) {
  const [filters, setFilters] = useState<Filters>(() => ({ ...blankFilters, project: (initialProjectName ?? "") }));
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [activeView, setActiveView] = useState<DashboardView>(initialView ?? "overview");
  const [reportStatusFilter, setReportStatusFilter] = useState<ReportStatusFilter>("all");
  const [insightView, setInsightView] = useState<InsightView | null>(null);
  const contentTopRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  const dateTimeFormatOptions: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Africa/Lagos"
  };

  function formatDateTime(value: Date | string | null | undefined) {
    if (!value) return "";
    const date = typeof value === "string" ? new Date(value) : value;
    return date.toLocaleString("en-GB", dateTimeFormatOptions);
  }

  useEffect(() => {
    setLastUpdated(formatDateTime(new Date()));
  }, []);

  useEffect(() => {
    contentTopRef.current?.scrollIntoView({ block: "start" });
    setLightboxIndex(null);
  }, [activeView]);

  const filtered = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    return submissions.filter((item) => {
      const date = item.installation_date ?? displaySubmissionDate(item.submitted_at, "");
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
        (!filters.lga || (item.installer_lga ?? "").toLowerCase().includes(filters.lga.trim().toLowerCase())) &&
        (!filters.project || displayProjectName(item.project_name) === filters.project) &&
        (!filters.campaign ||
          projects.find((project) => project.id === item.project_id || project.project_name === item.project_name)?.campaign_name === filters.campaign) &&
        (!filters.brand || item.brand_name === filters.brand) &&
        (filters.gpsStatus === "all_gps" || (filters.gpsStatus === "gps_verified" ? hasVerifiedGps(item) : !hasVerifiedGps(item)))
      );
    });
  }, [filters, submissions]);

  const dailyCounts = getDailyCounts(filtered);
  const regionCounts = getRegionCounts(filtered);
  const brandCounts = getBrandCounts(filtered);
  const stateCounts = getStateCounts(filtered);
  const projectCounts = getProjectCounts(filtered);
  const mappedCount = filtered.filter((item) => hasVerifiedGps(item)).length;
  const reportFiltered = useMemo(() => {
    const byStatus =
      reportStatusFilter === "all"
        ? filtered
        : reportStatusFilter === "approved"
        ? filtered.filter((item) => item.status === "Approved")
        : reportStatusFilter === "pending"
        ? filtered.filter((item) => item.status === "Pending")
        : filtered.filter((item) => item.status === "Rejected");

    return byStatus;
  }, [filtered, reportStatusFilter]);
  const exportQuery = buildExportQuery(filters, reportStatusFilter);
  const metrics = getExecutiveMetrics(filtered);
  const trendSeries = getTrendSeries(filtered);
  const clientTrendSeries = useMemo(() => {
    const buckets = new Map<string, { date: string; deployments: number; gpsVerified: number; photoEvidence: number }>();

    filtered.forEach((item) => {
      const date = new Date(item.submitted_at).toISOString().slice(0, 10);
      const current = buckets.get(date) ?? { date, deployments: 0, gpsVerified: 0, photoEvidence: 0 };
      current.deployments += 1;
      if (hasVerifiedGps(item)) current.gpsVerified += 1;
      if (item.image_url) current.photoEvidence += 1;
      buckets.set(date, current);
    });

    return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered]);
  const projectOptions = useMemo(
    () => Array.from(new Set([...projects.map((project) => displayProjectName(project.project_name)), ...submissions.map((item) => displayProjectName(item.project_name))])).sort(),
    [projects, submissions]
  );
  const selectedProject = useMemo(
    () =>
      filters.project
        ? projects.find((project) => displayProjectName(project.project_name) === filters.project)
        : projects.length === 1
        ? projects[0]
        : undefined,
    [filters.project, projects]
  );
  const selectedProjectId = selectedProject?.id ?? null;
  const selectedProjectName = selectedProject ? displayProjectName(selectedProject.project_name) : filters.project || "";
  const activeProjectName = selectedProjectName || (projectOptions.length === 1 ? projectOptions[0] : "All projects");
  const projectOperations = getProjectOperations(projects, projectTargets, filtered, deploymentProgress);
  const contextProjectOperations = selectedProject ? projectOperations.filter((row) => row.project.id === selectedProject.id) : projectOperations;
  const portfolio = getPortfolioOperations(projectOperations);
  const contextPortfolio = getPortfolioOperations(contextProjectOperations);
  useEffect(() => {
    console.info("[client-dashboard] project context", {
      selectedProjectId,
      activeProjectId: selectedProjectId,
      activeProjectName,
      displayedProjectName: activeProjectName,
      fallbackProjectName: FALLBACK_PROJECT_NAME,
      expectedDeploymentProjectId: selectedProjectId,
      dashboardProjectId: selectedProjectId,
      filtersProject: filters.project || null,
      projectOptions: projectOptions.slice(0, 10),
      projectCount: projects.length,
      submissionCount: submissions.length
    });
  }, [selectedProjectId, selectedProjectName, filters.project, activeProjectName, projectOptions.length, projects.length, submissions.length]);
  const campaignOptions = Array.from(new Set(projects.map((project) => project.campaign_name).filter(Boolean) as string[])).sort();
  const clientDisplayName = client.name;
  const statesCovered = stateCounts.filter((item) => item.state !== "Unknown").length;
  const regionsCovered = regionCounts.filter((item) => item.region !== "Unknown").length;
  const brandsCovered = brandCounts.length;
  const recentEvidence = filtered.slice(0, 5);
  const approvedCount = filtered.filter((item) => item.status === "Approved").length;
  const pendingCount = filtered.filter((item) => item.status === "Pending").length;
  const rejectedCount = filtered.filter((item) => item.status === "Rejected").length;
  const gpsVerifiedCount = filtered.filter((item) => hasVerifiedGps(item)).length;
  const gpsMissingCount = filtered.length - gpsVerifiedCount;
  const rejectionRows = filtered.filter((item) => item.status === "Rejected");
  const insightRows = insightView === "rejections" ? rejectionRows : [];

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
        <div className="mx-auto flex min-h-16 w-[min(1380px,calc(100%-28px))] min-w-0 flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <BrandMark />
            <p className="mt-2 whitespace-normal break-words text-sm leading-snug text-slate-500">
              {clientDisplayName} — {activeProjectName}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            <NotificationCenter enabled={notificationsEnabled} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-w-0 w-[min(1380px,calc(100%-28px))] flex-col gap-4 py-4 lg:flex-row lg:items-start lg:py-6">
        <DashboardSidebar audience="client" activeView={activeView} onSelectView={setActiveView} />
      <section className="min-w-0 flex-1" key={activeView}>
        <div ref={contentTopRef} className="mb-5 min-w-0 scroll-mt-24 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
          <h1 className="whitespace-normal break-words text-2xl font-bold leading-snug sm:text-3xl">{clientViewTitle(activeView)}</h1>
          <p className="mt-2 whitespace-normal break-words text-sm leading-snug text-slate-600">{clientViewDescription(activeView)}</p>
          <p className="mt-2 text-xs font-medium text-slate-500">Last updated: {lastUpdated || "Loading..."}</p>
        </div>

        <div className={`${activeView === "overview" ? "block" : "hidden"} min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm`}>
          <div className="grid min-w-0 gap-4 bg-slate-950 p-5 text-white lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
            <div className="min-w-0">
              <div className="inline-flex rounded-lg border border-orange-300/40 bg-orange-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-orange-200">DeployIQ</div>
              <h2 className="mt-4 whitespace-normal break-words text-2xl font-extrabold leading-tight sm:text-3xl">Client Executive Deployment Summary</h2>
              <p className="mt-2 max-w-3xl whitespace-normal break-words text-sm leading-relaxed text-slate-300">
                {clientDisplayName} deployment visibility for {activeProjectName}. Review progress, geographic coverage, brand execution, and field photo evidence.
              </p>
            </div>
            <div className="grid min-w-0 gap-2 rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
              <MetaLine label="Client" value={clientDisplayName} />
              <MetaLine label="Project" value={activeProjectName} />
              <MetaLine label="Generated" value={lastUpdated || "Loading..."} />
            </div>
          </div>
          <div className="grid min-w-0 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6">
            <SummaryCard label="Expected deployment" value={portfolio.expected} />
            <SummaryCard label="Actual deployment" value={portfolio.actual} />
            <SummaryCard label="Outstanding" value={portfolio.outstanding} />
            <SummaryCard label="Completion" value={portfolio.completion} suffix="%" />
            <SummaryCard label="State coverage" value={statesCovered} />
            <SummaryCard label="Evidence records" value={filtered.length} />
          </div>
        </div>

        <div className={`${activeView === "overview" ? "grid" : "hidden"} mt-5 min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-5`}>
          <SummaryCard label="Approved" value={approvedCount} />
          <SummaryCard label="Pending" value={pendingCount} />
          <SummaryActionCard label="Rejected" value={rejectedCount} onClick={() => setInsightView("rejections")} />
          <SummaryCard label="GPS Verified" value={gpsVerifiedCount} />
          <SummaryCard label="GPS Missing" value={gpsMissingCount} />
        </div>

        <div className={`${activeView === "overview" ? "grid" : "hidden"} mt-4 min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4`}>
          <SummaryCard label="States covered" value={statesCovered} />
          <SummaryCard label="Regions covered" value={regionsCovered} />
          <SummaryCard label="GPS/location evidence" value={mappedCount} />
          <SummaryCard label="Brands covered" value={brandsCovered} />
        </div>

        <div className={`${activeView === "overview" ? "flex" : "hidden"} mt-4 min-w-0 flex-wrap gap-2`}>
          <button
            type="button"
            className="inline-flex min-h-10 items-center rounded-lg border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-800 transition hover:bg-rose-100"
            onClick={() => setInsightView("rejections")}
          >
            View Rejections
          </button>
        </div>

        <div className={`${activeView === "overview" ? "block" : "hidden"} mt-5 min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4`}>
          <div className="grid min-w-0 gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
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
              <StateCombobox
                value={filters.state}
                onChange={(value) => setFilter("state", value)}
                required={false}
                placeholder="All states"
                inputClassName="min-h-10"
                autoComplete="off-state-filter"
                inputName="deployiq-state-filter"
                inputId="deployiq-client-state-filter"
              />
            </FilterField>
            <FilterField label="Region">
              <select className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" value={filters.region} onChange={(event) => setFilter("region", event.target.value)}>
                <option value="">All regions</option>
                {NIGERIA_REGIONS.map((region) => (
                  <option key={region} value={region}>{region}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="LGA">
              <input className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" value={filters.lga} onChange={(event) => setFilter("lga", event.target.value)} placeholder="All LGAs" />
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
            <FilterField label="GPS Status">
              <select className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" value={filters.gpsStatus} onChange={(event) => setFilter("gpsStatus", event.target.value as Filters["gpsStatus"])}>
                <option value="all_gps">All GPS</option>
                <option value="gps_verified">GPS Verified</option>
                <option value="gps_missing">GPS Missing</option>
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

          <div className="mt-4 flex min-w-0 flex-wrap gap-3">
            <button className="inline-flex min-h-10 min-w-[180px] flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold transition hover:border-orange-200 hover:bg-orange-50 sm:flex-none" onClick={() => setFilters(blankFilters)}>
              Clear filters
            </button>
            <ExportButton onClick={() => downloadExport("/api/client/exports/excel", "Full Excel report")} icon="excel" label="Full Excel report" loading={exporting === "Full Excel report"} />
            <ExportButton onClick={() => downloadExport(`/api/client/exports/excel${exportQuery}`, "Filtered Excel report")} icon="excel" label="Filtered Excel report" loading={exporting === "Filtered Excel report"} />
            <ExportButton onClick={() => downloadExport("/api/client/exports/pdf", "Full PDF report")} icon="pdf" label="Full PDF report" loading={exporting === "Full PDF report"} />
            <ExportButton onClick={() => downloadExport(`/api/client/exports/pdf${exportQuery}`, "Filtered PDF report")} icon="pdf" label="Filtered PDF report" loading={exporting === "Filtered PDF report"} />
          </div>
          {exportError ? <p className="mt-3 whitespace-normal break-words text-sm leading-snug text-rose-700">{exportError}</p> : null}
        </div>

        <div className={`${activeView === "overview" ? "grid" : "hidden"} mt-5 min-w-0 gap-4 lg:grid-cols-2`}>
          <ExecutiveBars title="Regional breakdown" rows={regionCounts.map((item) => [item.region, item.count])} />
          <ExecutiveBars title="Brand breakdown" rows={brandCounts.map((item) => [item.brand, item.count])} accent="#7c3aed" />
        </div>

        <div className={`${activeView === "overview" ? "grid" : "hidden"} mt-5 min-w-0 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]`}>
          <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex min-w-0 items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="whitespace-normal break-words text-base font-bold leading-snug">Deployment map summary</h2>
                <p className="mt-2 whitespace-normal break-words text-sm leading-snug text-slate-600">GPS-backed coverage and deployment density overview.</p>
              </div>
              <MapPin className="shrink-0 text-orange-500" aria-hidden size={24} />
            </div>
            <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-3">
              <MiniMetric label="States covered" value={statesCovered} />
              <MiniMetric label="GPS verified" value={mappedCount} />
              <MiniMetric label="Density" value={mappedCount === 0 ? "No GPS data" : `${mappedCount} mapped`} />
            </div>
            <button className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-orange-600" type="button" onClick={() => setActiveView("map")}>
              View Full Deployment Map
            </button>
          </div>
          <EvidenceInstallationsPanel rows={recentEvidence} onOpen={(item) => setLightboxIndex(filtered.findIndex((record) => record.id === item.id))} />
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

        {activeView === "analytics" ? (
          <div className="grid min-w-0 gap-5">
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="Expected deployment" value={contextPortfolio.expected} />
              <SummaryCard label="Actual deployment" value={contextPortfolio.actual} />
              <SummaryCard label="Outstanding" value={contextPortfolio.outstanding} />
              <SummaryCard label="Completion" value={contextPortfolio.completion} suffix="%" />
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="States covered" value={statesCovered} />
              <SummaryCard label="Regions covered" value={regionsCovered} />
              <SummaryCard label="Brands covered" value={brandsCovered} />
              <SummaryCard label="GPS evidence" value={mappedCount} />
            </div>
            <div className="grid min-w-0 gap-4 xl:grid-cols-3">
              <ChartPanel title="Installations by region" data={regionCounts} xKey="region" />
              <ChartPanel title="Installations by brand" data={brandCounts} xKey="brand" color="#7c3aed" />
              <ChartPanel title="Daily uploads" data={dailyCounts} xKey="date" color="#2563eb" />
            </div>
            <ClientTrendPanel data={clientTrendSeries} />
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <ExecutiveBars title="Deployment by region" rows={regionCounts.map((item) => [item.region, item.count])} />
              <ExecutiveBars title="Deployment by brand" rows={brandCounts.map((item) => [item.brand, item.count])} accent="#7c3aed" />
              <BreakdownPanel title="State coverage" rows={stateCounts.map((item) => [item.state, item.count])} />
              <BreakdownPanel title="Project distribution" rows={projectCounts.map((item) => [displayProjectName(item.project), item.count])} />
            </div>
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <ProjectPortfolioPanel rows={projectOperations} />
              <FunnelPanel rows={getStageTotals(projectOperations)} />
            </div>
          </div>
        ) : null}

        <div className={`${activeView === "reports" ? "block" : "hidden"} min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white`}>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <h2 className="min-w-0 break-words text-base font-bold leading-snug">Latest installations</h2>
            <div className="text-right">
              <span className="text-sm text-slate-500">{reportFiltered.length} shown</span>
              <p className="text-xs text-slate-500">Includes all status categories and GPS verification states.</p>
            </div>
          </div>
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="flex min-w-0 flex-wrap gap-2">
              <QuickFilterChip label="All Records" active={reportStatusFilter === "all"} onClick={() => setReportStatusFilter("all")} />
              <QuickFilterChip label="Approved" active={reportStatusFilter === "approved"} onClick={() => setReportStatusFilter("approved")} />
              <QuickFilterChip label="Pending" active={reportStatusFilter === "pending"} onClick={() => setReportStatusFilter("pending")} />
              <QuickFilterChip label="Rejected" active={reportStatusFilter === "rejected"} onClick={() => setReportStatusFilter("rejected")} />
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {reportFiltered.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title={submissions.length === 0 ? "No submissions yet" : "No filtered results"}
                  message={submissions.length === 0 ? "New installation evidence will appear here once available." : "Try widening the current filters to see more installations."}
                  icon={<Inbox aria-hidden size={22} />}
                />
              </div>
            ) : null}
            {reportFiltered.map((item) => (
              <article className="grid min-w-0 gap-3 overflow-hidden p-4 sm:grid-cols-[96px_minmax(0,1fr)]" key={item.id}>
                <button className="h-24 w-24 overflow-hidden rounded-lg border border-slate-200" onClick={() => setLightboxIndex(filtered.findIndex((record) => record.id === item.id))}>
                  <img className="h-full w-full object-cover" src={item.image_url} alt={item.salon_name || "Uploaded board"} />
                </button>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h3 className="min-w-0 whitespace-normal break-words text-base font-bold leading-snug">{item.salon_name || "Name not visible"}</h3>
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${clientStatusClass(item.status)}`}>{item.status}</span>
                    {item.duplicate_status && item.duplicate_status !== "Unique" ? (
                      <span className="rounded-full border border-orange-200 bg-orange-100 px-2 py-1 text-xs font-semibold text-orange-800">{item.duplicate_status}</span>
                    ) : null}
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
                    GPS: {item.gps_latitude ?? "n/a"}, {item.gps_longitude ?? "n/a"} | {item.installation_date ?? displaySubmissionDate(item.submitted_at)} {item.installation_time ?? ""}
                  </p>
                  <p className="mt-2 whitespace-normal break-words text-sm leading-snug text-slate-600">OCR: {item.ocr_text || item.ai_raw_text || "No extracted text"}</p>
                  {item.status === "Rejected" ? (
                    <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                      <p>
                        <strong>Rejection reason:</strong> {item.rejection_reason || "Not specified"}
                      </p>
                      {item.approval_comments ? (
                        <p className="mt-1">
                          <strong>Admin comment:</strong> {item.approval_comments}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
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
      {insightView ? (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm p-4 sm:p-6" role="dialog" aria-modal="true">
          <div className="mx-auto mt-4 w-[min(1180px,calc(100%-8px))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-base font-bold text-slate-950">Rejected Deployments</h2>
                <p className="text-xs text-slate-500">{insightRows.length} record{insightRows.length === 1 ? "" : "s"} shown</p>
              </div>
              <button
                type="button"
                className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={() => setInsightView(null)}
              >
                Close
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto">
              <table className="min-w-[900px] w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Photo</th>
                    <th className="px-3 py-2">Outlet Name</th>
                    <th className="px-3 py-2">State</th>
                    <th className="px-3 py-2">Installer</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Rejection Reason</th>
                    <th className="px-3 py-2">Admin Comment</th>
                    <th className="px-3 py-2">Duplicate Status</th>
                  </tr>
                </thead>
                <tbody>
                  {insightRows.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2">
                        <button type="button" className="h-12 w-12 overflow-hidden rounded border border-slate-200" onClick={() => setLightboxIndex(filtered.findIndex((record) => record.id === item.id))}>
                          <img className="h-full w-full object-cover" src={item.image_url} alt={item.salon_name || "Submission"} />
                        </button>
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{item.salon_name || "Name not visible"}</td>
                      <td className="px-3 py-2 text-slate-700">{item.installer_state || "Unknown"}</td>
                      <td className="px-3 py-2 text-slate-700">{item.installer_name || "Unknown"}</td>
                      <td className="px-3 py-2 text-slate-700">{item.installation_date ?? displaySubmissionDate(item.submitted_at)}</td>
                      <td className="px-3 py-2 text-slate-700">{item.status}</td>
                      <td className="px-3 py-2 text-slate-700">{item.rejection_reason || "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{item.approval_comments || "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{item.duplicate_status || "Unique"}</td>
                    </tr>
                  ))}
                  {insightRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                        No records to display.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
      <PhotoLightbox submissions={filtered} activeIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} onNavigate={setLightboxIndex} audience="client" />
    </main>
  );
}

function SummaryCard({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="min-w-0 h-full overflow-hidden rounded-xl bg-white p-5 shadow-sm">
      <div className="whitespace-normal break-words text-xs font-semibold uppercase leading-snug text-slate-400">{label}</div>
      <div className="mt-3 flex items-baseline gap-3">
        <div className="text-3xl font-extrabold leading-tight text-slate-900">{value}</div>
        {suffix ? <div className="text-sm font-semibold text-slate-500">{suffix}</div> : null}
      </div>
    </div>
  );
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 border-b border-white/10 pb-2 last:border-b-0 last:pb-0">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</span>
      <span className="min-w-0 whitespace-normal break-words text-right text-sm font-semibold text-white">{value}</span>
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
    <button className="inline-flex min-h-10 min-w-[180px] flex-1 items-center justify-center gap-2 whitespace-normal break-words rounded-lg border border-slate-200 bg-white px-4 text-center text-sm font-semibold leading-snug transition hover:border-orange-200 hover:bg-orange-50 disabled:cursor-wait disabled:opacity-70 sm:flex-none" onClick={onClick} type="button" disabled={loading}>
      {loading ? <Loader2 className="animate-spin" aria-hidden size={16} /> : <Icon aria-hidden size={16} />}
      {loading ? "Generating..." : label}
    </button>
  );
}

function QuickFilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-9 items-center rounded-lg border px-3 text-xs font-semibold transition ${
        active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ExecutiveBars({ title, rows, accent = "#0b7c59" }: { title: string; rows: Array<[string, number]>; accent?: string }) {
  const max = Math.max(...rows.map((row) => row[1]), 1);
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 whitespace-normal break-words text-base font-bold leading-snug">{title}</h2>
      {rows.length === 0 ? (
        <EmptyState title="No summary data" message="This summary will populate once matching submissions are available." />
      ) : (
        <div className="grid min-w-0 gap-3">
          {rows.slice(0, 8).map(([label, value]) => (
            <div className="grid min-w-0 gap-1" key={label}>
              <div className="flex min-w-0 items-center justify-between gap-3 text-sm">
                <span className="min-w-0 whitespace-normal break-words font-semibold leading-snug text-slate-700">{label}</span>
                <span className="shrink-0 font-bold text-slate-950">{value}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${Math.max(6, (value / max) * 100)}%`, backgroundColor: accent }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryActionCard({ label, value, onClick }: { label: string; value: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 h-full overflow-hidden rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-orange-200 hover:bg-orange-50"
    >
      <div className="whitespace-normal break-words text-xs font-semibold uppercase leading-snug text-slate-500">{label}</div>
      <div className="mt-3 flex items-baseline gap-3">
        <div className="text-3xl font-extrabold leading-tight text-slate-900">{value}</div>
      </div>
    </button>
  );
}

function EvidenceInstallationsPanel({ rows, onOpen }: { rows: Submission[]; onOpen: (item: Submission) => void }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="whitespace-normal break-words text-base font-bold leading-snug">Recent photo evidence</h2>
      <p className="mt-2 whitespace-normal break-words text-sm leading-snug text-slate-600">Latest outlet evidence available to the client team.</p>
      <div className="mt-4 grid min-w-0 gap-3">
        {rows.length === 0 ? <EmptyState title="No photo evidence yet" message="Installation evidence will appear here once available." /> : null}
        {rows.map((item) => (
          <button
            key={item.id}
            className="grid min-w-0 gap-3 rounded-lg bg-slate-50 p-3 text-left transition hover:bg-orange-50 sm:grid-cols-[72px_minmax(0,1fr)]"
            type="button"
            onClick={() => onOpen(item)}
          >
            <img className="h-16 w-16 rounded-lg object-cover" src={item.image_url} alt={item.salon_name || "Approved installation"} />
            <span className="min-w-0">
              <span className="block whitespace-normal break-words text-sm font-bold leading-snug text-slate-950">{item.salon_name || "Outlet name not visible"}</span>
              <span className="mt-1 block whitespace-normal break-words text-xs leading-snug text-slate-500">
                {item.installer_state || "Unknown state"} | {item.brand_name || "Unassigned brand"} | {item.installation_date ?? displaySubmissionDate(item.submitted_at)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
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

function ClientTrendPanel({
  data
}: {
  data: Array<{ date: string; deployments: number; gpsVerified: number; photoEvidence: number }>;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 whitespace-normal break-words text-base font-bold leading-snug">Executive trends</h2>
      {data.length === 0 ? (
        <EmptyState title="No trend data" message="This trend will populate once matching submissions are available." />
      ) : (
        <div className="min-w-0 overflow-x-auto overflow-y-hidden">
          <div className="w-[560px] sm:w-full">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={56} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="deployments" name="Deployments" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="gpsVerified" name="GPS verified" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="photoEvidence" name="Photo evidence" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
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

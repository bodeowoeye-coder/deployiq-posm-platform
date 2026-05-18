"use client";

import Link from "next/link";
import { Download, FileText, Inbox, Loader2, Search } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { BRANDS, STATUSES } from "@/lib/brands";
import type { Brand, Client, DeploymentProgress, Project, ProjectTarget, Submission, SubmissionStatus, SubmissionStatusHistory } from "@/lib/types";
import {
  getBrandComplianceScores,
  getBrandCounts,
  getDailyCounts,
  getExecutiveMetrics,
  getInstallerAccuracyRanking,
  getInstallerCounts,
  getRegionCounts,
  getRegionPerformanceRanking,
  getTrendSeries
} from "@/lib/reporting";
import { DeploymentMap } from "@/components/DeploymentMap";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { BrandMark } from "@/components/BrandMark";
import { EmptyState } from "@/components/EmptyState";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/components/ToastProvider";
import { displayProjectName } from "@/lib/projects";
import { DashboardSidebar, type DashboardView } from "@/components/DashboardSidebar";
import { getOperationalAlerts, getPortfolioOperations, getProjectOperations, getStageTotals } from "@/lib/operations";
import { StateCombobox } from "@/components/StateCombobox";

type Filters = {
  query: string;
  startDate: string;
  endDate: string;
  region: string;
  installer: string;
  project: string;
  campaign: string;
  brand: string;
  status: string;
};

const blankFilters: Filters = {
  query: "",
  startDate: "",
  endDate: "",
  region: "",
  installer: "",
  project: "",
  campaign: "",
  brand: "",
  status: ""
};

function buildExportQuery(filters: Filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value.trim()) params.set(key, value.trim());
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

function statusClass(status: string) {
  if (status === "Approved") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (status === "Rejected") return "bg-rose-100 text-rose-800 border-rose-200";
  if (status === "Flagged") return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-amber-100 text-amber-800 border-amber-200";
}

function matchClass(status: string | null) {
  if (status === "Matched") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (status === "Mismatch") return "bg-rose-100 text-rose-800 border-rose-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function confidenceClass(level: string | null) {
  if (level === "High") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (level === "Medium") return "bg-sky-100 text-sky-800 border-sky-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function duplicateClass(status: string | null) {
  if (status === "Duplicate") return "bg-rose-100 text-rose-800 border-rose-200";
  if (status === "Possible Duplicate") return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function formatStage(stage: string | null) {
  if (!stage) return "Installed";
  return stage
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function AdminDashboard({
  submissions,
  history,
  projects,
  projectTargets,
  deploymentProgress
  ,
  clients,
  brands
}: {
  submissions: Submission[];
  history: SubmissionStatusHistory[];
  projects: Project[];
  projectTargets: ProjectTarget[];
  deploymentProgress: DeploymentProgress[];
  clients: Client[];
  brands: Brand[];
}) {
  const [records, setRecords] = useState(submissions);
  const [projectRecords, setProjectRecords] = useState(projects);
  const [filters, setFilters] = useState<Filters>(blankFilters);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const { showToast } = useToast();

  useEffect(() => {
    setLastUpdated(new Date().toLocaleString());
  }, []);

  const filtered = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    const region = filters.region.trim().toLowerCase();
    const installer = filters.installer.trim().toLowerCase();

    return records.filter((item) => {
      const date = item.installation_date ?? item.submitted_at.slice(0, 10);
      const searchable = [
        item.installer_name,
        item.project_name,
        item.brand_name,
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
        (!region ||
          [item.installer_region, item.installer_state, item.installer_lga, item.state_region]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(region)) &&
        (!installer || (item.installer_name ?? "").toLowerCase().includes(installer)) &&
        (!filters.project || displayProjectName(item.project_name) === filters.project) &&
        (!filters.campaign ||
          projectRecords.find((project) => project.id === item.project_id || project.project_name === item.project_name)?.campaign_name === filters.campaign) &&
        (!filters.brand || item.brand_name === filters.brand) &&
        (!filters.status || item.status === filters.status)
      );
    });
  }, [filters, records]);

  const dailyCounts = getDailyCounts(filtered);
  const regionCounts = getRegionCounts(filtered);
  const brandCounts = getBrandCounts(filtered);
  const installerCounts = getInstallerCounts(filtered);
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = dailyCounts.find((item) => item.date === today)?.count ?? 0;
  const approvedCount = filtered.filter((item) => item.status === "Approved").length;
  const pendingCount = filtered.filter((item) => item.status === "Pending").length;
  const rejectedCount = filtered.filter((item) => item.status === "Rejected").length;
  const exportQuery = buildExportQuery(filters);
  const metrics = getExecutiveMetrics(filtered);
  const trendSeries = getTrendSeries(filtered);
  const installerAccuracy = getInstallerAccuracyRanking(filtered);
  const regionPerformance = getRegionPerformanceRanking(filtered);
  const brandCompliance = getBrandComplianceScores(filtered);
  const projectOptions = Array.from(new Set(records.map((item) => displayProjectName(item.project_name)))).sort();
  const campaignOptions = Array.from(new Set(projectRecords.map((project) => project.campaign_name).filter(Boolean) as string[])).sort();
  const projectOperations = getProjectOperations(projectRecords, projectTargets, filtered, deploymentProgress);
  const portfolio = getPortfolioOperations(projectOperations);
  const stageTotals = getStageTotals(projectOperations);
  const operationalAlerts = getOperationalAlerts(projectOperations);

  function setFilter(key: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function updateSubmission(
    id: string,
    changes: {
      brandName?: string;
      status?: SubmissionStatus;
      salonName?: string;
      address?: string;
      phone?: string;
      approvalComments?: string;
      rejectionReason?: string;
      deploymentStageCode?: string;
    }
  ) {
    const response = await fetch("/api/submissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...changes })
    });

    if (!response.ok) {
      showToast("Could not save update.", "error");
      return;
    }

    const body = await response.json();
    setRecords((current) => current.map((item) => (item.id === id ? body.submission : item)));
    setLastUpdated(new Date().toLocaleString());
    showToast(changes.status ? `Status updated to ${changes.status}.` : "Update saved.");
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

  async function createProject(formData: FormData) {
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: formData.get("projectName"),
        clientId: formData.get("clientId"),
        brandId: formData.get("brandId"),
        campaignName: formData.get("campaignName"),
        targetQuantity: Number(formData.get("targetQuantity") || 0),
        status: formData.get("status"),
        startDate: formData.get("startDate"),
        endDate: formData.get("endDate"),
        targetRegion: formData.get("targetRegion"),
        targetState: formData.get("targetState"),
        targetInstaller: formData.get("targetInstaller"),
        targetAgency: formData.get("targetAgency"),
        regionsCovered: String(formData.get("regionsCovered") || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        assignedInstallers: String(formData.get("assignedInstallers") || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      })
    });
    const body = await response.json();
    if (!response.ok) {
      showToast(body.error || "Could not create project.", "error");
      return;
    }
    setProjectRecords((current) => [body.project, ...current]);
    showToast("Project created.");
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-[min(1180px,calc(100%-28px))] min-w-0 flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <BrandMark />
          <div className="flex min-w-0 flex-wrap gap-2">
            <ThemeToggle />
            <Link className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold transition hover:border-orange-200 hover:bg-orange-50" href="/submit">
              Upload
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-w-0 w-[min(1380px,calc(100%-28px))] flex-col gap-4 py-4 lg:flex-row lg:items-start lg:py-6">
        <DashboardSidebar audience="admin" activeView={activeView} onSelectView={setActiveView} />
      <section className="min-w-0 flex-1">
        <div className="mb-5">
          <h1 className="whitespace-normal break-words text-2xl font-bold leading-snug tracking-normal sm:text-3xl">Installation Reports</h1>
          <p className="mt-2 whitespace-normal break-words text-sm leading-snug text-slate-600">Filter live deployment data and export client-ready Excel or PDF reports.</p>
          <p className="mt-2 text-xs font-medium text-slate-500">Last updated: {lastUpdated || "Loading..."}</p>
        </div>

        <div className={`${activeView === "overview" ? "grid" : "hidden"} min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4`}>
          <SummaryCard label="Expected deployments" value={portfolio.expected} />
          <SummaryCard label="Actual deployments" value={portfolio.actual} />
          <SummaryCard label="Completion" value={portfolio.completion} suffix="%" />
          <SummaryCard label="Outstanding" value={portfolio.outstanding} />
        </div>

        <div className={`${activeView === "overview" ? "grid" : "hidden"} mt-5 min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4`}>
          <SummaryCard label="Deployment efficiency" value={portfolio.deploymentEfficiency} suffix="%" />
          <SummaryCard label="Installer performance" value={portfolio.installerPerformance} suffix="%" />
          <SummaryCard label="Average approval time" value={portfolio.averageApprovalHours} suffix="h" />
          <SummaryCard label="SLA compliance" value={portfolio.slaCompliance} suffix="%" />
        </div>

        <div className={`${activeView === "overview" ? "grid" : "hidden"} mt-5 min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-6`}>
          <SummaryCard label="Total installs" value={filtered.length} />
          <SummaryCard label="Today" value={todayCount} />
          <SummaryCard label="Brands" value={brandCounts.length} />
          <SummaryCard label="Approved" value={approvedCount} />
          <SummaryCard label="Pending" value={pendingCount} />
          <SummaryCard label="Rejected" value={rejectedCount} />
        </div>

        <div className={`${activeView === "overview" ? "grid" : "hidden"} mt-5 min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5`}>
          <SummaryCard label="Success rate" value={metrics.successRate} suffix="%" />
          <SummaryCard label="Mismatch rate" value={metrics.mismatchRate} suffix="%" />
          <SummaryCard label="Duplicate rate" value={metrics.duplicateRate} suffix="%" />
          <SummaryCard label="Auto-approval rate" value={metrics.autoApprovalRate} suffix="%" />
          <SummaryCard label="Avg. turnaround" value={metrics.approvalTurnaroundHours} suffix="h" />
        </div>

        <div className={`${activeView === "overview" ? "block" : "hidden"} mt-5 min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4`}>
          <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-8">
            <FilterField label="Search">
              <div className="relative">
                <Search className="absolute left-3 top-3 text-slate-400" aria-hidden size={16} />
                <input className="min-h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm" value={filters.query} onChange={(event) => setFilter("query", event.target.value)} placeholder="Store, OCR, installer" />
              </div>
            </FilterField>
            <FilterField label="Start date">
              <input className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" type="date" value={filters.startDate} onChange={(event) => setFilter("startDate", event.target.value)} />
            </FilterField>
            <FilterField label="End date">
              <input className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" type="date" value={filters.endDate} onChange={(event) => setFilter("endDate", event.target.value)} />
            </FilterField>
            <FilterField label="Region/state">
              <StateCombobox
                value={filters.region}
                onChange={(value) => setFilter("region", value)}
                required={false}
                placeholder="All states"
                inputClassName="min-h-10"
                autoComplete="off-state-filter"
                inputName="deployiq-state-filter"
                inputId="deployiq-admin-state-filter"
              />
            </FilterField>
            <FilterField label="Installer">
              <input className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" value={filters.installer} onChange={(event) => setFilter("installer", event.target.value)} placeholder="Name" />
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
                {BRANDS.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Status">
              <select className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" value={filters.status} onChange={(event) => setFilter("status", event.target.value)}>
                <option value="">All statuses</option>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </FilterField>
          </div>

          <div className="mt-4 flex min-w-0 flex-wrap gap-2">
            <button className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold transition hover:border-orange-200 hover:bg-orange-50" onClick={() => setFilters(blankFilters)}>
              Clear filters
            </button>
            <ExportButton onClick={() => downloadExport("/api/exports/excel", "Full Excel report")} icon="excel" label="Full Excel report" loading={exporting === "Full Excel report"} />
            <ExportButton onClick={() => downloadExport(`/api/exports/excel${exportQuery}`, "Filtered Excel report")} icon="excel" label="Filtered Excel report" loading={exporting === "Filtered Excel report"} />
            <ExportButton onClick={() => downloadExport("/api/exports/pdf", "Full PDF report")} icon="pdf" label="Full PDF report" loading={exporting === "Full PDF report"} />
            <ExportButton onClick={() => downloadExport(`/api/exports/pdf${exportQuery}`, "Filtered PDF report")} icon="pdf" label="Filtered PDF report" loading={exporting === "Filtered PDF report"} />
          </div>
          {exportError ? <p className="mt-3 whitespace-normal break-words text-sm leading-snug text-rose-700">{exportError}</p> : null}
        </div>

        <div className={`${activeView === "overview" ? "grid" : "hidden"} mt-5 min-w-0 gap-4 lg:grid-cols-3`}>
          <ChartPanel title="Installations by region" data={regionCounts} xKey="region" />
          <ChartPanel title="Installations by brand" data={brandCounts} xKey="brand" color="#7c3aed" />
          <ChartPanel title="Daily uploads" data={dailyCounts} xKey="date" color="#2563eb" />
        </div>

        <div className={`${activeView === "overview" ? "grid" : "hidden"} mt-5 min-w-0 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]`}>
          <ProjectPortfolioPanel rows={projectOperations} />
          <FunnelPanel rows={stageTotals} />
        </div>

        <div className={`${activeView === "overview" ? "block" : "hidden"} mt-5 min-w-0`}>
          <AlertPanel rows={operationalAlerts} />
        </div>

        <div className={`${activeView === "overview" ? "block" : "hidden"} mt-5 min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4`}>
          <h2 className="mb-3 whitespace-normal break-words text-base font-bold leading-snug">Executive trends</h2>
          <div className="min-w-0 overflow-hidden">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendSeries}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line dataKey="submissions" stroke="#2563eb" strokeWidth={2} />
              <Line dataKey="approved" stroke="#059669" strokeWidth={2} />
              <Line dataKey="flagged" stroke="#f97316" strokeWidth={2} />
              <Line dataKey="mismatches" stroke="#e11d48" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
          </div>
        </div>

        {activeView === "map" ? (
          <div className="grid min-w-0 gap-4">
            <DeploymentMap submissions={filtered} variant="hero" />
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <BreakdownPanel title="Brand summary" rows={brandCounts.map((item) => [item.brand, item.count])} />
              <BreakdownPanel title="Installer performance" rows={installerCounts.slice(0, 8).map((item) => [item.installer, item.count])} />
            </div>
          </div>
        ) : null}

        <div className={`${activeView === "reports" ? "grid" : "hidden"} min-w-0 gap-4 lg:grid-cols-2`}>
          <BreakdownPanel title="Brand summary" rows={brandCounts.map((item) => [item.brand, item.count])} />
          <BreakdownPanel title="Installer performance" rows={installerCounts.slice(0, 8).map((item) => [item.installer, item.count])} />
        </div>

        <div className={`${activeView === "overview" ? "grid" : "hidden"} mt-5 min-w-0 gap-4 lg:grid-cols-3`}>
          <ScorePanel title="Installer accuracy ranking" rows={installerAccuracy.map((item) => [item.installer, item.score, item.total])} />
          <ScorePanel title="Region performance ranking" rows={regionPerformance.map((item) => [item.region, item.score, item.total])} />
          <ScorePanel title="Brand compliance score" rows={brandCompliance.map((item) => [item.brand, item.score, item.total])} />
        </div>

        <div className={`${activeView === "reports" ? "block" : "hidden"} mt-5 min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white`}>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <h2 className="min-w-0 break-words text-base font-bold leading-snug">Submissions</h2>
            <span className="text-sm text-slate-500">{filtered.length} shown</span>
          </div>
          <div className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title={records.length === 0 ? "No submissions yet" : "No filtered results"}
                  message={records.length === 0 ? "New installer uploads will appear here once submitted." : "Try widening the current filters to see more installations."}
                  icon={<Inbox aria-hidden size={22} />}
                />
              </div>
            ) : null}
            {filtered.map((item) => (
              <article className={`grid min-w-0 gap-3 overflow-hidden p-4 sm:grid-cols-[96px_minmax(0,1fr)] xl:grid-cols-[96px_minmax(0,1fr)_260px] ${item.brand_match_status === "Mismatch" ? "bg-rose-50/70" : item.duplicate_status && item.duplicate_status !== "Unique" ? "bg-orange-50/70" : ""}`} key={item.id}>
                <button className="h-24 w-24 overflow-hidden rounded-lg border border-slate-200" onClick={() => setLightboxIndex(filtered.findIndex((record) => record.id === item.id))}>
                  <img className="h-full w-full object-cover" src={item.image_url} alt={item.salon_name || "Uploaded board"} />
                </button>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h3 className="min-w-0 whitespace-normal break-words text-base font-bold leading-snug">{item.salon_name || "Name not visible"}</h3>
                    <span className={`max-w-full whitespace-normal break-words rounded-full border px-2 py-1 text-xs font-semibold leading-snug ${statusClass(item.status)}`}>{item.status}</span>
                    <span className={`max-w-full whitespace-normal break-words rounded-full border px-2 py-1 text-xs font-semibold leading-snug ${matchClass(item.brand_match_status)}`}>
                      {item.brand_match_status || "Unreviewed"}
                    </span>
                    <span className={`max-w-full whitespace-normal break-words rounded-full border px-2 py-1 text-xs font-semibold leading-snug ${confidenceClass(item.ai_confidence_level)}`}>
                      {item.ai_confidence_level || "n/a"}
                    </span>
                    <span className={`max-w-full whitespace-normal break-words rounded-full border px-2 py-1 text-xs font-semibold leading-snug ${duplicateClass(item.duplicate_status)}`}>
                      {item.duplicate_status || "Unique"}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-normal break-words text-sm leading-snug text-slate-600">{item.address || "Address not visible"}</p>
                  <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-500">
                    {item.brand_name || "Unassigned brand"} | {item.installer_name || "Unnamed installer"} | {item.installer_region || "Unknown region"}
                  </p>
                  <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-500">
                    Project: {displayProjectName(item.project_name)}
                  </p>
                  <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-500">
                    Stage: {formatStage(item.deployment_stage_code)}
                  </p>
                  <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-500">
                    Confirmed geography: {item.installer_state || "Unknown state"}{item.installer_lga ? ` | ${item.installer_lga}` : ""}
                  </p>
                  <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-500">
                    Selected brand: {item.brand_name || "Unassigned"} | Detected brand: {item.detected_brand_name || "Uncertain"}
                  </p>
                  <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-500">
                    GPS: {item.gps_latitude ?? "n/a"}, {item.gps_longitude ?? "n/a"} | {item.installation_date ?? item.submitted_at.slice(0, 10)} {item.installation_time ?? ""}
                  </p>
                  <p className="mt-2 whitespace-normal break-words text-xs leading-snug text-slate-500">
                    OCR confidence: {item.ocr_confidence || "n/a"} {item.ocr_note ? `| ${item.ocr_note}` : ""}
                  </p>
                  {item.ai_review_note ? <p className="mt-2 whitespace-normal break-words text-xs leading-snug text-rose-700">{item.ai_review_note}</p> : null}
                </div>
                <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <select className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100" value={item.brand_name ?? ""} onChange={(event) => updateSubmission(item.id, { brandName: event.target.value })}>
                    <option value="">Assign brand</option>
                    {BRANDS.map((brand) => (
                      <option key={brand} value={brand}>
                        {brand}
                      </option>
                    ))}
                  </select>
                  <select
                    className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
                    value={item.status}
                    onChange={(event) => {
                      const nextStatus = event.target.value as SubmissionStatus;
                      if (nextStatus === "Rejected" && !window.confirm("Reject this installation?")) {
                        event.target.value = item.status;
                        return;
                      }
                      updateSubmission(item.id, { status: nextStatus });
                    }}
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <select
                    className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
                    value={item.deployment_stage_code ?? "installed"}
                    onChange={(event) => updateSubmission(item.id, { deploymentStageCode: event.target.value })}
                  >
                    <option value="production">Production</option>
                    <option value="warehouse">Warehouse</option>
                    <option value="in_transit">In Transit</option>
                    <option value="installed">Installed</option>
                    <option value="approved">Approved</option>
                  </select>
                  <input
                    className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
                    defaultValue={item.salon_name ?? ""}
                    onBlur={(event) => updateSubmission(item.id, { salonName: event.target.value })}
                    placeholder="Correct salon/store name"
                  />
                  <input
                    className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
                    defaultValue={item.address ?? ""}
                    onBlur={(event) => updateSubmission(item.id, { address: event.target.value })}
                    placeholder="Correct address"
                  />
                  <input
                    className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
                    defaultValue={item.phone ?? ""}
                    onBlur={(event) => updateSubmission(item.id, { phone: event.target.value })}
                    placeholder="Correct phone"
                  />
                  <input
                    className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
                    defaultValue={item.approval_comments ?? ""}
                    onBlur={(event) => updateSubmission(item.id, { approvalComments: event.target.value })}
                    placeholder="Approval comment"
                  />
                  <input
                    className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
                    defaultValue={item.rejection_reason ?? ""}
                    onBlur={(event) => updateSubmission(item.id, { rejectionReason: event.target.value })}
                    placeholder="Rejection reason"
                  />
                  <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                    <div className="font-semibold">Status history</div>
                    <div className="mt-2 grid gap-1">
                      {history.filter((entry) => entry.submission_id === item.id).length === 0 ? <span>No changes yet.</span> : null}
                      {history
                        .filter((entry) => entry.submission_id === item.id)
                        .slice(0, 3)
                        .map((entry) => (
                          <span key={entry.id}>
                            {entry.previous_status || "New"} to {entry.new_status} | {new Date(entry.created_at).toLocaleString()}
                          </span>
                        ))}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className={`${activeView === "profile" ? "block" : "hidden"} min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4`}>
          <h2 className="text-base font-bold leading-snug">Settings/Profile</h2>
          <p className="mt-2 text-sm leading-snug text-slate-600">Admin operational workspace for POSM deployment oversight.</p>
          <ProjectManager clients={clients} brands={brands} onCreate={createProject} />
        </div>
      </section>
      </div>
      <PhotoLightbox submissions={filtered} activeIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} onNavigate={setLightboxIndex} />
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

function ScorePanel({ title, rows }: { title: string; rows: Array<[string, number, number]> }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 whitespace-normal break-words text-base font-bold leading-snug">{title}</h2>
      <div className="grid gap-2">
        {rows.length === 0 ? <div className="text-sm text-slate-500">No data yet.</div> : null}
        {rows.slice(0, 6).map(([label, score, total]) => (
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm" key={label}>
            <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">{label}</span>
            <strong className="shrink-0 whitespace-nowrap">
              {score}% <span className="font-normal text-slate-500">({total})</span>
            </strong>
          </div>
        ))}
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
      <div className="grid gap-2">
        {rows.length === 0 ? <div className="text-sm text-slate-500">No data yet.</div> : null}
        {rows.map(([label, count]) => (
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm" key={label}>
            <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">{label}</span>
            <strong className="shrink-0 whitespace-nowrap">{count}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectPortfolioPanel({ rows }: { rows: ReturnType<typeof getProjectOperations> }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 whitespace-normal break-words text-base font-bold leading-snug">Project portfolio</h2>
      <div className="grid gap-3">
        {rows.length === 0 ? <div className="text-sm text-slate-500">No projects configured yet.</div> : null}
        {rows.map((row) => (
          <div className="grid min-w-0 gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto]" key={row.project.id}>
            <div className="min-w-0">
              <p className="whitespace-normal break-words text-sm font-semibold leading-snug">{row.project.project_name}</p>
              <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-500">
                {row.project.campaign_name || "No campaign"} | {row.project.status}
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
      <h2 className="mb-3 whitespace-normal break-words text-base font-bold leading-snug">Deployment funnel</h2>
      <div className="grid gap-2">
        {rows.map((row) => (
          <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2" key={row.stage}>
            <span className="whitespace-normal break-words text-sm leading-snug">{formatStage(row.stage)}</span>
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

function AlertPanel({ rows }: { rows: Array<{ type: string; severity: "high" | "medium"; message: string }> }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 whitespace-normal break-words text-base font-bold leading-snug">Operational alerts</h2>
      <div className="grid gap-2">
        {rows.length === 0 ? <div className="text-sm text-slate-500">No active project alerts.</div> : null}
        {rows.map((row, index) => (
          <div
            className={`rounded-lg border px-3 py-2 text-sm leading-snug ${
              row.severity === "high" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-orange-200 bg-orange-50 text-orange-800"
            }`}
            key={`${row.type}-${index}`}
          >
            {row.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectManager({
  clients,
  brands,
  onCreate
}: {
  clients: Client[];
  brands: Brand[];
  onCreate: (formData: FormData) => Promise<void>;
}) {
  return (
    <form
      className="mt-5 grid min-w-0 gap-3 border-t border-slate-200 pt-5 md:grid-cols-2"
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        await onCreate(new FormData(event.currentTarget));
        event.currentTarget.reset();
      }}
    >
      <h3 className="md:col-span-2 text-sm font-bold">Create project</h3>
      <input name="projectName" required placeholder="Project name" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
      <input name="campaignName" placeholder="Campaign name" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
      <select name="clientId" required className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm">
        <option value="">Select client</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>{client.name}</option>
        ))}
      </select>
      <select name="brandId" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm">
        <option value="">All brands / multi-brand</option>
        {brands.map((brand) => (
          <option key={brand.id} value={brand.id}>{brand.brand_name}</option>
        ))}
      </select>
      <input name="targetQuantity" type="number" min="0" required placeholder="Target quantity" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
      <select name="status" defaultValue="Planning" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm">
        <option>Planning</option>
        <option>Active</option>
        <option>On Hold</option>
        <option>Completed</option>
      </select>
      <input name="startDate" type="date" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
      <input name="endDate" type="date" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
      <input name="regionsCovered" placeholder="Regions covered, comma separated" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
      <input name="assignedInstallers" placeholder="Assigned installers/agencies, comma separated" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
      <input name="targetRegion" placeholder="Primary target region" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
      <input name="targetState" placeholder="Primary target state" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
      <input name="targetInstaller" placeholder="Lead installer" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
      <input name="targetAgency" placeholder="Assigned agency" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
      <button className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 md:col-span-2">
        Create project
      </button>
    </form>
  );
}

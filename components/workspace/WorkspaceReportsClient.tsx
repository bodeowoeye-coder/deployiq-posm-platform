"use client";

import { Download, FileText, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { WorkspaceAnalyticsDashboard } from "@/lib/workspace/analytics";
import { buildWorkspaceAnalytics, type WorkspaceAnalyticsFilters } from "@/lib/workspace/analyticsCore";
import { hasValidGps } from "@/lib/reporting";

const statusOptions = ["Pending", "Flagged", "Approved", "Rejected", "Correction Requested"];
const controlClass = "min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-300 dark:bg-white dark:text-slate-900";

type Props = { dashboard: WorkspaceAnalyticsDashboard };

export function WorkspaceReportsClient({ dashboard }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState<WorkspaceAnalyticsFilters>(dashboard.filters);
  const [query, setQuery] = useState("");
  const [exportError, setExportError] = useState("");
  const source = dashboard.source;
  const report = useMemo(() => source ? buildWorkspaceAnalytics({ ...source, filters }) : null, [filters, source]);

  if (dashboard.queryStatus === "error" || !report) {
    return <section className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-rose-950"><h2 className="text-lg font-bold">Reports unavailable</h2><p className="mt-2 text-sm leading-6">{dashboard.loadError || "Deployment reports could not be loaded."}</p></section>;
  }

  const filteredRows = report.submissions.filter((submission) => {
    const haystack = [submission.project_name, submission.brand_name, submission.installer_name, submission.selected_outlet_name, submission.address].filter(Boolean).join(" ").toLowerCase();
    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  });
  const hasRows = filteredRows.length > 0;
  const hasAnySubmissions = (dashboard.source?.submissions.length ?? 0) > 0;
  const selectedProject = dashboard.source?.projects.find((project) => project.id === filters.projectId) ?? null;
  const campaignOptions = selectedProject
    ? (selectedProject.campaign_name ? [selectedProject.campaign_name] : [])
    : dashboard.available.campaigns;
  const reportScope = selectedProject ? `Report Scope: ${selectedProject.project_name}` : `Report Scope: All Projects (${report.projectProgress.length})`;
  const scopedSourceRows = selectedProject ? report.submissions : source?.submissions ?? [];
  const brandOptions = Array.from(new Set(scopedSourceRows.map((item) => item.brand_name || "Unassigned").filter(Boolean))).sort();
  const regionOptions = Array.from(new Set(scopedSourceRows.map((item) => item.installer_region || "").filter(Boolean))).sort();
  const stateOptions = selectedProject ? Array.from(new Set([...(selectedProject.regions_covered ?? []), ...(selectedProject.primary_target_state ? [selectedProject.primary_target_state] : []), ...scopedSourceRows.map((item) => item.resolved_state || item.installer_state || item.state_region || "")].filter(Boolean))).sort() : dashboard.available.states;

  useEffect(() => {
    setFilters((current) => ({
      ...current,
      brand: current.brand && brandOptions.includes(current.brand) ? current.brand : undefined,
      region: current.region && regionOptions.includes(current.region) ? current.region : undefined,
      state: current.state && stateOptions.includes(current.state) ? current.state : undefined,
      campaign: current.campaign && campaignOptions.includes(current.campaign) ? current.campaign : undefined,
    }));
  }, [selectedProject?.id, brandOptions.join("|"), regionOptions.join("|"), stateOptions.join("|"), campaignOptions.join("|")]);

  function setFilter(key: keyof WorkspaceAnalyticsFilters, value: string) {
    setFilters((current) => {
      const next = { ...current, [key]: value || undefined };
      if (key === "projectId") {
        const nextProject = dashboard.source?.projects.find((project) => project.id === value);
        const campaign = nextProject?.campaign_name || "";
        if (current.campaign && current.campaign !== campaign) next.campaign = undefined;
      }
      if (key === "projectId") router.push(`${pathname}${value ? `?projectId=${encodeURIComponent(value)}` : ""}`);
      return next;
    });
  }

  function exportQuery() {
    const params = new URLSearchParams();
    if (filters.projectId) params.set("projectId", filters.projectId);
    if (filters.campaign) params.set("campaign", filters.campaign);
    if (filters.brand) params.set("brand", filters.brand);
    if (filters.region) params.set("region", filters.region);
    if (filters.state) params.set("state", filters.state);
    if (filters.installer) params.set("installer", filters.installer);
    if (filters.status) params.set("status", filters.status);
    if (filters.gps && filters.gps !== "all") params.set("gpsFilter", filters.gps === "verified" ? "gps_verified" : "gps_missing");
    if (filters.dateFrom) params.set("startDate", filters.dateFrom);
    if (filters.dateTo) params.set("endDate", filters.dateTo);
    if (query.trim()) params.set("query", query.trim());
    return params.toString();
  }

  async function download(format: "excel" | "pdf") {
    if (!hasRows) return;
    setExportError("");
    const params = exportQuery();
    const response = await fetch(`/api/client/exports/${format}${params ? `?${params}` : ""}`, { credentials: "include" });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setExportError(body?.error || "Could not generate the report.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = format === "excel" ? "deployiq-deployment-report.xlsx" : "deployiq-deployment-report.pdf";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-200 dark:bg-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Customer Workspace</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">Deployment Reports</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Filter deployment evidence for {dashboard.workspace.organisationName}, then generate a formal PDF or Excel report.</p>
          </div>
          <div className="text-right"><p className="text-sm font-bold text-slate-950">{reportScope}</p><span className="text-xs font-medium text-slate-500">{filteredRows.length} records shown</span></div>
        </div>
      </section>
      <section className="rounded-lg border border-orange-200 bg-orange-50/40 p-5 shadow-sm" aria-label="Report scope">
        <div className="grid gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)] md:items-center">
          <div><p className="text-xs font-semibold uppercase tracking-widest text-orange-700">Report Scope</p><p className="mt-1 text-sm text-slate-600">Choose a combined portfolio report or one project.</p></div>
          <select value={filters.projectId ?? ""} onChange={(event) => setFilter("projectId", event.target.value)} className={controlClass} aria-label="Report Scope">
            <option value="">All Projects - Combined Report</option>
            {dashboard.available.projects.map((project) => {
              const metadata = dashboard.source?.projects.find((item) => item.id === project.id);
              return <option key={project.id} value={project.id}>{project.name}{metadata?.campaign_name ? ` - ${metadata.campaign_name}` : ""}</option>;
            })}
          </select>
        </div>
      </section>
      {!selectedProject ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Report summary">
          <SummaryMetric label="Expected / target" value={report.portfolio.expected} />
          <SummaryMetric label="Actual deployments" value={report.portfolio.actual} />
          <SummaryMetric label="Outstanding" value={report.portfolio.outstanding} />
          <SummaryMetric label="Completion" value={`${report.portfolio.completion}%`} />
          <SummaryMetric label="Evidence records" value={report.submissions.length} />
        </section>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-200 dark:bg-white">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Filter label="Search">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Project, outlet, installer" className={`${controlClass} pl-10`} /></div>
          </Filter>
          <Filter label="Campaign">
            <select value={filters.campaign ?? ""} onChange={(event) => setFilter("campaign", event.target.value)} className={controlClass}><option value="">All campaigns</option>{campaignOptions.map((campaign) => <option key={campaign} value={campaign}>{campaign}</option>)}</select>
          </Filter>
          <Filter label="Brand">
            <select value={filters.brand ?? ""} onChange={(event) => setFilter("brand", event.target.value)} className={controlClass}><option value="">All brands</option>{brandOptions.map((brand) => <option key={brand} value={brand}>{brand}</option>)}</select>
          </Filter>
          <Filter label="Region"><select value={filters.region ?? ""} onChange={(event) => setFilter("region", event.target.value)} className={controlClass}><option value="">All regions</option>{regionOptions.map((region) => <option key={region} value={region}>{region}</option>)}</select></Filter>
          <Filter label="State / region">
            <select value={filters.state ?? ""} onChange={(event) => setFilter("state", event.target.value)} className={controlClass}><option value="">All states</option>{stateOptions.map((state) => <option key={state} value={state}>{state}</option>)}</select>
          </Filter>
          <Filter label="Installer">
            <select value={filters.installer ?? ""} onChange={(event) => setFilter("installer", event.target.value)} className={controlClass}><option value="">All installers</option>{dashboard.available.installers.map((installer) => <option key={installer} value={installer}>{installer}</option>)}</select>
          </Filter>
          <Filter label="Status">
            <select value={filters.status ?? ""} onChange={(event) => setFilter("status", event.target.value)} className={controlClass}><option value="">All statuses</option>{statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select>
          </Filter>
          <Filter label="GPS status">
            <select value={filters.gps ?? ""} onChange={(event) => setFilter("gps", event.target.value)} className={controlClass}><option value="">All GPS</option><option value="verified">GPS verified</option><option value="missing">GPS missing</option></select>
          </Filter>
          <Filter label="Date from"><input type="date" value={filters.dateFrom ?? ""} onChange={(event) => setFilter("dateFrom", event.target.value)} className={controlClass} /></Filter>
          <Filter label="Date to"><input type="date" value={filters.dateTo ?? ""} onChange={(event) => setFilter("dateTo", event.target.value)} className={controlClass} /></Filter>
          <div className="flex items-end"><button type="button" onClick={() => { setFilters({}); setQuery(""); }} className={`${controlClass} font-semibold hover:border-orange-300 hover:bg-orange-50`}>Clear filters</button></div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" disabled={!hasRows} onClick={() => void download("pdf")} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"><FileText className="h-4 w-4" aria-hidden="true" />{selectedProject ? "Export Project PDF" : "Export Combined PDF"}</button>
          <button type="button" disabled={!hasRows} onClick={() => void download("excel")} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 transition hover:border-orange-300 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-4 w-4" aria-hidden="true" />{selectedProject ? "Export Project Excel" : "Export Combined Excel"}</button>
        </div>
        {exportError ? <p className="mt-3 text-sm text-rose-700">{exportError}</p> : null}
      </section>
      {selectedProject ? (
        <SelectedProjectReport project={report.projectProgress[0]} />
      ) : report.projectProgress.length > 0 ? (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4"><p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Project breakdown</p><h3 className="mt-1 text-lg font-bold text-slate-950">{selectedProject ? "Selected project performance" : "Combined workspace project performance"}</h3></div>
          <div className="grid gap-4 p-5 lg:grid-cols-2">
            {report.projectProgress.map((project) => (
              <article key={project.projectId} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-bold text-slate-950">{project.project}</h4><p className="mt-1 text-xs text-slate-500">{project.campaign || "No campaign metadata"} · {project.status}</p></div><span className="text-lg font-bold text-slate-950">{project.completion}%</span></div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><MiniMetric label="Target" value={project.expected} /><MiniMetric label="Actual" value={project.actual} /><MiniMetric label="Outstanding" value={project.outstanding} /><MiniMetric label="Evidence" value={project.evidenceRecords} /></div>
                <dl className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-2"><Info label="Brand" value={project.brand || "Multi-brand / unassigned"} /><Info label="Approved / pending / rejected" value={`${project.approved} / ${project.pending} / ${project.rejected}`} /><Info label="GPS" value={`${project.gpsVerified} verified · ${project.gpsExceptions} exceptions`} /><Info label="State / region" value={[...project.states, ...project.regions].filter(Boolean).join(", ") || "No activity yet"} /><Info label="Start date" value={project.startDate || "Not set"} /><Info label="Expected end" value={project.endDate || "Not set"} /></dl>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!hasAnySubmissions ? <EmptyReportState title="No deployment reports yet" message="Reports will become available after deployment evidence is submitted." /> : !hasRows ? <EmptyReportState title="No matching report records" message="Try widening the current filters to see more deployment evidence." /> : (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-200 dark:bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Deployment evidence</p><h3 className="mt-1 text-lg font-bold text-slate-950">Filtered report records</h3></div><span className="text-sm text-slate-500">{filteredRows.length} shown</span></div>
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-widest text-slate-500"><tr>{["Project", "Campaign", "Brand", "Outlet", "Installer", "Status", "GPS", "Submitted"].map((heading) => <th key={heading} className="px-5 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{filteredRows.map((submission) => <tr key={submission.id}><td className="px-5 py-3 font-semibold text-slate-950">{submission.project_name || "Project"}</td><td className="px-5 py-3 text-slate-700">{(dashboard.source?.projects.find((project) => project.id === submission.project_id)?.campaign_name) || "Not set"}</td><td className="px-5 py-3 text-slate-700">{submission.brand_name || "Unassigned"}</td><td className="px-5 py-3 text-slate-700">{submission.selected_outlet_name || submission.salon_name || "Deployment location"}</td><td className="px-5 py-3 text-slate-700">{submission.installer_name || "Unnamed installer"}</td><td className="px-5 py-3 text-slate-700">{submission.status}</td><td className="px-5 py-3 text-slate-700">{hasValidGps(submission) ? "GPS verified" : "GPS missing"}</td><td className="px-5 py-3 text-slate-700">{new Date(submission.submitted_at).toLocaleDateString()}</td></tr>)}</tbody></table></div>
        </section>
      )}
    </div>
  );
}

function Filter({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-sm font-semibold text-slate-700"><span className="mb-1.5 block text-xs uppercase tracking-widest text-slate-500">{label}</span>{children}</label>; }
function SummaryMetric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p><p className="mt-2 text-xl font-bold text-slate-950">{value}</p></div>; }
function MiniMetric({ label, value }: { label: string; value: string | number }) { return <div><p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{label}</p><p className="mt-1 font-bold text-slate-950">{value}</p></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div><dt className="font-semibold uppercase tracking-widest text-slate-400">{label}</dt><dd className="mt-1 font-semibold text-slate-700">{value}</dd></div>; }
function SelectedProjectReport({ project }: { project: { project: string; campaign: string | null; brand: string | null; status: string; startDate: string | null; endDate: string | null; expected: number; actual: number; outstanding: number; completion: number; approved: number; pending: number; rejected: number; gpsVerified: number; gpsExceptions: number; evidenceRecords: number; states: string[]; regions: string[] } | undefined }) {
  if (!project) return <EmptyReportState title="Project report unavailable" message="The selected project is not available in this workspace." />;
  const geography = [...project.states, ...project.regions].filter(Boolean).join(", ") || "No activity yet";
  return <section className="space-y-5 rounded-lg border border-orange-200 bg-white p-6 shadow-sm" aria-label="Selected project report">
    <header className="border-b border-slate-200 pb-5"><p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Project Report</p><h3 className="mt-2 text-2xl font-bold text-slate-950">{project.project}</h3><p className="mt-1 text-sm text-slate-600">{project.campaign || "No campaign metadata"} · {project.status}</p></header>
    <section><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Project Information</p><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><Info label="Project" value={project.project} /><Info label="Campaign" value={project.campaign || "Not set"} /><Info label="Brand" value={project.brand || "Multi-brand / unassigned"} /><Info label="Status" value={project.status} /><Info label="Start date" value={project.startDate || "Not set"} /><Info label="Expected end date" value={project.endDate || "Not set"} /><Info label="State / region" value={geography} /></dl></section>
    <section><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Deployment Performance</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><SummaryMetric label="Target" value={project.expected} /><SummaryMetric label="Actual" value={project.actual} /><SummaryMetric label="Outstanding" value={project.outstanding} /><SummaryMetric label="Completion" value={`${project.completion}%`} /></div></section>
    <section><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Approval / Evidence Summary</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><MiniMetric label="Approved" value={project.approved} /><MiniMetric label="Pending" value={project.pending} /><MiniMetric label="Rejected" value={project.rejected} /><MiniMetric label="GPS verified" value={`${project.gpsVerified} (${project.gpsExceptions} exceptions)`} /><MiniMetric label="Evidence records" value={project.evidenceRecords} /></div></section>
    <section className="grid gap-4 lg:grid-cols-2"><div><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">State / Region Performance</p><p className="mt-2 text-sm text-slate-600">{geography}</p></div><div><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Installer Performance</p><p className="mt-2 text-sm text-slate-600">{project.evidenceRecords > 0 ? "Installer activity is represented in the evidence records below." : "No installer activity yet."}</p></div></section>
  </section>;
}
function EmptyReportState({ title, message }: { title: string; message: string }) { return <section className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center"><h3 className="text-lg font-bold text-slate-950">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{message}</p></section>; }

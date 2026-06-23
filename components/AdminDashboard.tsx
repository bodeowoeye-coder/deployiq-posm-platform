"use client";

import { ChevronDown, Download, FileText, Inbox, Loader2, Search, Settings2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BRANDS, STATUSES } from "@/lib/brands";
import type { Agency, AuditLog, Brand, Client, ClientProfile, DeploymentLocation, DeploymentProgress, Installer, ManagedUser, Project, ProjectTarget, Submission, SubmissionStatus, SubmissionStatusHistory } from "@/lib/types";
import {
  canonicalInstallerName,
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
import { getOperationalAlerts, getPortfolioOperations, getProjectOperations, getStageTotals, getTargetAllocationRows } from "@/lib/operations";
import { StateCombobox } from "@/components/StateCombobox";
import { getRegionForState, NIGERIA_REGIONS, NIGERIA_STATES } from "@/lib/geography";
import { AdminProjectNotificationActions } from "@/components/AdminProjectNotificationActions";
import { SUBMISSION_REJECTION_REASONS, isSubmissionRejectionReason } from "@/lib/submissionRejection";

type Filters = {
  query: string;
  startDate: string;
  endDate: string;
  state: string;
  region: string;
  lga: string;
  installer: string;
  project: string;
  campaign: string;
  brand: string;
  status: string;
  gps: "all" | "verified" | "missing";
};

type OutletImportRow = {
  state: string;
  outlet_name: string;
  owner_name?: string | null;
  address?: string | null;
  brand_type?: string | null;
  outlet_code?: string | null;
};

type PendingRejectionState = {
  id: string;
  reason: string;
  comment: string;
};

const blankFilters: Filters = {
  query: "",
  startDate: "",
  endDate: "",
  state: "",
  region: "",
  lga: "",
  installer: "",
  project: "",
  campaign: "",
  brand: "",
  status: "",
  gps: "all"
};

const adminAccountSettingsItems: Array<{ view: DashboardView; label: string; status?: "ready" | "coming-soon" }> = [
  { view: "profile", label: "Profile" },
  { view: "create-project", label: "Create Project" },
  { view: "campaigns", label: "Campaign Management" },
  { view: "outlet-directory", label: "Outlet Directory" },
  { view: "installer-portal", label: "Installer Portal" },
  { view: "user-management", label: "User Management" },
  { view: "agencies", label: "Agencies" },
  { view: "regions", label: "Regions & Territories", status: "coming-soon" },
  { view: "preferences", label: "System Preferences", status: "coming-soon" },
  { view: "demo-data", label: "Demo/Test Data" },
  { view: "audit-logs", label: "Audit Logs" }
];

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

const dateOnlyFormatOptions: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Africa/Lagos"
};

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-GB", dateTimeFormatOptions);
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-GB", dateOnlyFormatOptions);
}

function buildExportQuery(filters: Filters, scope: { clientId?: string; projectId?: string } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (key === "gps") {
      const gpsValue = String(value).trim();
      if (gpsValue && gpsValue !== "all") params.set(key, gpsValue);
      return;
    }
    if (value.trim()) params.set(key, value.trim());
  });
  if (scope.clientId?.trim()) params.set("clientId", scope.clientId.trim());
  if (scope.projectId?.trim()) params.set("projectId", scope.projectId.trim());
  const query = params.toString();
  return query ? `?${query}` : "";
}

function hasValidGps(item: Submission) {
  if (item.gps_latitude === null || item.gps_longitude === null) return false;
  const lat = Number(item.gps_latitude);
  const lng = Number(item.gps_longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
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

function adminViewTitle(view: DashboardView) {
  const titles: Partial<Record<DashboardView, string>> = {
    dashboard: "Dashboard",
    deployments: "Deployments",
    analytics: "Analytics",
    reports: "Deployment Reports",
    submissions: "Submissions",
    alerts: "Alerts",
    clients: "Clients",
    installers: "Installers",
    map: "Deployment Map",
    profile: "Profile",
    "create-project": "Create Project",
    campaigns: "Campaign Management",
    "outlet-directory": "Outlet Directory",
    "installer-portal": "Installer Portal",
    "user-management": "User Management",
    agencies: "Agencies",
    regions: "Regions & Territories",
    preferences: "System Preferences",
    "demo-data": "Demo/Test Data",
    "audit-logs": "Audit Logs"
  };
  return titles[view] ?? "Dashboard";
}

function adminViewDescription(view: DashboardView) {
  const descriptions: Partial<Record<DashboardView, string>> = {
    dashboard: "Monitor deployments, approvals, installer performance, and campaign execution in real time.",
    deployments: "Operational field records, deployment evidence, maps, and submission controls.",
    analytics: "Performance trends, compliance rankings, and deployment intelligence.",
    reports: "Analytics, export actions, and report summaries for deployment performance.",
    submissions: "Review submitted installation records and field evidence.",
    alerts: "Exception monitoring for low completion, overdue work, and project risk.",
    clients: "Client portfolio management and account visibility.",
    installers: "Installer performance, accuracy, and operational oversight.",
    map: "Geographic view of verified deployment locations and mapped field activity.",
    profile: "Admin account settings.",
    "create-project": "Project configuration and campaign setup.",
    campaigns: "Campaign planning and lifecycle management.",
    "outlet-directory": "Import and view approved Godrej pilot outlet records.",
    "installer-portal": "Operational utility access for the installer submission workflow.",
    "user-management": "User provisioning and access controls.",
    agencies: "Agency directory and assignment configuration.",
    regions: "Territory planning and regional configuration.",
    preferences: "System-wide operational preferences.",
    "demo-data": "Safely archive seeded sample data before pilots and demos.",
    "audit-logs": "Governance, review, and system activity trails."
  };
  return descriptions[view] ?? "Executive intelligence across deployments.";
}

function formatStage(stage: string | null) {
  if (!stage) return "Installed";
  return stage
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function adminPathToView(pathname: string): DashboardView {
  if (pathname === "/admin/reports") return "reports";
  if (pathname === "/admin/submissions") return "submissions";
  if (pathname === "/admin/profile") return "profile";
  return "dashboard";
}

export function AdminDashboard({
  submissions,
  history,
  projects,
  projectTargets,
  deploymentProgress,
  clients,
  brands,
  agencies,
  installers,
  managedUsers,
  clientProfiles,
  auditLogs,
  currentUserId,
  currentUserEmail,
  initialView = "dashboard",
  notificationsEnabled
}: {
  submissions: Submission[];
  history: SubmissionStatusHistory[];
  projects: Project[];
  projectTargets: ProjectTarget[];
  deploymentProgress: DeploymentProgress[];
  clients: Client[];
  brands: Brand[];
  agencies: Agency[];
  installers: Installer[];
  managedUsers: ManagedUser[];
  clientProfiles: ClientProfile[];
  auditLogs: AuditLog[];
  currentUserId: string;
  currentUserEmail?: string | null;
  initialView?: DashboardView;
  notificationsEnabled?: boolean;
}) {
  const [records, setRecords] = useState(submissions.filter((item) => !item.archived_at));
  const [projectRecords, setProjectRecords] = useState(projects);
  const [targetRecords, setTargetRecords] = useState(projectTargets);
  const [userRecords, setUserRecords] = useState(managedUsers);
  const [clientRecords, setClientRecords] = useState(clients);
  const [agencyRecords, setAgencyRecords] = useState(agencies);
  const [installerRecords, setInstallerRecords] = useState(installers);
  const [clientProfileRecords, setClientProfileRecords] = useState(clientProfiles);
  const [auditLogRecords, setAuditLogRecords] = useState(auditLogs);
  const [outletRecords, setOutletRecords] = useState<DeploymentLocation[]>([]);
  const [outletsLoading, setOutletsLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [filters, setFilters] = useState<Filters>(blankFilters);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [activeView, setActiveView] = useState<DashboardView>(initialView);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [dashboardPanelsReady, setDashboardPanelsReady] = useState(initialView !== "dashboard");
  const [scopeClientId, setScopeClientId] = useState("");
  const [scopeProjectId, setScopeProjectId] = useState("");
  const [pendingRejection, setPendingRejection] = useState<PendingRejectionState | null>(null);
  const contentTopRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  const currentUser =
    userRecords.find((user) => user.user_id === currentUserId) ??
    (currentUserEmail
      ? {
          user_id: currentUserId,
          email: currentUserEmail,
          full_name: currentUserEmail,
          phone: null,
          role: "admin" as const,
          client_id: null,
          agency_id: null,
          assigned_project_ids: [],
          assigned_regions: [],
          assigned_states: [],
          status: "Active" as const,
          created_at: new Date().toISOString(),
          last_sign_in_at: null
        }
      : null);

  useEffect(() => {
    setLastUpdated(formatDateTime(new Date()));
    if (typeof window !== "undefined") {
      console.info("[admin-client-timing]", {
        stage: "dashboard-mounted",
        initialView,
        submissions: submissions.length,
        projects: projects.length,
        brands: brands.length,
        clients: clients.length,
        agencies: agencies.length,
        installers: installers.length
      });
    }
  }, []);

  useEffect(() => {
    contentTopRef.current?.scrollIntoView({ block: "start" });
    setLightboxIndex(null);
  }, [activeView]);

  useEffect(() => {
    if (activeView !== "dashboard") {
      setDashboardPanelsReady(true);
      return;
    }

    setDashboardPanelsReady(false);
    const frame = window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        setDashboardPanelsReady(true);
        console.info("[admin-client-timing]", {
          stage: "dashboard-secondary-panels-ready",
          activeView,
          submissions: submissions.length,
          projects: projects.length
        });
      }, 0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeView]);

  useEffect(() => {
    const syncViewFromPath = () => setActiveView(adminPathToView(window.location.pathname));
    window.addEventListener("popstate", syncViewFromPath);
    return () => window.removeEventListener("popstate", syncViewFromPath);
  }, []);

  const scopeProjectOptions = useMemo(
    () => projectRecords.filter((project) => !scopeClientId || project.client_id === scopeClientId),
    [projectRecords, scopeClientId]
  );
  const scopedRecords = useMemo(
    () =>
      records.filter(
        (item) =>
          (!scopeClientId || item.client_id === scopeClientId) &&
          (!scopeProjectId || item.project_id === scopeProjectId)
      ),
    [records, scopeClientId, scopeProjectId]
  );
  const scopedProjectRecords = useMemo(
    () =>
      projectRecords.filter(
        (project) =>
          (!scopeClientId || project.client_id === scopeClientId) &&
          (!scopeProjectId || project.id === scopeProjectId)
      ),
    [projectRecords, scopeClientId, scopeProjectId]
  );
  const scopedProjectIds = useMemo(() => new Set(scopedProjectRecords.map((project) => project.id)), [scopedProjectRecords]);
  const scopedTargetRecords = useMemo(
    () => targetRecords.filter((target) => !scopeProjectId && !scopeClientId ? true : scopedProjectIds.has(target.project_id)),
    [targetRecords, scopedProjectIds, scopeClientId, scopeProjectId]
  );
  const scopedDeploymentProgress = useMemo(
    () => deploymentProgress.filter((progress) => !scopeProjectId && !scopeClientId ? true : scopedProjectIds.has(progress.project_id)),
    [deploymentProgress, scopedProjectIds, scopeClientId, scopeProjectId]
  );
  const scopeClientName = scopeClientId ? clientRecords.find((client) => client.id === scopeClientId)?.name ?? "Selected Client Company" : "All Clients";
  const scopeProjectName = scopeProjectId ? displayProjectName(scopeProjectOptions.find((project) => project.id === scopeProjectId)?.project_name) : "All Projects";

  useEffect(() => {
    if (scopeProjectId && !scopeProjectOptions.some((project) => project.id === scopeProjectId)) {
      setScopeProjectId("");
    }
  }, [scopeProjectId, scopeProjectOptions]);

  const filtered = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    const installer = filters.installer.trim().toLowerCase();

    return scopedRecords.filter((item) => {
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
        (!filters.state || item.installer_state === filters.state) &&
        (!filters.region || item.installer_region === filters.region) &&
        (!filters.lga || (item.installer_lga ?? "").toLowerCase().includes(filters.lga.trim().toLowerCase())) &&
        (!installer || (item.installer_name ?? "").toLowerCase().includes(installer)) &&
        (!filters.project || displayProjectName(item.project_name) === filters.project) &&
        (!filters.campaign ||
          scopedProjectRecords.find((project) => project.id === item.project_id || project.project_name === item.project_name)?.campaign_name === filters.campaign) &&
        (!filters.brand || item.brand_name === filters.brand) &&
        (!filters.status || item.status === filters.status) &&
        (filters.gps === "all" || (filters.gps === "verified" ? hasValidGps(item) : !hasValidGps(item)))
      );
    });
  }, [filters, scopedRecords, scopedProjectRecords]);

  const dailyCounts = getDailyCounts(filtered);
  const regionCounts = getRegionCounts(filtered);
  const brandCounts = getBrandCounts(filtered);
  const installerIdentitySource = { installers: installerRecords, users: userRecords };
  const installerCounts = getInstallerCounts(filtered, installerIdentitySource);
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = dailyCounts.find((item) => item.date === today)?.count ?? 0;
  const approvedCount = filtered.filter((item) => item.status === "Approved").length;
  const pendingCount = filtered.filter((item) => item.status === "Pending").length;
  const rejectedCount = filtered.filter((item) => item.status === "Rejected").length;
  const gpsVerifiedCount = filtered.filter((item) => hasValidGps(item)).length;
  const gpsMissingCount = filtered.length - gpsVerifiedCount;
  const scopeExportQuery = buildExportQuery(blankFilters, { clientId: scopeClientId, projectId: scopeProjectId });
  const exportQuery = buildExportQuery(filters, { clientId: scopeClientId, projectId: scopeProjectId });
  const metrics = getExecutiveMetrics(filtered);
  const trendSeries = getTrendSeries(filtered);
  const installerAccuracy = getInstallerAccuracyRanking(filtered, installerIdentitySource);
  const regionPerformance = getRegionPerformanceRanking(filtered);
  const brandCompliance = getBrandComplianceScores(filtered);
  const projectOptions = Array.from(new Set(scopedRecords.map((item) => displayProjectName(item.project_name)))).sort();
  const campaignOptions = Array.from(new Set(scopedProjectRecords.map((project) => project.campaign_name).filter(Boolean) as string[])).sort();
  const projectOperations = getProjectOperations(scopedProjectRecords, scopedTargetRecords, filtered, scopedDeploymentProgress);
  const portfolio = getPortfolioOperations(projectOperations);
  const gpsCoveragePercent = portfolio.actual > 0 ? Number(((gpsVerifiedCount / portfolio.actual) * 100).toFixed(1)) : 0;
  const stageTotals = getStageTotals(projectOperations);
  const operationalAlerts = getOperationalAlerts(projectOperations);
  const allocationRows = getTargetAllocationRows(targetRecords, filtered, projectRecords);

  function setFilter(key: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function openAccountSettingsView(view: DashboardView) {
    setActiveView(view);
    setAccountMenuOpen(false);
    setLightboxIndex(null);
    if (view === "profile") {
      window.history.pushState(null, "", "/admin/profile");
    } else if (window.location.pathname === "/admin/profile") {
      window.history.pushState(null, "", "/admin");
    }
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
      return false;
    }

    const body = await response.json();
    setRecords((current) => current.map((item) => (item.id === id ? body.submission : item)));
    setLastUpdated(formatDateTime(new Date()));
    showToast(changes.status ? `Status updated to ${changes.status}.` : "Update saved.");
    return true;
  }

  async function downloadExport(href: string, label: string) {
    setExportError("");
    setExporting(label);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(href, { credentials: "include", signal: controller.signal });

      if (!response.ok) {
        const contentType = response.headers.get("content-type") ?? "";
        const body = contentType.includes("application/json")
          ? await response.json().catch(() => null)
          : await response.text().catch(() => "");
        const apiError =
          typeof body === "string"
            ? body.trim()
            : typeof body?.error === "string"
              ? body.error
              : "";
        throw new Error(apiError || `Could not generate report. Server returned ${response.status}.`);
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
      const message =
        downloadError instanceof DOMException && downloadError.name === "AbortError"
          ? "Report generation timed out. Please try again."
          : downloadError instanceof Error
            ? downloadError.message
            : "Could not generate report.";
      setExportError(message);
      showToast(message, "error");
    } finally {
      window.clearTimeout(timeout);
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

  async function updateProject(formData: FormData) {
    const assignedPeople = [formData.get("leadInstaller"), formData.get("agencyName")]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const response = await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: formData.get("projectId"),
        projectName: formData.get("projectName"),
        campaignName: formData.get("campaignName"),
        targetQuantity: Number(formData.get("targetQuantity") || 0),
        status: formData.get("status"),
        startDate: formData.get("startDate"),
        endDate: formData.get("endDate"),
        regionsCovered: String(formData.get("regionsCovered") || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        assignedInstallers: assignedPeople.length > 0
          ? assignedPeople
          : String(formData.get("assignedInstallers") || "")
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
        archived: formData.get("archived") === "true"
      })
    });
    const body = await response.json();
    if (!response.ok) {
      showToast(body.error || "Could not update project.", "error");
      return;
    }
    setProjectRecords((current) => current.map((project) => (project.id === body.project.id ? body.project : project)));
    showToast("Project updated.");
  }

  async function createTarget(formData: FormData) {
    const nextProjectId = String(formData.get("projectId") || "");
    const nextState = String(formData.get("state") || "");
    const nextRegion = String(formData.get("region") || "");
    const duplicate = targetRecords.some(
      (target) => target.project_id === nextProjectId && (target.state ?? "") === nextState && (target.region ?? "") === nextRegion
    );
    if (duplicate) {
      showToast("An allocation already exists for this project, state, and region.", "error");
      return;
    }
    const response = await fetch("/api/project-targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: nextProjectId,
        state: nextState,
        region: nextRegion,
        installerName: formData.get("installerName"),
        agencyName: formData.get("agencyName"),
        targetQuantity: Number(formData.get("targetQuantity") || 0)
      })
    });
    const body = await response.json();
    if (!response.ok) {
      showToast(body.error || "Could not create target allocation.", "error");
      return;
    }
    setTargetRecords((current) => [body.target, ...current]);
    showToast("Target allocation added.");
  }

  async function refreshUsers() {
    setUsersLoading(true);
    try {
      const response = await fetch("/api/users");
      if (!response.ok) return;
      const body = await response.json();
      setUserRecords(body.users ?? []);
      console.info("[admin-user-management] users refreshed", {
        count: Array.isArray(body.users) ? body.users.length : 0
      });
    } finally {
      setUsersLoading(false);
    }
  }

  async function refreshClients() {
    const response = await fetch("/api/clients");
    const body = await response.json().catch(() => ({}));
    console.info("[admin-user-management] clients refresh response", {
      ok: response.ok,
      count: Array.isArray(body.clients) ? body.clients.length : 0,
      error: body.error ?? null
    });
    if (!response.ok) {
      showToast(body.error || "Could not load clients for assignment.", "error");
      return;
    }
    setClientRecords(body.clients ?? []);
    setClientProfileRecords(body.profiles ?? []);
  }

  async function refreshAuditLogs() {
    const response = await fetch("/api/audit-logs");
    if (!response.ok) return;
    const body = await response.json();
    setAuditLogRecords(body.logs ?? []);
  }

  async function refreshOutletRecords() {
    setOutletsLoading(true);
    try {
      const response = await fetch("/api/deployment-locations", { credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast(body.error || "Could not load approved outlets.", "error");
        return;
      }
      setOutletRecords(body.locations ?? []);
    } finally {
      setOutletsLoading(false);
    }
  }

  async function importOutletRows(rows: OutletImportRow[]) {
    const response = await fetch("/api/deployment-locations", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      showToast(body.error || "Could not import outlet list.", "error");
      return false;
    }
    showToast(`${body.imported ?? rows.length} outlet${(body.imported ?? rows.length) === 1 ? "" : "s"} imported.`);
    await refreshOutletRecords();
    return true;
  }

  async function clearOutletDirectory() {
    const confirmed = window.confirm(
      "This will permanently remove all imported outlet directory records. It will not delete submissions or reports. Continue?"
    );
    if (!confirmed) return false;

    const response = await fetch("/api/deployment-locations", {
      method: "DELETE",
      credentials: "include"
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      showToast(body.error || "Could not clear outlet directory.", "error");
      return false;
    }
    const removed = Number(body.removed ?? 0);
    showToast(`${removed} outlet directory record${removed === 1 ? "" : "s"} removed.`);
    await refreshOutletRecords();
    return true;
  }

  useEffect(() => {
    if ((activeView === "profile" || activeView === "user-management" || activeView === "clients") && userRecords.length === 0) {
      void refreshUsers();
    }
    if ((activeView === "user-management" || activeView === "clients" || activeView === "create-project") && clientRecords.length === 0) {
      void refreshClients();
    }
    if (activeView === "audit-logs" && auditLogRecords.length === 0) {
      void refreshAuditLogs();
    }
    if (activeView === "outlet-directory" && outletRecords.length === 0) {
      void refreshOutletRecords();
    }
  }, [activeView, auditLogRecords.length, clientRecords.length, outletRecords.length, userRecords.length]);

  async function createUser(formData: FormData) {
    const payload = {
      fullName: formData.get("fullName"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      role: formData.get("role"),
      clientId: formData.get("clientId"),
      agencyId: formData.get("agencyId"),
      assignedProjectIds: formData.getAll("assignedProjectIds"),
      assignedRegions: formData.getAll("assignedRegions"),
      assignedStates: formData.getAll("assignedStates"),
      status: formData.get("status"),
      temporaryPassword: formData.get("temporaryPassword")
    };
    console.info("[admin-user-management] create user payload", {
      role: payload.role,
      email: typeof payload.email === "string" ? payload.email : null,
      selectedClientId: payload.clientId,
      selectedAgencyId: payload.agencyId || null,
      clientsLoaded: clientRecords.length,
      assignedProjectCount: payload.assignedProjectIds.length,
      assignedRegionCount: payload.assignedRegions.length,
      assignedStateCount: payload.assignedStates.length
    });
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json();
    console.info("[admin-user-management] create user response", {
      ok: response.ok,
      status: response.status,
      action: body.action ?? null,
      partial: body.partial ?? false,
      error: body.error ?? null,
      message: body.message ?? null
    });
    if (!response.ok) {
      showToast(body.error || "Could not create user.", "error");
      return false;
    }
    await refreshUsers();
    showToast(body.message || "User created.", body.partial ? "error" : "success");
    return !body.partial;
  }

  async function updateUser(payload: Record<string, unknown>) {
    const response = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json();
    if (!response.ok) {
      showToast(body.error || "Could not update user.", "error");
      return false;
    }
    const nextFullName = typeof payload.fullName === "string" ? payload.fullName.trim() : "";
    if (payload.userId === currentUserId && nextFullName) {
      setUserRecords((current) =>
        current.map((user) =>
          user.user_id === currentUserId
            ? {
                ...user,
                full_name: nextFullName,
                phone: typeof payload.phone === "string" ? payload.phone : user.phone
              }
            : user
        )
      );
    }
    await refreshUsers();
    showToast("User updated.");
    return true;
  }

  async function createAgency(formData: FormData) {
    const response = await fetch("/api/agencies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agencyName: formData.get("agencyName"),
        contactPerson: formData.get("contactPerson"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        assignedRegions: formData.getAll("assignedRegions"),
        status: formData.get("status")
      })
    });
    const body = await response.json();
    if (!response.ok) return showToast(body.error || "Could not create agency.", "error");
    setAgencyRecords((current) => [...current, body.agency]);
    showToast("Agency created.");
  }

  async function updateClientProfile(formData: FormData) {
    const response = await fetch("/api/clients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: formData.get("clientId"),
        name: formData.get("name"),
        contactPerson: formData.get("contactPerson"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        industryCategory: formData.get("industryCategory"),
        status: formData.get("status")
      })
    });
    const body = await response.json();
    if (!response.ok) return showToast(body.error || "Could not save client profile.", "error");
    if (body.client) {
      setClientRecords((current) => current.map((item) => (item.id === body.client.id ? { ...item, ...body.client } : item)));
    }
    setClientProfileRecords((current) => [body.profile, ...current.filter((item) => item.client_id !== body.profile.client_id)]);
    showToast("Client profile saved.");
  }

  async function archiveClient(clientId: string) {
    const client = clientRecords.find((item) => item.id === clientId);
    if (!client) return;
    const confirmed = window.confirm("Archive this client company? It will no longer appear in new project or user assignment dropdowns, but linked records will remain intact.");
    if (!confirmed) return;
    const profile = clientProfileRecords.find((item) => item.client_id === clientId);
    const response = await fetch("/api/clients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        name: client.name,
        contactPerson: profile?.contact_person ?? "",
        email: profile?.email ?? "",
        phone: profile?.phone ?? "",
        industryCategory: profile?.industry_category ?? "",
        status: "Inactive"
      })
    });
    const body = await response.json();
    if (!response.ok) return showToast(body.error || "Could not archive client company.", "error");
    if (body.client) {
      setClientRecords((current) => current.map((item) => (item.id === body.client.id ? { ...item, ...body.client } : item)));
    }
    showToast("Client company archived.");
  }

  async function deleteClient(clientId: string) {
    const confirmed = window.confirm("Delete this client company permanently? This is only allowed when it has no projects, assigned users, submissions, or reports.");
    if (!confirmed) return;
    const response = await fetch(`/api/clients?clientId=${encodeURIComponent(clientId)}`, { method: "DELETE" });
    const body = await response.json();
    if (!response.ok) return showToast(body.error || "Could not delete client company.", "error");
    setClientRecords((current) => current.filter((item) => item.id !== clientId));
    setClientProfileRecords((current) => current.filter((item) => item.client_id !== clientId));
    showToast("Client company deleted.");
  }

  async function createClient(formData: FormData) {
    const response = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        contactPerson: formData.get("contactPerson"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        industryCategory: formData.get("industryCategory"),
        status: formData.get("status")
      })
    });
    const body = await response.json();
    if (!response.ok) {
      showToast(body.error || "Could not create client company.", "error");
      return false;
    }
    setClientRecords((current) => [...current.filter((item) => item.id !== body.client.id), body.client].sort((a, b) => a.name.localeCompare(b.name)));
    if (body.profile) {
      setClientProfileRecords((current) => [body.profile, ...current.filter((item) => item.client_id !== body.profile.client_id)]);
    }
    showToast("Client company created.");
    return true;
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-[min(1380px,calc(100%-28px))] min-w-0 flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <BrandMark />
          <div className="relative flex min-w-0 flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 text-sm font-semibold text-[#07122a] shadow-sm transition hover:bg-orange-100"
              onClick={() => setAccountMenuOpen((current) => !current)}
              aria-expanded={accountMenuOpen}
            >
              <Settings2 aria-hidden size={16} className="text-orange-600" />
              Account Settings
              <ChevronDown aria-hidden size={15} className={`transition ${accountMenuOpen ? "rotate-180" : ""}`} />
            </button>
            <ThemeToggle />
            {accountMenuOpen ? (
              <div className="absolute right-0 top-12 z-30 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-orange-600">Configuration</p>
                <div className="grid gap-1">
                  {adminAccountSettingsItems.map((item) => (
                    <button
                      key={item.view}
                      type="button"
                      className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm font-semibold transition ${
                        activeView === item.view
                          ? "bg-orange-50 text-[#07122a] ring-1 ring-orange-200"
                          : item.status === "coming-soon"
                            ? "text-slate-500 hover:bg-slate-50"
                            : "text-slate-700 hover:bg-orange-50 hover:text-[#07122a]"
                      }`}
                      onClick={() => openAccountSettingsView(item.view)}
                    >
                      <span className="min-w-0 break-words leading-snug">{item.label}</span>
                      {item.status === "coming-soon" ? <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">Soon</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-w-0 w-[min(1380px,calc(100%-28px))] flex-col gap-4 py-4 lg:flex-row lg:items-start lg:py-6">
        <DashboardSidebar audience="admin" activeView={activeView} onSelectView={setActiveView} />
      <section className="min-w-0 flex-1" key={activeView}>
        <div className="admin-workspace-scope mb-4 grid min-w-0 gap-3 rounded-xl border border-orange-100 bg-orange-50/50 p-3 shadow-sm lg:grid-cols-[minmax(0,1fr)_minmax(220px,280px)_minmax(220px,280px)] lg:items-end">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-orange-700">Admin workspace scope</p>
            <p className="mt-1 whitespace-normal break-words text-sm font-semibold leading-snug text-slate-950">
              Viewing: {scopeClientName} / {scopeProjectName}
            </p>
          </div>
          <FilterField label="Client Company">
            <select
              value={scopeClientId}
              onChange={(event) => {
                setScopeClientId(event.target.value);
                setScopeProjectId("");
              }}
              className="admin-workspace-scope-select min-h-10 w-full rounded-lg border border-orange-200 bg-white px-3 text-sm shadow-sm"
            >
              <option value="">All Client Companies</option>
              {clientRecords.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}{client.status === "Inactive" ? " (Archived)" : ""}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Project">
            <select
              value={scopeProjectId}
              onChange={(event) => setScopeProjectId(event.target.value)}
              className="admin-workspace-scope-select min-h-10 w-full rounded-lg border border-orange-200 bg-white px-3 text-sm shadow-sm"
            >
              <option value="">All Projects</option>
              {scopeProjectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {displayProjectName(project.project_name)}
                </option>
              ))}
            </select>
          </FilterField>
        </div>
        <div ref={contentTopRef} className="mb-5 min-w-0 scroll-mt-24 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
          <h1 className="whitespace-normal break-words text-2xl font-bold leading-snug tracking-normal sm:text-3xl">{adminViewTitle(activeView)}</h1>
          <p className="mt-2 whitespace-normal break-words text-sm leading-snug text-slate-600">{adminViewDescription(activeView)}</p>
          <p className="mt-2 text-xs font-medium text-slate-500">Last updated: {lastUpdated || "Loading..."}</p>
        </div>

        <div className={`${activeView === "dashboard" ? "grid" : "hidden"} min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4`}>
          <SummaryCard label="Expected deployments" value={portfolio.expected} />
          <SummaryCard label="Actual deployments" value={portfolio.actual} />
          <SummaryCard label="Completion" value={portfolio.completion} suffix="%" />
          <SummaryCard label="Outstanding" value={portfolio.outstanding} />
        </div>

        <div className={`${activeView === "dashboard" ? "grid" : "hidden"} mt-5 min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4`}>
          <SummaryCard label="Deployment efficiency" value={portfolio.deploymentEfficiency} suffix="%" />
          <SummaryCard label="Installer performance" value={portfolio.installerPerformance} suffix="%" />
          <SummaryCard label="Average approval time" value={portfolio.averageApprovalHours} suffix="h" />
          <SummaryCard label="SLA compliance" value={portfolio.slaCompliance} suffix="%" />
        </div>

        <div className={`${activeView === "dashboard" ? "grid" : "hidden"} mt-5 min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-6`}>
          <SummaryCard label="Total installs" value={filtered.length} />
          <SummaryCard label="Today" value={todayCount} />
          <SummaryCard label="Brands" value={brandCounts.length} />
          <SummaryCard label="Approved" value={approvedCount} />
          <SummaryCard label="Pending" value={pendingCount} />
          <SummaryCard label="Rejected" value={rejectedCount} />
        </div>

        <div className={`${activeView === "dashboard" ? "grid" : "hidden"} mt-5 min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3`}>
          <SummaryCard label="GPS Verified" value={gpsVerifiedCount} />
          <SummaryCard label="GPS Missing" value={gpsMissingCount} />
          <SummaryCard label="GPS Coverage" value={gpsCoveragePercent} suffix="%" />
        </div>

        <div className={`${activeView === "dashboard" ? "grid" : "hidden"} mt-5 min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-5`}>
          <SummaryCard label="Success rate" value={metrics.successRate} suffix="%" />
          <SummaryCard label="Mismatch rate" value={metrics.mismatchRate} suffix="%" />
          <SummaryCard label="Duplicate rate" value={metrics.duplicateRate} suffix="%" />
          <SummaryCard label="Auto-approval rate" value={metrics.autoApprovalRate} suffix="%" />
          <SummaryCard label="Avg. turnaround" value={metrics.approvalTurnaroundHours} suffix="h" />
        </div>

        <div className={`${activeView === "dashboard" || activeView === "reports" || activeView === "submissions" ? "block" : "hidden"} mt-5 min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4`}>
          <div className="grid min-w-0 gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
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
            <FilterField label="State">
              <StateCombobox
                value={filters.state}
                onChange={(value) => setFilter("state", value)}
                required={false}
                placeholder="All states"
                inputClassName="min-h-10"
                autoComplete="off-state-filter"
                inputName="deployiq-admin-state-filter"
                inputId="deployiq-admin-state-filter-main"
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
            <FilterField label="GPS">
              <select className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" value={filters.gps} onChange={(event) => setFilter("gps", event.target.value as Filters["gps"])}>
                <option value="all">All GPS</option>
                <option value="verified">GPS Verified</option>
                <option value="missing">GPS Missing</option>
              </select>
            </FilterField>
          </div>

          <div className="mt-4 flex min-w-0 flex-wrap gap-3">
            <button className="inline-flex min-h-10 min-w-[180px] flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold transition hover:border-orange-200 hover:bg-orange-50 sm:flex-none" onClick={() => setFilters(blankFilters)}>
              Clear filters
            </button>
            <ExportButton onClick={() => downloadExport(`/api/exports/excel${scopeExportQuery}`, "Full Excel report")} icon="excel" label="Full Excel report" loading={exporting === "Full Excel report"} />
            <ExportButton onClick={() => downloadExport(`/api/exports/excel${exportQuery}`, "Filtered Excel report")} icon="excel" label="Filtered Excel report" loading={exporting === "Filtered Excel report"} />
            <ExportButton onClick={() => downloadExport(`/api/exports/pdf${scopeExportQuery}`, "Full PDF report")} icon="pdf" label="Full PDF report" loading={exporting === "Full PDF report"} />
            <ExportButton onClick={() => downloadExport(`/api/exports/pdf${exportQuery}`, "Filtered PDF report")} icon="pdf" label="Filtered PDF report" loading={exporting === "Filtered PDF report"} />
          </div>
          {exportError ? <p className="mt-3 whitespace-normal break-words text-sm leading-snug text-rose-700">{exportError}</p> : null}
        </div>

        {activeView === "dashboard" && !dashboardPanelsReady ? (
          <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-3">
            <InlineDashboardSkeleton />
            <InlineDashboardSkeleton />
            <InlineDashboardSkeleton />
          </div>
        ) : null}

        <div className={`${activeView === "dashboard" && dashboardPanelsReady ? "grid" : "hidden"} mt-5 min-w-0 gap-4 lg:grid-cols-3`}>
          <ChartPanel title="Installations by region" data={regionCounts} xKey="region" />
          <ChartPanel title="Installations by brand" data={brandCounts} xKey="brand" color="#7c3aed" />
          <ChartPanel title="Daily uploads" data={dailyCounts} xKey="date" color="#2563eb" />
        </div>

        <div className={`${activeView === "dashboard" && dashboardPanelsReady ? "grid" : "hidden"} mt-5 min-w-0 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]`}>
          <ProjectPortfolioPanel rows={projectOperations} />
          <FunnelPanel rows={stageTotals} />
        </div>

        <div className={`${(activeView === "dashboard" && dashboardPanelsReady) || activeView === "alerts" ? "block" : "hidden"} mt-5 min-w-0`}>
          <AlertPanel rows={operationalAlerts} />
        </div>

        <div className={`${(activeView === "dashboard" && dashboardPanelsReady) || activeView === "analytics" ? "block" : "hidden"} mt-5 min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4`}>
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
              <BreakdownPanel title="Mapped brand summary" rows={brandCounts.map((item) => [item.brand, item.count])} />
              <BreakdownPanel title="Mapped installer activity" rows={installerCounts.slice(0, 8).map((item) => [item.installer, item.count])} />
            </div>
          </div>
        ) : null}

        <div className={`${activeView === "reports" || activeView === "installers" ? "grid" : "hidden"} min-w-0 gap-4 lg:grid-cols-2`}>
          <BreakdownPanel title="Brand summary" rows={brandCounts.map((item) => [item.brand, item.count])} />
          <BreakdownPanel title="Installer performance" rows={installerCounts.slice(0, 8).map((item) => [item.installer, item.count])} />
        </div>

        <div className={`${(activeView === "dashboard" && dashboardPanelsReady) || activeView === "analytics" || activeView === "installers" ? "grid" : "hidden"} mt-5 min-w-0 gap-4 lg:grid-cols-3`}>
          <ScorePanel title="Installer accuracy ranking" rows={installerAccuracy.map((item) => [item.installer, item.score, item.total])} />
          <ScorePanel title="Region performance ranking" rows={regionPerformance.map((item) => [item.region, item.score, item.total])} />
          <ScorePanel title="Brand compliance score" rows={brandCompliance.map((item) => [item.brand, item.score, item.total])} />
        </div>

        <div className={`${activeView === "submissions" ? "block" : "hidden"} mt-5 min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900`}>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <h2 className="min-w-0 break-words text-base font-bold leading-snug">Submissions</h2>
            <span className="text-sm text-slate-500">{filtered.length} shown</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
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
              <article className={`grid min-w-0 gap-3 overflow-hidden p-4 sm:grid-cols-[96px_minmax(0,1fr)] xl:grid-cols-[96px_minmax(0,1fr)_minmax(220px,260px)] ${item.brand_match_status === "Mismatch" ? "bg-rose-50/70 dark:bg-rose-950/30" : item.duplicate_status && item.duplicate_status !== "Unique" ? "bg-orange-50/70 dark:bg-orange-950/30" : "dark:bg-slate-900"}`} key={item.id}>
                <button className="h-24 w-24 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700" onClick={() => setLightboxIndex(filtered.findIndex((record) => record.id === item.id))}>
                  <img className="h-full w-full object-cover" src={item.image_url} alt={item.salon_name || "Uploaded board"} />
                </button>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h3 className="min-w-0 whitespace-normal break-words text-base font-bold leading-snug text-slate-950 dark:text-white">{item.salon_name || "Name not visible"}</h3>
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
                  <p className="mt-1 whitespace-normal break-words text-sm leading-snug text-slate-700 dark:text-slate-200">{item.address || "Address not visible"}</p>
                  <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-600 dark:text-slate-300">
                    {item.brand_name || "Unassigned brand"} | {canonicalInstallerName(item.installer_user_id, item.installer_name, installerIdentitySource)} | {item.installer_region || "Unknown region"}
                  </p>
                  <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-600 dark:text-slate-300">
                    Project: {displayProjectName(item.project_name)}
                  </p>
                  <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-600 dark:text-slate-300">
                    Stage: {formatStage(item.deployment_stage_code)}
                  </p>
                  <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-600 dark:text-slate-300">
                    Confirmed geography: {item.installer_state || "Unknown state"}{item.installer_lga ? ` | ${item.installer_lga}` : ""}
                  </p>
                  <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-600 dark:text-slate-300">
                    Selected brand: {item.brand_name || "Unassigned"} | Detected brand: {item.detected_brand_name || "Uncertain"}
                  </p>
                  <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-600 dark:text-slate-300">
                    GPS: {item.gps_latitude ?? "n/a"}, {item.gps_longitude ?? "n/a"} | {item.installation_date ?? item.submitted_at.slice(0, 10)} {item.installation_time ?? ""}
                  </p>
                  <p className="mt-2 whitespace-normal break-words text-xs leading-snug text-slate-600 dark:text-slate-300">
                    OCR confidence: {item.ocr_confidence || "n/a"} {item.ocr_note ? `| ${item.ocr_note}` : ""}
                  </p>
                  {item.ai_review_note ? <p className="mt-2 whitespace-normal break-words text-xs leading-snug text-rose-700 dark:text-rose-300">{item.ai_review_note}</p> : null}
                  {item.outlet_match_status && item.outlet_match_status !== "not_checked" ? (
                    <p
                      className={`mt-2 whitespace-normal break-words rounded-lg px-3 py-2 text-xs font-semibold leading-snug ${
                        item.outlet_match_status === "matched" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : "bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200"
                      }`}
                    >
                      Outlet verification:{" "}
                      {item.outlet_match_status === "matched"
                        ? "Outlet match confirmed"
                        : item.outlet_match_notes || "Selected outlet may not match uploaded photo."}
                    </p>
                  ) : null}
                </div>
                <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <select className="min-h-10 min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500" value={item.brand_name ?? ""} onChange={(event) => updateSubmission(item.id, { brandName: event.target.value })}>
                    <option value="">Assign brand</option>
                    {BRANDS.map((brand) => (
                      <option key={brand} value={brand}>
                        {brand}
                      </option>
                    ))}
                  </select>
                  <select
                    className="min-h-10 min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                    value={item.status}
                    onChange={(event) => {
                      const nextStatus = event.target.value as SubmissionStatus;
                      if (nextStatus === "Rejected") {
                        const existingReason = isSubmissionRejectionReason(item.rejection_reason ?? "") ? (item.rejection_reason ?? "") : "";
                        setPendingRejection({
                          id: item.id,
                          reason: existingReason,
                          comment: item.approval_comments ?? ""
                        });
                        return;
                      }
                      setPendingRejection((current) => (current?.id === item.id ? null : current));
                      void updateSubmission(item.id, { status: nextStatus });
                    }}
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <select
                    className="min-h-10 min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
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
                    className="min-h-10 min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                    defaultValue={item.salon_name ?? ""}
                    onBlur={(event) => updateSubmission(item.id, { salonName: event.target.value })}
                    placeholder="Correct salon/store name"
                  />
                  <input
                    className="min-h-10 min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                    defaultValue={item.address ?? ""}
                    onBlur={(event) => updateSubmission(item.id, { address: event.target.value })}
                    placeholder="Correct address"
                  />
                  <input
                    className="min-h-10 min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                    defaultValue={item.phone ?? ""}
                    onBlur={(event) => updateSubmission(item.id, { phone: event.target.value })}
                    placeholder="Correct phone"
                  />
                  <input
                    className="min-h-10 min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                    defaultValue={item.approval_comments ?? ""}
                    onBlur={(event) => updateSubmission(item.id, { approvalComments: event.target.value })}
                    placeholder="Admin comment (optional)"
                  />
                  <select
                    className="min-h-10 min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                    value={isSubmissionRejectionReason(item.rejection_reason ?? "") ? item.rejection_reason ?? "" : ""}
                    onChange={(event) => void updateSubmission(item.id, { rejectionReason: event.target.value })}
                  >
                    <option value="">Rejection reason (if rejected)</option>
                    {SUBMISSION_REJECTION_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                  {pendingRejection?.id === item.id ? (
                    <div className="sm:col-span-2 xl:col-span-1 rounded-lg border border-rose-200 bg-rose-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-rose-700">Reject submission</p>
                      <div className="mt-2 grid gap-2">
                        <select
                          className="min-h-10 min-w-0 max-w-full rounded-lg border border-rose-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                          value={pendingRejection.reason}
                          onChange={(event) => setPendingRejection((current) => (current ? { ...current, reason: event.target.value } : current))}
                        >
                          <option value="">Select rejection reason</option>
                          {SUBMISSION_REJECTION_REASONS.map((reason) => (
                            <option key={reason} value={reason}>
                              {reason}
                            </option>
                          ))}
                        </select>
                        <textarea
                          className="min-h-20 min-w-0 max-w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                          value={pendingRejection.comment}
                          onChange={(event) => setPendingRejection((current) => (current ? { ...current, comment: event.target.value } : current))}
                          placeholder="Optional admin comment"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            onClick={() => setPendingRejection(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-rose-300 bg-rose-600 px-3 text-xs font-semibold text-white transition hover:bg-rose-700"
                            onClick={async () => {
                              if (!pendingRejection.reason) {
                                showToast("Select a rejection reason before rejecting.", "error");
                                return;
                              }
                              const saved = await updateSubmission(item.id, {
                                status: "Rejected",
                                rejectionReason: pendingRejection.reason,
                                approvalComments: pendingRejection.comment
                              });
                              if (saved) setPendingRejection(null);
                            }}
                          >
                            Save rejection
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <div className="font-semibold">Status history</div>
                    <div className="mt-2 grid gap-1">
                      {history.filter((entry) => entry.submission_id === item.id).length === 0 ? <span>No changes yet.</span> : null}
                      {history
                        .filter((entry) => entry.submission_id === item.id)
                        .slice(0, 3)
                        .map((entry) => (
                          <span key={entry.id}>
                            {entry.previous_status || "New"} to {entry.new_status} | {formatDateTime(entry.created_at)}
                          </span>
                        ))}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
        {activeView === "profile" ? (
          <AdminProfilePanel
            user={currentUser}
            agencies={agencyRecords}
            onSave={updateUser}
            isLoading={usersLoading && !currentUser}
          />
        ) : null}
        {activeView === "create-project" ? (
          <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-base font-bold leading-snug">Create Project</h2>
            <p className="mt-2 text-sm leading-snug text-slate-600">Configure new deployment initiatives, targets, territories, and assigned teams.</p>
            <ProjectManager clients={clientRecords.filter((client) => client.status !== "Inactive")} brands={brands} agencies={agencyRecords} installers={installerRecords} users={userRecords} onCreate={createProject} />
          </div>
        ) : null}
        {activeView === "campaigns" ? (
          <div className="grid min-w-0 gap-4">
            <ProjectCrudPanel projects={projectRecords} clients={clientRecords} brands={brands} agencies={agencyRecords} notificationsEnabled={notificationsEnabled} onUpdate={updateProject} />
            <TargetAllocationPanel
              projects={projectRecords}
              rows={allocationRows}
              installers={installers}
              agencies={agencies}
              onCreate={createTarget}
            />
          </div>
        ) : null}
        {activeView === "outlet-directory" ? <OutletDirectoryPanel outlets={outletRecords} isLoading={outletsLoading} onImport={importOutletRows} onClear={clearOutletDirectory} /> : null}
        {activeView === "installer-portal" ? <InstallerPortalPanel /> : null}
        {activeView === "clients" ? <ClientManagementPanel clients={clientRecords} clientProfiles={clientProfileRecords} users={userRecords} submissions={records} projects={projectRecords} onCreate={createClient} onSave={updateClientProfile} onArchive={archiveClient} onDelete={deleteClient} /> : null}
        {activeView === "user-management" ? <UserManagementPanel users={userRecords} clients={clientRecords.filter((client) => client.status !== "Inactive")} agencies={agencyRecords} projects={projectRecords} submissions={records} onCreate={createUser} onUpdate={updateUser} /> : null}
        {activeView === "installers" ? (
          <InstallerManagementPanel installers={installerRecords} submissions={records} projects={projectRecords} agencies={agencyRecords} users={userRecords} />
        ) : null}
        {activeView === "agencies" ? <AgencyManagementPanel agencies={agencyRecords} installers={installerRecords} submissions={records} projects={projectRecords} onCreate={createAgency} /> : null}
        {activeView === "regions" ? <AdminPlaceholder title="Regions & Territories" message="Coming soon: territory rules and coverage configuration." /> : null}
        {activeView === "preferences" ? <AdminPlaceholder title="System Preferences" message="Coming soon: operational defaults and platform preferences." /> : null}
        {activeView === "demo-data" ? <DemoDataManagementPanel /> : null}
        {activeView === "audit-logs" ? <AuditLogPanel logs={auditLogRecords} users={userRecords} /> : null}
      </section>
      </div>
      <PhotoLightbox submissions={filtered} activeIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} onNavigate={setLightboxIndex} />
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

function OutletDirectoryPanel({
  outlets,
  isLoading,
  onImport,
  onClear
}: {
  outlets: DeploymentLocation[];
  isLoading: boolean;
  onImport: (rows: OutletImportRow[]) => Promise<boolean>;
  onClear: () => Promise<boolean>;
}) {
  const [importing, setImporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");

  async function handleCsvFile(file: File | null) {
    setParseError("");
    setFileName(file?.name ?? "");
    if (!file) return;

    try {
      const text = await file.text();
      const rows = parseOutletCsv(text);
      if (rows.length === 0) {
        setParseError("The CSV did not contain any outlet rows.");
        return;
      }
      setImporting(true);
      const imported = await onImport(rows);
      if (imported) setFileName("");
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Could not read this CSV file.");
    } finally {
      setImporting(false);
    }
  }

  async function handleClearDirectory() {
    setClearing(true);
    try {
      await onClear();
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-4">
      <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-bold leading-snug">Import approved outlets</h2>
            <p className="mt-2 text-sm leading-snug text-slate-600">
              Upload a CSV with these columns: state, outlet_name, owner_name, address, brand_type, outlet_code.
            </p>
          </div>
          <button
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-wait disabled:opacity-60"
            type="button"
            disabled={clearing || outlets.length === 0}
            onClick={() => void handleClearDirectory()}
          >
            {clearing ? "Clearing..." : "Clear Outlet Directory"}
          </button>
        </div>
        <div className="mt-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold transition hover:border-orange-200 hover:bg-orange-50">
            Choose CSV
            <input
              className="sr-only"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void handleCsvFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <span className="min-w-0 whitespace-normal break-words text-sm text-slate-600">{fileName || "No file selected"}</span>
          {importing ? (
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-orange-700">
              <Loader2 aria-hidden size={16} className="animate-spin" />
              Importing...
            </span>
          ) : null}
        </div>
        {parseError ? <p className="mt-3 whitespace-normal break-words text-sm text-rose-700">{parseError}</p> : null}
      </section>

      <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-base font-bold leading-snug">Imported outlets</h2>
            <p className="mt-1 text-sm leading-snug text-slate-600">Approved outlet records available to installers during upload.</p>
          </div>
          <span className="text-sm text-slate-500">{isLoading ? "Loading..." : `${outlets.length} shown`}</span>
        </div>
        {outlets.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title={isLoading ? "Loading outlets" : "No outlets imported yet"}
              message={isLoading ? "Approved outlet records are loading." : "Import the Godrej pilot outlet list to make outlets selectable on the installer page."}
              icon={<Inbox aria-hidden size={22} />}
            />
          </div>
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <table className="min-w-[860px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">Outlet</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Brand type</th>
                  <th className="px-4 py-3">Outlet code</th>
                  <th className="px-4 py-3">Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {outlets.map((outlet) => (
                  <tr key={outlet.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">{outlet.state}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{outlet.outlet_name}</td>
                    <td className="px-4 py-3 text-slate-600">{outlet.owner_name || "Not provided"}</td>
                    <td className="px-4 py-3 text-slate-600">{outlet.brand_type || "Not provided"}</td>
                    <td className="px-4 py-3 text-slate-600">{outlet.outlet_code || "Not provided"}</td>
                    <td className="max-w-xs whitespace-normal break-words px-4 py-3 text-slate-600">{outlet.address || "Not provided"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function parseOutletCsv(text: string): OutletImportRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const headerIndex = new Map(headers.map((header, index) => [header, index]));

  function getValue(values: string[], keys: string[]) {
    for (const key of keys) {
      const index = headerIndex.get(key);
      if (typeof index === "number") return values[index]?.trim() ?? "";
    }
    return "";
  }

  return lines.slice(1).flatMap((line) => {
    const values = parseCsvLine(line);
    const state = getValue(values, ["state"]);
    const outletName = getValue(values, ["outletname", "outlet", "salonname", "storename"]);
    if (!state && !outletName) return [];
    return [
      {
        state,
        outlet_name: outletName,
        owner_name: getValue(values, ["ownername", "owner", "contactperson"]) || null,
        address: getValue(values, ["address", "location"]) || null,
        brand_type: getValue(values, ["brandtype", "brand"]) || null,
        outlet_code: getValue(values, ["outletcode", "code"]) || null
      }
    ];
  });
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];
    if (character === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += character;
    }
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function InlineDashboardSkeleton() {
  return (
    <div className="min-h-[260px] min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
      <div className="h-5 w-44 animate-pulse rounded bg-slate-200" />
      <div className="mt-5 h-44 animate-pulse rounded-lg bg-slate-100" />
      <div className="mt-4 grid gap-2">
        <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
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

function SearchableTextInput({
  name,
  placeholder,
  options,
  listId,
  defaultValue = ""
}: {
  name: string;
  placeholder: string;
  options: string[];
  listId: string;
  defaultValue?: string;
}) {
  return (
    <>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        list={listId}
        autoComplete="off"
        className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm"
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
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

function AdminPlaceholder({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-base font-bold leading-snug">{title}</h2>
      <p className="mt-2 text-sm leading-snug text-slate-600">{message}</p>
    </div>
  );
}

function InstallerPortalPanel() {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-base font-bold leading-snug">Installer Portal</h2>
      <p className="mt-2 text-sm leading-snug text-slate-600">
        Field execution is handled through the installer workflow. Use manual submission only for operational exceptions.
      </p>
      <a
        href="/submit"
        className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold transition hover:border-orange-200 hover:bg-orange-50"
      >
        Open manual submission
      </a>
    </div>
  );
}

function AdminProfilePanel({
  user,
  agencies,
  onSave,
  isLoading
}: {
  user: ManagedUser | null;
  agencies: Agency[];
  onSave: (payload: Record<string, unknown>) => Promise<boolean>;
  isLoading: boolean;
}) {
  const [isSaving, setIsSaving] = useState(false);

  if (isLoading) {
    return (
      <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-base font-bold leading-snug">Admin profile</h2>
        <p className="mt-2 text-sm leading-snug text-slate-600">Loading your profile details...</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="h-16 rounded-lg bg-slate-100" />
          <div className="h-16 rounded-lg bg-slate-100" />
          <div className="h-16 rounded-lg bg-slate-100" />
          <div className="h-16 rounded-lg bg-slate-100" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <AdminPlaceholder title="Profile" message="Could not load your admin profile. Please refresh the dashboard." />;
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-base font-bold leading-snug">Admin profile</h2>
      <p className="mt-2 text-sm leading-snug text-slate-600">Manage your admin identity and password.</p>
      <form
        className="mt-5 grid min-w-0 gap-4 md:grid-cols-2"
        onSubmit={async (event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const form = event.currentTarget;
          setIsSaving(true);
          const formData = new FormData(form);
          const nextPassword = String(formData.get("temporaryPassword") || "");
          const ok = await onSave({
            userId: user.user_id,
            fullName: formData.get("fullName"),
            phone: formData.get("phone"),
            role: user.role,
            clientId: user.client_id,
            agencyId: formData.get("agencyId"),
            assignedProjectIds: user.assigned_project_ids,
            assignedRegions: user.assigned_regions,
            assignedStates: user.assigned_states,
            status: user.status,
            resetPassword: Boolean(nextPassword),
            temporaryPassword: nextPassword
          });
          if (ok) {
            const passwordInput = form.elements.namedItem("temporaryPassword") as HTMLInputElement | null;
            if (passwordInput) passwordInput.value = "";
          }
          setIsSaving(false);
        }}
      >
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Full name
          <input name="fullName" defaultValue={user.full_name} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm normal-case tracking-normal text-slate-950" />
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Email
          <input disabled defaultValue={user.email} className="min-h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm normal-case tracking-normal text-slate-600" />
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Phone number
          <input name="phone" defaultValue={user.phone ?? ""} placeholder="Phone number" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm normal-case tracking-normal text-slate-950" />
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Role
          <input disabled defaultValue={user.role} className="min-h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm normal-case tracking-normal text-slate-600" />
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">
          Agency/company
          <select name="agencyId" defaultValue={user.agency_id ?? ""} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm normal-case tracking-normal text-slate-950">
            <option value="">Impact Visibility Ltd</option>
            {agencies.map((agency) => (
              <option key={agency.id} value={agency.id}>{agency.agency_name}</option>
            ))}
          </select>
        </label>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 md:col-span-2">
          <h3 className="text-sm font-bold">Change password</h3>
          <p className="mt-1 text-xs text-slate-500">Leave blank to keep your current password.</p>
          <input
            name="temporaryPassword"
            type="password"
            minLength={8}
            placeholder="New password"
            autoComplete="new-password"
            className="mt-3 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
          />
        </div>
        <button disabled={isSaving} className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70 md:col-span-2">
          {isSaving ? "Saving..." : "Save profile"}
        </button>
      </form>
    </div>
  );
}

const PROJECT_BRAND_LABELS = ["Godrej", "Darling", "Tura", "Fresh Glow", "MegaGrowth"] as const;

function normalizeOption(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function statesForRegion(region: string) {
  return NIGERIA_STATES.filter((state) => !region || getRegionForState(state) === region);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))).sort();
}

function ProjectManager({
  clients,
  brands,
  agencies,
  installers,
  users,
  onCreate
}: {
  clients: Client[];
  brands: Brand[];
  agencies: Agency[];
  installers: Installer[];
  users: ManagedUser[];
  onCreate: (formData: FormData) => Promise<void>;
}) {
  const [targetRegion, setTargetRegion] = useState("");
  const [targetState, setTargetState] = useState("");
  const [targetAgency, setTargetAgency] = useState("");
  const [targetInstaller, setTargetInstaller] = useState("");
  const brandByName = new Map(brands.map((brand) => [normalizeOption(brand.brand_name), brand]));
  const installerOptions = uniqueStrings([
    ...installers.map((installer) => installer.installer_name),
    ...users.filter((user) => user.role === "installer").map((user) => user.full_name)
  ]);
  const agencyOptions = agencies.map((agency) => agency.agency_name).sort();
  const visibleStates = statesForRegion(targetRegion);

  return (
    <form
      className="mt-5 grid min-w-0 gap-3 border-t border-slate-200 pt-5 md:grid-cols-2"
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        await onCreate(new FormData(event.currentTarget));
        event.currentTarget.reset();
        setTargetRegion("");
        setTargetState("");
        setTargetAgency("");
        setTargetInstaller("");
      }}
    >
      <h3 className="md:col-span-2 text-sm font-bold">Create project</h3>
      <input name="projectName" required placeholder="Project name" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
      <input name="campaignName" placeholder="Campaign name" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
      <select name="clientId" required className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm">
        <option value="">Select Client Company</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>{client.name}</option>
        ))}
      </select>
      <select name="brandId" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm">
        <option value="">Multi-brand</option>
        {PROJECT_BRAND_LABELS.map((label) => {
          const brand = brandByName.get(normalizeOption(label));
          return (
            <option key={label} value={brand?.id ?? ""}>
              {label}
            </option>
          );
        })}
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
      <select
        name="targetRegion"
        value={targetRegion}
        onChange={(event) => {
          const nextRegion = event.target.value;
          setTargetRegion(nextRegion);
          if (targetState && getRegionForState(targetState) !== nextRegion) setTargetState("");
        }}
        className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm"
      >
        <option value="">Primary target region</option>
        {NIGERIA_REGIONS.map((region) => (
          <option key={region} value={region}>{region}</option>
        ))}
      </select>
      <select
        name="targetState"
        value={targetState}
        onChange={(event) => setTargetState(event.target.value)}
        className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm"
      >
        <option value="">Primary target state</option>
        {visibleStates.map((state) => (
          <option key={state} value={state}>{state}</option>
        ))}
      </select>
      <select name="targetAgency" value={targetAgency} onChange={(event) => setTargetAgency(event.target.value)} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm">
        <option value="">Assigned agency</option>
        {agencyOptions.map((agency) => (
          <option key={agency} value={agency}>{agency}</option>
        ))}
      </select>
      <select name="targetInstaller" value={targetInstaller} onChange={(event) => setTargetInstaller(event.target.value)} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm">
        <option value="">Lead installer</option>
        {installerOptions.map((installer) => (
          <option key={installer} value={installer}>{installer}</option>
        ))}
      </select>
      <input type="hidden" name="regionsCovered" value={targetRegion} />
      <input type="hidden" name="assignedInstallers" value={[targetInstaller, targetAgency].filter(Boolean).join(", ")} />
      <button className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 md:col-span-2">
        Create project
      </button>
    </form>
  );
}

function ProjectCrudPanel({
  projects,
  clients,
  brands,
  agencies,
  notificationsEnabled,
  onUpdate
}: {
  projects: Project[];
  clients: Client[];
  brands: Brand[];
  agencies: Agency[];
  notificationsEnabled?: boolean;
  onUpdate: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-base font-bold leading-snug">Project management</h2>
      <p className="mt-2 text-sm leading-snug text-slate-600">Edit campaign details, targets, dates, assignments, and archive projects without deleting history.</p>
      <div className="mt-4 grid gap-3">
        {projects.length === 0 ? <div className="text-sm text-slate-500">No projects configured yet.</div> : null}
        {projects.map((project) => {
          const projectWithTargets = project as Project & {
            brand?: Brand | string | null;
            primary_target_region?: string | null;
            primary_target_state?: string | null;
          };
          const clientName = clients.find((client) => client.id === project.client_id)?.name || "Unassigned client";
          const brandName =
            brands.find((brand) => brand.id === project.brand_id)?.brand_name ||
            (typeof projectWithTargets.brand === "string" ? projectWithTargets.brand : projectWithTargets.brand?.brand_name) ||
            "Unassigned brand";
          const regionValue = projectWithTargets.primary_target_region || project.regions_covered[0] || "";
          const stateValue = projectWithTargets.primary_target_state || "";
          const leadInstaller = project.assigned_installers[0] || "";
          const agencyName = project.assigned_installers[1] || "";

          return (
            <form
              key={project.id}
              className="grid min-w-0 gap-4 rounded-lg bg-slate-50 p-3 md:grid-cols-2 xl:grid-cols-3"
              onSubmit={async (event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                await onUpdate(new FormData(event.currentTarget));
              }}
            >
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="projectName" value={project.project_name ?? ""} />
              <input type="hidden" name="campaignName" value={project.campaign_name ?? ""} />
              <input type="hidden" name="assignedInstallers" value={project.assigned_installers.join(", ")} />
              <div className="grid min-w-0 gap-3 rounded-lg border border-slate-200 bg-white p-3 md:col-span-2 xl:col-span-3">
                <div className="min-w-0">
                  <p className="whitespace-normal break-words text-sm font-semibold leading-snug">{project.project_name}</p>
                  <p className="mt-1 text-xs text-slate-500">Project summary</p>
                </div>
                <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  <SummaryPill label="Project Name" value={project.project_name} />
                  <SummaryPill label="Client Company" value={clientName} />
                  <SummaryPill label="Brand" value={brandName} />
                  <SummaryPill label="Status" value={project.archived_at ? "Archived" : project.status} />
                  <SummaryPill label="Target Quantity" value={project.target_quantity.toLocaleString()} />
                </div>
              </div>
              {notificationsEnabled ? (
                <div className="md:col-span-2 xl:col-span-3">
                  <AdminProjectNotificationActions enabled={notificationsEnabled} project={project} clientName={clientName} />
                </div>
              ) : null}
              <FilterField label="Project Name">
                <input disabled readOnly value={project.project_name ?? ""} className="min-h-10 rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm text-slate-600 disabled:opacity-100" />
              </FilterField>
              <FilterField label="Client Company">
                <input disabled readOnly value={clientName} className="min-h-10 rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm text-slate-600 disabled:opacity-100" />
              </FilterField>
              <FilterField label="Brand">
                <input disabled readOnly value={brandName} className="min-h-10 rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm text-slate-600 disabled:opacity-100" />
              </FilterField>
              <FilterField label="Status">
                <select name="status" defaultValue={project.status} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm">
                  <option>Planning</option>
                  <option>Active</option>
                  <option>On Hold</option>
                  <option>Completed</option>
                </select>
              </FilterField>
              <FilterField label="Start Date">
                <input name="startDate" type="date" defaultValue={project.start_date ?? ""} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
              </FilterField>
              <FilterField label="End Date">
                <input name="endDate" type="date" defaultValue={project.end_date ?? ""} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
              </FilterField>
              <FilterField label="Target Quantity">
                <input name="targetQuantity" type="number" min="0" defaultValue={project.target_quantity} placeholder="Target quantity" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
              </FilterField>
              <FilterField label="Region">
                <input name="regionsCovered" defaultValue={regionValue} placeholder="Region" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
              </FilterField>
              <FilterField label="State">
                <input readOnly value={stateValue || "Not set"} className="min-h-10 rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm text-slate-600" />
              </FilterField>
              <FilterField label="Installer">
                <input name="leadInstaller" defaultValue={leadInstaller} placeholder="Lead installer" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
              </FilterField>
              <FilterField label="Agency">
                <select
                  name="agencyName"
                  defaultValue={agencyName}
                  disabled={agencies.length === 0}
                  className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                >
                  <option value="">{agencies.length === 0 ? "No agencies available" : "No agency assigned"}</option>
                  {agencies.map((agency) => (
                    <option key={agency.id} value={agency.agency_name}>
                      {agency.agency_name}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Archive Status">
                <select name="archived" defaultValue={project.archived_at ? "true" : "false"} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm">
                  <option value="false">Keep active</option>
                  <option value="true">Archive safely</option>
                </select>
              </FilterField>
              <button className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 md:col-span-2 xl:col-span-3">
                Save project changes
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 whitespace-normal break-words text-xs font-semibold leading-snug text-slate-950">{value || "Not set"}</p>
    </div>
  );
}

function TargetAllocationPanel({
  projects,
  rows,
  installers,
  agencies,
  onCreate
}: {
  projects: Project[];
  rows: ReturnType<typeof getTargetAllocationRows>;
  installers: Installer[];
  agencies: Agency[];
  onCreate: (formData: FormData) => Promise<void>;
}) {
  const [region, setRegion] = useState("");
  const [state, setState] = useState("");
  const installerOptions = uniqueStrings(installers.map((installer) => installer.installer_name));
  const agencyOptions = uniqueStrings(agencies.map((agency) => agency.agency_name));
  const visibleStates = statesForRegion(region);

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-base font-bold leading-snug">Project target allocation</h2>
      <p className="mt-2 text-sm leading-snug text-slate-600">Allocate expected deployment volume by territory, installer, or agency and compare it against live submissions.</p>
      <form
        className="mt-4 grid min-w-0 gap-3 border-t border-slate-200 pt-4 md:grid-cols-3"
        onSubmit={async (event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          await onCreate(new FormData(event.currentTarget));
          event.currentTarget.reset();
          setRegion("");
          setState("");
        }}
      >
        <select required name="projectId" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm">
          <option value="">Select project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.project_name}</option>
          ))}
        </select>
        <select
          name="region"
          value={region}
          onChange={(event) => {
            const nextRegion = event.target.value;
            setRegion(nextRegion);
            if (state && getRegionForState(state) !== nextRegion) setState("");
          }}
          className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm"
        >
          <option value="">Any region</option>
          {NIGERIA_REGIONS.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <select
          name="state"
          value={state}
          onChange={(event) => setState(event.target.value)}
          className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm"
        >
          <option value="">Any state</option>
          {visibleStates.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <SearchableTextInput name="installerName" placeholder="Any installer" options={installerOptions} listId="target-installer-options" />
        <SearchableTextInput name="agencyName" placeholder="Any agency" options={agencyOptions} listId="target-agency-options" />
        <input required name="targetQuantity" type="number" min="0" placeholder="Expected quantity" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
        <button className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 md:col-span-3">
          Add target allocation
        </button>
      </form>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Project</th>
              <th className="px-3 py-2">Allocation</th>
              <th className="px-3 py-2">Expected</th>
              <th className="px-3 py-2">Actual</th>
              <th className="px-3 py-2">Pending</th>
              <th className="px-3 py-2">Completion</th>
              <th className="px-3 py-2">Variance</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={7}>No target allocations yet.</td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.target.id} className="border-t border-slate-100">
                <td className="px-3 py-3 font-medium">{row.project?.project_name ?? "Unknown project"}</td>
                <td className="px-3 py-3 text-slate-600">
                  {[row.target.state, row.target.region, row.target.installer_name, row.target.agency_name].filter(Boolean).join(" | ") || "Portfolio target"}
                </td>
                <td className="px-3 py-3">{row.expected}</td>
                <td className="px-3 py-3">{row.actual}</td>
                <td className="px-3 py-3">{row.pending}</td>
                <td className="px-3 py-3">{row.completion}%</td>
                <td className="px-3 py-3">{row.variance}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InstallerManagementPanel({
  installers,
  submissions,
  projects,
  agencies,
  users
}: {
  installers: Installer[];
  submissions: Submission[];
  projects: Project[];
  agencies: Agency[];
  users: ManagedUser[];
}) {
  return (
    <div className="mt-5 min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-base font-bold leading-snug">Installer directory</h2>
      <p className="mt-2 text-sm leading-snug text-slate-600">Lightweight operational view of installer assignments, status, and submission performance.</p>
      <div className="mt-4 grid gap-3">
        {installers.length === 0 ? <div className="text-sm text-slate-500">No installers configured yet.</div> : null}
        {installers.map((installer) => {
          const installerSubmissions = submissions.filter((item) => {
            if (installer.user_id && item.installer_user_id) return item.installer_user_id === installer.user_id;
            return item.installer_name === installer.installer_name;
          });
          const approved = installerSubmissions.filter((item) => item.status === "Approved").length;
          const rejected = installerSubmissions.filter((item) => item.status === "Rejected").length;
          const duplicates = installerSubmissions.filter((item) => item.duplicate_status && item.duplicate_status !== "Unique").length;
          const agency = agencies.find((item) => item.id === installer.agency_id);
          const assignedProjects = projects.filter((project) => installer.assigned_project_ids.includes(project.id));
          const displayName = canonicalInstallerName(installer.user_id, installer.installer_name, { installers, users });
          return (
            <div key={installer.id} className="grid min-w-0 gap-3 rounded-lg bg-slate-50 p-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <p className="whitespace-normal break-words text-sm font-semibold leading-snug">{displayName}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {agency?.agency_name || "Independent"} | {installer.status}
                </p>
                <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-500">
                  Regions: {installer.assigned_regions.join(", ") || "Unassigned"}
                </p>
                <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-500">
                  Projects: {assignedProjects.map((project) => project.project_name).join(", ") || "Unassigned"}
                </p>
              </div>
              <div className="grid grid-cols-5 gap-3 text-right text-xs">
                <MiniMetric label="Volume" value={installerSubmissions.length} />
                <MiniMetric label="Approved" value={approved} />
                <MiniMetric label="Success" value={`${installerSubmissions.length === 0 ? 0 : Math.round((approved / installerSubmissions.length) * 100)}%`} />
                <MiniMetric label="Reject" value={`${installerSubmissions.length === 0 ? 0 : Math.round((rejected / installerSubmissions.length) * 100)}%`} />
                <MiniMetric label="Duplicate" value={`${installerSubmissions.length === 0 ? 0 : Math.round((duplicates / installerSubmissions.length) * 100)}%`} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgencyManagementPanel({
  agencies,
  installers,
  submissions,
  projects,
  onCreate
}: {
  agencies: Agency[];
  installers: Installer[];
  submissions: Submission[];
  projects: Project[];
  onCreate: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="grid gap-4">
      <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-base font-bold leading-snug">Create agency</h2>
        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={async (event) => {
          event.preventDefault();
          await onCreate(new FormData(event.currentTarget));
          event.currentTarget.reset();
        }}>
          <input required name="agencyName" placeholder="Agency name" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
          <input name="contactPerson" placeholder="Contact person" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
          <input name="email" placeholder="Email" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
          <input name="phone" placeholder="Phone" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
          <MultiSelectOptions name="assignedRegions" label="Assigned regions" options={[...NIGERIA_REGIONS]} selected={[]} />
          <select name="status" defaultValue="Active" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm">
            <option>Active</option>
            <option>Inactive</option>
          </select>
          <button className="min-h-10 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white md:col-span-2">Create agency</button>
        </form>
      </div>
      <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-base font-bold leading-snug">Agency directory</h2>
        <p className="mt-2 text-sm leading-snug text-slate-600">Partner agencies, territory assignments, and execution performance.</p>
        <div className="mt-4 grid gap-3">
          {agencies.length === 0 ? <div className="text-sm text-slate-500">No agencies configured yet.</div> : null}
          {agencies.map((agency) => {
            const assignedInstallers = installers.filter((installer) => installer.agency_id === agency.id);
            const installerNames = assignedInstallers.map((item) => item.installer_name);
            const installerUserIds = new Set(assignedInstallers.map((item) => item.user_id).filter((id): id is string => Boolean(id)));
            const agencySubmissions = submissions.filter((item) => {
              if (item.installer_user_id && installerUserIds.has(item.installer_user_id)) return true;
              return installerNames.includes(item.installer_name ?? "");
            });
            const approved = agencySubmissions.filter((item) => item.status === "Approved").length;
            const reviewed = agencySubmissions.filter((item) => item.reviewed_at);
            const slaCompliant = reviewed.filter((item) => new Date(item.reviewed_at!).getTime() - new Date(item.submitted_at).getTime() <= 48 * 3600000).length;
            const projectCount = projects.filter((project) => project.assigned_installers.some((name) => installerNames.includes(name))).length;
            return (
              <div key={agency.id} className="grid min-w-0 gap-3 rounded-lg bg-slate-50 p-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <p className="whitespace-normal break-words text-sm font-semibold leading-snug">{agency.agency_name}</p>
                  <p className="mt-1 text-xs text-slate-500">{agency.contact_person || "No contact"} | {agency.status}</p>
                  <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-slate-500">
                    Regions: {agency.assigned_regions.join(", ") || "Unassigned"}
                  </p>
                </div>
                <div className="grid grid-cols-5 gap-3 text-right text-xs">
                  <MiniMetric label="Installers" value={assignedInstallers.length} />
                  <MiniMetric label="Projects" value={projectCount} />
                  <MiniMetric label="Volume" value={agencySubmissions.length} />
                  <MiniMetric label="Perf." value={`${agencySubmissions.length ? Math.round((approved / agencySubmissions.length) * 100) : 0}%`} />
                  <MiniMetric label="SLA" value={`${reviewed.length ? Math.round((slaCompliant / reviewed.length) * 100) : 0}%`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function UserManagementPanel({
  users,
  clients,
  agencies,
  projects,
  submissions,
  onCreate,
  onUpdate
}: {
  users: ManagedUser[];
  clients: Client[];
  agencies: Agency[];
  projects: Project[];
  submissions: Submission[];
  onCreate: (formData: FormData) => Promise<boolean>;
  onUpdate: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [agency, setAgency] = useState("");
  const [client, setClient] = useState("");
  const [status, setStatus] = useState("");
  const [region, setRegion] = useState("");
  const [project, setProject] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState("");
  const [createClientId, setCreateClientId] = useState("");
  const [selectedCreateProjectIds, setSelectedCreateProjectIds] = useState<string[]>([]);
  const selectedUser = users.find((user) => user.user_id === selectedUserId) ?? null;
  const createProjectOptions = useMemo(
    () => projects.filter((item) => item.client_id === createClientId),
    [createClientId, projects]
  );
  const filteredUsers = users.filter((user) => {
    const searchable = [user.full_name, user.email, user.phone].filter(Boolean).join(" ").toLowerCase();
    return (
      (!query || searchable.includes(query.toLowerCase())) &&
      (!role || user.role === role) &&
      (!agency || user.agency_id === agency) &&
      (!client || user.client_id === client) &&
      (!status || user.status === status) &&
      (!region || user.assigned_regions.includes(region) || user.assigned_states.includes(region)) &&
      (!project || user.assigned_project_ids.includes(project))
    );
  });

  return (
    <div className="grid min-w-0 gap-4">
      <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-base font-bold leading-snug">Create user</h2>
        <form
          className="mt-4 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3"
          onSubmit={async (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            setFormMessage("");
            const form = event.currentTarget;
            const formData = new FormData(form);
            const nextRole = String(formData.get("role") || "");
            const nextClientId = String(formData.get("clientId") || "");
            console.info("[admin-user-management] create user form submit", {
              role: nextRole,
              selectedClientId: nextClientId || null,
              clientsLoaded: clients.length
            });
            if (nextRole === "client" && clients.length === 0) {
              setFormMessage("No clients are loaded yet. Please refresh clients before creating a client user.");
              return;
            }
            if (nextRole === "client" && !nextClientId) {
              setFormMessage("Please select an assigned client before creating a client user.");
              return;
            }
            const created = await onCreate(formData);
            if (created) {
              form.reset();
              setCreateClientId("");
              setSelectedCreateProjectIds([]);
            }
          }}
        >
          <input required name="fullName" placeholder="Full name" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
          <input required name="email" type="email" placeholder="Email" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
          <input name="phone" placeholder="Phone" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
          <select required name="role" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm">
            <option value="">Role</option>
            <option value="admin">Admin</option>
            <option value="client">Client</option>
            <option value="installer">Installer</option>
          </select>
          <select
            name="clientId"
            value={createClientId}
            onChange={(event) => {
              setCreateClientId(event.target.value);
              setSelectedCreateProjectIds([]);
            }}
            className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm"
          >
            <option value="">Assigned Client Company</option>
            {clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select name="agencyId" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm">
            <option value="">Assigned agency</option>
            {agencies.map((item) => <option key={item.id} value={item.id}>{item.agency_name}</option>)}
          </select>
          <select
            name="assignedProjectIds"
            multiple
            value={selectedCreateProjectIds}
            disabled={!createClientId || createProjectOptions.length === 0}
            onChange={(event) => setSelectedCreateProjectIds(Array.from(event.target.selectedOptions).map((option) => option.value))}
            className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
          >
            {!createClientId ? <option value="" disabled>Select Client Company first</option> : null}
            {createClientId && createProjectOptions.length === 0 ? <option value="" disabled>No projects available</option> : null}
            {createProjectOptions.map((item) => <option key={item.id} value={item.id}>{item.project_name}</option>)}
          </select>
          <MultiSelectOptions name="assignedRegions" label="Assigned regions" options={[...NIGERIA_REGIONS]} selected={[]} />
          <MultiSelectOptions name="assignedStates" label="Assigned states" options={[...NIGERIA_STATES]} selected={[]} />
          <select name="status" defaultValue="Active" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm">
            <option>Active</option>
            <option>Inactive</option>
            <option>Suspended</option>
          </select>
          <input required name="temporaryPassword" minLength={8} placeholder="Temporary password" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
          <button className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 xl:col-span-3">
            Create user
          </button>
          {formMessage ? (
            <p className="whitespace-normal break-words rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold leading-snug text-rose-700 xl:col-span-3">
              {formMessage}
            </p>
          ) : null}
          {clients.length === 0 ? (
            <p className="whitespace-normal break-words rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold leading-snug text-orange-800 xl:col-span-3">
              No client records are currently available for assignment. Client users cannot be created until a client is loaded.
            </p>
          ) : null}
        </form>
      </div>

      <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, phone" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm xl:col-span-2" />
          <select value={role} onChange={(event) => setRole(event.target.value)} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm">
            <option value="">All roles</option>
            <option value="admin">Admin</option>
            <option value="client">Client</option>
            <option value="installer">Installer</option>
          </select>
          <select value={agency} onChange={(event) => setAgency(event.target.value)} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm">
            <option value="">All agencies</option>
            {agencies.map((item) => <option key={item.id} value={item.id}>{item.agency_name}</option>)}
          </select>
          <select value={client} onChange={(event) => setClient(event.target.value)} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm">
            <option value="">All Client Companies</option>
            {clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm">
            <option value="">All statuses</option>
            <option>Active</option>
            <option>Inactive</option>
            <option>Suspended</option>
            <option>Archived</option>
          </select>
          <input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="Region/state" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
          <select value={project} onChange={(event) => setProject(event.target.value)} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm">
            <option value="">All projects</option>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.project_name}</option>)}
          </select>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Agency</th>
                <th className="px-3 py-2">Projects</th>
                <th className="px-3 py-2">Regions</th>
                <th className="px-3 py-2">Last login</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.user_id} className="cursor-pointer border-t border-slate-100 hover:bg-orange-50/50" onClick={() => setSelectedUserId(user.user_id)}>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-xs font-bold text-white">{initials(user.full_name || user.email)}</span>
                      <span>
                        <span className="block font-medium">{user.full_name || "Unnamed user"}</span>
                        <span className="block text-xs text-slate-500">{user.email}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3"><RoleBadge role={user.role} /></td>
                  <td className="px-3 py-3">{agencies.find((item) => item.id === user.agency_id)?.agency_name || "—"}</td>
                  <td className="px-3 py-3">{user.assigned_project_ids.length}</td>
                  <td className="px-3 py-3">{user.assigned_regions.join(", ") || "—"}</td>
                  <td className="px-3 py-3">{user.last_sign_in_at ? formatDate(user.last_sign_in_at) : "Never"}</td>
                  <td className="px-3 py-3">{user.status}</td>
                  <td className="px-3 py-3">{formatDate(user.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {selectedUser ? (
        <UserProfilePanel
          user={selectedUser}
          clients={clients}
          agencies={agencies}
          projects={projects}
          submissions={submissions}
          onClose={() => setSelectedUserId(null)}
          onUpdate={onUpdate}
        />
      ) : null}
    </div>
  );
}

function UserProfilePanel({
  user,
  clients,
  agencies,
  projects,
  submissions,
  onClose,
  onUpdate
}: {
  user: ManagedUser;
  clients: Client[];
  agencies: Agency[];
  projects: Project[];
  submissions: Submission[];
  onClose: () => void;
  onUpdate: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const userSubmissions = submissions.filter((item) => item.installer_user_id === user.user_id || item.installer_name === user.full_name);
  const approved = userSubmissions.filter((item) => item.status === "Approved").length;
  const rejected = userSubmissions.filter((item) => item.status === "Rejected").length;
  const lastSubmission = userSubmissions[0];
  const [currentFullName, setCurrentFullName] = useState(user.full_name);
  const [currentPhone, setCurrentPhone] = useState(user.phone ?? "");
  const [currentRole, setCurrentRole] = useState<ManagedUser["role"]>(user.role);
  const [currentClientId, setCurrentClientId] = useState(user.client_id ?? "");
  const [currentAgencyId, setCurrentAgencyId] = useState(user.agency_id ?? "");
  const [currentAssignedProjectIds, setCurrentAssignedProjectIds] = useState<string[]>(user.assigned_project_ids ?? []);
  const [currentStatus, setCurrentStatus] = useState(user.status ?? "Active");

  const clientProjectOptions = useMemo(
    () => projects.filter((project) => project.client_id === currentClientId),
    [projects, currentClientId]
  );

  useEffect(() => {
    setCurrentFullName(user.full_name);
    setCurrentPhone(user.phone ?? "");
    setCurrentRole(user.role);
    setCurrentClientId(user.client_id ?? "");
    setCurrentAgencyId(user.agency_id ?? "");
    setCurrentAssignedProjectIds(user.assigned_project_ids ?? []);
    setCurrentStatus(user.status ?? "Active");
  }, [user.user_id]);

  useEffect(() => {
    setCurrentAssignedProjectIds((currentIds) =>
      currentIds.filter((projectId) => clientProjectOptions.some((project) => project.id === projectId))
    );
  }, [clientProjectOptions]);

  function toggleAssignedProject(projectId: string) {
    setCurrentAssignedProjectIds((current) =>
      current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId]
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/35">
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{user.full_name || "Unnamed user"}</h2>
            <p className="text-sm text-slate-600">{user.email}</p>
          </div>
          <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm" onClick={onClose}>Close</button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Deployments" value={userSubmissions.length} />
          <SummaryCard label="Approval rate" value={userSubmissions.length ? Math.round((approved / userSubmissions.length) * 100) : 0} suffix="%" />
          <SummaryCard label="Rejection rate" value={userSubmissions.length ? Math.round((rejected / userSubmissions.length) * 100) : 0} suffix="%" />
        </div>
        <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm">
          <p>Role: <strong>{user.role}</strong></p>
          <p className="mt-1">Client Company: <strong>{clients.find((item) => item.id === user.client_id)?.name || "—"}</strong></p>
          <p className="mt-1">Agency: <strong>{agencies.find((item) => item.id === user.agency_id)?.agency_name || "—"}</strong></p>
          <p className="mt-1">Projects: <strong>{projects.filter((item) => user.assigned_project_ids.includes(item.id)).map((item) => item.project_name).join(", ") || "—"}</strong></p>
          <p className="mt-1">Territories: <strong>{[...user.assigned_regions, ...user.assigned_states].join(", ") || "—"}</strong></p>
          <p className="mt-1">Last submission: <strong>{lastSubmission ? formatDateTime(lastSubmission.submitted_at) : "None"}</strong></p>
        </div>
        <div className="mt-4 rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-bold">Activity history</h3>
          <div className="mt-3 grid gap-2">
            {userSubmissions.length === 0 ? <p className="text-sm text-slate-500">No submission activity yet.</p> : null}
            {userSubmissions.slice(0, 5).map((item) => (
              <div key={item.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium">{item.salon_name || "Unnamed location"}</span>
                <span className="text-slate-500"> | {item.status} | {formatDateTime(item.submitted_at)}</span>
              </div>
            ))}
          </div>
        </div>
        <form
          className="mt-4 grid gap-3"
          onSubmit={async (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const nextStatus = String(formData.get("status"));
            if ((nextStatus === "Suspended" || nextStatus === "Archived") && !window.confirm(`Confirm ${nextStatus.toLowerCase()} for this user?`)) return;
            await onUpdate({
              userId: user.user_id,
              fullName: formData.get("fullName"),
              phone: formData.get("phone"),
              role: formData.get("role"),
              clientId: formData.get("clientId"),
              agencyId: formData.get("agencyId"),
              assignedProjectIds: formData.getAll("assignedProjectIds"),
              assignedRegions: formData.getAll("assignedRegions"),
              assignedStates: formData.getAll("assignedStates"),
              status: nextStatus
            });
          }}
        >
          <input name="fullName" value={currentFullName} onChange={(event) => setCurrentFullName(event.target.value)} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
          <input name="phone" value={currentPhone} onChange={(event) => setCurrentPhone(event.target.value)} placeholder="Phone" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
          <select name="role" value={currentRole} onChange={(event) => setCurrentRole(event.target.value as ManagedUser["role"])} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm">
            <option value="admin">Admin</option>
            <option value="client">Client</option>
            <option value="installer">Installer</option>
          </select>
          <select
            name="clientId"
            value={currentClientId}
            onChange={(event) => setCurrentClientId(event.target.value)}
            className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm"
          >
            <option value="">No client</option>
            {clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select
            name="agencyId"
            value={currentAgencyId}
            onChange={(event) => setCurrentAgencyId(event.target.value)}
            className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm"
          >
            <option value="">No agency</option>
            {agencies.map((item) => <option key={item.id} value={item.id}>{item.agency_name}</option>)}
          </select>
          <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-600">Assigned projects</span>
              <span className="shrink-0 text-xs text-slate-400">{currentAssignedProjectIds.length} selected</span>
            </div>
            <div className="grid gap-2 max-h-56 overflow-y-auto rounded-md bg-slate-50 p-2">
              {currentClientId && clientProjectOptions.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-300 bg-slate-100 px-3 py-3 text-sm text-slate-500">No projects available</div>
              ) : null}
              {clientProjectOptions.length === 0 && !currentClientId ? (
                <div className="rounded-md border border-dashed border-slate-300 bg-slate-100 px-3 py-3 text-sm text-slate-500">Select a client company to load projects</div>
              ) : null}
              {clientProjectOptions.map((project) => {
                const selected = currentAssignedProjectIds.includes(project.id);
                return (
                  <label
                    key={project.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                      selected ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-white hover:bg-slate-100"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="assignedProjectIds"
                      value={project.id}
                      checked={selected}
                      onChange={() => toggleAssignedProject(project.id)}
                      className="h-4 w-4 rounded border-slate-300 text-orange-600"
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">{project.project_name}</div>
                      <div className="text-xs text-slate-500">{project.campaign_name || project.project_name}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
          <MultiSelectOptions name="assignedRegions" label="Assigned regions" options={[...NIGERIA_REGIONS]} selected={user.assigned_regions} />
          <MultiSelectOptions name="assignedStates" label="Assigned states" options={[...NIGERIA_STATES]} selected={user.assigned_states} />
          <select name="status" defaultValue={user.status} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm">
            <option>Active</option>
            <option>Inactive</option>
            <option>Suspended</option>
            <option>Archived</option>
          </select>
          <button className="min-h-10 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white">Save changes</button>
        </form>
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const password = window.prompt("Enter a new temporary password (minimum 8 characters):");
            if (!password) return;
            await onUpdate({ userId: user.user_id, resetPassword: true, temporaryPassword: password });
          }}
        >
          <button className="min-h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold">Reset password</button>
        </form>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: ManagedUser["role"] }) {
  return <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold capitalize">{role}</span>;
}

function MultiSelectOptions({
  name,
  label,
  options,
  selected
}: {
  name: string;
  label: string;
  options: string[];
  selected: string[];
}) {
  const [values, setValues] = useState(selected);

  useEffect(() => {
    setValues(selected);
  }, [selected.join("|")]);

  function toggle(option: string) {
    setValues((current) => (current.includes(option) ? current.filter((item) => item !== option) : [...current, option]));
  }

  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
      {values.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-600">{label}</span>
        <span className="shrink-0 text-xs text-slate-400">{values.length} selected</span>
      </div>
      <div className="max-h-36 overflow-y-auto rounded-md bg-slate-50 p-1">
        {options.map((option) => (
          <label key={option} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-orange-50">
            <input
              type="checkbox"
              checked={values.includes(option)}
              onChange={() => toggle(option)}
              autoComplete="off-state-assignment"
              className="h-4 w-4 rounded border-slate-300 text-orange-600"
            />
            <span className="min-w-0 break-words">{option}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((item) => item[0]?.toUpperCase())
    .join("") || "U";
}

function ClientManagementPanel({
  clients,
  clientProfiles,
  users,
  submissions,
  projects,
  onCreate,
  onSave,
  onArchive,
  onDelete
}: {
  clients: Client[];
  clientProfiles: ClientProfile[];
  users: ManagedUser[];
  submissions: Submission[];
  projects: Project[];
  onCreate: (formData: FormData) => Promise<boolean>;
  onSave: (formData: FormData) => Promise<void>;
  onArchive: (clientId: string) => Promise<void>;
  onDelete: (clientId: string) => Promise<void>;
}) {
  const [editingClientId, setEditingClientId] = useState<string | null>(null);

  return (
    <div className="grid min-w-0 gap-4">
      <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-base font-bold leading-snug">Create Client Company</h2>
          <p className="text-sm leading-snug text-slate-600">
            Add the company account first, then create projects and client users under that company.
          </p>
        </div>
        <form
          className="mt-4 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3"
          onSubmit={async (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const form = event.currentTarget;
            const created = await onCreate(new FormData(form));
            if (created) form.reset();
          }}
        >
          <FilterField label="Company name">
            <input required name="name" placeholder="Godrej Nigeria Ltd" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
          </FilterField>
          <FilterField label="Contact person">
            <input name="contactPerson" placeholder="Primary contact" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
          </FilterField>
          <FilterField label="Email">
            <input name="email" type="email" placeholder="client@example.com" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
          </FilterField>
          <FilterField label="Phone">
            <input name="phone" placeholder="Phone number" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
          </FilterField>
          <FilterField label="Industry/category">
            <input name="industryCategory" placeholder="FMCG, beauty, retail..." className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
          </FilterField>
          <FilterField label="Status">
            <select name="status" defaultValue="Active" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm">
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </FilterField>
          <button className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 md:col-span-2 xl:col-span-3">
            Create Client Company
          </button>
        </form>
      </div>

      <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-base font-bold leading-snug">Client Companies</h2>
        <p className="mt-1 text-sm leading-snug text-slate-600">Manage company profiles used by projects, client users, dashboards, and reports.</p>
      </div>
      {clients.map((client) => {
        const profile = clientProfiles.find((item) => item.client_id === client.id);
        const clientSubmissions = submissions.filter((item) => item.client_id === client.id);
        const approved = clientSubmissions.filter((item) => item.status === "Approved").length;
        const clientProjects = projects.filter((item) => item.client_id === client.id);
        const coverage = Array.from(new Set(clientSubmissions.map((item) => item.installer_region).filter(Boolean))).length;
        const assignedUsers = users.filter((item) => item.client_id === client.id).length;
        const isEditing = editingClientId === client.id;
        const canDelete = clientProjects.length === 0 && assignedUsers === 0 && clientSubmissions.length === 0;
        return (
          <form key={client.id} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-2" onSubmit={async (event) => {
            event.preventDefault();
            await onSave(new FormData(event.currentTarget));
            setEditingClientId(null);
          }}>
            <input type="hidden" name="clientId" value={client.id} />
            <div className="flex min-w-0 flex-col gap-3 md:col-span-2 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h3 className="min-w-0 whitespace-normal break-words text-base font-bold">{client.name}</h3>
                  <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${client.status === "Inactive" ? "border-slate-200 bg-slate-100 text-slate-500" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                    {client.status === "Inactive" ? "Archived" : "Active"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{profile?.contact_person || "No contact"} | {profile?.email || "No email"} | {assignedUsers} assigned users | {clientProjects.length} projects</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button type="button" onClick={() => setEditingClientId(isEditing ? null : client.id)} className="min-h-9 rounded-lg border border-slate-200 px-3 text-sm font-semibold transition hover:bg-slate-50">
                  {isEditing ? "Collapse" : "Edit"}
                </button>
                {client.status !== "Inactive" ? (
                  <button type="button" onClick={() => onArchive(client.id)} className="min-h-9 rounded-lg border border-orange-200 bg-orange-50 px-3 text-sm font-semibold text-orange-800 transition hover:bg-orange-100">
                    Archive
                  </button>
                ) : null}
                {canDelete ? (
                  <button type="button" onClick={() => onDelete(client.id)} className="min-h-9 rounded-lg border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100">
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 md:col-span-2 xl:grid-cols-6">
              <MiniMetric label="Projects" value={clientProjects.length} />
              <MiniMetric label="Assigned Users" value={assignedUsers} />
              <MiniMetric label="Deployments" value={clientSubmissions.length} />
              <MiniMetric label="Approved" value={approved} />
              <MiniMetric label="Approval" value={`${clientSubmissions.length ? Math.round((approved / clientSubmissions.length) * 100) : 0}%`} />
              <MiniMetric label="Coverage" value={coverage} />
            </div>
            {!canDelete ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 md:col-span-2">
                This client has linked records. Archive it instead to preserve history.
              </p>
            ) : null}
            {isEditing ? (
              <>
                <FilterField label="Company name">
                  <input required name="name" defaultValue={client.name} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
                </FilterField>
                <FilterField label="Contact person">
                  <input name="contactPerson" defaultValue={profile?.contact_person ?? ""} placeholder="Contact person" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
                </FilterField>
                <FilterField label="Email">
                  <input name="email" type="email" defaultValue={profile?.email ?? ""} placeholder="Email" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
                </FilterField>
                <FilterField label="Phone">
                  <input name="phone" defaultValue={profile?.phone ?? ""} placeholder="Phone" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
                </FilterField>
                <FilterField label="Industry/category">
                  <input name="industryCategory" defaultValue={profile?.industry_category ?? ""} placeholder="Industry/category" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm" />
                </FilterField>
                <FilterField label="Status">
                  <select name="status" defaultValue={client.status ?? "Active"} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm">
                    <option>Active</option>
                    <option>Inactive</option>
                  </select>
                </FilterField>
                <button className="min-h-10 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white md:col-span-2">Save Client Company</button>
              </>
            ) : (
              <>
                <input type="hidden" name="name" value={client.name} />
                <input type="hidden" name="contactPerson" value={profile?.contact_person ?? ""} />
                <input type="hidden" name="email" value={profile?.email ?? ""} />
                <input type="hidden" name="phone" value={profile?.phone ?? ""} />
                <input type="hidden" name="industryCategory" value={profile?.industry_category ?? ""} />
                <input type="hidden" name="status" value={client.status ?? "Active"} />
              </>
            )}
          </form>
        );
      })}
      {clients.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          No client companies configured yet.
        </div>
      ) : null}
    </div>
  );
}

function AuditLogPanel({ logs, users }: { logs: AuditLog[]; users: ManagedUser[] }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-base font-bold">Audit logs</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? <tr><td colSpan={4} className="px-3 py-3 text-slate-500">No audit events yet.</td></tr> : null}
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-slate-100">
                <td className="px-3 py-3">{log.action_type.replaceAll("_", " ")}</td>
                <td className="px-3 py-3">{users.find((item) => item.user_id === log.actor_user_id)?.email || "System"}</td>
                <td className="px-3 py-3">{users.find((item) => item.user_id === log.target_user_id)?.email || "—"}</td>
                <td className="px-3 py-3">{formatDateTime(log.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type DemoDataPlan = {
  mode: "seeded" | "client" | "project";
  selectedClientId: string | null;
  selectedProjectId: string | null;
  clients: Array<{ id: string; name: string; status: string | null }>;
  projectsForSelectedClient: Array<{ id: string; project_name: string; client_id: string | null; archived_at: string | null }>;
  users: Array<{ user_id: string; email: string; full_name: string; role: string | null; client_id: string | null; status: string | null; match_reason: string }>;
  projects: Array<{ id: string; project_name: string; client_id: string | null; client_name: string | null; archived_at: string | null; match_reason: string }>;
  submissions: Array<{ id: string; project_id: string | null; project_name: string | null; client_id: string | null; brand_name: string | null; installer_user_id: string | null; installer_name: string | null; status: string | null; submitted_at: string | null; match_reason: string }>;
  reports: Array<{ id: string; alert_type: string | null; created_at: string | null; match_reason: string }>;
  rules: string[];
  warnings: string[];
};

function DemoDataManagementPanel() {
  const [plan, setPlan] = useState<DemoDataPlan | null>(null);
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const { showToast } = useToast();

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (clientId) params.set("clientId", clientId);
    if (projectId) params.set("projectId", projectId);
    const value = params.toString();
    return value ? `?${value}` : "";
  }, [clientId, projectId]);

  async function loadPlan(nextQueryString = queryString) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/demo-data${nextQueryString}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not load demo data plan.");
      setPlan(body.plan ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load demo data plan.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlan(queryString);
  }, [queryString]);

  async function archiveDemoData() {
    if (!plan) return;
    const total = plan.users.length + plan.projects.length + plan.submissions.length + plan.reports.length;
    if (total === 0) {
      showToast("No demo/test records found to archive.");
      return;
    }
    const scopeLabel = projectId
      ? plan.projectsForSelectedClient.find((project) => project.id === projectId)?.project_name ?? "the selected project"
      : clientId
        ? plan.clients.find((client) => client.id === clientId)?.name ?? "the selected client"
        : "seeded/test records";
    const confirmed = window.confirm(`Archive ${total} matched records for ${scopeLabel}? This will not delete production data or remove auth users. Continue?`);
    if (!confirmed) return;
    setArchiving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/demo-data${queryString}`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not archive demo data.");
      const archived = body.archived ?? {};
      const summary = `Archived ${archived.projects ?? 0} projects, ${archived.users ?? 0} users, ${archived.submissions ?? 0} submissions, and ${archived.reports ?? 0} report records.`;
      setMessage(summary);
      showToast(summary);
      await loadPlan(queryString);
    } catch (archiveError) {
      const nextError = archiveError instanceof Error ? archiveError.message : "Could not archive demo data.";
      setError(nextError);
      showToast(nextError, "error");
    } finally {
      setArchiving(false);
    }
  }

  const counts = {
    projects: plan?.projects.length ?? 0,
    users: plan?.users.length ?? 0,
    submissions: plan?.submissions.length ?? 0,
    reports: plan?.reports.length ?? 0
  };

  const selectedClientLabel = clientId ? plan?.clients.find((client) => client.id === clientId)?.name ?? "Selected Client Company" : "Seeded/Test Records";
  const selectedProjectLabel = projectId ? plan?.projectsForSelectedClient.find((project) => project.id === projectId)?.project_name ?? "Selected Project" : clientId ? "All Projects" : "Seeded/Test Projects";

  return (
    <div className="grid min-w-0 gap-4">
      <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-orange-700">Safety first</p>
        <h2 className="mt-2 text-lg font-bold">Demo/Test Data Management</h2>
        <p className="mt-2 max-w-3xl text-sm leading-snug text-slate-700">
          Preview exactly which records will be archived before you approve cleanup. Choose a Client Company or Project to archive a full demo environment such as Godrej, or leave both selectors empty to review only seeded test records.
        </p>
      </div>

      <div className="grid min-w-0 gap-3 rounded-lg border border-slate-200 bg-white p-4 lg:grid-cols-[1fr_1fr]">
        <FilterField label="Client Company archive scope">
          <select
            value={clientId}
            onChange={(event) => {
              setClientId(event.target.value);
              setProjectId("");
              setMessage("");
            }}
            className="min-h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
          >
            <option value="">Seeded/Test Records Only</option>
            {plan?.clients.map((client) => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Project archive scope">
          <select
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value);
              setMessage("");
            }}
            disabled={!clientId}
            className="min-h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
          >
            <option value="">{clientId ? "All Projects Under Client" : "Select Client Company first"}</option>
            {plan?.projectsForSelectedClient.map((project) => (
              <option key={project.id} value={project.id}>{project.project_name}</option>
            ))}
          </select>
        </FilterField>
        <div className="lg:col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
          Previewing: {selectedClientLabel} / {selectedProjectLabel}
        </div>
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Projects To Archive" value={counts.projects} />
        <SummaryCard label="Users To Archive" value={counts.users} />
        <SummaryCard label="Submissions To Archive" value={counts.submissions} />
        <SummaryCard label="Report Records" value={counts.reports} />
      </div>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</div> : null}
      {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</div> : null}
      {plan?.warnings.length ? (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
          {plan.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-base font-bold">Matching rules currently in use</h3>
        {plan?.rules.length ? (
          <ul className="mt-3 grid gap-2 text-sm text-slate-700">
            {plan.rules.map((rule) => (
              <li key={rule} className="rounded-lg bg-slate-50 px-3 py-2 leading-snug">{rule}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Load a preview to see matching rules.</p>
        )}
      </div>

      <div className="flex min-w-0 flex-wrap gap-2">
        <button type="button" onClick={() => loadPlan(queryString)} disabled={loading || archiving} className="min-h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-60">
          {loading ? "Refreshing..." : "Refresh archive preview"}
        </button>
        <button type="button" onClick={archiveDemoData} disabled={loading || archiving || !plan} className="min-h-10 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:opacity-60">
          {archiving ? "Archiving..." : "Archive previewed records"}
        </button>
      </div>

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading archive preview...</div>
      ) : (
        <div className="grid min-w-0 gap-4">
          <DemoProjectsTable projects={plan?.projects ?? []} />
          <DemoUsersTable users={plan?.users ?? []} />
          <DemoSubmissionsTable submissions={plan?.submissions ?? []} />
          <DemoReportsTable reports={plan?.reports ?? []} />
        </div>
      )}
    </div>
  );
}

function DemoPreviewTable({ title, empty, headings, children }: { title: string; empty: string; headings: string[]; children: ReactNode }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-base font-bold">{title}</h3>
      {!children ? (
        <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
              <tr>
                {headings.map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">{children}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DemoProjectsTable({ projects }: { projects: DemoDataPlan["projects"] }) {
  return (
    <DemoPreviewTable title="Projects that will be archived" empty="No matching projects found." headings={["Project", "Client", "Archived", "Reason", "ID"]}>
      {projects.length === 0 ? null : projects.map((project) => (
        <tr key={project.id}>
          <td className="px-3 py-3 font-semibold text-slate-900">{project.project_name || "Untitled project"}</td>
          <td className="px-3 py-3">{project.client_name || project.client_id || "No client"}</td>
          <td className="px-3 py-3">{project.archived_at ? formatDateTime(project.archived_at) : "No"}</td>
          <td className="px-3 py-3">{project.match_reason}</td>
          <td className="px-3 py-3 font-mono text-xs text-slate-500">{project.id.slice(0, 8)}</td>
        </tr>
      ))}
    </DemoPreviewTable>
  );
}

function DemoUsersTable({ users }: { users: DemoDataPlan["users"] }) {
  return (
    <DemoPreviewTable title="Users that will be archived" empty="No matching users found." headings={["Name", "Email", "Role", "Status", "Reason", "User ID"]}>
      {users.length === 0 ? null : users.map((user) => (
        <tr key={user.user_id}>
          <td className="px-3 py-3 font-semibold text-slate-900">{user.full_name || "Unnamed user"}</td>
          <td className="px-3 py-3">{user.email || "No email"}</td>
          <td className="px-3 py-3">{user.role || "No role"}</td>
          <td className="px-3 py-3">{user.status || "Active"}</td>
          <td className="px-3 py-3">{user.match_reason}</td>
          <td className="px-3 py-3 font-mono text-xs text-slate-500">{user.user_id.slice(0, 8)}</td>
        </tr>
      ))}
    </DemoPreviewTable>
  );
}

function DemoSubmissionsTable({ submissions }: { submissions: DemoDataPlan["submissions"] }) {
  return (
    <DemoPreviewTable title="Submissions that will be archived" empty="No matching submissions found." headings={["Project", "Brand", "Installer", "Status", "Submitted", "Reason", "ID"]}>
      {submissions.length === 0 ? null : submissions.map((submission) => (
        <tr key={submission.id}>
          <td className="px-3 py-3 font-semibold text-slate-900">{submission.project_name || submission.project_id || "No project"}</td>
          <td className="px-3 py-3">{submission.brand_name || "No brand"}</td>
          <td className="px-3 py-3">{submission.installer_name || submission.installer_user_id || "No installer"}</td>
          <td className="px-3 py-3">{submission.status || "No status"}</td>
          <td className="px-3 py-3">{submission.submitted_at ? formatDateTime(submission.submitted_at) : "No date"}</td>
          <td className="px-3 py-3">{submission.match_reason}</td>
          <td className="px-3 py-3 font-mono text-xs text-slate-500">{submission.id.slice(0, 8)}</td>
        </tr>
      ))}
    </DemoPreviewTable>
  );
}

function DemoReportsTable({ reports }: { reports: DemoDataPlan["reports"] }) {
  return (
    <DemoPreviewTable title="Report/activity records that will be archived" empty="No matching report/activity records found, or optional alert records are not enabled in this database." headings={["Type", "Created", "Reason", "ID"]}>
      {reports.length === 0 ? null : reports.map((report) => (
        <tr key={report.id}>
          <td className="px-3 py-3 font-semibold text-slate-900">{report.alert_type || "Alert"}</td>
          <td className="px-3 py-3">{report.created_at ? formatDateTime(report.created_at) : "No date"}</td>
          <td className="px-3 py-3">{report.match_reason}</td>
          <td className="px-3 py-3 font-mono text-xs text-slate-500">{report.id.slice(0, 8)}</td>
        </tr>
      ))}
    </DemoPreviewTable>
  );
}

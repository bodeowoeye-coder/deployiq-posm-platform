import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { accessControlErrorResponse, requireClientUser } from "@/lib/accessControl";
import { loadClientSubmissionScope } from "@/lib/clientSubmissions";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { getBrandCounts, getRegionCounts } from "@/lib/reporting";
import { getPortfolioOperations, getProjectOperations } from "@/lib/operations";
import type { DeploymentProgress, ProjectTarget } from "@/lib/types";
import type { Submission } from "@/lib/types";
import { campaignMatches, displayProjectName, isLegacyProvisioningPlaceholderProject, resolveSubmissionCampaignName } from "@/lib/projects";
import { createReportId, drawReportFooter, drawReportHeader } from "@/lib/reportBranding";
import { isMissingDeploymentProgressTable } from "@/lib/workspace/analyticsCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pageWidth = 210;
const margin = 14;
const contentBottom = 280;
const rowLineHeight = 4.5;
const thumbnailWidth = 24;
const thumbnailHeight = 24;
const thumbnailFetchTimeoutMs = 12000;
const storageBucket = "installation-images";
const maxImageLoadAttempts = 2;
const imageDebugNeedles = ["ABUKKYA STORE", "MAC-DAVIS VENTURES", "MECHE", "CHINEMEREM SALONS"];

function hasValidGps(item: Submission) {
  if (item.gps_latitude === null || item.gps_longitude === null) return false;
  const lat = Number(item.gps_latitude);
  const lng = Number(item.gps_longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

// headerContentStart: header draws metadata starting at top+37=49, 4 rows × 5mm = last row at 64.
// Safe content start is 76 (12mm clear of last metadata row).
const headerContentStart = 76;

function ensurePageSpace(doc: jsPDF, requiredHeight: number, y: number, header: Array<[string, string]>) {
  if (y + requiredHeight <= contentBottom) return y;
  doc.addPage();
  drawReportHeader(doc, pageWidth, "Client Deployment Evidence", header);
  return headerContentStart;
}

function wrappedLines(doc: jsPDF, text: string, width: number) {
  return doc.splitTextToSize(text, width) as string[];
}

function formatPercent(part: number, whole: number) {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function toSentenceCase(text: string) {
  if (!text.trim()) return "Not specified";
  const trimmed = text.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

async function imageToThumbnailData(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), thumbnailFetchTimeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return { data: null, reason: `http_${response.status}` };
    }
    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.includes("jpeg") && !contentType.includes("jpg") && !contentType.includes("png") && !contentType.includes("webp")) {
      return { data: null, reason: `unsupported_content_type:${contentType}` };
    }

    let imageBuffer: Buffer;
    if (response.body) {
      const reader = response.body.getReader();
      const chunks: Buffer[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        chunks.push(Buffer.from(value));
      }

      imageBuffer = Buffer.concat(chunks);
    } else {
      const arrayBuffer = await response.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    }

    const format = contentType.includes("png") ? "PNG" : contentType.includes("webp") ? "WEBP" : "JPEG";
    return {
      data: { dataUrl: `data:${contentType};base64,${imageBuffer.toString("base64")}`, format, imageBuffer, contentType },
      reason: "ok"
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown_error";
    return { data: null, reason };
  } finally {
    clearTimeout(timeout);
  }
}

function tryEmbedPdfImage(doc: jsPDF, dataUrl: string, format: string, x: number, y: number, width: number, height: number) {
  try {
    doc.addImage(dataUrl, format, x, y, width, height, undefined, "MEDIUM");
    return true;
  } catch {
    return false;
  }
}

async function convertImageForPdf(
  imageBuffer: Buffer,
  maxWidthPx = 960
): Promise<{ dataUrl: string; format: "JPEG" } | null> {
  try {
    const sharpModule = await import("sharp");
    const sharp = sharpModule.default;
    const converted = await sharp(imageBuffer, { failOn: "none" })
      .rotate()
      .resize({ width: maxWidthPx, height: maxWidthPx, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 76, mozjpeg: true })
      .toBuffer();
    return { dataUrl: `data:image/jpeg;base64,${converted.toString("base64")}`, format: "JPEG" };
  } catch {
    return null;
  }
}

function sanitizeImageUrlForLog(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return raw.split("?")[0].slice(0, 220);
  }
}

function resolvePathImageUrl(path: string, supabase: ReturnType<typeof createAdminSupabase>) {
  const normalizedPath = path.replace(/^\/+/, "").trim();
  if (!normalizedPath) return null;
  const { data } = supabase.storage.from(storageBucket).getPublicUrl(normalizedPath);
  return data?.publicUrl ?? null;
}

function isImageDebugTarget(submission: Submission) {
  const haystack = [submission.salon_name, submission.address, submission.project_name, submission.installer_name]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  return imageDebugNeedles.some((needle) => haystack.includes(needle));
}

function resolveClientDashboardImageSource(
  item: Submission,
  supabase: ReturnType<typeof createAdminSupabase>
): {
  url: string | null;
  field: "image_url" | "image_path" | "photo_url" | "evidence_photo_url" | "photo_path" | "none";
  reason?: string;
} {
  // Preserve dashboard parity by prioritizing the raw image_url value exactly as-is when present.
  const rawImageUrl = String((item as Submission & { image_url?: unknown }).image_url ?? "").trim();
  if (rawImageUrl) {
    return { url: rawImageUrl, field: "image_url" };
  }

  const rawPhotoUrl = String((item as Submission & { photo_url?: unknown }).photo_url ?? "").trim();
  if (rawPhotoUrl) {
    return { url: rawPhotoUrl, field: "photo_url" };
  }

  const rawEvidencePhotoUrl = String((item as Submission & { evidence_photo_url?: unknown }).evidence_photo_url ?? "").trim();
  if (rawEvidencePhotoUrl) {
    return { url: rawEvidencePhotoUrl, field: "evidence_photo_url" };
  }

  const rawImagePath = String((item as Submission & { image_path?: unknown }).image_path ?? "").trim();
  if (rawImagePath) {
    const imagePathUrl = resolvePathImageUrl(rawImagePath, supabase);
    if (imagePathUrl) {
      return { url: imagePathUrl, field: "image_path" };
    }
    return { url: null, field: "image_path", reason: "could_not_resolve_public_url" };
  }

  const rawPhotoPath = String((item as Submission & { photo_path?: unknown }).photo_path ?? "").trim();
  if (rawPhotoPath) {
    const photoPathUrl = resolvePathImageUrl(rawPhotoPath, supabase);
    if (photoPathUrl) {
      return { url: photoPathUrl, field: "photo_path" };
    }
    return { url: null, field: "photo_path", reason: "could_not_resolve_public_url" };
  }

  return { url: null, field: "none", reason: "missing_image_fields" };
}

export async function GET(request: Request) {
  try {
    const userContext = await requireClientUser(request);
    const supabase = createAdminSupabase();
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, name")
      .eq("id", userContext.client_id)
      .maybeSingle();

    if (clientError) {
      return NextResponse.json({ error: clientError.message }, { status: 500 });
    }

    if (!client) {
      return NextResponse.json({ error: "Client account is not linked." }, { status: 400 });
    }

    if (!userContext.client_id) {
      return NextResponse.json({ error: "Client account is not linked." }, { status: 400 });
    }

    const clientId = userContext.client_id;

    const { searchParams } = new URL(request.url);
    const isFiltered = Array.from(searchParams.keys()).length > 0;
    const projectId = searchParams.get("projectId")?.trim() || "";
  const state = searchParams.get("state")?.trim();
  const region = searchParams.get("region")?.trim();
  const lga = searchParams.get("lga")?.trim();
  const project = searchParams.get("project")?.trim();
  const campaign = searchParams.get("campaign")?.trim();
  const brand = searchParams.get("brand")?.trim();
  const startDate = searchParams.get("startDate")?.trim();
  const endDate = searchParams.get("endDate")?.trim();
  const search = searchParams.get("query")?.trim();
  const quickFilter = (searchParams.get("quickFilter")?.trim().toLowerCase() ?? "") as "" | "all" | "approved" | "pending" | "rejected";
  const statusFilter = searchParams.get("status")?.trim() ?? "";
  const gpsFilter = (searchParams.get("gpsFilter")?.trim().toLowerCase() ?? "") as "" | "all_gps" | "gps_verified" | "gps_missing";
    const campaignDebugEnabled = process.env.NEXT_PUBLIC_CAMPAIGN_FILTER_DEBUG === "1";
    const scoped = await loadClientSubmissionScope(supabase, client, clientId);

    if (projectId && !scoped.projects.some((project) => project.id === projectId)) {
      return NextResponse.json({ error: "You do not have access to this project export scope." }, { status: 403 });
    }
  console.info("[client-pdf-source-shape]", {
    submissionCount: scoped.submissions.length,
    selectStrategy: 'loadClientSubmissionScope uses submissions.select("*")',
    sampleSubmissionShape: scoped.submissions[0]
      ? {
          submissionId: scoped.submissions[0].id,
          salonName: scoped.submissions[0].salon_name || null,
          hasImageUrl: Boolean((scoped.submissions[0] as Submission & { image_url?: unknown }).image_url),
          hasImagePath: Boolean((scoped.submissions[0] as Submission & { image_path?: unknown }).image_path),
          hasPhotoUrl: Boolean((scoped.submissions[0] as Submission & { photo_url?: unknown }).photo_url),
          hasEvidencePhotoUrl: Boolean((scoped.submissions[0] as Submission & { evidence_photo_url?: unknown }).evidence_photo_url),
          hasPhotoPath: Boolean((scoped.submissions[0] as Submission & { photo_path?: unknown }).photo_path)
        }
      : null
  });
  const sourceDebugTarget = scoped.submissions.find((item) => isImageDebugTarget(item));
  if (sourceDebugTarget) {
    console.info("[client-pdf-source-debug-record]", {
      stage: "before-image-resolution",
      submissionId: sourceDebugTarget.id,
      salonName: sourceDebugTarget.salon_name || null,
      projectName: sourceDebugTarget.project_name || null,
      installerName: sourceDebugTarget.installer_name || null,
      image_url: sanitizeImageUrlForLog((sourceDebugTarget as Submission & { image_url?: unknown }).image_url),
      image_path: sanitizeImageUrlForLog((sourceDebugTarget as Submission & { image_path?: unknown }).image_path),
      photo_url: sanitizeImageUrlForLog((sourceDebugTarget as Submission & { photo_url?: unknown }).photo_url),
      evidence_photo_url: sanitizeImageUrlForLog((sourceDebugTarget as Submission & { evidence_photo_url?: unknown }).evidence_photo_url),
      photo_path: sanitizeImageUrlForLog((sourceDebugTarget as Submission & { photo_path?: unknown }).photo_path)
    });
  } else {
    console.info("[client-pdf-source-debug-record]", {
      stage: "before-image-resolution",
      note: "No named debug record matched in current client scope",
      needles: imageDebugNeedles
    });
  }
  const searchText = search?.toLowerCase() ?? "";
    let submissions = scoped.submissions.filter((item) => {
    const date = item.installation_date ?? item.submitted_at.slice(0, 10);
    const campaignName = resolveSubmissionCampaignName(scoped.projects, item);
    const searchable = [
      item.installer_name,
      item.project_name,
      item.brand_name,
      item.salon_name,
      item.address,
      item.installer_region,
      item.installer_state,
      item.installer_lga,
      item.state_region,
      item.ocr_text
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (
      (!state || item.installer_state === state) &&
      (!region || item.installer_region === region) &&
      (!lga || (item.installer_lga ?? "").toLowerCase().includes(lga.toLowerCase())) &&
      (!project || displayProjectName(item.project_name) === project) &&
      (!projectId || item.project_id === projectId) &&
      campaignMatches(campaign, campaignName) &&
      (!brand || item.brand_name === brand) &&
      (!startDate || date >= startDate) &&
      (!endDate || date <= endDate) &&
      (!searchText || searchable.includes(searchText))
    );
  }).filter((submission) => !submission.archived_at) as Submission[];

    if (campaignDebugEnabled && (project || campaign)) {
    console.info("[client-pdf-campaign-filter-debug]", {
      selectedCampaignFilter: campaign || null,
      selectedProjectFilter: project || null,
      submissionsBeforeFilter: scoped.submissions.length,
      firstSubmissions: scoped.submissions.slice(0, 3).map((item) => ({
        submissionId: item.id,
        project_id: item.project_id,
        project_name: item.project_name,
        resolvedCampaignName: resolveSubmissionCampaignName(scoped.projects, item)
      })),
      submissionsAfterCampaignFilter: submissions.length
    });
    }

    if (statusFilter) submissions = submissions.filter((item) => item.status === statusFilter);
    if (!statusFilter && quickFilter === "approved") submissions = submissions.filter((item) => item.status === "Approved");
    if (!statusFilter && quickFilter === "pending") submissions = submissions.filter((item) => item.status === "Pending");
    if (!statusFilter && quickFilter === "rejected") submissions = submissions.filter((item) => item.status === "Rejected");
  const effectiveGpsFilter =
    gpsFilter ||
    ((searchParams.get("quickFilter")?.trim().toLowerCase() ?? "") === "gps_verified"
      ? "gps_verified"
      : (searchParams.get("quickFilter")?.trim().toLowerCase() ?? "") === "gps_missing"
      ? "gps_missing"
      : "");
    if (effectiveGpsFilter === "gps_verified") submissions = submissions.filter((item) => hasValidGps(item));
    if (effectiveGpsFilter === "gps_missing") submissions = submissions.filter((item) => !hasValidGps(item));

    const doc = new jsPDF({ unit: "mm", format: "a4" });
  const generatedAt = new Date().toLocaleString("en-GB", { timeZone: "Africa/Lagos" });
  const reportId = createReportId(isFiltered ? "DPIQ-CLT-FLT" : "DPIQ-CLT");
  let y = headerContentStart;
  const operationalProjects = scoped.projects.filter((item) => !isLegacyProvisioningPlaceholderProject(item));
  const selectedProject = projectId ? operationalProjects.find((item) => item.id === projectId) : null;
  const projectTitle = selectedProject?.project_name || project || "Combined Workspace Report";
  const includedProjects = selectedProject ? [selectedProject] : operationalProjects;
  const clientDisplayName = scoped.effectiveClient.name;
  const regionCounts = getRegionCounts(submissions);
  const brandCounts = getBrandCounts(submissions);
  const projectIds = includedProjects.map((item) => item.id);
  const [{ data: projectTargets, error: projectTargetsError }, { data: deploymentProgress, error: progressError }] =
    projectIds.length > 0
      ? await Promise.all([
          supabase.from("project_targets").select("*").in("project_id", projectIds),
          supabase.from("deployment_progress").select("*").in("project_id", projectIds)
        ])
      : [{ data: [] }, { data: [] }];
  if (projectTargetsError) throw projectTargetsError;
  if (progressError && !isMissingDeploymentProgressTable(progressError)) throw progressError;
  const compatibleDeploymentProgress = progressError && isMissingDeploymentProgressTable(progressError) ? [] : deploymentProgress ?? [];
  const projectOperations = getProjectOperations(includedProjects, (projectTargets ?? []) as ProjectTarget[], submissions, compatibleDeploymentProgress as DeploymentProgress[]);
  const portfolio = getPortfolioOperations(projectOperations);
  const statesCovered = new Set(submissions.map((item) => item.installer_state).filter(Boolean)).size;
  const evidenceRecords = submissions.length;
  const approvedCount = submissions.filter((item) => item.status === "Approved").length;
  const pendingCount = submissions.filter((item) => item.status === "Pending").length;
  const rejectedRows = submissions.filter((item) => item.status === "Rejected");
  const rejectedCount = rejectedRows.length;
  const gpsVerifiedCount = submissions.filter((item) => hasValidGps(item)).length;
  const gpsMissingCount = submissions.length - gpsVerifiedCount;
  const gpsCoverage = formatPercent(gpsVerifiedCount, submissions.length);
  const approvalRate = formatPercent(approvedCount, submissions.length);
  const rejectionRate = formatPercent(rejectedCount, submissions.length);

  const stateCountMap = submissions.reduce((acc, item) => {
    const key = item.installer_state || "Unknown";
    acc.set(key, (acc.get(key) ?? 0) + 1);
    return acc;
  }, new Map<string, number>());
  const leadingState = [...stateCountMap.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["N/A", 0];

  const rejectionReasonMap = rejectedRows.reduce((acc, item) => {
    const key = toSentenceCase(item.rejection_reason || "Not specified");
    acc.set(key, (acc.get(key) ?? 0) + 1);
    return acc;
  }, new Map<string, number>());
  const rejectionReasonRows = [...rejectionReasonMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count }));
  const mainRejectionReason = rejectionReasonRows[0] ?? { reason: "None", count: 0 };
  const projectById = new Map(scoped.projects.map((project) => [project.id, project]));

  const headerRows: Array<[string, string]> = [
    ["Client Name", clientDisplayName],
    ["Project Name", projectTitle],
    ["Generated Date/Time", generatedAt],
    ["Report ID", reportId]
  ];
  drawReportHeader(doc, pageWidth, `${isFiltered ? "Filtered" : "Full"} Client Deployment Report`, [
    ["Client Name", clientDisplayName],
    ["Project Name", projectTitle],
    ["Generated Date/Time", generatedAt],
    ["Report ID", reportId]
  ]);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Executive Deployment Summary", margin, y);
  y += 5;

  const campaignHealthBoxHeight = 32;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, pageWidth - margin * 2, campaignHealthBoxHeight, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("Campaign Health", margin + 3, y + 6.5);
  const healthSummary = [
    ["Expected Deployment", portfolio.expected],
    ["Completion %", `${portfolio.completion}%`],
    ["GPS Compliance %", `${gpsCoverage}%`],
    ["Approval Rate %", `${approvalRate}%`],
    ["Actual Deployment", portfolio.actual],
    ["Outstanding Deployment", portfolio.outstanding]
  ];
  const healthColumns = 3;
  const healthCellWidth = (pageWidth - margin * 2 - 8) / healthColumns;
  const healthGridTop = y + 11.5;
  const healthRowHeight = 10.5;
  healthSummary.forEach(([label, value], index) => {
    const column = index % healthColumns;
    const row = Math.floor(index / healthColumns);
    const x = margin + 4 + column * healthCellWidth;
    const cellTop = healthGridTop + row * healthRowHeight;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(String(label), x, cellTop);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.8);
    doc.setTextColor(15, 23, 42);
    doc.text(String(value), x, cellTop + 4.9);
  });
  y += campaignHealthBoxHeight + 5;

  const progressStartY = y;
  const progressPct = Math.max(0, Math.min(100, portfolio.completion));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("Progress to Target", margin, y);
  y += 4.5;
  const progressBarWidth = 96;
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(margin, y, progressBarWidth, 5, 1.5, 1.5, "FD");
  doc.setFillColor(11, 124, 89);
  doc.roundedRect(margin, y, (progressBarWidth * progressPct) / 100, 5, 1.5, 1.5, "F");
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(`${portfolio.actual} completed`, margin, y);
  doc.text(`${portfolio.outstanding} outstanding`, margin + 44, y);

  const insightsX = 112;
  let insightsY = progressStartY;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("Key Insights", insightsX, insightsY);
  insightsY += 5;
  const keyInsights = [
    `Total deployed so far: ${portfolio.actual}`,
    `Leading state: ${leadingState[0]} (${leadingState[1]})`,
    `Total rejected deployments: ${rejectedCount}`,
    `Main rejection reason: ${mainRejectionReason.reason} (${mainRejectionReason.count})`,
    `GPS evidence: ${gpsVerifiedCount} valid, ${gpsMissingCount} missing`,
    `Outstanding deployments: ${portfolio.outstanding}`
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.6);
  doc.setTextColor(51, 65, 85);
  keyInsights.forEach((insight) => {
    const lines = wrappedLines(doc, `• ${insight}`, 74);
    doc.text(lines, insightsX, insightsY);
    insightsY += lines.length * 4.2 + 1;
  });

  y = Math.max(156, insightsY + 4);
  const sectionBoxHeight = 38;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, 88, sectionBoxHeight, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("Deployment Exceptions Dashboard", margin + 3, y + 6.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Reason", margin + 3, y + 12);
  doc.text("Count", margin + 75, y + 12, { align: "right" });
  let exceptionY = y + 16;
  const exceptionRows = rejectionReasonRows.slice(0, 4);
  if (exceptionRows.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text("No deployment exceptions recorded.", margin + 3, exceptionY);
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    exceptionRows.forEach((entry) => {
      if (exceptionY > y + sectionBoxHeight - 2) return;
      doc.text(entry.reason.slice(0, 46), margin + 3, exceptionY);
      doc.text(String(entry.count), margin + 75, exceptionY, { align: "right" });
      exceptionY += 4.6;
    });
  }

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(112, y, 84, sectionBoxHeight, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("Risks / Attention Required", 115, y + 6.5);
  let riskY = y + 11.5;
  const risks = [
    "Salons/outlets displaced or no longer operating at recorded locations",
    "Incorrect or invalid outlet phone numbers",
    "Phone numbers unreachable or unavailable",
    "Incomplete or inaccurate outlet addresses"
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.4);
  doc.setTextColor(51, 65, 85);
  risks.forEach((risk) => {
    const lines = wrappedLines(doc, `• ${risk}`, 74);
    doc.text(lines, 115, riskY);
    riskY += lines.length * 3.7 + 0.6;
  });

  y += sectionBoxHeight + 8;

  doc.addPage();
  drawReportHeader(doc, pageWidth, "Project Performance Breakdown", [
    ["Client Name", clientDisplayName],
    ["Report Scope", projectTitle],
    ["Generated Date/Time", generatedAt],
    ["Report ID", reportId]
  ]);
  y = headerContentStart;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(projectId ? "Selected Project Performance" : "Combined Workspace Project Performance", margin, y);
  y += 8;
  projectOperations.forEach((row) => {
    if (y > 258) {
      doc.addPage();
      drawReportHeader(doc, pageWidth, "Project Performance Breakdown", [
        ["Client Name", clientDisplayName],
        ["Report Scope", projectTitle],
        ["Generated Date/Time", generatedAt],
        ["Report ID", reportId]
      ]);
      y = headerContentStart;
    }
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 32, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(row.project.project_name, margin + 4, y + 7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Campaign: ${row.project.campaign_name || "Not set"} | Brand: ${row.project.brand?.brand_name || "Multi-brand / unassigned"} | Status: ${row.project.status}`, margin + 4, y + 12);
    doc.text(`Target: ${row.expected} | Actual: ${row.actual} | Outstanding: ${row.outstanding} | Completion: ${row.completion}%`, margin + 4, y + 17);
    doc.text(`Approved: ${row.approved} | Pending: ${row.pending} | Rejected: ${row.rejected} | Evidence: ${row.submissions.length}`, margin + 4, y + 22);
    doc.text(`Dates: ${row.project.start_date || "Not set"} to ${row.project.end_date || "Not set"}`, margin + 4, y + 27);
    y += 38;
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("Deployment by Region", margin, y);
  doc.text("Deployment by Brand", 112, y);
  const maxRegion = Math.max(...regionCounts.map((item) => item.count), 1);
  const maxBrand = Math.max(...brandCounts.map((item) => item.count), 1);
  let breakdownY = y + 8;
  regionCounts.slice(0, 6).forEach((item) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(item.region.slice(0, 18), margin, breakdownY);
    doc.setFillColor(11, 124, 89);
    doc.rect(margin + 34, breakdownY - 4, Math.max(4, (item.count / maxRegion) * 42), 4, "F");
    doc.text(String(item.count), margin + 80, breakdownY);
    breakdownY += 6;
  });
  breakdownY = y + 8;
  brandCounts.slice(0, 6).forEach((item) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(item.brand.slice(0, 18), 112, breakdownY);
    doc.setFillColor(124, 58, 237);
    doc.rect(146, breakdownY - 4, Math.max(4, (item.count / maxBrand) * 34), 4, "F");
    doc.text(String(item.count), 184, breakdownY);
    breakdownY += 6;
  });
  y += 46;

  y = ensurePageSpace(doc, 24, y, headerRows);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("GPS Evidence Summary", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(`Records with coordinates: ${gpsVerifiedCount}`, margin, y);
  y += 4.5;
  doc.text(`Records without coordinates: ${gpsMissingCount}`, margin, y);
  y += 4.5;
  doc.text(`GPS coverage: ${gpsCoverage}%`, margin, y);
  y += 7;

  doc.addPage();
  drawReportHeader(doc, pageWidth, "Client Deployment Evidence", headerRows);
  y = headerContentStart;
  const thumbnailCache = new Map<string, Awaited<ReturnType<typeof imageToThumbnailData>>>();
  let submissionsWithImageSource = 0;
  let imagesAttempted = 0;
  let imagesEmbeddedSuccessfully = 0;
  let imagesFailed = 0;
  let submissionsWithNoImageSource = 0;

  for (const item of submissions) {
    doc.setFontSize(8);
    const textX = margin + 30;
    const textWidth = pageWidth - margin - textX - 4;
    const projectRecord = item.project_id ? projectById.get(item.project_id) : undefined;
    const resolvedProjectName = projectRecord ? displayProjectName(projectRecord.project_name) : displayProjectName(item.project_name);
    const rows = [
      `Project: ${resolvedProjectName}`,
      `Campaign: ${resolveSubmissionCampaignName(scoped.projects, item) || "Not set"}`,
      `Brand: ${item.brand_name || "Unassigned"}`,
      `Status: ${item.status} | Duplicate: ${item.duplicate_status || "Unique"}`,
      `Region: ${item.installer_region || item.state_region || "Unknown"} | State: ${item.installer_state || "Unknown"} | LGA: ${item.installer_lga || "n/a"}`,
      `GPS: ${item.gps_latitude ?? "n/a"}, ${item.gps_longitude ?? "n/a"}`,
      `Address: ${item.address || "Address not visible"}`,
      `Resolved GPS address: ${item.resolved_address || "Not resolved"}`,
      `Rejection reason: ${item.rejection_reason || "Not rejected"}`,
      `Admin comment: ${item.approval_comments || "None"}`
    ].map((row) => wrappedLines(doc, row, textWidth));
    const titleLines = wrappedLines(doc, item.salon_name || "Name not visible", textWidth);
    const evidenceLineHeight = rowLineHeight + 1.6;
    const textHeight = titleLines.length * 5 + rows.reduce((total, lines) => total + lines.length * rowLineHeight + 1.6, 0) + evidenceLineHeight;
    const cardHeight = Math.max(34, textHeight + 10);

    if (y + cardHeight > contentBottom) {
      doc.addPage();
      drawReportHeader(doc, pageWidth, "Client Deployment Evidence", headerRows);
      y = headerContentStart;
    }

    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, pageWidth - margin * 2, cardHeight, 2, 2);

    const resolvedImage = resolveClientDashboardImageSource(item, supabase);
    let hasEmbeddedThumbnail = false;
    let imageLoadFailed = false;

    if (resolvedImage.url) {
      submissionsWithImageSource += 1;
    } else {
      submissionsWithNoImageSource += 1;
    }

    if (resolvedImage.url) {
      imagesAttempted += 1;
      let finalFailureReason = "thumbnail_fetch_failed";

      for (let attempt = 1; attempt <= maxImageLoadAttempts && !hasEmbeddedThumbnail; attempt += 1) {
        let preview =
          attempt === 1
            ? thumbnailCache.get(resolvedImage.url)
            : undefined;

        if (!preview) {
          preview = await imageToThumbnailData(resolvedImage.url);
          if (attempt === 1) {
            thumbnailCache.set(resolvedImage.url, preview);
          }
        }

        if (!preview?.data) {
          finalFailureReason = preview?.reason || "thumbnail_fetch_failed";
          continue;
        }

        const embeddedOriginal = tryEmbedPdfImage(doc, preview.data.dataUrl, preview.data.format, margin + 2, y + 4, thumbnailWidth, thumbnailHeight);
        if (embeddedOriginal) {
          doc.link(margin + 2, y + 4, thumbnailWidth, thumbnailHeight, { url: resolvedImage.url });
          hasEmbeddedThumbnail = true;
          imagesEmbeddedSuccessfully += 1;
          break;
        }

        const converted = await convertImageForPdf(preview.data.imageBuffer);
        if (converted) {
          const embeddedConverted = tryEmbedPdfImage(doc, converted.dataUrl, converted.format, margin + 2, y + 4, thumbnailWidth, thumbnailHeight);
          if (embeddedConverted) {
            doc.link(margin + 2, y + 4, thumbnailWidth, thumbnailHeight, { url: resolvedImage.url });
            hasEmbeddedThumbnail = true;
            imagesEmbeddedSuccessfully += 1;
            break;
          }
        }

        finalFailureReason = `embed_failed_after_conversion_attempt_${attempt}`;
      }

      if (!hasEmbeddedThumbnail) {
        imageLoadFailed = true;
        imagesFailed += 1;
        console.warn("[client-pdf-image-failed]", {
          submissionId: item.id,
          outletName: item.salon_name || "Name not visible",
          imageFieldUsed: resolvedImage.field,
          failureReason: finalFailureReason
        });
      }
    } else {
      console.warn("[client-pdf-image-failed]", {
        submissionId: item.id,
        outletName: item.salon_name || "Name not visible",
        imageFieldUsed: resolvedImage.field,
        failureReason: resolvedImage.reason || "no_valid_image_source"
      });
    }

    if (!hasEmbeddedThumbnail) {
      doc.setDrawColor(203, 213, 225);
      doc.rect(margin + 2, y + 4, thumbnailWidth, thumbnailHeight);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      doc.setTextColor(100, 116, 139);
      const fallbackLabel = imageLoadFailed ? "Evidence Photo Could Not Be Loaded" : "Evidence Photo Unavailable";
      doc.text(wrappedLines(doc, fallbackLabel, thumbnailWidth - 2), margin + 3, y + 14);
    }

    let textY = y + 7;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(titleLines, textX, textY);
    textY += titleLines.length * 5 + 1;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    rows.forEach((lines) => {
      doc.text(lines, textX, textY);
      textY += lines.length * rowLineHeight + 1.6;
    });

    if (resolvedImage.url) {
      doc.setTextColor(37, 99, 235);
      const evidenceLabel = "Evidence Photo: View";
      doc.text(evidenceLabel, textX, textY);
      doc.link(textX, textY - 3.5, 28, 4.5, { url: resolvedImage.url });
      doc.setTextColor(15, 23, 42);
    } else {
      doc.text("Evidence Photo: Not available", textX, textY);
    }

    y += cardHeight + 5;
  }

  drawReportFooter(doc, pageWidth, 297, margin);
  console.info("[client-pdf-export-summary]", {
    totalSubmissionsInReport: submissions.length,
    submissionsWithImageSource,
    imagesAttempted,
    imagesEmbeddedSuccessfully,
    imagesFailed,
    submissionsWithNoImageSource
  });
    const buffer = Buffer.from(doc.output("arraybuffer"));
  const filename = `${isFiltered ? "filtered" : "full"}-client-deployment-report-${new Date().toISOString().slice(0, 10)}.pdf`;
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=${filename}`
      }
    });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

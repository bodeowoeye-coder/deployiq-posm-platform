import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { getCurrentUserContext } from "@/lib/auth";
import { loadClientSubmissionScope } from "@/lib/clientSubmissions";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { getBrandCounts, getRegionCounts } from "@/lib/reporting";
import { getPortfolioOperations, getProjectOperations } from "@/lib/operations";
import type { DeploymentProgress, ProjectTarget } from "@/lib/types";
import type { Submission } from "@/lib/types";
import { campaignMatches, displayProjectName, resolveSubmissionCampaignName } from "@/lib/projects";
import { createReportId, drawReportFooter, drawReportHeader } from "@/lib/reportBranding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pageWidth = 210;
const margin = 14;
const contentBottom = 280;
const rowLineHeight = 4.5;

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

async function imageToDataUrl(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const format = contentType.includes("png") ? "PNG" : "JPEG";
    return { dataUrl: `data:${contentType};base64,${base64}`, format };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const context = await getCurrentUserContext();
  if (!context || context.role.role !== "client" || !context.role.client_id || !context.client) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const client = context.client;
  const clientId = context.role.client_id;

  const { searchParams } = new URL(request.url);
  const isFiltered = Array.from(searchParams.keys()).length > 0;
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
  const gpsFilter = (searchParams.get("gpsFilter")?.trim().toLowerCase() ?? "") as "" | "all_gps" | "gps_verified" | "gps_missing";
  const supabase = createAdminSupabase();
  const scoped = await loadClientSubmissionScope(supabase, client, clientId);
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
      campaignMatches(campaign, campaignName) &&
      (!brand || item.brand_name === brand) &&
      (!startDate || date >= startDate) &&
      (!endDate || date <= endDate) &&
      (!searchText || searchable.includes(searchText))
    );
  }).filter((submission) => !submission.archived_at) as Submission[];

  if (quickFilter === "approved") submissions = submissions.filter((item) => item.status === "Approved");
  if (quickFilter === "pending") submissions = submissions.filter((item) => item.status === "Pending");
  if (quickFilter === "rejected") submissions = submissions.filter((item) => item.status === "Rejected");
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
  const projectTitle = project || "All projects";
  const clientDisplayName = scoped.effectiveClient.name;
  const regionCounts = getRegionCounts(submissions);
  const brandCounts = getBrandCounts(submissions);
  const projectIds = scoped.projects.map((item) => item.id);
  const [{ data: projectTargets }, { data: deploymentProgress }] =
    projectIds.length > 0
      ? await Promise.all([
          supabase.from("project_targets").select("*").in("project_id", projectIds),
          supabase.from("deployment_progress").select("*").in("project_id", projectIds)
        ])
      : [{ data: [] }, { data: [] }];
  const projectOperations = getProjectOperations(scoped.projects, (projectTargets ?? []) as ProjectTarget[], submissions, (deploymentProgress ?? []) as DeploymentProgress[]);
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

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 36, 2, 2, "F");
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
  healthSummary.forEach(([label, value], index) => {
    const column = index % healthColumns;
    const row = Math.floor(index / healthColumns);
    const x = margin + 4 + column * healthCellWidth;
    const cellTop = y + 11 + row * 12;
    const labelLines = wrappedLines(doc, String(label), healthCellWidth - 2);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(labelLines, x, cellTop);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(String(value), x, cellTop + labelLines.length * 3 + 3.4);
  });
  y += 42;

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
  let insightsY = 113;
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

  y = 156;
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

  y = 198;

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

  for (const item of submissions) {
    doc.setFontSize(8);
    const textX = margin + 30;
    const textWidth = pageWidth - margin - textX - 4;
    const rows = [
      `Project: ${displayProjectName(item.project_name)}`,
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

    const preview = await imageToDataUrl(item.image_url);
    if (preview) {
      try {
        doc.addImage(preview.dataUrl, preview.format, margin + 2, y + 4, 24, 24);
        if (item.image_url) {
          doc.link(margin + 2, y + 4, 24, 24, { url: item.image_url });
        }
      } catch {
        doc.setFontSize(7);
        doc.text("Preview unavailable", margin + 3, y + 16);
      }
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

    if (item.image_url) {
      doc.setTextColor(37, 99, 235);
      const evidenceLabel = "Evidence Photo: View";
      doc.text(evidenceLabel, textX, textY);
      doc.link(textX, textY - 3.5, 28, 4.5, { url: item.image_url });
      doc.setTextColor(15, 23, 42);
    } else {
      doc.text("Evidence Photo: Not available", textX, textY);
    }

    y += cardHeight + 5;
  }

  drawReportFooter(doc, pageWidth, 297, margin);
  const buffer = Buffer.from(doc.output("arraybuffer"));
  const filename = `${isFiltered ? "filtered" : "full"}-client-deployment-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=${filename}`
    }
  });
}

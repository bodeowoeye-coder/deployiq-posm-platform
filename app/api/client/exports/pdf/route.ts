import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { getCurrentUserContext } from "@/lib/auth";
import { loadClientSubmissionScope } from "@/lib/clientSubmissions";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { getBrandCounts, getRegionCounts } from "@/lib/reporting";
import { getPortfolioOperations, getProjectOperations } from "@/lib/operations";
import type { DeploymentProgress, ProjectTarget } from "@/lib/types";
import type { Submission } from "@/lib/types";
import { displayProjectName } from "@/lib/projects";
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

function ensurePageSpace(doc: jsPDF, requiredHeight: number, y: number, header: Array<[string, string]>) {
  if (y + requiredHeight <= contentBottom) return y;
  doc.addPage();
  drawReportHeader(doc, pageWidth, "Client Deployment Evidence", header);
  return 66;
}

function wrappedLines(doc: jsPDF, text: string, width: number) {
  return doc.splitTextToSize(text, width) as string[];
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
    const campaignName = scoped.projects.find((projectRow) => projectRow.id === item.project_id || projectRow.project_name === item.project_name)?.campaign_name ?? "";
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
      (!campaign || campaignName === campaign) &&
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
  let y = 66;
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
  const gpsVerifiedCount = submissions.filter((item) => hasValidGps(item)).length;
  const gpsMissingCount = submissions.length - gpsVerifiedCount;
  const gpsCoverage = submissions.length === 0 ? 0 : Math.round((gpsVerifiedCount / submissions.length) * 100);
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

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 46, 2, 2, "F");
  const summary = [
    ["Expected Deployment", portfolio.expected],
    ["Actual Deployment", portfolio.actual],
    ["Outstanding", portfolio.outstanding],
    ["Completion %", `${portfolio.completion}%`],
    ["State Coverage", statesCovered],
    ["Evidence Records", evidenceRecords],
    ["Approved", approvedCount],
    ["Pending", pendingCount],
    ["Rejected", rejectedRows.length],
    ["GPS Verified", gpsVerifiedCount],
    ["GPS Missing", gpsMissingCount],
    ["GPS Coverage %", `${gpsCoverage}%`]
  ];
  summary.forEach(([label, value], index) => {
    const column = index % 6;
    const row = Math.floor(index / 6);
    const x = margin + 8 + column * 30;
    const yOffset = y + row * 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(String(label), x, yOffset + 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(String(value), x, yOffset + 18);
  });
  y += 58;

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
    breakdownY += 7;
  });
  breakdownY = y + 8;
  brandCounts.slice(0, 6).forEach((item) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(item.brand.slice(0, 18), 112, breakdownY);
    doc.setFillColor(124, 58, 237);
    doc.rect(146, breakdownY - 4, Math.max(4, (item.count / maxBrand) * 34), 4, "F");
    doc.text(String(item.count), 184, breakdownY);
    breakdownY += 7;
  });
  y += 56;

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

  y = ensurePageSpace(doc, 34, y, headerRows);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("Rejected Deployments Summary", margin, y);
  y += 6;
  if (rejectedRows.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("No rejected deployments in this dataset.", margin, y);
    y += 8;
  } else {
    rejectedRows.slice(0, 10).forEach((item) => {
      y = ensurePageSpace(doc, 8, y, headerRows);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      doc.text(`• ${item.salon_name || "Name not visible"} | ${item.installer_state || "Unknown state"} | ${item.rejection_reason || "Not specified"}`, margin, y);
      y += 5;
      if (item.approval_comments) {
        doc.setTextColor(100, 116, 139);
        doc.text(`  Admin comment: ${item.approval_comments}`, margin, y);
        y += 4;
      }
    });
    y += 3;
  }

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
    const textHeight = titleLines.length * 5 + rows.reduce((total, lines) => total + lines.length * rowLineHeight + 1.6, 0);
    const cardHeight = Math.max(34, textHeight + 10);

    if (y + cardHeight > contentBottom) {
      doc.addPage();
      drawReportHeader(doc, pageWidth, "Client Deployment Evidence", headerRows);
      y = 66;
    }

    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, pageWidth - margin * 2, cardHeight, 2, 2);

    const preview = await imageToDataUrl(item.image_url);
    if (preview) {
      try {
        doc.addImage(preview.dataUrl, preview.format, margin + 2, y + 4, 24, 24);
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

import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { getCurrentUserContext } from "@/lib/auth";
import { getBrandCounts, getInstallerCounts, getRegionCounts } from "@/lib/reporting";
import type { Submission } from "@/lib/types";
import { displayProjectName } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pageWidth = 210;
const margin = 14;
const contentBottom = 278;
const rowLineHeight = 4.5;

function reportDate() {
  return new Date().toISOString().slice(0, 10);
}

function companyName() {
  return process.env.COMPANY_NAME || "Deployment Reporting";
}

function footer(doc: jsPDF, generatedAt: string) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, 285, pageWidth - margin, 285);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(companyName(), margin, 291);
    doc.text(`Generated ${generatedAt}`, pageWidth / 2, 291, { align: "center" });
    doc.text(`Page ${page} of ${pages}`, pageWidth - margin, 291, { align: "right" });
  }
}

function drawFallbackLogo(doc: jsPDF) {
  doc.setFillColor(11, 124, 89);
  doc.roundedRect(margin, 12, 28, 14, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("DR", margin + 14, 21, { align: "center" });
  doc.setTextColor(15, 23, 42);
}

function drawBars(doc: jsPDF, title: string, rows: Array<[string, number]>, x: number, y: number, width: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(title, x, y);
  const max = Math.max(...rows.map((row) => row[1]), 1);
  let currentY = y + 7;

  rows.slice(0, 6).forEach(([label, count]) => {
    const barWidth = Math.max(4, (count / max) * (width - 34));
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(label.slice(0, 18), x, currentY);
    doc.setFillColor(11, 124, 89);
    doc.rect(x + 34, currentY - 4, barWidth, 4, "F");
    doc.setTextColor(71, 85, 105);
    doc.text(String(count), x + 36 + barWidth, currentY);
    doc.setTextColor(15, 23, 42);
    currentY += 7;
  });
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

async function drawLogo(doc: jsPDF) {
  const logoUrl = process.env.COMPANY_LOGO_URL;
  if (logoUrl) {
    const logo = await imageToDataUrl(logoUrl);
    if (logo) {
      try {
        doc.addImage(logo.dataUrl, logo.format, margin, 12, 28, 14);
        return;
      } catch {
        // Fall back to a text mark when the configured logo cannot be rendered.
      }
    }
  }

  drawFallbackLogo(doc);
}

function wrappedLines(doc: jsPDF, text: string, width: number) {
  return doc.splitTextToSize(text, width) as string[];
}

export async function GET(request: Request) {
  const context = await getCurrentUserContext();
  if (!context || context.role.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const isFiltered = Array.from(searchParams.keys()).length > 0;
  const region = searchParams.get("region")?.trim();
  const installer = searchParams.get("installer")?.trim();
  const project = searchParams.get("project")?.trim();
  const campaign = searchParams.get("campaign")?.trim();
  const brand = searchParams.get("brand")?.trim();
  const status = searchParams.get("status")?.trim();
  const startDate = searchParams.get("startDate")?.trim();
  const endDate = searchParams.get("endDate")?.trim();
  const search = searchParams.get("query")?.trim();
  const supabase = createAdminSupabase();
  let query = supabase.from("submissions").select("*").order("submitted_at", { ascending: false });
  if (campaign) {
    const { data: matchingProjects } = await supabase.from("projects").select("id").eq("campaign_name", campaign);
    query = matchingProjects?.length ? query.in("project_id", matchingProjects.map((item) => item.id)) : query.eq("project_id", "00000000-0000-0000-0000-000000000000");
  }

  if (region) query = query.or(`installer_region.ilike.%${region}%,installer_state.ilike.%${region}%,installer_lga.ilike.%${region}%,state_region.ilike.%${region}%`);
  if (installer) query = query.ilike("installer_name", `%${installer}%`);
  if (project) query = project === "General Deployment" ? query.is("project_name", null) : query.eq("project_name", project);
  if (brand) query = query.eq("brand_name", brand);
  if (status) query = query.eq("status", status);
  if (startDate) query = query.gte("installation_date", startDate);
  if (endDate) query = query.lte("installation_date", endDate);
  if (search) {
    query = query.or(
      [
        `installer_name.ilike.%${search}%`,
        `project_name.ilike.%${search}%`,
        `brand_name.ilike.%${search}%`,
        `salon_name.ilike.%${search}%`,
        `address.ilike.%${search}%`,
        `installer_region.ilike.%${search}%`,
        `installer_state.ilike.%${search}%`,
        `installer_lga.ilike.%${search}%`,
        `state_region.ilike.%${search}%`,
        `ocr_text.ilike.%${search}%`
      ].join(",")
    );
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const submissions = (data ?? []) as Submission[];
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const generatedAt = new Date().toLocaleString();
  const regionCounts = getRegionCounts(submissions);
  const brandCounts = getBrandCounts(submissions);
  const installerCounts = getInstallerCounts(submissions);
  const approvedCount = submissions.filter((item) => item.status === "Approved").length;
  const pendingCount = submissions.filter((item) => item.status === "Pending").length;
  const rejectedCount = submissions.filter((item) => item.status === "Rejected").length;

  await drawLogo(doc);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Deployment Installation Report", 48, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`${isFiltered ? "Filtered" : "Full"} report | Generated ${generatedAt}`, 48, 25);
  doc.setTextColor(15, 23, 42);

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, 36, pageWidth - margin * 2, 28, 2, 2, "F");
  const summary = [
    ["Total", submissions.length],
    ["Approved", approvedCount],
    ["Pending", pendingCount],
    ["Rejected", rejectedCount],
    ["Regions", regionCounts.length],
    ["Brands", brandCounts.length]
  ];
  summary.forEach(([label, value], index) => {
    const x = margin + 8 + index * 29;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(String(label), x, 46);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text(String(value), x, 57);
    doc.setFont("helvetica", "normal");
  });

  drawBars(doc, "Regional breakdown", regionCounts.map((item) => [item.region, item.count]), margin, 78, 82);
  drawBars(doc, "Brand breakdown", brandCounts.map((item) => [item.brand, item.count]), 112, 78, 82);
  drawBars(doc, "Installer performance", installerCounts.map((item) => [item.installer, item.count]), margin, 130, 176);

  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Installation Table", margin, 18);

  let y = 28;
  for (const item of submissions) {
    const textX = margin + 30;
    const textWidth = pageWidth - margin - textX - 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const rows = [
      `Selected: ${item.brand_name || "Unassigned"} | Detected: ${item.detected_brand_name || "Uncertain"}`,
      `Project: ${displayProjectName(item.project_name)}`,
      `Region: ${item.installer_region || item.state_region || "Unknown"} | State: ${item.installer_state || "Unknown"} | LGA: ${item.installer_lga || "n/a"}`,
      `Status: ${item.status} | Match: ${item.brand_match_status || "Unreviewed"}`,
      `GPS: ${item.gps_latitude ?? "n/a"}, ${item.gps_longitude ?? "n/a"} | Date: ${item.installation_date || item.submitted_at.slice(0, 10)} ${item.installation_time || ""}`,
      `Address: ${item.address || "Address not visible"}`,
      `Resolved GPS address: ${item.resolved_address || "Not resolved"}`,
      `Confidence: ${item.ai_confidence_level || "n/a"} (${item.ai_confidence_score ?? "n/a"}) | Duplicate: ${item.duplicate_status || "Unique"}`,
      `OCR: ${item.ocr_text || item.ai_raw_text || "No text extracted"}`,
      `AI review: ${item.ai_review_note || "No AI review note"}`
    ].map((row) => wrappedLines(doc, row, textWidth));
    const titleLines = wrappedLines(doc, item.salon_name || "Name not visible", textWidth);
    const textHeight = titleLines.length * 5 + rows.reduce((total, lines) => total + lines.length * rowLineHeight + 1.6, 0);
    const cardHeight = Math.max(34, textHeight + 10);

    if (y + cardHeight > contentBottom) {
      doc.addPage();
      y = 18;
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

  footer(doc, generatedAt);

  const buffer = Buffer.from(doc.output("arraybuffer"));
  const filename = `${isFiltered ? "filtered" : "full"}-deployment-report-${reportDate()}.pdf`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=${filename}`
    }
  });
}

import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { getCurrentUserContext } from "@/lib/auth";
import { loadClientSubmissionScope } from "@/lib/clientSubmissions";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { getBrandCounts, getRegionCounts } from "@/lib/reporting";
import type { Submission } from "@/lib/types";
import { DEFAULT_PROJECT_NAME, displayProjectName } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pageWidth = 210;
const margin = 14;
const contentBottom = 280;
const rowLineHeight = 4.5;

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
  const supabase = createAdminSupabase();
  const scoped = await loadClientSubmissionScope(supabase, client, clientId);
  const searchText = search?.toLowerCase() ?? "";
  const submissions = scoped.submissions.filter((item) => {
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
  }) as Submission[];
  const doc = new jsPDF();
  let y = 18;
  doc.setFontSize(18);
  const projectTitle = project || DEFAULT_PROJECT_NAME;
  const clientDisplayName = scoped.effectiveClient.name;
  doc.text(`${clientDisplayName} — ${projectTitle}`, 14, y);
  y += 10;
  doc.setFontSize(11);
  doc.text(`${isFiltered ? "Filtered" : "Full"} report generated ${new Date().toLocaleString()}`, 14, y);
  y += 10;
  doc.text(`Total installations: ${submissions.length}`, 14, y);
  y += 8;
  doc.text(`Regions covered: ${getRegionCounts(submissions).length}`, 14, y);
  y += 8;
  doc.text(`Brands represented: ${getBrandCounts(submissions).length}`, 14, y);
  y += 12;

  for (const item of submissions) {
    doc.setFontSize(8);
    const textX = margin + 30;
    const textWidth = pageWidth - margin - textX - 4;
    const rows = [
      `Project: ${displayProjectName(item.project_name)}`,
      `Brand: ${item.brand_name || "Unassigned"}`,
      `Region: ${item.installer_region || item.state_region || "Unknown"} | State: ${item.installer_state || "Unknown"} | LGA: ${item.installer_lga || "n/a"}`,
      `GPS: ${item.gps_latitude ?? "n/a"}, ${item.gps_longitude ?? "n/a"}`,
      `Address: ${item.address || "Address not visible"}`,
      `Resolved GPS address: ${item.resolved_address || "Not resolved"}`,
      `OCR: ${item.ocr_text || item.ai_raw_text || "No text extracted"}`
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

  const buffer = Buffer.from(doc.output("arraybuffer"));
  const filename = `${isFiltered ? "filtered" : "full"}-client-deployment-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=${filename}`
    }
  });
}

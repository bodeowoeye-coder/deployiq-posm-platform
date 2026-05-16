import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { getCurrentUserContext } from "@/lib/auth";
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
  if (!context || context.role.role !== "client" || !context.role.client_id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const isFiltered = Array.from(searchParams.keys()).length > 0;
  const state = searchParams.get("state")?.trim();
  const region = searchParams.get("region")?.trim();
  const project = searchParams.get("project")?.trim();
  const brand = searchParams.get("brand")?.trim();
  const startDate = searchParams.get("startDate")?.trim();
  const endDate = searchParams.get("endDate")?.trim();
  const search = searchParams.get("query")?.trim();
  const supabase = createAdminSupabase();
  let query = supabase.from("submissions").select("*").eq("client_id", context.role.client_id).order("submitted_at", { ascending: false });

  if (state) query = query.eq("installer_state", state);
  if (region) query = query.eq("installer_region", region);
  if (project) query = project === "General Deployment" ? query.is("project_name", null) : query.eq("project_name", project);
  if (brand) query = query.eq("brand_name", brand);
  if (startDate) query = query.gte("installation_date", startDate);
  if (endDate) query = query.lte("installation_date", endDate);
  if (search) query = query.or(`installer_name.ilike.%${search}%,project_name.ilike.%${search}%,brand_name.ilike.%${search}%,salon_name.ilike.%${search}%,address.ilike.%${search}%,installer_region.ilike.%${search}%,installer_state.ilike.%${search}%,installer_lga.ilike.%${search}%,state_region.ilike.%${search}%,ocr_text.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const submissions = (data ?? []) as Submission[];
  const doc = new jsPDF();
  let y = 18;
  doc.setFontSize(18);
  const projectTitle = project || DEFAULT_PROJECT_NAME;
  const clientDisplayName = context.client?.name?.startsWith("Godrej") ? "Godrej" : context.client?.name ?? "Client";
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

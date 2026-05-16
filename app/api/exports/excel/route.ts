import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { getCurrentUserContext } from "@/lib/auth";
import type { Submission } from "@/lib/types";
import { displayProjectName } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayForFilename() {
  return new Date().toISOString().slice(0, 10);
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
  const brand = searchParams.get("brand")?.trim();
  const status = searchParams.get("status")?.trim();
  const startDate = searchParams.get("startDate")?.trim();
  const endDate = searchParams.get("endDate")?.trim();
  const search = searchParams.get("query")?.trim();
  const supabase = createAdminSupabase();
  let query = supabase.from("submissions").select("*").order("submitted_at", { ascending: false });

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

  const rows = ((data ?? []) as Submission[]).map((item) => ({
    "Installer Name": item.installer_name ?? "",
    "Project Name": displayProjectName(item.project_name),
    "Selected Brand": item.brand_name ?? "",
    "Detected Brand": item.detected_brand_name ?? "",
    "Brand Match Status": item.brand_match_status ?? "",
    "AI Confidence Score": item.ai_confidence_score ?? "",
    "AI Confidence Level": item.ai_confidence_level ?? "",
    "Auto Approved": item.auto_approved ? "Yes" : "No",
    "Duplicate Status": item.duplicate_status ?? "Unique",
    "Duplicate Reason": item.duplicate_reason ?? "",
    "AI Review Note": item.ai_review_note ?? "",
    "Salon/Store Name": item.salon_name ?? "",
    Address: item.address ?? "",
    "GPS Latitude": item.gps_latitude ?? "",
    "GPS Longitude": item.gps_longitude ?? "",
    "Installer Selected State": item.installer_state ?? "",
    "Installer Selected Region": item.installer_region ?? "",
    "Installer Selected LGA": item.installer_lga ?? "",
    "Installation Date": item.installation_date ?? new Date(item.submitted_at).toISOString().slice(0, 10),
    "Installation Time": item.installation_time ?? "",
    "OCR Extracted Text": item.ocr_text ?? item.ai_raw_text ?? "",
    "Image URL": item.image_url,
    "Image Thumbnail Preview": "Image embedding is not supported by the community xlsx writer; use Image URL.",
    "OCR State/Region": item.state_region ?? "",
    "Submission Status": item.status,
    "Created Timestamp": item.submitted_at
  }));

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  const headers = Object.keys(rows[0] ?? {
    "Installer Name": "",
    "Project Name": "",
    "Selected Brand": "",
    "Detected Brand": "",
    "Brand Match Status": "",
    "AI Confidence Score": "",
    "AI Confidence Level": "",
    "Auto Approved": "",
    "Duplicate Status": "",
    "Duplicate Reason": "",
    "AI Review Note": "",
    "Salon/Store Name": "",
    Address: "",
    "GPS Latitude": "",
    "GPS Longitude": "",
    "Installer Selected State": "",
    "Installer Selected Region": "",
    "Installer Selected LGA": "",
    "Installation Date": "",
    "Installation Time": "",
    "OCR Extracted Text": "",
    "Image URL": "",
    "Image Thumbnail Preview": "",
    "OCR State/Region": "",
    "Submission Status": "",
    "Created Timestamp": ""
  });

  sheet["!cols"] = headers.map((header) => {
    const maxLength = Math.max(
      header.length,
      ...rows.map((row) => String(row[header as keyof typeof row] ?? "").slice(0, 80).length)
    );
    return { wch: Math.min(Math.max(maxLength + 2, 14), 52) };
  });
  sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length, 1), c: headers.length - 1 } }) };
  sheet["!freeze"] = { xSplit: 0, ySplit: 1 };

  headers.forEach((_, index) => {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: index })];
    if (cell) {
      cell.s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "1F2937" } },
        alignment: { horizontal: "center" }
      };
    }
  });

  XLSX.utils.book_append_sheet(workbook, sheet, "Installations");
  workbook.Props = {
    Title: "Deployment Installation Report",
    Company: process.env.COMPANY_NAME || "Deployment Reporting",
    CreatedDate: new Date()
  };

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer", cellStyles: true });
  const filename = `${isFiltered ? "filtered" : "full"}-deployment-report-${todayForFilename()}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=${filename}`
    }
  });
}

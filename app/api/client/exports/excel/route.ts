import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getCurrentUserContext } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type { Submission } from "@/lib/types";
import { displayProjectName } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  let query = supabase
    .from("submissions")
    .select("*")
    .eq("client_id", context.role.client_id)
    .order("submitted_at", { ascending: false });

  if (state) query = query.eq("installer_state", state);
  if (region) query = query.eq("installer_region", region);
  if (project) query = project === "General Deployment" ? query.is("project_name", null) : query.eq("project_name", project);
  if (brand) query = query.eq("brand_name", brand);
  if (startDate) query = query.gte("installation_date", startDate);
  if (endDate) query = query.lte("installation_date", endDate);
  if (search) query = query.or(`installer_name.ilike.%${search}%,project_name.ilike.%${search}%,brand_name.ilike.%${search}%,salon_name.ilike.%${search}%,address.ilike.%${search}%,installer_region.ilike.%${search}%,installer_state.ilike.%${search}%,installer_lga.ilike.%${search}%,state_region.ilike.%${search}%,ocr_text.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = ((data ?? []) as Submission[]).map((item) => ({
    "Project Name": displayProjectName(item.project_name),
    "Brand Name": item.brand_name ?? "",
    "Salon/Store Name": item.salon_name ?? "",
    Address: item.address ?? "",
    "GPS Latitude": item.gps_latitude ?? "",
    "GPS Longitude": item.gps_longitude ?? "",
    "Installer Selected State": item.installer_state ?? "",
    "Installer Selected Region": item.installer_region ?? "",
    "Installer Selected LGA": item.installer_lga ?? "",
    "Installation Date": item.installation_date ?? item.submitted_at.slice(0, 10),
    "Installation Time": item.installation_time ?? "",
    "OCR Extracted Text": item.ocr_text ?? item.ai_raw_text ?? "",
    "Image URL": item.image_url,
    "OCR State/Region": item.state_region ?? "",
    "Created Timestamp": item.submitted_at
  }));

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  const headers = Object.keys(
    rows[0] ?? {
      "Project Name": "",
      "Brand Name": "",
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
      "OCR State/Region": "",
      "Created Timestamp": ""
    }
  );
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
    Title: "Client Deployment Installation Report",
    Company: process.env.COMPANY_NAME || "Deployment Reporting",
    CreatedDate: new Date()
  };
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer", cellStyles: true });
  const filename = `${isFiltered ? "filtered" : "full"}-client-deployment-report-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=${filename}`
    }
  });
}

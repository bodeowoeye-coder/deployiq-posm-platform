import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getCurrentUserContext } from "@/lib/auth";
import { loadClientSubmissionScope } from "@/lib/clientSubmissions";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import type { Submission } from "@/lib/types";
import { displayProjectName } from "@/lib/projects";
import { createReportId, reportFooter, reportSubtitle } from "@/lib/reportBranding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasValidGps(item: Submission) {
  if (item.gps_latitude === null || item.gps_longitude === null) return false;
  const lat = Number(item.gps_latitude);
  const lng = Number(item.gps_longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function addCoverSheet(workbook: XLSX.WorkBook, metadata: Array<[string, string]>) {
  const rows = [
    ["DeployIQ"],
    [reportSubtitle],
    [""],
    ["Client Deployment Report"],
    [""],
    ...metadata,
    [""],
    [reportFooter]
  ];
  const cover = XLSX.utils.aoa_to_sheet(rows);
  cover["!cols"] = [{ wch: 28 }, { wch: 52 }];
  cover["!freeze"] = { xSplit: 0, ySplit: 4 };
  ["A1", "A2", "A4"].forEach((address) => {
    const cell = cover[address];
    if (cell) {
      cell.s = {
        font: { bold: true, color: { rgb: address === "A1" ? "FF8A3D" : "0F172A" }, sz: address === "A1" ? 24 : 14 },
        alignment: { horizontal: "left" }
      };
    }
  });
  XLSX.utils.book_append_sheet(workbook, cover, "Cover");
}

function toExportRow(item: Submission) {
  const hasGps = hasValidGps(item);
  const gpsAccuracy = (item as Submission & { gps_accuracy?: number | string | null }).gps_accuracy;
  const googleMapsUrl = hasGps ? `https://www.google.com/maps?q=${item.gps_latitude},${item.gps_longitude}` : "";
  return {
    "Project Name": displayProjectName(item.project_name),
    "Brand Name": item.brand_name ?? "",
    Status: item.status,
    "Duplicate Status": item.duplicate_status ?? "Unique",
    "Rejection Reason": item.rejection_reason ?? "",
    "Admin Comment": item.approval_comments ?? "",
    "Salon/Store Name": item.salon_name ?? "",
    Address: item.address ?? "",
    "GPS Latitude": item.gps_latitude ?? "",
    "GPS Longitude": item.gps_longitude ?? "",
    "GPS Accuracy (meters)": gpsAccuracy ?? "",
    "GPS Captured": hasGps ? "Yes" : "No",
    "Captured Address": item.resolved_address ?? item.address ?? "",
    "GPS Status": hasGps ? "GPS Verified" : "GPS Missing",
    "Google Maps URL": googleMapsUrl,
    "Installer Selected State": item.installer_state ?? "",
    "Installer Selected Region": item.installer_region ?? "",
    "Installer Selected LGA": item.installer_lga ?? "",
    "Resolved Address": item.resolved_address ?? "",
    "Resolved Street": item.resolved_street ?? "",
    "Resolved LGA": item.resolved_lga ?? "",
    "Resolved City": item.resolved_city ?? "",
    "Resolved State": item.resolved_state ?? "",
    "Installation Date": item.installation_date ?? item.submitted_at.slice(0, 10),
    "Installation Time": item.installation_time ?? "",
    "OCR Extracted Text": item.ocr_text ?? item.ai_raw_text ?? "",
    "Image URL": item.image_url,
    "OCR State/Region": item.state_region ?? "",
    "Created Timestamp": item.submitted_at
  };
}

function styleSheet(sheet: XLSX.WorkSheet, rows: Array<Record<string, unknown>>) {
  const headers = Object.keys(
    rows[0] ?? {
      "Project Name": "",
      "Brand Name": "",
      Status: "",
      "Duplicate Status": "",
      "Rejection Reason": "",
      "Admin Comment": "",
      "Salon/Store Name": "",
      Address: "",
      "GPS Latitude": "",
      "GPS Longitude": "",
      "GPS Accuracy (meters)": "",
      "GPS Captured": "",
      "Captured Address": "",
      "GPS Status": "",
      "Google Maps URL": "",
      "Installer Selected State": "",
      "Installer Selected Region": "",
      "Installer Selected LGA": "",
      "Resolved Address": "",
      "Resolved Street": "",
      "Resolved LGA": "",
      "Resolved City": "",
      "Resolved State": "",
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
  const quickFilter = (searchParams.get("quickFilter")?.trim().toLowerCase() ?? "") as "" | "all" | "approved" | "pending" | "rejected" | "gps_verified" | "gps_missing";
  const supabase = createAdminSupabase();
  const scoped = await loadClientSubmissionScope(supabase, client, clientId);
  const searchText = search?.toLowerCase() ?? "";
  const data = scoped.submissions.filter((item) => {
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
  });

  let filteredData = data;
  if (quickFilter === "approved") filteredData = data.filter((item) => item.status === "Approved");
  if (quickFilter === "pending") filteredData = data.filter((item) => item.status === "Pending");
  if (quickFilter === "rejected") filteredData = data.filter((item) => item.status === "Rejected");
  if (quickFilter === "gps_verified") filteredData = data.filter((item) => hasValidGps(item));
  if (quickFilter === "gps_missing") filteredData = data.filter((item) => !hasValidGps(item));

  const projectTitle = project || "All projects";
  const reportId = createReportId(isFiltered ? "DPIQ-CLT-XLS-FLT" : "DPIQ-CLT-XLS");
  const generatedAt = new Date().toLocaleString("en-GB", { timeZone: "Africa/Lagos" });
  const baseSubmissions = ((filteredData ?? []) as Submission[]).filter((submission) => !submission.archived_at);
  const rows = baseSubmissions.map((item) => toExportRow(item));
  const rejectedRows = baseSubmissions.filter((item) => item.status === "Rejected").map((item) => toExportRow(item));

  const workbook = XLSX.utils.book_new();
  addCoverSheet(workbook, [
    ["Client", scoped.effectiveClient.name],
    ["Project", projectTitle],
    ["Generated Date", generatedAt],
    ["Report ID", reportId],
    ["Report Type", isFiltered ? "Filtered Client Excel Report" : "Full Client Excel Report"],
    ["Quick Filter", quickFilter || "all"]
  ]);
  const sheet = XLSX.utils.json_to_sheet(rows);
  styleSheet(sheet, rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Installations");
  const rejectedSheet = XLSX.utils.json_to_sheet(rejectedRows);
  styleSheet(rejectedSheet, rejectedRows);
  XLSX.utils.book_append_sheet(workbook, rejectedSheet, "Rejected Deployments");
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

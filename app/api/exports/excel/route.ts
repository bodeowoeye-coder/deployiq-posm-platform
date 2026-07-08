import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { accessControlErrorResponse, requireAdmin } from "@/lib/accessControl";
import type { Submission } from "@/lib/types";
import { campaignMatches, displayProjectName, normalizeProjectRecords, resolveSubmissionCampaignName } from "@/lib/projects";
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

function todayForFilename() {
  return new Date().toISOString().slice(0, 10);
}

function addCoverSheet(workbook: XLSX.WorkBook, metadata: Array<[string, string]>) {
  const rows = [
    ["DeployIQ"],
    [reportSubtitle],
    [""],
    ["Deployment Installation Report"],
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

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function matchesBrand(submission: Submission, selectedBrand: string) {
  const selected = normalizeText(selectedBrand);
  if (!selected) return true;

  const brandName = normalizeText(submission.brand_name);
  const selectedOutletBrandType = normalizeText(
    (submission as Submission & { selected_outlet_brand_type?: string | null }).selected_outlet_brand_type
  );

  return brandName === selected || selectedOutletBrandType === selected;
}

function displayFilterValue(value: string | null | undefined, fallback: string) {
  const text = (value ?? "").trim();
  return text || fallback;
}

function gpsFilterLabel(gps: string | null | undefined) {
  const value = (gps ?? "").trim().toLowerCase();
  if (value === "verified") return "GPS Verified";
  if (value === "missing") return "GPS Missing";
  return "All GPS";
}

function dateRangeLabel(startDate: string | null | undefined, endDate: string | null | undefined) {
  const start = (startDate ?? "").trim();
  const end = (endDate ?? "").trim();
  if (!start && !end) return "All dates";
  return `${start || "Any"} to ${end || "Any"}`;
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);

    const { searchParams } = new URL(request.url);
    const isFiltered = Array.from(searchParams.keys()).length > 0;
    const state = searchParams.get("state")?.trim();
    const region = searchParams.get("region")?.trim();
    const lga = searchParams.get("lga")?.trim();
    const installer = searchParams.get("installer")?.trim();
    const project = searchParams.get("project")?.trim();
    const clientName = searchParams.get("clientName")?.trim();
    const clientId = searchParams.get("clientId")?.trim();
    const projectId = searchParams.get("projectId")?.trim();
    const campaign = searchParams.get("campaign")?.trim();
    const brand = searchParams.get("brand")?.trim();
    const status = searchParams.get("status")?.trim();
    const gps = searchParams.get("gps")?.trim().toLowerCase();
    const startDate = searchParams.get("startDate")?.trim();
    const endDate = searchParams.get("endDate")?.trim();
    const search = searchParams.get("query")?.trim();
    const supabase = createAdminSupabase();

    let selectedProjectName: string | null = null;
    let selectedProjectCampaign: string | null = null;
    if (projectId) {
      const { data: scopedProject, error: projectScopeError } = await supabase
        .from("projects")
        .select("id, client_id, name, campaign")
        .eq("id", projectId)
        .maybeSingle();

      if (projectScopeError) {
        return NextResponse.json({ error: projectScopeError.message }, { status: 500 });
      }

      if (!scopedProject) {
        return NextResponse.json({ error: "Invalid project scope." }, { status: 400 });
      }

      if (clientId && scopedProject.client_id !== clientId) {
        return NextResponse.json({ error: "Project does not belong to the selected client scope." }, { status: 400 });
      }

      selectedProjectName = displayProjectName((scopedProject as { name?: string | null }).name);
      selectedProjectCampaign = typeof (scopedProject as { campaign?: string | null }).campaign === "string"
        ? ((scopedProject as { campaign?: string | null }).campaign ?? null)
        : null;
    }

    let selectedClientName = clientName || null;
    if (!selectedClientName && clientId) {
      const { data: scopedClient } = await supabase.from("clients").select("id, name").eq("id", clientId).maybeSingle();
      selectedClientName = typeof scopedClient?.name === "string" ? scopedClient.name : null;
    }

    let query = supabase.from("submissions").select("*").order("submitted_at", { ascending: false });

  if (clientId) query = query.eq("client_id", clientId);
  if (state) query = query.eq("installer_state", state);
  if (region) query = query.eq("installer_region", region);
  if (lga) query = query.ilike("installer_lga", `%${lga}%`);
  if (installer) query = query.ilike("installer_name", `%${installer}%`);
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

    const reportId = createReportId(isFiltered ? "DPIQ-XLS-FLT" : "DPIQ-XLS");
    const generatedAt = new Date().toLocaleString("en-GB", { timeZone: "Africa/Lagos" });
    let filteredSubmissions = ((data ?? []) as Submission[]).filter((submission) => !submission.archived_at);
    let normalizedProjects: ReturnType<typeof normalizeProjectRecords> = [];
    if (campaign || project) {
      let projectQuery = supabase.from("projects").select("id, name, campaign");
      if (clientId) projectQuery = projectQuery.eq("client_id", clientId);
      if (projectId) projectQuery = projectQuery.eq("id", projectId);
      const { data: projectRows } = await projectQuery;
      normalizedProjects = normalizeProjectRecords(projectRows ?? []);
    }

    if (projectId) {
      const normalizedSelectedProjectName = normalizeText(displayProjectName(selectedProjectName ?? project));
      filteredSubmissions = filteredSubmissions.filter((item) => {
        if ((item.project_id ?? "") === projectId) return true;
        if (item.project_id) return false;
        return normalizeText(displayProjectName(item.project_name)) === normalizedSelectedProjectName;
      });
    } else if (project) {
      filteredSubmissions = filteredSubmissions.filter((item) => {
        return normalizeText(displayProjectName(item.project_name)) === normalizeText(displayProjectName(project));
      });
    }

    if (brand) {
      filteredSubmissions = filteredSubmissions.filter((item) => matchesBrand(item, brand));
    }

    if (campaign) {
    filteredSubmissions = filteredSubmissions.filter((item) => campaignMatches(campaign, resolveSubmissionCampaignName(normalizedProjects, item)));
    }
    if (gps === "verified") filteredSubmissions = filteredSubmissions.filter((item) => hasValidGps(item));
    if (gps === "missing") filteredSubmissions = filteredSubmissions.filter((item) => !hasValidGps(item));

    const rows = filteredSubmissions.map((item) => ({
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
    "Resolved Address": item.resolved_address ?? "",
    "Resolved Street": item.resolved_street ?? "",
    "Resolved LGA": item.resolved_lga ?? "",
    "Resolved City": item.resolved_city ?? "",
    "Resolved State": item.resolved_state ?? "",
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
  const reportProjectName = selectedProjectName ?? (project ? displayProjectName(project) : "All projects");
  const reportCampaignName = campaign || selectedProjectCampaign || "All campaigns";
  const coverMetadata: Array<[string, string]> = [
    ["Client Name", displayFilterValue(selectedClientName, "All clients")],
    ["Project Name", displayFilterValue(reportProjectName, "All projects")],
    ["Campaign Name", displayFilterValue(reportCampaignName, "All campaigns")],
    ["Brand", displayFilterValue(brand, "All brands")],
    ["Status", displayFilterValue(status, "All statuses")],
    ["GPS Status", gpsFilterLabel(gps)],
    ["State", displayFilterValue(state, "All states")],
    ["Region", displayFilterValue(region, "All regions")],
    ["LGA", displayFilterValue(lga, "All LGAs")],
    ["Installer", displayFilterValue(installer, "All installers")],
    ["Date Range", dateRangeLabel(startDate, endDate)],
    ["Generated Date/Time", generatedAt],
    ["Report ID", reportId],
    ["Report Type", isFiltered ? "Filtered Excel Report" : "Full Excel Report"]
  ];

  if (search) {
    coverMetadata.splice(10, 0, ["Search", search]);
  }

  addCoverSheet(workbook, coverMetadata);
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
    "Resolved Address": "",
    "Resolved Street": "",
    "Resolved LGA": "",
    "Resolved City": "",
    "Resolved State": "",
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
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

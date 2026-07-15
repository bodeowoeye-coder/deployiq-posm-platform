import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import sharp from "sharp";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { accessControlErrorResponse, requireAdmin } from "@/lib/accessControl";
import { getBrandCounts, getInstallerCounts, getRegionCounts } from "@/lib/reporting";
import type { Installer, ManagedUser, Submission } from "@/lib/types";
import { campaignMatches, displayProjectName, normalizeProjectRecords, resolveSubmissionCampaignName } from "@/lib/projects";
import { createReportId, drawInstallationTableHeader, drawReportFooter, drawReportHeader } from "@/lib/reportBranding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pageWidth = 210;
const margin = 14;
const contentBottom = 280;
const rowLineHeight = 4.5;
const PREVIEW_BATCH_SIZE = 24;
const installationCardTextXOffset = 27;
const installationCardPhotoSize = 22;
const installationCardTopPadding = 5;
const installationCardBottomPadding = 5;
const installationCardTitleLineHeight = 4.2;
const installationCardBodyLineHeight = 4.1;
const installationCardBodyGap = 0.9;
const installationCardBottomGap = 4;
const installationCardFallbackHeight = 30;

function hasValidGps(item: Submission) {
  if (item.gps_latitude === null || item.gps_longitude === null) return false;
  const lat = Number(item.gps_latitude);
  const lng = Number(item.gps_longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function reportDate() {
  return new Date().toISOString().slice(0, 10);
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

type ImagePreview = { dataUrl: string; format: "JPEG" | "PNG" };

type ImagePreviewFailureReason =
  | "invalid_url"
  | "http_error"
  | "timeout"
  | "network_error"
  | "unsupported_content_type"
  | "decode_error";

type ImagePreviewResult = {
  preview: ImagePreview | null;
  reason: ImagePreviewFailureReason | "ok";
  statusCode?: number;
};

function sanitizeImageUrl(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "invalid-url";
  }
}

async function imageToDataUrl(url: string, timeoutMs = 1400): Promise<ImagePreviewResult> {
  if (!url) return { preview: null, reason: "invalid_url" };

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { preview: null, reason: "invalid_url" };
  }

  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(parsedUrl, { signal: controller.signal });
    if (!response.ok) {
      return {
        preview: null,
        reason: "http_error",
        statusCode: response.status
      };
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (contentType && !contentType.includes("image/") && !contentType.includes("application/octet-stream")) {
      return {
        preview: null,
        reason: "unsupported_content_type"
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const input = Buffer.from(arrayBuffer);
    const output = await sharp(input)
      .rotate()
      .resize({ width: 160, height: 160, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 45, mozjpeg: true })
      .toBuffer();

    const base64 = output.toString("base64");
    return {
      preview: { dataUrl: `data:image/jpeg;base64,${base64}`, format: "JPEG" },
      reason: "ok"
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { preview: null, reason: "timeout" };
    }

    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("sharp") || message.includes("unsupported") || message.includes("decode")) {
      return { preview: null, reason: "decode_error" };
    }

    return { preview: null, reason: "network_error" };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function shouldRetryPreview(result: ImagePreviewResult) {
  if (result.reason === "timeout" || result.reason === "network_error") return true;
  if (result.reason === "http_error" && typeof result.statusCode === "number" && result.statusCode >= 500) return true;
  return false;
}

async function buildImagePreviewMap(urls: string[], cache: Map<string, ImagePreview | null>) {
  const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));
  const previews = new Map<string, ImagePreview | null>();
  if (uniqueUrls.length === 0) return previews;

  const pendingUrls: string[] = [];
  uniqueUrls.forEach((url) => {
    if (cache.has(url)) {
      previews.set(url, cache.get(url) ?? null);
      return;
    }
    pendingUrls.push(url);
  });

  if (pendingUrls.length === 0) return previews;

  let nextIndex = 0;
  const workerCount = Math.min(6, pendingUrls.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < pendingUrls.length) {
      const index = nextIndex;
      nextIndex += 1;
      const url = pendingUrls[index];
      let result = await imageToDataUrl(url);

      if (shouldRetryPreview(result)) {
        result = await imageToDataUrl(url, 1400);
      }

      if (!result.preview) {
        console.warn("[exports-pdf] image preview unavailable", {
          reason: result.reason,
          statusCode: result.statusCode ?? null,
          imageUrl: sanitizeImageUrl(url)
        });
      }

      cache.set(url, result.preview);
      previews.set(url, result.preview);
    }
  });

  await Promise.all(workers);
  return previews;
}

function wrappedLines(doc: jsPDF, text: string, width: number) {
  return doc.splitTextToSize(text, width) as string[];
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
    let selectedProjectClientId: string | null = null;
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
      selectedProjectClientId = typeof scopedProject.client_id === "string" ? scopedProject.client_id : null;
      selectedProjectCampaign = typeof (scopedProject as { campaign?: string | null }).campaign === "string"
        ? ((scopedProject as { campaign?: string | null }).campaign ?? null)
        : null;
    }

    let selectedClientName = clientName || null;
    const effectiveClientId = clientId || selectedProjectClientId;
    if (!selectedClientName && effectiveClientId) {
      const { data: scopedClient } = await supabase.from("clients").select("id, name").eq("id", effectiveClientId).maybeSingle();
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

    let submissions = ((data ?? []) as Submission[]).filter((submission) => !submission.archived_at);
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
      submissions = submissions.filter((item) => {
        if ((item.project_id ?? "") === projectId) return true;
        if (item.project_id) return false;
        return normalizeText(displayProjectName(item.project_name)) === normalizedSelectedProjectName;
      });
    } else if (project) {
      submissions = submissions.filter((item) => {
        return normalizeText(displayProjectName(item.project_name)) === normalizeText(displayProjectName(project));
      });
    }

    if (brand) {
      submissions = submissions.filter((item) => matchesBrand(item, brand));
    }

    if (campaign) {
      submissions = submissions.filter((item) => campaignMatches(campaign, resolveSubmissionCampaignName(normalizedProjects, item)));
    }
    if (gps === "verified") submissions = submissions.filter((item) => hasValidGps(item));
    if (gps === "missing") submissions = submissions.filter((item) => !hasValidGps(item));
    const reportId = createReportId(isFiltered ? "DPIQ-FLT" : "DPIQ-FULL");
    const installerUserIds = Array.from(new Set(submissions.map((item) => item.installer_user_id).filter((id): id is string => Boolean(id))));
    const [{ data: installers }, { data: profiles }] =
      installerUserIds.length > 0
        ? await Promise.all([
            supabase.from("installers").select("*").in("user_id", installerUserIds),
            supabase.schema("public").from("user_profiles").select("user_id, full_name, email, phone, agency_id, assigned_project_ids, assigned_regions, assigned_states, status, created_at, updated_at").in("user_id", installerUserIds)
          ])
        : [{ data: [] }, { data: [] }];
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const generatedAt = new Date().toLocaleString();
    const regionCounts = getRegionCounts(submissions);
    const brandCounts = getBrandCounts(submissions);
    const installerCounts = getInstallerCounts(submissions, {
    installers: (installers ?? []) as Installer[],
    users: ((profiles ?? []) as Array<{
      user_id: string;
      full_name: string | null;
      email: string | null;
      phone: string | null;
      agency_id: string | null;
      assigned_project_ids: string[] | null;
      assigned_regions: string[] | null;
      assigned_states: string[] | null;
      status: ManagedUser["status"];
      created_at: string | null;
    }>).map((profile) => ({
      user_id: profile.user_id,
      full_name: profile.full_name ?? "",
      email: profile.email ?? "",
      phone: profile.phone,
      role: "installer",
      client_id: null,
      agency_id: profile.agency_id,
      assigned_project_ids: profile.assigned_project_ids ?? [],
      assigned_regions: profile.assigned_regions ?? [],
      assigned_states: profile.assigned_states ?? [],
      status: profile.status,
      created_at: profile.created_at ?? "",
      last_sign_in_at: null
    }))
  });
    const approvedCount = submissions.filter((item) => item.status === "Approved").length;
    const pendingCount = submissions.filter((item) => item.status === "Pending").length;
    const rejectedCount = submissions.filter((item) => item.status === "Rejected").length;

    const reportProjectName = selectedProjectName ?? (project ? displayProjectName(project) : "All projects");
    const reportCampaignName = campaign || selectedProjectCampaign || "All campaigns";
    const reportMetadata: Array<[string, string]> = [
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
      ["Report ID", reportId]
    ];

    if (search) {
      reportMetadata.splice(10, 0, ["Search", search]);
    }

    drawReportHeader(doc, pageWidth, "Deployment Installation Report", reportMetadata);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text("Summary charts are shown on the next page.", margin, 116);
    doc.setTextColor(15, 23, 42);

    doc.addPage();

    drawReportHeader(doc, pageWidth, "Deployment Summary", [
      ["Client Name", displayFilterValue(selectedClientName, "All clients")],
      ["Project Name", displayFilterValue(reportProjectName, "All projects")],
      ["Generated Date/Time", generatedAt],
      ["Report ID", reportId]
    ]);

    doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, 64, pageWidth - margin * 2, 28, 2, 2, "F");
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
	    doc.text(String(label), x, 74);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
	    doc.text(String(value), x, 85);
    doc.setFont("helvetica", "normal");
  });

  drawBars(doc, "Regional breakdown", regionCounts.map((item) => [item.region, item.count]), margin, 106, 82);
  drawBars(doc, "Brand breakdown", brandCounts.map((item) => [item.brand, item.count]), 112, 106, 82);
  drawBars(doc, "Installer performance", installerCounts.map((item) => [item.installer, item.count]), margin, 158, 176);

  doc.addPage();
  const installationTableMetadata: Array<[string, string]> = [
    ["Client Name", displayFilterValue(selectedClientName, "All clients")],
    ["Project Name", displayFilterValue(reportProjectName, "All projects")],
    ["Generated Date/Time", generatedAt],
    ["Report ID", reportId]
  ];

  const renderInstallationTableHeader = () =>
    drawInstallationTableHeader(doc, pageWidth, "Installation Table", installationTableMetadata);

  const previewCache = new Map<string, ImagePreview | null>();
  let previewByUrl = new Map<string, ImagePreview | null>();
  let y = renderInstallationTableHeader().contentTopY;
  for (const [index, item] of submissions.entries()) {
    if (index % PREVIEW_BATCH_SIZE === 0) {
      const batchUrls = submissions
        .slice(index, index + PREVIEW_BATCH_SIZE)
        .map((submission) => submission.image_url);
      previewByUrl = await buildImagePreviewMap(batchUrls, previewCache);
    }

    const textX = margin + installationCardTextXOffset;
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
    const titleHeight = titleLines.length * installationCardTitleLineHeight;
    const bodyHeight = rows.reduce((total, lines) => total + lines.length * installationCardBodyLineHeight + installationCardBodyGap, 0);
    const textBlockHeight = installationCardTopPadding + titleHeight + 0.8 + bodyHeight + installationCardBottomPadding;
    const photoBlockHeight = installationCardPhotoSize + installationCardTopPadding + installationCardBottomPadding;
    const cardHeight = Math.max(installationCardFallbackHeight, Math.max(textBlockHeight, photoBlockHeight));

    if (y + cardHeight > contentBottom) {
      doc.addPage();
      y = renderInstallationTableHeader().contentTopY;
    }

    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, pageWidth - margin * 2, cardHeight, 2, 2);

    const preview = previewByUrl.get(item.image_url) ?? previewCache.get(item.image_url) ?? null;
    if (preview) {
      try {
        doc.addImage(preview.dataUrl, preview.format, margin + 2, y + 4, installationCardPhotoSize, installationCardPhotoSize);
      } catch {
        doc.setFontSize(7);
        doc.text("Preview unavailable", margin + 3, y + 16);
      }
    } else {
      doc.setFontSize(7);
      doc.text("Preview unavailable", margin + 3, y + 16);
      console.warn("[exports-pdf] submission preview unavailable", {
        submissionId: item.id,
        imageUrl: sanitizeImageUrl(item.image_url),
        reason: "preview_missing_after_fetch"
      });
    }

    let textY = y + installationCardTopPadding;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(titleLines, textX, textY);
    textY += titleLines.length * installationCardTitleLineHeight + 0.8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    rows.forEach((lines) => {
      doc.text(lines, textX, textY);
      textY += lines.length * installationCardBodyLineHeight + installationCardBodyGap;
    });

    y += cardHeight + installationCardBottomGap;
  }

  drawReportFooter(doc, pageWidth, 297, margin);

    const buffer = Buffer.from(doc.output("arraybuffer"));
    const filename = `${isFiltered ? "filtered" : "full"}-deployment-report-${reportDate()}.pdf`;

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

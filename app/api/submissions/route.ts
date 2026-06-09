import { NextResponse } from "next/server";
import { extractBoardTextFromImage } from "@/lib/ai";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { STATUSES } from "@/lib/brands";
import { getCurrentUserContext } from "@/lib/auth";
import { reviewBrandMatch } from "@/lib/brandReview";
import { scoreBrandVerification } from "@/lib/confidence";
import { detectDuplicate, fingerprintImage } from "@/lib/duplicates";
import { buildAlertEvent } from "@/lib/alerts";
import { getRegionForState, NIGERIA_STATES } from "@/lib/geography";
import { DEFAULT_PROJECT_NAME } from "@/lib/projects";
import { reverseGeocode } from "@/lib/reverseGeocoding";
import type { Submission } from "@/lib/types";

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "";
if (!STORAGE_BUCKET) {
  throw new Error("Missing SUPABASE_STORAGE_BUCKET environment variable.");
}

export const runtime = "nodejs";

const ACTIVE_OUTLET_DUPLICATE_STATUSES = ["Submitted", "submitted", "Pending", "pending", "Approved", "approved"];
const OUTLET_DUPLICATE_MESSAGE = "This approved outlet has already been submitted for this project. Please select another outlet.";

function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function timingMs(start: number) {
  return Math.round((nowMs() - start) * 10) / 10;
}

function cleanString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function isOptionalSubmissionColumnError(error: { message?: string; code?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "PGRST204" ||
    error?.code === "42703" ||
    message.includes("local_submission_id") ||
    message.includes("installer_email") ||
    message.includes("brand_id") ||
    message.includes("resolved_neighbourhood") ||
    message.includes("resolved_country") ||
    message.includes("selected_outlet") ||
    message.includes("outlet_match")
  );
}

function stripOptionalSubmissionColumns(payload: Record<string, unknown>) {
  const fallbackPayload = { ...payload };
  delete fallbackPayload.local_submission_id;
  delete fallbackPayload.installer_email;
  delete fallbackPayload.brand_id;
  delete fallbackPayload.resolved_neighbourhood;
  delete fallbackPayload.resolved_country;
  delete fallbackPayload.selected_outlet_id;
  delete fallbackPayload.selected_outlet_code;
  delete fallbackPayload.selected_outlet_name;
  delete fallbackPayload.selected_outlet_address;
  delete fallbackPayload.selected_outlet_brand_type;
  delete fallbackPayload.selected_outlet_state;
  delete fallbackPayload.outlet_match_status;
  delete fallbackPayload.outlet_match_notes;
  return fallbackPayload;
}

function normalizeMatchText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulTokens(value: string | null | undefined) {
  return normalizeMatchText(value)
    .split(" ")
    .filter((token) => token.length >= 3);
}

function hasPartialMatch(source: string, value: string | null | undefined) {
  const normalizedValue = normalizeMatchText(value);
  if (!source || !normalizedValue) return false;
  if (source.includes(normalizedValue) || normalizedValue.includes(source)) return true;
  const tokens = meaningfulTokens(value);
  if (tokens.length === 0) return false;
  const matched = tokens.filter((token) => source.includes(token)).length;
  return matched >= Math.min(2, tokens.length);
}

function reviewOutletMatch({
  visibleText,
  outletName,
  outletAddress,
  outletCode
}: {
  visibleText: string | null;
  outletName: string | null;
  outletAddress: string | null;
  outletCode: string | null;
}): { status: "matched" | "warning" | "not_checked"; notes: string } {
  if (!outletName && !outletAddress && !outletCode) {
    return {
      status: "not_checked",
      notes: "No approved outlet record was selected."
    };
  }

  const normalizedText = normalizeMatchText(visibleText);
  if (!normalizedText) {
    return {
      status: "warning",
      notes: "OCR did not detect enough readable text to confirm this outlet."
    };
  }

  const nameMatched = hasPartialMatch(normalizedText, outletName);
  const addressMatched = hasPartialMatch(normalizedText, outletAddress);
  const codeMatched = hasPartialMatch(normalizedText, outletCode);

  if (nameMatched || addressMatched || codeMatched) {
    return {
      status: "matched",
      notes: "Outlet match confirmed from detected board text."
    };
  }

  return {
    status: "warning",
    notes: "The uploaded board photo may not match the selected outlet. Please confirm the outlet name and address before submitting."
  };
}

async function findActiveOutletSubmission({
  supabase,
  projectId,
  selectedOutletId,
  outletCode
}: {
  supabase: ReturnType<typeof createAdminSupabase>;
  projectId: string | null | undefined;
  selectedOutletId: string;
  outletCode: string | null | undefined;
}) {
  if (!projectId || (!selectedOutletId && !outletCode)) return { duplicate: null, error: null };

  const selectFields = "id,status,selected_outlet_id,selected_outlet_code";
  const queryBase = () =>
    supabase
      .from("submissions")
      .select(selectFields)
      .eq("project_id", projectId)
      .in("status", ACTIVE_OUTLET_DUPLICATE_STATUSES)
      .limit(1);

  if (selectedOutletId) {
    const { data, error } = await queryBase().eq("selected_outlet_id", selectedOutletId);
    if (error) return { duplicate: null, error };
    if (data?.[0]) return { duplicate: data[0], error: null };
  }

  const normalizedOutletCode = (outletCode ?? "").trim();
  if (normalizedOutletCode) {
    const { data, error } = await queryBase().ilike("selected_outlet_code", normalizedOutletCode);
    if (error) return { duplicate: null, error };
    if (data?.[0]) return { duplicate: data[0], error: null };
  }

  return { duplicate: null, error: null };
}

function metadataFullName(user: { user_metadata?: Record<string, unknown> }) {
  return typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
}

function getLagosInstallationParts(value: string) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23"
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((current, part) => {
      if (part.type !== "literal") current[part.type] = part.value;
      return current;
    }, {});

  return {
    installationDate: `${parts.year}-${parts.month}-${parts.day}`,
    installationTime: `${parts.hour}:${parts.minute}:${parts.second}`
  };
}

export async function POST(request: Request) {
  const totalStart = nowMs();
  try {
    const authStart = nowMs();
    const context = await getCurrentUserContext();
    console.info("[submit-server-timing]", { stage: "auth-context", durationMs: timingMs(authStart), role: context?.role.role ?? null });
    if (!context || !["admin", "installer"].includes(context.role.role)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const formDataStart = nowMs();
    const formData = await request.formData();
    console.info("[submit-server-timing]", { stage: "form-data-parse", durationMs: timingMs(formDataStart) });
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json({ error: "Please upload an image." }, { status: 400 });
    }

    const submittedInstallerName = cleanString(formData.get("installerName"));
    const localSubmissionId = cleanString(formData.get("localSubmissionId"));
    const projectName = cleanString(formData.get("projectName")) || DEFAULT_PROJECT_NAME;
    const submittedBrandName = cleanString(formData.get("brandName"));
    const installerState = cleanString(formData.get("installerState"));
    const submittedInstallerRegion = cleanString(formData.get("installerRegion"));
    const installerLga = cleanString(formData.get("installerLga"));
    const submittedResolvedAddress = cleanString(formData.get("resolvedAddress"));
    const manualLocationDescription = cleanString(formData.get("manualLocationDescription"));
    const manualLandmark = cleanString(formData.get("manualLandmark"));
    const selectedLocationId = cleanString(formData.get("selectedLocationId"));
    const selectedOutletName = cleanString(formData.get("selectedOutletName"));
    const selectedOutletAddress = cleanString(formData.get("selectedOutletAddress"));
    const selectedOutletBrandType = cleanString(formData.get("selectedOutletBrandType"));
    const selectedOutletCode = cleanString(formData.get("selectedOutletCode"));
    const submitAnyway = cleanString(formData.get("submitAnyway")) === "true";
    const latitude = Number(cleanString(formData.get("latitude"))) || null;
    const longitude = Number(cleanString(formData.get("longitude"))) || null;
    const capturedAt = cleanString(formData.get("capturedAt")) || new Date().toISOString();

    if (!(NIGERIA_STATES as readonly string[]).includes(installerState)) {
      return NextResponse.json({ error: "Please select a valid state." }, { status: 400 });
    }

    const installerRegion = getRegionForState(installerState);
    if (!installerRegion || (submittedInstallerRegion && submittedInstallerRegion !== installerRegion)) {
      return NextResponse.json({ error: "Could not derive a valid region from the selected state." }, { status: 400 });
    }
    const capturedDate = new Date(capturedAt);
    const capturedIso = Number.isNaN(capturedDate.valueOf()) ? new Date().toISOString() : capturedDate.toISOString();
    const installationParts = getLagosInstallationParts(capturedIso);
    const supabase = createAdminSupabase();
    const { data: selectedLocation } = selectedLocationId
      ? await supabase
          .from("deployment_locations")
          .select("state, outlet_name, owner_name, address, brand_type, outlet_code")
          .eq("id", selectedLocationId)
          .maybeSingle()
      : { data: null };
    const outletName = selectedLocation?.outlet_name ?? selectedOutletName;
    const outletAddress = selectedLocation?.address ?? selectedOutletAddress;
    const outletBrandType = selectedLocation?.brand_type ?? selectedOutletBrandType;
    const outletCode = selectedLocation?.outlet_code ?? selectedOutletCode;
    const brandName = submittedBrandName || outletBrandType;
    const { data: userProfile, error: userProfileError } = await supabase
      .schema("public")
      .from("user_profiles")
      .select("full_name, email, assigned_regions, assigned_states, status")
      .eq("user_id", context.user.id)
      .maybeSingle();

    if (userProfileError) {
      console.warn("[submissions] could not resolve installer profile", { message: userProfileError.message });
    }

    if (context.role.role === "installer" && userProfile?.status && userProfile.status !== "Active") {
      return NextResponse.json({ error: "This installer account is not active." }, { status: 403 });
    }

    const canonicalInstallerEmail = userProfile?.email ?? context.user.email ?? null;
    const canonicalInstallerName =
      (typeof userProfile?.full_name === "string" && userProfile.full_name.trim()) ||
      metadataFullName(context.user) ||
      canonicalInstallerEmail ||
      submittedInstallerName ||
      "Installer";

    if (context.role.role === "installer") {
      const { data: existingInstaller } = await supabase.from("installers").select("id").eq("user_id", context.user.id).maybeSingle();
      const installerProfilePayload = {
        user_id: context.user.id,
        installer_name: canonicalInstallerName,
        assigned_regions: userProfile?.assigned_regions ?? [],
        assigned_states: userProfile?.assigned_states ?? [],
        access_status: "Active",
        status: "Active"
      };
      if (existingInstaller?.id) {
        await supabase.from("installers").update(installerProfilePayload).eq("id", existingInstaller.id);
      } else {
        const { error: installerInsertError } = await supabase.from("installers").insert(installerProfilePayload);
        if (installerInsertError) {
          console.warn("[submissions] installer profile sync skipped", { message: installerInsertError.message });
        }
      }
    }

    if (localSubmissionId) {
      const { data: existingSubmission, error: existingSubmissionError } = await supabase
        .from("submissions")
        .select("*")
        .eq("installer_user_id", context.user.id)
        .eq("local_submission_id", localSubmissionId)
        .maybeSingle();

      if (existingSubmission) {
        return NextResponse.json({ submission: existingSubmission, alreadySynced: true });
      }

      if (existingSubmissionError && !isOptionalSubmissionColumnError(existingSubmissionError)) {
        return NextResponse.json({ error: existingSubmissionError.message }, { status: 500 });
      }
    }

    const assignmentStart = nowMs();
    const { data: matchingBrand } = brandName
      ? await supabase.from("brands").select("id, client_id, brand_name").ilike("brand_name", brandName).maybeSingle()
      : { data: null };
    const { data: projectByName } = projectName
      ? await supabase
          .from("projects")
          .select("id, client_id, project_name")
          .eq("project_name", projectName)
          .maybeSingle()
      : { data: null };
    const { data: godrejClient } =
      !projectByName?.client_id && !matchingBrand?.client_id && projectName.toLowerCase().includes("godrej")
        ? await supabase.from("clients").select("id, name").eq("name", "Godrej Nigeria Ltd").maybeSingle()
        : { data: null };
    const assignmentClientId = projectByName?.client_id ?? matchingBrand?.client_id ?? godrejClient?.id ?? null;
    const { data: matchingProject } = assignmentClientId
      ? projectByName?.client_id === assignmentClientId
        ? { data: projectByName }
        : await supabase
            .from("projects")
            .select("id, project_name")
            .eq("client_id", assignmentClientId)
            .eq("project_name", projectName)
            .maybeSingle()
      : { data: null };
    const resolvedBrandName = matchingBrand?.brand_name ?? (brandName || null);
    console.info("[submit-server-timing]", {
      stage: "project-assignment",
      projectId: matchingProject?.id ?? null,
      clientId: assignmentClientId,
      durationMs: timingMs(assignmentStart)
    });

    if (selectedLocationId || outletCode) {
      const outletDuplicateStart = nowMs();
      const { duplicate: activeOutletSubmission, error: outletDuplicateError } = await findActiveOutletSubmission({
        supabase,
        projectId: matchingProject?.id,
        selectedOutletId: selectedLocationId,
        outletCode
      });
      console.info("[submit-server-timing]", {
        stage: "outlet-duplicate-check",
        checked: Boolean(matchingProject?.id && (selectedLocationId || outletCode)),
        duplicateFound: Boolean(activeOutletSubmission),
        durationMs: timingMs(outletDuplicateStart)
      });

      if (outletDuplicateError && !isOptionalSubmissionColumnError(outletDuplicateError)) {
        return NextResponse.json({ error: outletDuplicateError.message }, { status: 500 });
      }

      if (activeOutletSubmission) {
        return NextResponse.json({ error: OUTLET_DUPLICATE_MESSAGE }, { status: 409 });
      }
    }

    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const imageFingerprint = fingerprintImage(imageBuffer);
    const fileName = `${Date.now()}-${crypto.randomUUID()}.jpg`;
    const path = `installations/${fileName}`;

    const storageStart = nowMs();
    const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, image, {
      contentType: image.type || "image/jpeg",
      upsert: false
    });
    console.info("[submit-server-timing]", { stage: "storage-upload", durationMs: timingMs(storageStart), imageSize: image.size, imageType: image.type || "image/jpeg" });

    if (uploadError) {
      console.info("[submit-server-timing]", { stage: "submit-total", result: "storage-error", durationMs: timingMs(totalStart), message: uploadError.message });
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const {
      data: { publicUrl }
    } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);

    const ocrStart = nowMs();
    const extraction = await extractBoardTextFromImage(publicUrl);
    console.info("[submit-server-timing]", { stage: "ocr-vision", confidence: extraction.confidence, durationMs: timingMs(ocrStart) });
    const brandLoadStart = nowMs();
    const { data: allBrands } = await supabase.from("brands").select("brand_name");
    const brandReview = reviewBrandMatch(resolvedBrandName, extraction, allBrands ?? []);
    const confidence = scoreBrandVerification(extraction.confidence, brandReview.brandMatchStatus);
    const outletReview = reviewOutletMatch({
      visibleText: extraction.visibleText || null,
      outletName,
      outletAddress,
      outletCode
    });
    console.info("[submit-server-timing]", {
      stage: "brand-validation",
      selectedBrand: resolvedBrandName,
      detectedBrand: brandReview.detectedBrandName,
      matchStatus: brandReview.brandMatchStatus,
      confidenceLevel: confidence.level,
      durationMs: timingMs(brandLoadStart)
    });

    const requiresBrandReviewConfirmation =
      (brandReview.brandMatchStatus === "Mismatch" || brandReview.brandMatchStatus === "Uncertain") && !submitAnyway;

    if (requiresBrandReviewConfirmation) {
      await supabase.storage.from(STORAGE_BUCKET).remove([path]);
      console.info("[submit-server-timing]", { stage: "submit-total", result: "brand-review-confirmation", durationMs: timingMs(totalStart) });
      return NextResponse.json(
        {
          requiresConfirmation: true,
          selectedBrand: resolvedBrandName,
          detectedBrand: brandReview.detectedBrandName,
          confidence: confidence.level,
          mismatchReason: brandReview.mismatchReason,
          aiReviewNote: brandReview.aiReviewNote
        },
        { status: 409 }
      );
    }

    if (selectedLocationId && outletReview.status === "warning" && !submitAnyway) {
      await supabase.storage.from(STORAGE_BUCKET).remove([path]);
      console.info("[submit-server-timing]", { stage: "submit-total", result: "outlet-review-confirmation", durationMs: timingMs(totalStart) });
      return NextResponse.json(
        {
          requiresOutletConfirmation: true,
          outletMatchStatus: outletReview.status,
          outletMatchNotes: outletReview.notes,
          selectedOutletName: outletName,
          selectedOutletAddress: outletAddress,
          selectedOutletCode: outletCode
        },
        { status: 409 }
      );
    }

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const duplicateStart = nowMs();
    const { data: recentData } = await supabase
      .from("submissions")
      .select("*")
      .gte("submitted_at", cutoff)
      .order("submitted_at", { ascending: false })
      .limit(150);
    const duplicateReview = detectDuplicate(
      {
        installerName: canonicalInstallerName,
        brandName: resolvedBrandName,
        latitude,
        longitude,
        ocrText: extraction.visibleText || null,
        imageFingerprint
      },
      (recentData ?? []) as Submission[]
    );
    console.info("[submit-server-timing]", { stage: "duplicate-detection", status: duplicateReview.status, durationMs: timingMs(duplicateStart) });
    const autoApproved = brandReview.brandMatchStatus === "Matched" && confidence.level === "High";
    const status =
      brandReview.brandMatchStatus === "Mismatch"
        ? "Flagged"
        : autoApproved
          ? "Approved"
          : "Pending";
    const aiReviewNote = [
      brandReview.aiReviewNote,
      autoApproved ? "Automatically approved because selected and detected brands matched with high confidence." : null
    ]
      .filter(Boolean)
      .join(" ");
    const reverseGeocodeStart = nowMs();
    const resolvedLocation = await reverseGeocode(latitude, longitude);
    console.info("[submit-server-timing]", { stage: "reverse-geocoding", hasCoordinates: Boolean(latitude && longitude), resolved: Boolean(resolvedLocation.resolvedAddress), durationMs: timingMs(reverseGeocodeStart) });
    const manualFallbackAddress = [
      manualLocationDescription,
      manualLandmark ? `Landmark: ${manualLandmark}` : "",
      installerLga ? `LGA: ${installerLga}` : ""
    ]
      .filter(Boolean)
      .join(" | ");
    const finalResolvedAddress = resolvedLocation.resolvedAddress || submittedResolvedAddress || manualFallbackAddress || null;

    const submissionPayload: Record<string, unknown> = {
        local_submission_id: localSubmissionId || null,
        installer_name: canonicalInstallerName,
        installer_email: canonicalInstallerEmail,
        installer_user_id: context.user.id,
        project_id: matchingProject?.id ?? null,
        brand_id: matchingBrand?.id ?? null,
        project_name: projectName,
        client_id: assignmentClientId,
        brand_name: resolvedBrandName,
        detected_brand_name: brandReview.detectedBrandName,
        brand_match_status: brandReview.brandMatchStatus,
        mismatch_reason: brandReview.mismatchReason,
        ai_review_note: aiReviewNote,
        ai_confidence_score: confidence.score,
        ai_confidence_level: confidence.level,
        auto_approved: autoApproved,
        duplicate_status: duplicateReview.status,
        duplicate_reason: duplicateReview.reason,
        image_fingerprint: imageFingerprint,
        selected_outlet_id: selectedLocationId || null,
        selected_outlet_code: outletCode || null,
        selected_outlet_name: outletName || null,
        selected_outlet_address: outletAddress || null,
        selected_outlet_brand_type: outletBrandType || null,
        selected_outlet_state: selectedLocation?.state ?? installerState,
        outlet_match_status: outletReview.status,
        outlet_match_notes: outletReview.notes,
        salon_name: extraction.salonName || outletName || null,
        address: extraction.address || finalResolvedAddress,
        phone: extraction.phone || null,
        gps_latitude: latitude,
        gps_longitude: longitude,
        installer_state: installerState,
        installer_region: installerRegion,
        installer_lga: installerLga || null,
        resolved_address: finalResolvedAddress,
        resolved_street: resolvedLocation.resolvedStreet || manualLocationDescription || null,
        resolved_neighbourhood: resolvedLocation.resolvedNeighbourhood || manualLandmark || null,
        resolved_lga: resolvedLocation.resolvedLga || installerLga || null,
        resolved_city: resolvedLocation.resolvedCity,
        resolved_state: resolvedLocation.resolvedState || installerState,
        resolved_country: resolvedLocation.resolvedCountry,
        deployment_stage_code: autoApproved ? "approved" : "installed",
        state_region: extraction.stateRegion || null,
        status,
        image_url: publicUrl,
        image_path: path,
        ocr_text: extraction.visibleText || null,
        ocr_salon_name: extraction.salonName || null,
        ocr_address: extraction.address || null,
        ocr_brand_name: extraction.brandName || null,
        ocr_phone: extraction.phone || null,
        ocr_raw_text: extraction.visibleText || null,
        ocr_confidence: extraction.confidence,
        ocr_note: extraction.note || null,
        ai_raw_text: extraction.visibleText || null,
        captured_at: capturedIso,
        installation_date: installationParts.installationDate,
        installation_time: installationParts.installationTime
      };

    const insertStart = nowMs();
    let { data, error } = await supabase
      .from("submissions")
      .insert(submissionPayload)
      .select()
      .single();
    console.info("[submit-server-timing]", { stage: "database-insert", usedFallbackPayload: false, durationMs: timingMs(insertStart), ok: !error });

    if (error && isOptionalSubmissionColumnError(error)) {
      const fallbackInsertStart = nowMs();
      const fallbackPayload = stripOptionalSubmissionColumns(submissionPayload);
      const fallbackResult = await supabase
        .from("submissions")
        .insert(fallbackPayload)
        .select()
        .single();
      data = fallbackResult.data;
      error = fallbackResult.error;
      console.info("[submit-server-timing]", { stage: "database-insert", usedFallbackPayload: true, durationMs: timingMs(fallbackInsertStart), ok: !error });
    }

    if (error) {
      if (localSubmissionId && error.code === "23505") {
        const { data: existingSubmission } = await supabase
          .from("submissions")
          .select("*")
          .eq("installer_user_id", context.user.id)
          .eq("local_submission_id", localSubmissionId)
          .maybeSingle();
        if (existingSubmission) {
          await supabase.storage.from(STORAGE_BUCKET).remove([path]);
          console.info("[submit-server-timing]", { stage: "submit-total", result: "already-synced", durationMs: timingMs(totalStart) });
          return NextResponse.json({ submission: existingSubmission, alreadySynced: true });
        }
      }
      if (error.code === "23505" && error.message.toLowerCase().includes("outlet")) {
        await supabase.storage.from(STORAGE_BUCKET).remove([path]);
        console.info("[submit-server-timing]", { stage: "submit-total", result: "outlet-duplicate", durationMs: timingMs(totalStart) });
        return NextResponse.json({ error: OUTLET_DUPLICATE_MESSAGE }, { status: 409 });
      }
      await supabase.storage.from(STORAGE_BUCKET).remove([path]);
      console.info("[submit-server-timing]", { stage: "submit-total", result: "database-error", durationMs: timingMs(totalStart), message: error.message });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const alertEvents = [];
    if (brandReview.brandMatchStatus === "Mismatch") {
      alertEvents.push(
        buildAlertEvent({
          alertType: "brand_mismatch",
          submission: data as Submission,
          severity: "high",
          message: brandReview.mismatchReason || "Selected and detected brands differ."
        })
      );
    }
    if (duplicateReview.status !== "Unique") {
      alertEvents.push(
        buildAlertEvent({
          alertType: "duplicate_suspected",
          submission: data as Submission,
          severity: duplicateReview.status === "Duplicate" ? "high" : "medium",
          message: duplicateReview.reason || "Potential duplicate detected."
        })
      );
    }
    if (context.user.id) {
      const { data: recentInstallerRows } = await supabase
        .from("submissions")
        .select("brand_match_status,status")
        .eq("installer_user_id", context.user.id)
        .gte("submitted_at", cutoff);
      const riskyCount = (recentInstallerRows ?? []).filter(
        (item) => item.brand_match_status === "Mismatch" || item.status === "Flagged"
      ).length;
      if (riskyCount >= 3) {
        alertEvents.push(
          buildAlertEvent({
            alertType: "high_risk_installer",
            submission: data as Submission,
            severity: "high",
            message: `Installer has ${riskyCount} recent flagged or mismatched submissions.`
          })
        );
      }
    }
    if (alertEvents.length > 0) {
      await supabase.from("alert_events").insert(alertEvents);
    }

    console.info("[submit-server-timing]", { stage: "submit-total", result: "success", durationMs: timingMs(totalStart) });
    return NextResponse.json({ submission: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    console.info("[submit-server-timing]", { stage: "submit-total", result: "error", durationMs: timingMs(totalStart), message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getCurrentUserContext();
    if (!context || context.role.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    const brandName = typeof body.brandName === "string" ? body.brandName.trim() : "";
    const status = typeof body.status === "string" ? body.status.trim() : "";
    const salonName = typeof body.salonName === "string" ? body.salonName.trim() : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const approvalComments = typeof body.approvalComments === "string" ? body.approvalComments.trim() : "";
    const rejectionReason = typeof body.rejectionReason === "string" ? body.rejectionReason.trim() : "";
    const deploymentStageCode = typeof body.deploymentStageCode === "string" ? body.deploymentStageCode.trim() : "";

    if (!id) {
      return NextResponse.json({ error: "Missing submission id." }, { status: 400 });
    }

    const updates: Record<string, string | null> = {};
    if (brandName) {
      const supabase = createAdminSupabase();
      const { data: matchingBrand } = await supabase.from("brands").select("client_id, brand_name").eq("brand_name", brandName).maybeSingle();
      if (!matchingBrand) {
        return NextResponse.json({ error: "Unsupported brand." }, { status: 400 });
      }
      updates.brand_name = matchingBrand.brand_name;
      updates.client_id = matchingBrand?.client_id ?? null;
    }

    if (status) {
      if (!(STATUSES as readonly string[]).includes(status)) {
        return NextResponse.json({ error: "Unsupported status." }, { status: 400 });
      }
      updates.status = status;
      updates.reviewed_by = context.user.id;
      updates.reviewed_at = new Date().toISOString();
    }

    if (salonName) updates.salon_name = salonName;
    if (address) updates.address = address;
    if (phone) updates.phone = phone;
    if (approvalComments) updates.approval_comments = approvalComments;
    if (rejectionReason) updates.rejection_reason = rejectionReason;
    if (deploymentStageCode) {
      const validStages = ["production", "warehouse", "in_transit", "installed", "approved"];
      if (!validStages.includes(deploymentStageCode)) {
        return NextResponse.json({ error: "Unsupported deployment stage." }, { status: 400 });
      }
      updates.deployment_stage_code = deploymentStageCode;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No changes supplied." }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    const { data: existing } = await supabase.from("submissions").select("status").eq("id", id).maybeSingle();
    const { data, error } = await supabase.from("submissions").update(updates).eq("id", id).select().single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (status && existing?.status !== status) {
      await supabase.from("submission_status_history").insert({
        submission_id: id,
        previous_status: existing?.status ?? null,
        new_status: status,
        changed_by: context.user.id,
        comment: rejectionReason || approvalComments || null
      });

      if (status === "Rejected") {
        await supabase.from("alert_events").insert(
          buildAlertEvent({
            alertType: "submission_rejected",
            submission: {
              ...(data as Submission),
              duplicate_status: (data as Submission).duplicate_status ?? "Unique"
            },
            severity: "medium",
            message: rejectionReason || "Submission was rejected by an administrator."
          })
        );
      }
    }

    return NextResponse.json({ submission: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

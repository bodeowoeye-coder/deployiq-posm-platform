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

export const runtime = "nodejs";

function cleanString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentUserContext();
    if (!context || !["admin", "installer"].includes(context.role.role)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json({ error: "Please upload an image." }, { status: 400 });
    }

    const installerName = cleanString(formData.get("installerName"));
    const projectName = cleanString(formData.get("projectName")) || DEFAULT_PROJECT_NAME;
    const brandName = cleanString(formData.get("brandName"));
    const installerState = cleanString(formData.get("installerState"));
    const submittedInstallerRegion = cleanString(formData.get("installerRegion"));
    const installerLga = cleanString(formData.get("installerLga"));
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
    const supabase = createAdminSupabase();
    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const imageFingerprint = fingerprintImage(imageBuffer);
    const fileName = `${Date.now()}-${crypto.randomUUID()}.jpg`;
    const path = `installations/${fileName}`;

    const { error: uploadError } = await supabase.storage.from("deployment-photos").upload(path, image, {
      contentType: image.type || "image/jpeg",
      upsert: false
    });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const {
      data: { publicUrl }
    } = supabase.storage.from("deployment-photos").getPublicUrl(path);

    const extraction = await extractBoardTextFromImage(publicUrl);
    const { data: allBrands } = await supabase.from("brands").select("brand_name");
    const { data: matchingBrand } = brandName
      ? await supabase.from("brands").select("client_id, brand_name").eq("brand_name", brandName).maybeSingle()
      : { data: null };
    const { data: matchingProject } = matchingBrand?.client_id
      ? await supabase
          .from("projects")
          .select("id, project_name")
          .eq("client_id", matchingBrand.client_id)
          .eq("project_name", projectName)
          .maybeSingle()
      : { data: null };
    const resolvedBrandName = matchingBrand?.brand_name ?? null;
    const brandReview = reviewBrandMatch(resolvedBrandName, extraction, allBrands ?? []);
    const confidence = scoreBrandVerification(extraction.confidence, brandReview.brandMatchStatus);

    if (brandReview.brandMatchStatus === "Mismatch" && !submitAnyway) {
      await supabase.storage.from("deployment-photos").remove([path]);
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

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: recentData } = await supabase
      .from("submissions")
      .select("*")
      .gte("submitted_at", cutoff)
      .order("submitted_at", { ascending: false })
      .limit(150);
    const duplicateReview = detectDuplicate(
      {
        installerName: installerName || null,
        brandName: resolvedBrandName,
        latitude,
        longitude,
        ocrText: extraction.visibleText || null,
        imageFingerprint
      },
      (recentData ?? []) as Submission[]
    );
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
    const resolvedLocation = await reverseGeocode(latitude, longitude);

    const { data, error } = await supabase
      .from("submissions")
      .insert({
        installer_name: installerName || null,
        installer_user_id: context.user.id,
        project_id: matchingProject?.id ?? null,
        project_name: projectName,
        client_id: matchingBrand?.client_id ?? null,
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
        salon_name: extraction.salonName || null,
        address: extraction.address || resolvedLocation.resolvedAddress || null,
        phone: extraction.phone || null,
        gps_latitude: latitude,
        gps_longitude: longitude,
        installer_state: installerState,
        installer_region: installerRegion,
        installer_lga: installerLga || null,
        resolved_address: resolvedLocation.resolvedAddress,
        resolved_street: resolvedLocation.resolvedStreet,
        resolved_lga: resolvedLocation.resolvedLga,
        resolved_city: resolvedLocation.resolvedCity,
        resolved_state: resolvedLocation.resolvedState,
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
        installation_date: capturedIso.slice(0, 10),
        installation_time: capturedIso.slice(11, 19)
      })
      .select()
      .single();

    if (error) {
      await supabase.storage.from("deployment-photos").remove([path]);
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
    if (installerName) {
      const { data: recentInstallerRows } = await supabase
        .from("submissions")
        .select("brand_match_status,status")
        .eq("installer_name", installerName)
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

    return NextResponse.json({ submission: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
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

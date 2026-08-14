import { extractBoardTextFromImage } from "@/lib/ai";
import { buildAlertEvent } from "@/lib/alerts";
import { reviewBrandMatch } from "@/lib/brandReview";
import { scoreBrandVerification } from "@/lib/confidence";
import { isSubmissionRejectionReason } from "@/lib/submissionRejection";
import type { Submission } from "@/lib/types";
import type { createAdminSupabase } from "@/lib/supabaseAdmin";

type SupabaseAdmin = ReturnType<typeof createAdminSupabase>;
type Row = Record<string, unknown>;

export type CoreGpsStatus = "Verified" | "Approximate" | "Unavailable";

export type CoreSubmissionPersistenceOptions = {
  stripOptionalColumns?: (payload: Row) => Row;
  isOptionalColumnError?: (error: { message?: string; code?: string } | null | undefined) => boolean;
};

export type CoreSubmissionWorkflowInput = {
  supabase: SupabaseAdmin;
  submissionId: string;
  actorUserId: string;
  tenantClientId?: string | null;
  action: "approve" | "reject" | "request_correction" | "set_status";
  status?: string | null;
  rejectionReason?: string | null;
  correctionNotes?: string | null;
  approvalComments?: string | null;
  extraUpdates?: Row;
  insertAlertEvent?: boolean;
};

export function getSubmissionStorageBucket() {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();
  if (!bucket) throw new Error("Missing SUPABASE_STORAGE_BUCKET environment variable.");
  return bucket;
}

export function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function canonicalGpsStatus(input: { latitude?: unknown; longitude?: unknown; distanceMeters?: number | null }): CoreGpsStatus {
  const distance = typeof input.distanceMeters === "number" && Number.isFinite(input.distanceMeters) ? input.distanceMeters : null;
  if (distance !== null) return distance <= 150 ? "Verified" : "Approximate";
  return numberOrNull(input.latitude) !== null && numberOrNull(input.longitude) !== null ? "Verified" : "Unavailable";
}

export function distanceMetersBetween(
  a: { latitude: number | null; longitude: number | null },
  b: { latitude: number | null; longitude: number | null },
) {
  if (a.latitude === null || a.longitude === null || b.latitude === null || b.longitude === null) return null;
  const earth = 6_371_000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(earth * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

export async function uploadSubmissionEvidence(input: {
  supabase: SupabaseAdmin;
  bucket: string;
  image: File;
  pathPrefix?: string;
}) {
  const fileName = `${Date.now()}-${crypto.randomUUID()}.jpg`;
  const path = `${input.pathPrefix || "installations"}/${fileName}`;
  const { error } = await input.supabase.storage.from(input.bucket).upload(path, input.image, {
    contentType: input.image.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  const {
    data: { publicUrl },
  } = input.supabase.storage.from(input.bucket).getPublicUrl(path);
  return { imagePath: path, imageUrl: publicUrl };
}

export async function runSubmissionOcrAndBrandReview(input: {
  supabase: SupabaseAdmin;
  imageUrl: string;
  selectedBrandName: string | null;
}) {
  const extraction = await extractBoardTextFromImage(input.imageUrl);
  const { data: brands } = await input.supabase.from("brands").select("brand_name");
  const brandReview = reviewBrandMatch(input.selectedBrandName, extraction, brands ?? []);
  const confidence = scoreBrandVerification(extraction.confidence, brandReview.brandMatchStatus);
  const autoApproved = brandReview.brandMatchStatus === "Matched" && confidence.level === "High";
  return { extraction, brandReview, confidence, autoApproved };
}

export function buildCoreSubmissionPayload(input: {
  localSubmissionId?: string | null;
  installerName?: string | null;
  installerEmail?: string | null;
  installerUserId?: string | null;
  projectId: string;
  brandId?: string | null;
  projectName: string;
  clientId: string;
  brandName?: string | null;
  imageUrl: string;
  imagePath: string;
  latitude?: number | null;
  longitude?: number | null;
  selectedOutletId?: string | null;
  selectedOutletCode?: string | null;
  selectedOutletName?: string | null;
  selectedOutletAddress?: string | null;
  selectedOutletBrandType?: string | null;
  selectedOutletState?: string | null;
  notes?: string | null;
  capturedAt?: string | null;
  status?: string | null;
  ocr?: Awaited<ReturnType<typeof runSubmissionOcrAndBrandReview>> | null;
  orchestration?: Row;
}) {
  const ocr = input.ocr;
  return {
    local_submission_id: text(input.localSubmissionId) || null,
    installer_name: text(input.installerName) || null,
    installer_email: text(input.installerEmail) || null,
    installer_user_id: text(input.installerUserId) || null,
    project_id: input.projectId,
    brand_id: text(input.brandId) || null,
    project_name: input.projectName,
    client_id: input.clientId,
    brand_name: text(input.brandName) || null,
    image_url: input.imageUrl,
    image_path: input.imagePath,
    gps_latitude: input.latitude ?? null,
    gps_longitude: input.longitude ?? null,
    selected_outlet_id: text(input.selectedOutletId) || null,
    selected_outlet_code: text(input.selectedOutletCode) || null,
    selected_outlet_name: text(input.selectedOutletName) || null,
    selected_outlet_address: text(input.selectedOutletAddress) || null,
    selected_outlet_brand_type: text(input.selectedOutletBrandType) || null,
    selected_outlet_state: text(input.selectedOutletState) || null,
    salon_name: ocr?.extraction.salonName || text(input.selectedOutletName) || null,
    address: ocr?.extraction.address || text(input.selectedOutletAddress) || null,
    phone: ocr?.extraction.phone || null,
    detected_brand_name: ocr?.brandReview.detectedBrandName || null,
    brand_match_status: ocr?.brandReview.brandMatchStatus || null,
    mismatch_reason: ocr?.brandReview.mismatchReason || null,
    ai_review_note: ocr?.brandReview.aiReviewNote || null,
    ai_confidence_score: ocr?.confidence.score ?? null,
    ai_confidence_level: ocr?.confidence.level || null,
    auto_approved: Boolean(ocr?.autoApproved),
    status: text(input.status) || (ocr?.autoApproved ? "Approved" : "Pending"),
    deployment_stage_code: ocr?.autoApproved ? "approved" : "installed",
    ocr_text: ocr?.extraction.visibleText || null,
    ocr_salon_name: ocr?.extraction.salonName || null,
    ocr_address: ocr?.extraction.address || null,
    ocr_brand_name: ocr?.extraction.brandName || null,
    ocr_phone: ocr?.extraction.phone || null,
    ocr_raw_text: ocr?.extraction.visibleText || null,
    ocr_confidence: ocr?.extraction.confidence || null,
    ocr_note: ocr?.extraction.note || null,
    ai_raw_text: ocr?.extraction.visibleText || null,
    captured_at: text(input.capturedAt) || new Date().toISOString(),
    ...(input.orchestration ?? {}),
  };
}

export async function persistCoreSubmission(
  supabase: SupabaseAdmin,
  payload: Row,
  options: CoreSubmissionPersistenceOptions = {},
) {
  const { data, error } = await insertCoreSubmission(supabase, payload, options);
  if (error) throw error;
  return data;
}

export async function insertCoreSubmission(
  supabase: SupabaseAdmin,
  payload: Row,
  options: CoreSubmissionPersistenceOptions = {},
) {
  let { data, error } = await supabase.from("submissions").insert(payload).select().single();
  if (error && options.isOptionalColumnError?.(error) && options.stripOptionalColumns) {
    const fallback = await supabase.from("submissions").insert(options.stripOptionalColumns(payload)).select().single();
    data = fallback.data;
    error = fallback.error;
  }
  return { data, error };
}

export async function applySubmissionWorkflowTransition(input: CoreSubmissionWorkflowInput) {
  const query = input.supabase.from("submissions").select("id,status,project_id,client_id,duplicate_status").eq("id", input.submissionId);
  const scopedQuery = input.tenantClientId ? query.eq("client_id", input.tenantClientId) : query;
  const { data: existing, error: lookupError } = await scopedQuery.maybeSingle();
  if (lookupError) throw lookupError;
  if (!existing) throw Object.assign(new Error("Submission not found."), { status: 404 });

  const updates: Row = { ...(input.extraUpdates ?? {}), reviewed_by: input.actorUserId, reviewed_at: new Date().toISOString() };
  if (input.action === "approve") {
    updates.status = input.status || "Approved";
    updates.approval_comments = text(input.approvalComments) || null;
    updates.rejection_reason = null;
  } else if (input.action === "reject") {
    const reason = text(input.rejectionReason);
    if (!isSubmissionRejectionReason(reason)) throw Object.assign(new Error("Unsupported rejection reason."), { status: 400 });
    updates.status = input.status || "Rejected";
    updates.rejection_reason = reason;
    updates.approval_comments = text(input.approvalComments) || null;
  } else if (input.action === "request_correction") {
    updates.status = input.status || "Correction Requested";
    updates.correction_requested_at = new Date().toISOString();
    updates.correction_notes = text(input.correctionNotes) || "Please correct and resubmit this deployment.";
  } else {
    updates.status = text(input.status);
    if (!updates.status) throw Object.assign(new Error("Unsupported status."), { status: 400 });
    if (typeof input.approvalComments === "string") updates.approval_comments = text(input.approvalComments) || null;
    if (typeof input.rejectionReason === "string") updates.rejection_reason = text(input.rejectionReason) || null;
  }

  const updateQuery = input.supabase.from("submissions").update(updates).eq("id", input.submissionId);
  const scopedUpdate = input.tenantClientId ? updateQuery.eq("client_id", input.tenantClientId) : updateQuery;
  const { data, error } = await scopedUpdate.select().single();
  if (error) throw error;

  if (text((existing as Row).status) !== text(updates.status)) {
    await input.supabase.from("submission_status_history").insert({
      submission_id: input.submissionId,
      previous_status: text((existing as Row).status) || null,
      new_status: text(updates.status),
      changed_by: input.actorUserId,
      comment: text(input.rejectionReason) || text(input.correctionNotes) || text(input.approvalComments) || null,
    });

    if (input.insertAlertEvent && text(updates.status) === "Rejected") {
      await input.supabase.from("alert_events").insert(
        buildAlertEvent({
          alertType: "submission_rejected",
          submission: {
            ...(data as Submission),
            duplicate_status: (data as Submission).duplicate_status ?? "Unique",
          },
          severity: "medium",
          message: text(input.rejectionReason) || "Submission was rejected by an administrator.",
        }),
      );
    }
  }

  return { submission: data };
}

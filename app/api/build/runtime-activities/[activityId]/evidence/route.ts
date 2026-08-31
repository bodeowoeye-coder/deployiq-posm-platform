import { NextRequest, NextResponse } from "next/server";
import { AccessControlError } from "@/lib/accessControl";
import { authorizeRuntimeEvidenceUpload, finalizeRuntimeEvidence } from "@/lib/build/runtime/service";
import type { BuildRuntimeEvidenceType } from "@/lib/build/runtime/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const value = (input: unknown) => typeof input === "string" ? input.trim() : "";
const evidenceType = (input: unknown) => value(input) as BuildRuntimeEvidenceType;
const numberOrNull = (input: unknown) => typeof input === "number" && Number.isFinite(input) ? input : null;

export async function POST(request: NextRequest, { params }: { params: { activityId: string } }) {
  try {
    const body = await request.json();
    const common = { request, activityId: params.activityId, projectId: value(body.projectId), siteId: value(body.siteId),
      workPackageId: value(body.workPackageId), checklistItemId: value(body.checklistItemId) || null, exceptionId: value(body.exceptionId) || null };
    if (body.action === "authorize") {
      const authorization = await authorizeRuntimeEvidenceUpload({ ...common, evidenceType: evidenceType(body.evidenceType),
        originalFilename: value(body.originalFilename), mimeType: value(body.mimeType), fileSizeBytes: Number(body.fileSizeBytes) });
      return NextResponse.json({ authorization });
    }
    if (body.action === "finalize" || body.action === "note") {
      const id = await finalizeRuntimeEvidence({ ...common, authorizationId: value(body.authorizationId) || null,
        evidenceType: body.action === "note" ? "note" : evidenceType(body.evidenceType), description: value(body.description) || null,
        note: value(body.note) || null, latitude: numberOrNull(body.latitude), longitude: numberOrNull(body.longitude) });
      return NextResponse.json({ id });
    }
    return NextResponse.json({ error: "Evidence action is invalid." }, { status: 400 });
  } catch (error) {
    const status = error instanceof AccessControlError ? error.status : 500;
    return NextResponse.json({ error: status >= 500 ? "The Evidence request could not be completed." : error instanceof Error ? error.message : "The Evidence request could not be completed." }, { status });
  }
}

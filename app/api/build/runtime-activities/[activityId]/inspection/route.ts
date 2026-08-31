import { NextRequest, NextResponse } from "next/server";
import { AccessControlError } from "@/lib/accessControl";
import { recordRuntimeInspection, resumeRuntimeActivityCorrections, submitRuntimeActivityForReview } from "@/lib/build/runtime/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const value = (input: unknown) => typeof input === "string" ? input.trim() : "";

export async function POST(request: NextRequest, { params }: { params: { activityId: string } }) {
  try {
    const body = await request.json();
    const common = {
      request, activityId: params.activityId, projectId: value(body.projectId),
      siteId: value(body.siteId), workPackageId: value(body.workPackageId),
    };
    const execution = body.action === "submit"
      ? await submitRuntimeActivityForReview(common)
      : body.action === "inspect"
        ? await recordRuntimeInspection({ ...common, outcome: value(body.outcome), comments: value(body.comments) || null })
        : body.action === "resume_corrections"
          ? await resumeRuntimeActivityCorrections(common)
          : null;
    if (!execution) return NextResponse.json({ error: "Inspection action is invalid." }, { status: 400 });
    return NextResponse.json({ execution });
  } catch (error) {
    const status = error instanceof AccessControlError ? error.status : 500;
    return NextResponse.json({ error: status >= 500 ? "The Inspection request could not be completed." : error instanceof Error ? error.message : "The Inspection request could not be completed." }, { status });
  }
}

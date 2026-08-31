import { NextRequest, NextResponse } from "next/server";
import { AccessControlError } from "@/lib/accessControl";
import { applyRuntimeChecklistResult } from "@/lib/build/runtime/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const value = (input: unknown) => typeof input === "string" ? input.trim() : "";

export async function PATCH(request: NextRequest, { params }: { params: { activityId: string } }) {
  try {
    const body = await request.json();
    await applyRuntimeChecklistResult({ request, activityId: params.activityId, projectId: value(body.projectId),
      siteId: value(body.siteId), workPackageId: value(body.workPackageId), checklistItemId: value(body.checklistItemId),
      result: value(body.result), note: value(body.note) || null });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof AccessControlError ? error.status : 500;
    return NextResponse.json({ error: status >= 500 ? "The Checklist result could not be recorded." : error instanceof Error ? error.message : "The Checklist result could not be recorded." }, { status });
  }
}

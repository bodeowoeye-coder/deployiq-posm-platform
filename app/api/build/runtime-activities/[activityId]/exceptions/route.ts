import { NextRequest, NextResponse } from "next/server";
import { AccessControlError } from "@/lib/accessControl";
import { applyRuntimeExceptionAction, createRuntimeException } from "@/lib/build/runtime/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const value = (input: unknown) => typeof input === "string" ? input.trim() : "";

export async function POST(request: NextRequest, { params }: { params: { activityId: string } }) {
  try {
    const body = await request.json();
    const common = { request, activityId: params.activityId, projectId: value(body.projectId), siteId: value(body.siteId), workPackageId: value(body.workPackageId) };
    const execution = body.action === "create"
      ? await createRuntimeException({ ...common, inspectionId: value(body.inspectionId), title: value(body.title),
          description: value(body.description), severity: value(body.severity), ownerUserId: value(body.ownerUserId), dueAt: value(body.dueAt) || null })
      : await applyRuntimeExceptionAction({ ...common, exceptionId: value(body.exceptionId), action: value(body.action), note: value(body.note) || null });
    return NextResponse.json({ execution });
  } catch (error) {
    const status = error instanceof AccessControlError ? error.status : 500;
    return NextResponse.json({ error: status >= 500 ? "The Exception request could not be completed." : error instanceof Error ? error.message : "The Exception request could not be completed." }, { status });
  }
}

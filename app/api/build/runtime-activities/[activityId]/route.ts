import { NextRequest, NextResponse } from "next/server";
import { AccessControlError } from "@/lib/accessControl";
import { applyRuntimeActivityAction, getRuntimeActivityExecution } from "@/lib/build/runtime/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const value = (input: unknown) => typeof input === "string" ? input.trim() : "";
function failure(error: unknown) {
  const status = error instanceof AccessControlError ? error.status : 500;
  return NextResponse.json({ error: status >= 500 ? "The Activity request could not be completed." : error instanceof Error ? error.message : "The Activity request could not be completed." }, { status });
}

export async function GET(request: NextRequest, { params }: { params: { activityId: string } }) {
  try {
    const query = request.nextUrl.searchParams;
    return NextResponse.json({ execution: await getRuntimeActivityExecution({ request, activityId: params.activityId, projectId: value(query.get("projectId")), siteId: value(query.get("siteId")), workPackageId: value(query.get("workPackageId")) }) });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: NextRequest, { params }: { params: { activityId: string } }) {
  try {
    const body = await request.json();
    return NextResponse.json({ execution: await applyRuntimeActivityAction({ request, activityId: params.activityId, projectId: value(body.projectId), siteId: value(body.siteId), workPackageId: value(body.workPackageId), action: value(body.action), ownerUserId: value(body.ownerUserId) || null, supervisorUserId: value(body.supervisorUserId) || null, note: value(body.note) || null }) });
  } catch (error) { return failure(error); }
}

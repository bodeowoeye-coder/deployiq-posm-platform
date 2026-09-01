import { NextRequest, NextResponse } from "next/server";
import { AccessControlError } from "@/lib/accessControl";
import { baselineBuildWorkPlanSchedule, createWorkPlan, getWorkPlan, previewBuildWorkPlanSchedule } from "@/lib/build/runtime/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function value(input: unknown) { return typeof input === "string" ? input.trim() : ""; }
function failure(error: unknown) {
  const status = error instanceof AccessControlError ? error.status : 500;
  return NextResponse.json({ error: status >= 500 ? "The Work Plan request could not be completed." : error instanceof Error ? error.message : "The Work Plan request could not be completed." }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams;
    const plan = await getWorkPlan({ request, projectId: value(query.get("projectId")), siteId: value(query.get("siteId")), workPackageId: value(query.get("workPackageId")) });
    return NextResponse.json({ plan });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const plan = await createWorkPlan({ request, projectId: value(body.projectId), siteId: value(body.siteId), workPackageId: value(body.workPackageId) });
    return NextResponse.json({ plan });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const params = {
      request, projectId: value(body.projectId), siteId: value(body.siteId),
      workPackageId: value(body.workPackageId), baselineStart: value(body.baselineStart),
    };
    if (body.action === "preview-schedule") {
      return NextResponse.json({ schedule: await previewBuildWorkPlanSchedule(params) });
    }
    if (body.action === "baseline-schedule") {
      return NextResponse.json(await baselineBuildWorkPlanSchedule(params));
    }
    return NextResponse.json({ error: "Select a valid Work Plan schedule action." }, { status: 400 });
  } catch (error) { return failure(error); }
}

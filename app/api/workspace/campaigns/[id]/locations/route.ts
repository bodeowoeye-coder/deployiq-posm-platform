import { NextResponse } from "next/server";
import {
  assignCampaignLocations,
  getCampaignLocationDashboard,
  removeCampaignLocation,
} from "@/lib/workspace/campaignLocations";
import { CustomerWorkspaceRedirect } from "@/lib/workspace/customerAdmin";

export const dynamic = "force-dynamic";

function statusFor(error: unknown) {
  if (error instanceof CustomerWorkspaceRedirect) return 401;
  return typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
}

function messageFor(error: unknown) {
  if (error instanceof CustomerWorkspaceRedirect) return "Customer workspace access is required.";
  return error instanceof Error ? error.message : "Unable to process campaign locations.";
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(request.url);
    const dashboard = await getCampaignLocationDashboard(params.id, {
      search: searchParams.get("search"),
      state: searchParams.get("state"),
      region: searchParams.get("region"),
      city: searchParams.get("city"),
      status: searchParams.get("status"),
      assigned: searchParams.get("assigned") as "all" | "assigned" | "unassigned" | null,
      sort: searchParams.get("sort"),
      page: Number(searchParams.get("page") ?? 1),
    });
    return NextResponse.json(dashboard);
  } catch (error) {
    return NextResponse.json({ error: messageFor(error) }, { status: statusFor(error) });
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json().catch(() => null);
    const result = await assignCampaignLocations({
      campaignId: params.id,
      locationIds: Array.isArray(body?.locationIds) ? body.locationIds : [],
      assignAll: body?.assignAll === true,
      targetQuantityPerLocation: body?.targetQuantityPerLocation,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: messageFor(error) }, { status: statusFor(error) });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json().catch(() => null);
    const result = await removeCampaignLocation({
      campaignId: params.id,
      assignmentId: typeof body?.assignmentId === "string" ? body.assignmentId : null,
      locationId: typeof body?.locationId === "string" ? body.locationId : null,
      exclusionReason: typeof body?.exclusionReason === "string" ? body.exclusionReason : null,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: messageFor(error) }, { status: statusFor(error) });
  }
}

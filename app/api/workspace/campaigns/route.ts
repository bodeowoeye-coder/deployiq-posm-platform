import { NextResponse } from "next/server";
import {
  getWorkspaceCampaignDashboard,
} from "@/lib/workspace/campaigns";
import { CustomerWorkspaceRedirect } from "@/lib/workspace/customerAdmin";

export const dynamic = "force-dynamic";

function statusFor(error: unknown) {
  if (error instanceof CustomerWorkspaceRedirect) return 401;
  return typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
}

function messageFor(error: unknown) {
  if (error instanceof CustomerWorkspaceRedirect) return "Customer workspace access is required.";
  return error instanceof Error ? error.message : "Unable to process workspace campaign request.";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dashboard = await getWorkspaceCampaignDashboard({
      search: searchParams.get("search"),
      status: searchParams.get("status"),
      project: searchParams.get("project"),
      brand: searchParams.get("brand"),
      state: searchParams.get("state"),
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
      sort: searchParams.get("sort"),
    });
    return NextResponse.json({ campaigns: dashboard.filteredCampaigns, kpis: dashboard.kpis });
  } catch (error) {
    return NextResponse.json({ error: messageFor(error) }, { status: statusFor(error) });
  }
}

export async function POST() {
  return NextResponse.json(
    { error: "Create campaigns through Projects. Campaign Management now configures tenant-scoped project campaign metadata." },
    { status: 410 },
  );
}

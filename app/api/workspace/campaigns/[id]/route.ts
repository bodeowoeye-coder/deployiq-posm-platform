import { NextResponse } from "next/server";
import {
  getWorkspaceCampaign,
  updateWorkspaceCampaignStatus,
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

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getWorkspaceCampaign(params.id);
    if (!result) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: messageFor(error) }, { status: statusFor(error) });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const result = await updateWorkspaceCampaignStatus({
      campaignId: params.id,
      action: typeof body.action === "string" ? body.action : "",
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: messageFor(error), readiness: (error as { readiness?: unknown })?.readiness }, { status: statusFor(error) });
  }
}

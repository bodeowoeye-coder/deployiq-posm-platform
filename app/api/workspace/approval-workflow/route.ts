import { NextResponse } from "next/server";
import {
  getApprovalWorkflowDashboard,
  saveApprovalWorkflow,
} from "@/lib/workspace/approvalWorkflow";

export const dynamic = "force-dynamic";

function statusFor(error: unknown) {
  return typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
}

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : "Unable to process approval workflow.";
}

export async function GET() {
  try {
    return NextResponse.json(await getApprovalWorkflowDashboard());
  } catch (error) {
    return NextResponse.json({ error: messageFor(error) }, { status: statusFor(error) });
  }
}

export async function PATCH(request: Request) {
  try {
    return NextResponse.json(await saveApprovalWorkflow(await request.json()));
  } catch (error) {
    return NextResponse.json({ error: messageFor(error) }, { status: statusFor(error) });
  }
}

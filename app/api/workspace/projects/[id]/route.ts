import { NextResponse } from "next/server";
import { updateCustomerProjectDetails } from "@/lib/workspace/projects";

export const dynamic = "force-dynamic";

function statusFor(error: unknown) {
  return typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
}

function messageFor(error: unknown) {
  const status = statusFor(error);
  if (status >= 500) return "Project could not be saved. Please review the highlighted information and try again.";
  return error instanceof Error ? error.message : "Project could not be saved. Please review the highlighted information and try again.";
}

function diagnosticFor(error: unknown) {
  if (!error || typeof error !== "object") return { message: String(error) };
  const record = error as Record<string, unknown>;
  return {
    message: error instanceof Error ? error.message : typeof record.message === "string" ? record.message : "Unknown error",
    code: typeof record.code === "string" ? record.code : undefined,
    details: typeof record.details === "string" ? record.details : undefined,
    hint: typeof record.hint === "string" ? record.hint : undefined,
    status: typeof record.status === "number" ? record.status : undefined,
  };
}

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("project name")) return "project_name_invalid";
  if (message.includes("deployment quantity") || message.includes("target quantity")) return "target_quantity_invalid";
  if (message.includes("status")) return "status_invalid";
  if (message.includes("not found")) return "project_not_found";
  return statusFor(error) >= 500 ? "project_update_failed" : "project_update_invalid";
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const project = await updateCustomerProjectDetails({
      projectId: params.id,
      projectName: body.projectName,
      campaignName: body.campaignName,
      brandName: body.brandName,
      status: body.status,
      expectedDeploymentQuantity: body.expectedDeploymentQuantity,
      regions: body.regions,
      states: body.states,
      startDate: body.startDate,
      expectedEndDate: body.expectedEndDate,
    });
    return NextResponse.json({ project });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("[workspace-projects]", "PATCH detail", { projectId: params.id, diagnostic: diagnosticFor(error) });
    return NextResponse.json({ error: messageFor(error), code: errorCode(error) }, { status: statusFor(error) });
  }
}

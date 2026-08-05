import { NextResponse } from "next/server";
import { provisionAcquisitionWorkspace } from "@/lib/acquisition/provisioning/service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const resumeToken = typeof body.resumeToken === "string" ? body.resumeToken : null;
    if (!resumeToken) {
      return NextResponse.json({ error: "Acquisition session is required." }, { status: 400 });
    }

    const result = await provisionAcquisitionWorkspace(resumeToken);
    return NextResponse.json({
      job: result.job,
      completed: result.completed,
      message: result.customerMessage,
      workspaceUrl: result.workspaceUrl,
      ...(process.env.NODE_ENV === "development" && result.accountSetupLink
        ? { accountSetupLink: result.accountSetupLink }
        : {}),
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "provisioning_failed";
    const job = (error as { job?: unknown }).job;
    const failedStage = typeof (error as { failedStage?: unknown }).failedStage === "string"
      ? (error as { failedStage: string }).failedStage
      : typeof (job as { result_data?: { failedSafeStage?: unknown } })?.result_data?.failedSafeStage === "string"
      ? String((job as { result_data: { failedSafeStage: string } }).result_data.failedSafeStage)
      : null;
    const commercialReference = typeof (job as { commercial_reference?: unknown })?.commercial_reference === "string"
      ? String((job as { commercial_reference: string }).commercial_reference)
      : null;
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to provision workspace.",
      code,
      retryable: Boolean((error as { retryable?: unknown }).retryable ?? true),
      provisioningReference: commercialReference,
      failedStage,
      ...(job ? { job } : {}),
    }, { status });
  }
}

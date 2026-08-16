import { NextResponse } from "next/server";
import { provisionAcquisitionWorkspace } from "@/lib/acquisition/provisioning/service";
import { getCurrentAccessToken } from "@/lib/auth";
import { createUserSupabase } from "@/lib/supabaseUser";
import { classifyProvisioningFailure } from "@/lib/acquisition/provisioning/failure";

export async function POST(request: Request) {
  try {
    const accessToken = await getCurrentAccessToken();
    if (!accessToken) {
      return NextResponse.json({ error: "Sign in to set up this workspace.", code: "authentication_required" }, { status: 401 });
    }
    const { data: authData, error: authError } = await createUserSupabase(accessToken).auth.getUser(accessToken);
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Sign in to set up this workspace.", code: "authentication_required" }, { status: 401 });
    }
    const body = await request.json();
    const resumeToken = typeof body.resumeToken === "string" ? body.resumeToken : null;
    if (!resumeToken) {
      return NextResponse.json({ error: "Acquisition session is required." }, { status: 400 });
    }

    const result = await provisionAcquisitionWorkspace(resumeToken, {
      id: authData.user.id,
      email: authData.user.email ?? null,
      emailConfirmed: Boolean(authData.user.email_confirmed_at || authData.user.confirmed_at),
    });
    return NextResponse.json({
      job: result.job,
      completed: result.completed,
      message: result.customerMessage,
      workspaceReady: result.workspaceReady,
      workspaceUrl: result.workspaceUrl,
      adminWorkspaceUrl: result.adminWorkspaceUrl,
      workspaceDestination: result.workspaceDestination,
      shadowPlanning: result.job.result_data.shadowPlanning ?? null,
      localDevelopmentAdminWorkspaceUrl: process.env.NODE_ENV === "development" && result.job.status === "completed"
        ? result.workspaceDestination?.adminWorkspaceUrl ?? null
        : null,
      ...(process.env.NODE_ENV === "development" && result.accountSetupLink
        ? { accountSetupLink: result.accountSetupLink }
        : {}),
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "provisioning_failed";
    const classification = typeof (error as { classification?: unknown }).classification === "string"
      ? String((error as { classification: string }).classification)
      : classifyProvisioningFailure(code);
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
      classification,
      retryable: Boolean((error as { retryable?: unknown }).retryable ?? classification === "retryable"),
      provisioningReference: commercialReference,
      failedStage,
      ...(job ? { job } : {}),
    }, { status });
  }
}

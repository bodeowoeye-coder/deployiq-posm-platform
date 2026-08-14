import { NextResponse } from "next/server";
import { reviewDeploymentSubmission } from "@/lib/workspace/deploymentExecution";

export const dynamic = "force-dynamic";

function status(error: unknown) {
  return typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
    return NextResponse.json(await reviewDeploymentSubmission({ ...body, submissionId: params.id }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to review submission." }, { status: status(error) });
  }
}

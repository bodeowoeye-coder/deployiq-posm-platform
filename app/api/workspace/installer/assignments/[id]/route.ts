import { NextResponse } from "next/server";
import { getDeploymentAssignment } from "@/lib/workspace/deploymentExecution";

export const dynamic = "force-dynamic";

function status(error: unknown) {
  return typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getDeploymentAssignment(params.id);
    if (!result) return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load assignment." }, { status: status(error) });
  }
}

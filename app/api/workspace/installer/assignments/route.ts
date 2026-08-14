import { NextResponse } from "next/server";
import { getInstallerAssignments } from "@/lib/workspace/deploymentExecution";

export const dynamic = "force-dynamic";

function status(error: unknown) {
  return typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
}

export async function GET() {
  try {
    return NextResponse.json(await getInstallerAssignments());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load assignments." }, { status: status(error) });
  }
}

import { NextResponse } from "next/server";
import { submitDeploymentEvidence } from "@/lib/workspace/deploymentExecution";

export const dynamic = "force-dynamic";

function status(error: unknown) {
  return typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const queued = Array.isArray(body.submissions) ? body.submissions : [];
    const results = [];
    for (const item of queued) {
      results.push(await submitDeploymentEvidence({ ...item, offlineSyncStatus: "synced" }));
    }
    return NextResponse.json({ synced: results.length, results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to sync offline submissions." }, { status: status(error) });
  }
}

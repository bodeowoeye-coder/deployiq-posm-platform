import { NextResponse } from "next/server";
import { getWorkspaceDirectoryDashboard } from "@/lib/workspace/directoryImport";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const status = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
  return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load workspace directory." }, { status });
}

export async function GET() {
  try {
    const { dashboard, workspace } = await getWorkspaceDirectoryDashboard();
    return NextResponse.json({
      dashboard,
      workspace: {
        productKey: workspace.productKey,
        productName: workspace.productName,
        workspaceName: workspace.workspaceName,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

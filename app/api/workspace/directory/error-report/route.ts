import { NextResponse } from "next/server";
import { getWorkspaceDirectoryDashboard } from "@/lib/workspace/directoryImport";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const batchId = new URL(request.url).searchParams.get("batchId")?.trim() ?? "";
    const { workspace, dashboard } = await getWorkspaceDirectoryDashboard();
    const batch = dashboard.history.find((item) => item.id === batchId) ?? dashboard.history[0] ?? null;
    const issues = batch?.errorReport ?? [];
    const report = JSON.stringify({
      workspace: {
        clientId: workspace.clientId,
        productKey: workspace.productKey,
      },
      batchId: batch?.id ?? null,
      importDate: batch?.importDate ?? null,
      status: batch?.status ?? "not_available",
      counts: {
        imported: batch?.recordsImported ?? 0,
        duplicates: batch?.duplicates ?? 0,
        errors: batch?.errors ?? 0,
        warnings: batch?.warnings ?? 0,
        issues: issues.length,
      },
      message: batch ? (issues.length > 0 ? "Directory import issues are listed below." : "No directory import errors were recorded for this batch.") : "No directory import batch was found for this workspace.",
      issues,
    }, null, 2);
    return new NextResponse(report, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="deployiq-directory-error-report${batch?.id ? `-${batch.id}` : ""}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to download error report." }, { status });
  }
}

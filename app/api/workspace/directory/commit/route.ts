import { NextResponse } from "next/server";
import { commitWorkspaceDirectoryImport } from "@/lib/workspace/directoryImport";
import type { ImportLocationRow } from "@/lib/deploymentLocationsImport";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { rows?: ImportLocationRow[]; source?: string } | null;
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: "Preview a valid directory file before importing." }, { status: 400 });
    }
    const result = await commitWorkspaceDirectoryImport({
      rows,
      source: typeof body?.source === "string" ? body.source : "upload",
    });
    return NextResponse.json({
      batchId: result.batchId,
      summary: result.summary,
      preview: result.preview,
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    const preview = (error as { preview?: unknown }).preview;
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to commit directory import.",
      ...(preview ? { preview } : {}),
    }, { status });
  }
}

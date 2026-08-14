import { NextResponse } from "next/server";
import { previewWorkspaceDirectoryImport } from "@/lib/workspace/directoryImport";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload a CSV or Excel directory file." }, { status: 400 });
    }
    const { preview, rows, workspace } = await previewWorkspaceDirectoryImport({ file });
    return NextResponse.json({
      preview,
      rows,
      workspace: {
        productKey: workspace.productKey,
        productName: workspace.productName,
      },
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to preview directory import." }, { status });
  }
}

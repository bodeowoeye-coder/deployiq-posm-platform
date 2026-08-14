import { NextResponse } from "next/server";
import { buildDirectoryTemplateResponse } from "@/lib/workspace/directoryImport";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { csv, template } = await buildDirectoryTemplateResponse();
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="deployiq-${template.recordLabel}-directory-template.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to generate directory template." }, { status });
  }
}

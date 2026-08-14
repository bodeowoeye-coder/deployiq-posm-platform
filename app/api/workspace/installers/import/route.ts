import { NextResponse } from "next/server";
import {
  commitWorkspaceInstallerImport,
  installerCsvTemplate,
  previewWorkspaceInstallerImport,
} from "@/lib/workspace/fieldResources";

export const dynamic = "force-dynamic";

function status(error: unknown) {
  return typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
}

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function GET() {
  return new Response(installerCsvTemplate(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="deployiq-installers-template.csv"',
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const csv = typeof body.csv === "string" ? body.csv : "";
    const mode = typeof body.mode === "string" ? body.mode : "preview";
    const result = mode === "commit" ? await commitWorkspaceInstallerImport(csv) : await previewWorkspaceInstallerImport(csv);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: message(error, "Unable to import installers."), preview: (error as { preview?: unknown })?.preview }, { status: status(error) });
  }
}

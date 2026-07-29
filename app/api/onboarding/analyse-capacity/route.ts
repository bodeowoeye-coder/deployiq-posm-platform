import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "A CSV file is required." }, { status: 400 });
    }
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "File is too large." }, { status: 413 });
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json({ error: "Only CSV files are supported." }, { status: 400 });
    }
    const text = await file.text();
    const rows = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const validRows = rows.slice(rows[0] && rows[0].includes(",") ? 1 : 0).filter(Boolean);
    return NextResponse.json({ detectedDeploymentLocations: validRows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireAdmin, AccessControlError } from "@/lib/accessControl";
import { cloneTemplate } from "@/lib/commercial/pricing/service";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = await requireAdmin(request);
    const { id } = params;
    if (!id) return NextResponse.json({ error: "Template id is required." }, { status: 400 });
    let destinationProductKey: string | null = null;
    try {
      const body = await request.json();
      destinationProductKey = typeof body?.destinationProductKey === "string" ? body.destinationProductKey : null;
    } catch {
      destinationProductKey = null;
    }
    const template = await cloneTemplate(id, context.user_id, destinationProductKey);
    return NextResponse.json({ template });
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    const isNotFound = message.includes("not found");
    const status = isNotFound ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

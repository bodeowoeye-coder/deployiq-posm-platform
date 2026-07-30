import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/accessControl";
import { activateTemplate } from "@/lib/commercial/pricing/service";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = await requireAdmin(request);
    const { id } = params;
    if (!id) return NextResponse.json({ error: "Template id is required." }, { status: 400 });
    const template = await activateTemplate(id, context.user_id);
    return NextResponse.json({ template });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const isNotFound = message.includes("not found");
    const isBusinessRule = message.includes("cannot") || message.includes("already") || message.includes("invalid") || message.includes("Invalid") || message.includes("Unsupported") || message.includes("must") || message.includes("overlaps") || message.includes("continuous") || message.includes("Duplicate") || message.includes("default");
    const status = isNotFound ? 404 : isBusinessRule ? 422 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

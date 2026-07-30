import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/accessControl";
import { getPricingTemplateById, listPricingTemplates } from "@/lib/commercial/pricing/service";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const templates = await listPricingTemplates();
    return NextResponse.json({ templates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const templateId = typeof body.templateId === "string" ? body.templateId : null;
    if (!templateId) {
      return NextResponse.json({ error: "A pricing template id is required." }, { status: 400 });
    }
    const template = await getPricingTemplateById(templateId);
    if (!template) {
      return NextResponse.json({ error: "Pricing template not found." }, { status: 404 });
    }
    return NextResponse.json({ template });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

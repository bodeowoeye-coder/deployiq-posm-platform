import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/accessControl";
import { calculateProgressivePricing, getPricingTemplateById } from "@/lib/commercial/pricing/service";

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const templateId = typeof body.pricingTemplateId === "string" ? body.pricingTemplateId : body.templateId;
    const quantity = Number(body.quantity ?? 0);

    if (!templateId) {
      return NextResponse.json({ error: "A pricing template id is required." }, { status: 400 });
    }

    const template = await getPricingTemplateById(templateId);
    if (!template) {
      return NextResponse.json({ error: "Pricing template not found." }, { status: 404 });
    }

    const result = calculateProgressivePricing(quantity, template, template.tiers);
    return NextResponse.json({ result, templateId: template.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getDefaultRetailPricingTemplate } from "@/lib/commercial/pricing/service";

export async function GET() {
  return NextResponse.json({ templates: [getDefaultRetailPricingTemplate()] });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    return NextResponse.json({ template: { ...getDefaultRetailPricingTemplate(), ...body } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

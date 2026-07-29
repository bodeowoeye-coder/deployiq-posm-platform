import { NextResponse } from "next/server";
import { calculateProgressivePricing, getDefaultRetailPricingTemplate } from "@/lib/commercial/pricing/service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const quantity = Number(body.quantity ?? 0);
    return NextResponse.json({ result: calculateProgressivePricing(quantity, getDefaultRetailPricingTemplate()) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { calculateProgressivePricing, getDefaultRetailPricingTemplate } from "@/lib/commercial/pricing/service";
import { validateCapacityInput } from "@/lib/commercial/onboarding/validation";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const quantity = typeof body.quantity === "number" ? body.quantity : Number(body.quantity);
    const validation = validateCapacityInput(quantity);

    if (!validation.isValid) {
      return NextResponse.json({ error: "Invalid capacity input.", details: validation.errors }, { status: 400 });
    }

    const result = calculateProgressivePricing(quantity, getDefaultRetailPricingTemplate());
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

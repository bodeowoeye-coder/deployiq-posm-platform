import { NextResponse } from "next/server";
import { getCommercialProductCatalog } from "@/lib/commercial/products/catalogue";

export async function GET() {
  return NextResponse.json({ products: getCommercialProductCatalog() });
}

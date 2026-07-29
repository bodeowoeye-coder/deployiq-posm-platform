import { NextResponse } from "next/server";
import { upsertPlatformProvisioningContext } from "@/lib/commercial/provisioning/platform";
import { provisionRetailProduct } from "@/lib/commercial/provisioning/products/retail";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const platform = await upsertPlatformProvisioningContext({
      organisationName: body.organisationName,
      contactPerson: body.contactPerson,
      businessEmail: body.businessEmail,
      phoneNumber: body.phoneNumber,
      country: body.country,
      userId: body.userId ?? null
    });

    const retail = await provisionRetailProduct({
      organisationId: platform.organisationId,
      userId: body.userId ?? null,
      campaignName: body.campaignName,
      projectName: body.projectName,
      brandName: body.brandName,
      capacity: body.capacity,
      productKey: body.productKey ?? "retail"
    });

    return NextResponse.json({ organisationId: platform.organisationId, retail });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

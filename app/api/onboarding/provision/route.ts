import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    error: "This legacy provisioning endpoint has been retired. Use the approved acquisition provisioning flow.",
    code: "legacy_provisioning_retired",
  }, { status: 410 });
}

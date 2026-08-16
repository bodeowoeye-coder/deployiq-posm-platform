import { NextResponse } from "next/server";
import { SupportAccessError, createSupportSession, endSupportSession } from "@/lib/admin/supportAccess";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const status = error instanceof SupportAccessError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Unable to process the support session request.";
  if (status >= 500) console.error("[support-access]", { message, error });
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const session = await createSupportSession({
      clientId: typeof body.clientId === "string" ? body.clientId : "",
      reason: typeof body.reason === "string" ? body.reason : "",
      initiatedFrom: typeof body.initiatedFrom === "string" ? body.initiatedFrom : null,
    });
    return NextResponse.json({ ok: true, session, redirectTo: "/workspace/admin" });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    const result = await endSupportSession();
    return NextResponse.json({
      ok: true,
      redirectTo: result.clientId ? `/admin/customers/${result.clientId}` : "/admin/customers",
    });
  } catch (error) {
    return errorResponse(error);
  }
}

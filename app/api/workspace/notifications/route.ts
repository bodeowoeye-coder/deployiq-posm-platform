import { NextResponse } from "next/server";
import { accessControlErrorResponse } from "@/lib/accessControl";
import { listAuthenticatedBuildNotifications, updateAuthenticatedBuildNotification } from "@/lib/build/notifications/repository";
import { requireOperationalNotificationContext } from "@/lib/workspace/operationalNotifications";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireOperationalNotificationContext();
    return NextResponse.json({ enabled: true, ...(await listAuthenticatedBuildNotifications()) });
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireOperationalNotificationContext();
    const body = await request.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const action = body.action === "mark_read" || body.action === "acknowledge" ? body.action : null;
    if (!id || !action || body.source !== "build") return NextResponse.json({ error: "Unsupported notification action." }, { status: 400 });
    return NextResponse.json(await updateAuthenticatedBuildNotification({ id, action }));
  } catch (error) {
    const { status, payload } = accessControlErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}

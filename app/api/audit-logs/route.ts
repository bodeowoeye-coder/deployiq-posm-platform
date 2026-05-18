import { NextResponse } from "next/server";
import { listAuditLogs, requireAdminContext } from "@/lib/userManagement";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await requireAdminContext();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json({ logs: await listAuditLogs() });
}

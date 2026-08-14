import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth";
import {
  getWorkspaceActivationNotificationState,
  requestWorkspaceActivationNotification,
} from "@/lib/acquisition/provisioning/activationNotifications";

export const dynamic = "force-dynamic";

function statusFor(error: unknown) {
  return typeof (error as { status?: unknown })?.status === "number"
    ? (error as { status: number }).status
    : 500;
}

function logNotificationError(scope: "get" | "post", error: unknown) {
  const maybe = error as { code?: unknown; status?: unknown; message?: unknown };
  console.error("[activation-notification]", {
    scope,
    status: typeof maybe.status === "number" ? maybe.status : 500,
    code: typeof maybe.code === "string" ? maybe.code : "notification_request_failed",
    message: typeof maybe.message === "string" ? maybe.message : "Unknown notification failure",
  });
}

function customerError(error: unknown) {
  const status = statusFor(error);
  if (status === 401) return "Sign in to request a workspace-ready notification.";
  if (status === 403) return "We could not verify this workspace notification request.";
  if (status === 409) return "Workspace preparation has not started yet. Start workspace setup first.";
  return "We couldn’t save your notification request. Please try again.";
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentUserContext();
    if (!context) return NextResponse.json({ error: "Sign in to check notification status." }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const resumeToken = searchParams.get("token")?.trim() || "";
    if (!resumeToken) return NextResponse.json({ error: "Workspace setup session is required." }, { status: 400 });

    const state = await getWorkspaceActivationNotificationState({ resumeToken, user: context.user });
    return NextResponse.json({
      requested: state.requested,
      status: state.notification?.status ?? null,
      requestedAt: state.notification?.requested_at ?? null,
      sentAt: state.notification?.sent_at ?? null,
      retryable: state.notification?.status === "failed",
    });
  } catch (error) {
    logNotificationError("get", error);
    return NextResponse.json({ error: customerError(error) }, { status: statusFor(error) });
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentUserContext();
    if (!context) return NextResponse.json({ error: "Sign in to request a workspace-ready notification." }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const resumeToken = typeof body.resumeToken === "string" ? body.resumeToken.trim() : "";
    if (!resumeToken) return NextResponse.json({ error: "Workspace setup session is required." }, { status: 400 });

    const result = await requestWorkspaceActivationNotification({ resumeToken, user: context.user });
    return NextResponse.json({
      requested: true,
      created: result.created,
      status: result.notification.status,
      requestedAt: result.notification.requested_at,
      sentAt: result.notification.sent_at,
      message: "We’ll email you as soon as your DeployIQ workspace is ready.",
    });
  } catch (error) {
    logNotificationError("post", error);
    return NextResponse.json({
      error: customerError(error),
      retryable: true,
    }, { status: statusFor(error) });
  }
}

import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth";
import { getNotificationAction, notificationsEnabled } from "@/lib/notifications";
import { createAdminSupabase } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function disabledResponse() {
  return NextResponse.json({ enabled: false, notifications: [], unreadCount: 0 });
}

function errorPayload(error: unknown) {
  if (!error || typeof error !== "object") return { message: "Unknown error" };
  const maybe = error as { code?: string; message?: string; details?: string };
  return {
    code: maybe.code,
    message: maybe.message,
    details: maybe.details
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalQuantity(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 ? Math.round(numericValue) : null;
}

function phaseMessage(status: string, fallbackMessage: string, phaseName: string) {
  if (status === "production_started") return `Production has started for ${phaseName} phase.`;
  if (status === "production_completed") return `Production has been completed for ${phaseName} phase.`;
  if (status === "dispatched") return `Materials have been dispatched for ${phaseName}.`;
  if (status === "arrived_at_destination") return `Materials have arrived at ${phaseName} destination.`;
  if (status === "deployment_started") return `Field deployment has started for ${phaseName}.`;
  if (status === "deployment_completed") return `Field deployment has been completed for ${phaseName}.`;
  return fallbackMessage;
}

export async function GET(request: Request) {
  if (!notificationsEnabled()) return disabledResponse();

  const context = await getCurrentUserContext();
  if (!context || !["admin", "client"].includes(context.role.role)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const supabase = createAdminSupabase();
  let query = supabase.from("notification_events").select("*").order("created_at", { ascending: false }).limit(80);

  if (context.role.role === "client") {
    if (!context.role.client_id) return NextResponse.json({ enabled: true, notifications: [], unreadCount: 0 });
    query = query.eq("client_id", context.role.client_id);
  } else {
    const clientId = searchParams.get("clientId")?.trim();
    const projectId = searchParams.get("projectId")?.trim();
    if (clientId) query = query.eq("client_id", clientId);
    if (projectId) query = query.eq("project_id", projectId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[notifications] list failed", errorPayload(error));
    return NextResponse.json({ error: "Could not load notifications." }, { status: 500 });
  }

  const notifications = data ?? [];
  const unreadCount = notifications.filter((item) => !item.read_at).length;
  return NextResponse.json({ enabled: true, notifications, unreadCount });
}

export async function POST(request: Request) {
  if (!notificationsEnabled()) {
    return NextResponse.json({ error: "Notifications are disabled." }, { status: 404 });
  }

  const context = await getCurrentUserContext();
  if (!context || context.role.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const status = typeof body.status === "string" ? body.status : "";
  const action = getNotificationAction(status);
  if (!action) return NextResponse.json({ error: "Unsupported notification type." }, { status: 400 });

  const projectId = stringValue(body.projectId) || null;
  let clientId = stringValue(body.clientId) || null;
  const phaseName = stringValue(body.phaseName) || null;
  const destination = stringValue(body.destination) || null;
  const quantity = optionalQuantity(body.quantity);
  const supabase = createAdminSupabase();
  let projectName = "selected project";

  if (projectId) {
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .maybeSingle();

    if (projectError) {
      console.error("[notifications] project lookup failed", errorPayload(projectError));
      return NextResponse.json({ error: "Could not verify the selected project." }, { status: 500 });
    }

    const row = project as { client_id?: string | null; project_name?: string | null; name?: string | null } | null;
    clientId = clientId ?? row?.client_id ?? null;
    projectName = row?.project_name || row?.name || projectName;
  }

  if (!clientId) return NextResponse.json({ error: "Select a project with a linked client before sending a notification." }, { status: 400 });
  const locationLabel = destination || phaseName;
  const title = phaseName ? `${action.title} - ${phaseName}` : action.title;
  const messageLines = [
    phaseName ? phaseMessage(action.status, action.message, phaseName) : `${action.message} (${projectName})`,
    destination && destination !== phaseName ? `Destination: ${destination}` : "",
    quantity !== null ? `Quantity: ${quantity} boards` : "",
    !phaseName && destination ? `Location: ${locationLabel}` : ""
  ].filter(Boolean);

  const { data, error } = await supabase
    .from("notification_events")
    .insert({
      project_id: projectId,
      client_id: clientId,
      phase_name: phaseName,
      destination,
      quantity,
      title,
      message: messageLines.join("\n"),
      status: action.status
    })
    .select()
    .single();

  if (error) {
    console.error("[notifications] create failed", errorPayload(error));
    return NextResponse.json({ error: "Could not create notification." }, { status: 500 });
  }

  return NextResponse.json({ notification: data });
}

export async function PATCH(request: Request) {
  if (!notificationsEnabled()) {
    return NextResponse.json({ error: "Notifications are disabled." }, { status: 404 });
  }

  const context = await getCurrentUserContext();
  if (!context || !["admin", "client"].includes(context.role.role)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" && body.id.trim() ? body.id.trim() : "";
  const markAllRead = body.markAllRead === true;
  const supabase = createAdminSupabase();
  const readAt = new Date().toISOString();

  let query = supabase.from("notification_events").update({ read_at: readAt });
  if (markAllRead) {
    if (context.role.role === "client") {
      if (!context.role.client_id) return NextResponse.json({ error: "Client account is not linked." }, { status: 400 });
      query = query.eq("client_id", context.role.client_id).is("read_at", null);
    } else {
      return NextResponse.json({ error: "Admin mark-all requires a client context." }, { status: 400 });
    }
  } else {
    if (!id) return NextResponse.json({ error: "Notification id is required." }, { status: 400 });
    query = query.eq("id", id);
    if (context.role.role === "client") {
      if (!context.role.client_id) return NextResponse.json({ error: "Client account is not linked." }, { status: 400 });
      query = query.eq("client_id", context.role.client_id);
    }
  }

  const { error } = await query;
  if (error) {
    console.error("[notifications] mark-read failed", errorPayload(error));
    return NextResponse.json({ error: "Could not update notification." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, readAt });
}

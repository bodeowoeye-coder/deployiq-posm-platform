import { cookies } from "next/headers";
import { getCurrentUserContext } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { writeAuditLog } from "@/lib/userManagement";

// Core Admin support access. The administrator keeps their own identity and Core Admin session;
// this module only grants a scoped, expiring authorisation to resolve one customer workspace.
export const SUPPORT_SESSION_COOKIE = "deployiq_support_session";
export const SUPPORT_SESSION_MINUTES = 60;

type Row = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export type ActiveSupportSession = {
  id: string;
  adminUserId: string;
  clientId: string;
  reason: string;
  startedAt: string | null;
  expiresAt: string;
  expiresInMinutes: number;
};

export class SupportAccessError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// Only a DeployIQ platform administrator may open a support session.
async function requirePlatformAdmin() {
  const context = await getCurrentUserContext();
  if (!context?.user) throw new SupportAccessError("Sign in to continue.", 401);
  if (context.role.role !== "admin") throw new SupportAccessError("Support access is restricted to DeployIQ platform administrators.", 403);
  return context;
}

export async function createSupportSession(input: { clientId: string; reason: string; initiatedFrom?: string | null }) {
  const context = await requirePlatformAdmin();
  const clientId = text(input.clientId);
  const reason = text(input.reason);
  if (!clientId) throw new SupportAccessError("Select a customer to support.", 400);
  if (reason.length < 5) throw new SupportAccessError("Provide a reason for accessing this customer workspace.", 400);

  const supabase = createAdminSupabase();
  // The workspace must genuinely exist and be provisioned for this customer.
  const [{ data: client }, { data: workspace }] = await Promise.all([
    supabase.from("clients").select("id,name").eq("id", clientId).maybeSingle(),
    supabase.from("workspace_settings").select("client_id,status").eq("client_id", clientId).maybeSingle(),
  ]);
  if (!client) throw new SupportAccessError("Customer not found.", 404);
  if (!workspace) throw new SupportAccessError("Workspace not provisioned.", 409);
  if (text(workspace.status) === "archived") throw new SupportAccessError("This workspace is archived.", 409);

  const expiresAt = new Date(Date.now() + SUPPORT_SESSION_MINUTES * 60_000).toISOString();
  const { data, error } = await supabase
    .from("workspace_support_sessions")
    .insert({
      admin_user_id: context.user.id,
      client_id: clientId,
      reason,
      status: "active",
      expires_at: expiresAt,
      initiated_from: text(input.initiatedFrom) || "customer_360",
      last_activity_at: new Date().toISOString(),
    })
    .select("id,expires_at")
    .single();
  if (error) throw error;

  cookies().set(SUPPORT_SESSION_COOKIE, text(data.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SUPPORT_SESSION_MINUTES * 60,
  });

  await writeAuditLog({
    actorUserId: context.user.id,
    targetUserId: context.user.id,
    actionType: "support_session_started",
    newValue: { clientId, organisation: text(client.name), reason, expiresAt: text(data.expires_at) },
  });

  return { id: text(data.id), clientId, expiresAt: text(data.expires_at) };
}

// Resolves the support session for the current request. Returns null when there is no valid one,
// so normal customer sign-in is completely unaffected.
export async function resolveActiveSupportSession(): Promise<ActiveSupportSession | null> {
  const sessionId = cookies().get(SUPPORT_SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const context = await getCurrentUserContext();
  if (!context?.user || context.role.role !== "admin") return null;

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("workspace_support_sessions")
    .select("id,admin_user_id,client_id,reason,status,started_at,expires_at")
    .eq("id", sessionId)
    // The session is bound to the authenticated administrator; a stolen id is useless to anyone else.
    .eq("admin_user_id", context.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (error || !data) return null;

  const expiresAt = text(data.expires_at);
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  if (!expiresAt || Number.isNaN(remainingMs) || remainingMs <= 0) {
    await expireSupportSession(text(data.id), text(data.client_id), context.user.id);
    return null;
  }

  return {
    id: text(data.id),
    adminUserId: text(data.admin_user_id),
    clientId: text(data.client_id),
    reason: text(data.reason),
    startedAt: text(data.started_at) || null,
    expiresAt,
    expiresInMinutes: Math.max(0, Math.round(remainingMs / 60_000)),
  };
}

async function expireSupportSession(sessionId: string, clientId: string, adminUserId: string) {
  const supabase = createAdminSupabase();
  await supabase
    .from("workspace_support_sessions")
    .update({ status: "expired", ended_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("status", "active");
  cookies().delete(SUPPORT_SESSION_COOKIE);
  await writeAuditLog({
    actorUserId: adminUserId,
    targetUserId: adminUserId,
    actionType: "support_session_expired",
    newValue: { clientId, sessionId },
  }).catch(() => undefined);
}

export async function endSupportSession() {
  const context = await getCurrentUserContext();
  const sessionId = cookies().get(SUPPORT_SESSION_COOKIE)?.value;
  cookies().delete(SUPPORT_SESSION_COOKIE);
  if (!sessionId || !context?.user) return { ok: true, clientId: null as string | null };

  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("workspace_support_sessions")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("admin_user_id", context.user.id)
    .eq("status", "active")
    .select("client_id")
    .maybeSingle();

  const clientId = text((data as Row | null)?.client_id) || null;
  if (clientId) {
    await writeAuditLog({
      actorUserId: context.user.id,
      targetUserId: context.user.id,
      actionType: "support_session_ended",
      newValue: { clientId, sessionId },
    }).catch(() => undefined);
  }
  return { ok: true, clientId };
}

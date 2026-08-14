import { createHash, randomBytes } from "node:crypto";
import { createAdminSupabase } from "@/lib/supabaseAdmin";
import { getOnboardingDraftByToken } from "@/lib/commercial/onboarding/service";
import type { ProvisioningJobRecord } from "./service";

type ActivationNotificationRecord = {
  id: string;
  authenticated_user_id: string;
  onboarding_draft_id: string;
  provisioning_job_id: string;
  client_id: string | null;
  recipient_email: string;
  commercial_reference: string;
  status: "requested" | "sending" | "sent" | "failed" | "cancelled";
  requested_at: string;
  sent_at: string | null;
  failure_reason_safe: string | null;
  continuation_token_hash: string | null;
  continuation_token_expires_at: string | null;
  continuation_token_used_at: string | null;
  delivery_mode: string | null;
  development_delivery_payload?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type AuthenticatedUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normaliseEmail(value: unknown) {
  return text(value).toLowerCase();
}

function normaliseNotification(record: Record<string, unknown>): ActivationNotificationRecord {
  return {
    id: String(record.id ?? ""),
    authenticated_user_id: String(record.authenticated_user_id ?? ""),
    onboarding_draft_id: String(record.onboarding_draft_id ?? ""),
    provisioning_job_id: String(record.provisioning_job_id ?? ""),
    client_id: typeof record.client_id === "string" ? record.client_id : null,
    recipient_email: String(record.recipient_email ?? ""),
    commercial_reference: String(record.commercial_reference ?? ""),
    status: (record.status as ActivationNotificationRecord["status"]) ?? "requested",
    requested_at: String(record.requested_at ?? ""),
    sent_at: typeof record.sent_at === "string" ? record.sent_at : null,
    failure_reason_safe: typeof record.failure_reason_safe === "string" ? record.failure_reason_safe : null,
    continuation_token_hash: typeof record.continuation_token_hash === "string" ? record.continuation_token_hash : null,
    continuation_token_expires_at: typeof record.continuation_token_expires_at === "string" ? record.continuation_token_expires_at : null,
    continuation_token_used_at: typeof record.continuation_token_used_at === "string" ? record.continuation_token_used_at : null,
    delivery_mode: typeof record.delivery_mode === "string" ? record.delivery_mode : null,
    development_delivery_payload: record.development_delivery_payload && typeof record.development_delivery_payload === "object"
      ? record.development_delivery_payload as Record<string, unknown>
      : null,
    created_at: String(record.created_at ?? ""),
    updated_at: String(record.updated_at ?? ""),
  };
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function isDevelopmentEmailSimulationEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.DEPLOYIQ_RUNTIME_ENV !== "production";
}

function publicBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "")
    || process.env.DEPLOYIQ_APP_URL?.replace(/\/+$/, "")
    || "http://localhost:3000";
}

function providerEndpoint() {
  return process.env.DEPLOYIQ_TRANSACTIONAL_EMAIL_ENDPOINT?.trim() || "";
}

function providerToken() {
  return process.env.DEPLOYIQ_TRANSACTIONAL_EMAIL_TOKEN?.trim() || "";
}

async function findJobForDraft(draftId: string) {
  const { data, error } = await createAdminSupabase()
    .from("provisioning_jobs")
    .select("*")
    .eq("acquisition_draft_id", draftId)
    .maybeSingle();
  if (error) throw error;
  return data ? data as Record<string, unknown> : null;
}

async function findActiveNotification(jobId: string, recipientEmail: string) {
  const { data, error } = await createAdminSupabase()
    .from("workspace_activation_notifications")
    .select("*")
    .eq("provisioning_job_id", jobId)
    .eq("recipient_email", recipientEmail)
    .in("status", ["requested", "sending", "failed"])
    .maybeSingle();
  if (error) throw error;
  return data ? normaliseNotification(data as Record<string, unknown>) : null;
}

export async function getWorkspaceActivationNotificationState(input: {
  resumeToken: string;
  user: AuthenticatedUser;
}) {
  const draft = await getOnboardingDraftByToken(input.resumeToken);
  if (!draft) throw Object.assign(new Error("Workspace setup was not found."), { status: 404 });
  const recipientEmail = normaliseEmail(input.user.email);
  const adminEmail = normaliseEmail(draft.draft_data.adminEmail);
  if (!recipientEmail || recipientEmail !== adminEmail) {
    throw Object.assign(new Error("Notification can only be requested by the verified administrator."), { status: 403 });
  }
  if (draft.authenticated_user_id !== input.user.id) {
    throw Object.assign(new Error("This workspace setup belongs to another account."), { status: 403 });
  }

  const job = await findJobForDraft(draft.id);
  if (!job) return { requested: false, notification: null, job: null };
  const notification = await findActiveNotification(String(job.id), recipientEmail);
  return { requested: Boolean(notification), notification, job };
}

export async function requestWorkspaceActivationNotification(input: {
  resumeToken: string;
  user: AuthenticatedUser;
}) {
  const draft = await getOnboardingDraftByToken(input.resumeToken);
  if (!draft) throw Object.assign(new Error("Workspace setup was not found."), { status: 404 });
  const userEmail = normaliseEmail(input.user.email);
  const adminEmail = normaliseEmail(draft.draft_data.adminEmail);
  if (!input.user.email_confirmed_at && !input.user.confirmed_at) {
    throw Object.assign(new Error("Verify the administrator email before requesting a notification."), { status: 403 });
  }
  if (!userEmail || userEmail !== adminEmail || draft.draft_data.emailVerified !== true) {
    throw Object.assign(new Error("Notification can only be requested by the verified administrator."), { status: 403 });
  }
  if (draft.authenticated_user_id !== input.user.id) {
    throw Object.assign(new Error("This workspace setup belongs to another account."), { status: 403 });
  }

  const job = await findJobForDraft(draft.id);
  if (!job) {
    throw Object.assign(new Error("Workspace preparation has not started yet. Start workspace setup first."), { status: 409 });
  }

  const existing = await findActiveNotification(String(job.id), userEmail);
  if (existing) return { notification: existing, created: false };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("workspace_activation_notifications")
    .insert({
      authenticated_user_id: input.user.id,
      onboarding_draft_id: draft.id,
      provisioning_job_id: String(job.id),
      client_id: text((job.result_data as Record<string, unknown>)?.organisationId) || null,
      recipient_email: userEmail,
      commercial_reference: text(job.commercial_reference),
      status: "requested",
      requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) {
    const duplicate = await findActiveNotification(String(job.id), userEmail);
    if (duplicate) return { notification: duplicate, created: false };
    throw error;
  }

  return { notification: normaliseNotification(data as Record<string, unknown>), created: true };
}

function buildWorkspaceReadyEmail(input: {
  notification: ActivationNotificationRecord;
  job: ProvisioningJobRecord;
  continuationToken: string;
}) {
  const resultData = input.job.result_data ?? {};
  const organisation = text(resultData.organisationName) || text(resultData.workspaceName) || "your organisation";
  const firstName = text(resultData.administratorName).split(/\s+/)[0] || "there";
  const workspaceUrl = text(resultData.workspaceUrl) || `https://${input.job.workspace_slug}.deployiq.ng`;
  const link = `${publicBaseUrl()}/workspace/continue?token=${encodeURIComponent(input.continuationToken)}`;
  return {
    to: input.notification.recipient_email,
    subject: "Your DeployIQ workspace is ready",
    body: [
      `Hello ${firstName},`,
      "",
      `Your DeployIQ workspace for ${organisation} is ready.`,
      "",
      "Use the secure link below to continue:",
      "",
      link,
      "",
      `Workspace: ${workspaceUrl}`,
      `Reference: ${input.notification.commercial_reference}`,
      "",
      "If you did not request this workspace, please contact DeployIQ support.",
    ].join("\n"),
    continuationLink: link,
    workspaceUrl,
    commercialReference: input.notification.commercial_reference,
  };
}

export async function deliverWorkspaceReadyNotifications(job: ProvisioningJobRecord) {
  if (job.status !== "completed" || job.result_data.workspaceReady !== true) return;

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("workspace_activation_notifications")
    .select("*")
    .eq("provisioning_job_id", job.id)
    .in("status", ["requested", "failed"]);
  if (error) throw error;

  for (const row of data ?? []) {
    const notification = normaliseNotification(row as Record<string, unknown>);
    const continuationToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString();
    const email = buildWorkspaceReadyEmail({ notification, job, continuationToken });
    await supabase
      .from("workspace_activation_notifications")
      .update({
        status: "sending",
        failure_reason_safe: null,
        continuation_token_hash: hashToken(continuationToken),
        continuation_token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", notification.id)
      .neq("status", "sent");

    if (isDevelopmentEmailSimulationEnabled()) {
      await supabase
        .from("workspace_activation_notifications")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          delivery_mode: "development_simulated",
          development_delivery_payload: email,
          updated_at: new Date().toISOString(),
        })
        .eq("id", notification.id)
        .neq("status", "sent");
      continue;
    }

    const endpoint = providerEndpoint();
    if (!endpoint) {
      await supabase
        .from("workspace_activation_notifications")
        .update({
          status: "failed",
          failure_reason_safe: "email_provider_not_configured",
          delivery_mode: "provider_missing",
          updated_at: new Date().toISOString(),
        })
        .eq("id", notification.id)
        .neq("status", "sent");
      continue;
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(providerToken() ? { Authorization: `Bearer ${providerToken()}` } : {}),
        },
        body: JSON.stringify(email),
      });
      if (!response.ok) throw new Error("provider_rejected_workspace_ready_email");
      await supabase
        .from("workspace_activation_notifications")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          delivery_mode: "transactional_provider",
          updated_at: new Date().toISOString(),
        })
        .eq("id", notification.id)
        .neq("status", "sent");
    } catch {
      await supabase
        .from("workspace_activation_notifications")
        .update({
          status: "failed",
          failure_reason_safe: "workspace_ready_email_delivery_failed",
          delivery_mode: "transactional_provider",
          updated_at: new Date().toISOString(),
        })
        .eq("id", notification.id)
        .neq("status", "sent");
    }
  }
}

export async function resolveWorkspaceContinuationToken(token: string) {
  const hash = hashToken(token);
  const { data, error } = await createAdminSupabase()
    .from("workspace_activation_notifications")
    .select("id, status, continuation_token_expires_at, continuation_token_used_at, provisioning_job_id")
    .eq("continuation_token_hash", hash)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "sent") return null;
  const expiresAt = text(data.continuation_token_expires_at);
  if (!expiresAt || new Date(expiresAt).getTime() < Date.now()) return null;
  if (data.continuation_token_used_at) return null;

  const { data: job, error: jobError } = await createAdminSupabase()
    .from("provisioning_jobs")
    .select("*")
    .eq("id", String(data.provisioning_job_id))
    .maybeSingle();
  if (jobError) throw jobError;
  if (!job || job.status !== "completed" || job.result_data?.workspaceReady !== true) return null;

  await createAdminSupabase()
    .from("workspace_activation_notifications")
    .update({ continuation_token_used_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", String(data.id))
    .is("continuation_token_used_at", null);

  return {
    workspaceSlug: String(job.workspace_slug ?? ""),
    adminWorkspaceUrl: text(job.result_data?.adminWorkspaceUrl) || `/workspace/admin?workspace=${encodeURIComponent(String(job.workspace_slug ?? ""))}`,
  };
}

-- ---------------------------------------------------------------------------
-- CO-1D workspace activation notification requests
-- ---------------------------------------------------------------------------
-- Stores customer requests to be emailed when a provisioning job becomes ready.
-- No credentials, OTPs, auth session tokens, or temporary passwords are stored.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workspace_activation_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authenticated_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  onboarding_draft_id uuid NOT NULL REFERENCES public.onboarding_drafts(id) ON DELETE CASCADE,
  provisioning_job_id uuid NOT NULL REFERENCES public.provisioning_jobs(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  commercial_reference text NOT NULL,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'sending', 'sent', 'failed', 'cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  failure_reason_safe text,
  continuation_token_hash text,
  continuation_token_expires_at timestamptz,
  continuation_token_used_at timestamptz,
  delivery_mode text,
  development_delivery_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_activation_notifications_active_uidx
  ON public.workspace_activation_notifications (provisioning_job_id, lower(recipient_email))
  WHERE status IN ('requested', 'sending', 'failed');

CREATE INDEX IF NOT EXISTS workspace_activation_notifications_job_status_idx
  ON public.workspace_activation_notifications (provisioning_job_id, status);

CREATE INDEX IF NOT EXISTS workspace_activation_notifications_token_hash_idx
  ON public.workspace_activation_notifications (continuation_token_hash)
  WHERE continuation_token_hash IS NOT NULL;

ALTER TABLE public.workspace_activation_notifications ENABLE ROW LEVEL SECURITY;

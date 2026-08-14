-- ---------------------------------------------------------------------------
-- CO-1D acquisition provisioning jobs and events
-- ---------------------------------------------------------------------------
-- Existing tenant model remains public.clients + related product resources.
-- This migration only adds an idempotent provisioning control plane.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provisioning_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acquisition_draft_id uuid NOT NULL REFERENCES public.onboarding_drafts(id) ON DELETE CASCADE,
  commercial_reference text NOT NULL,
  product_key text NOT NULL,
  workspace_slug text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  current_stage text NOT NULL DEFAULT 'queued'
    CHECK (current_stage IN (
      'queued',
      'validating',
      'reserving_workspace',
      'creating_organisation',
      'creating_workspace',
      'configuring_product',
      'creating_administrator',
      'creating_permissions',
      'seeding_workspace',
      'running_post_checks',
      'completed',
      'failed'
    )),
  progress_percent integer NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  failure_code text,
  failure_message text,
  result_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS provisioning_jobs_acquisition_draft_id_uidx
  ON public.provisioning_jobs (acquisition_draft_id);

CREATE UNIQUE INDEX IF NOT EXISTS provisioning_jobs_commercial_reference_uidx
  ON public.provisioning_jobs (commercial_reference);

CREATE UNIQUE INDEX IF NOT EXISTS provisioning_jobs_workspace_slug_uidx
  ON public.provisioning_jobs (workspace_slug);

CREATE INDEX IF NOT EXISTS provisioning_jobs_status_idx
  ON public.provisioning_jobs (status, current_stage);

CREATE TABLE IF NOT EXISTS public.provisioning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provisioning_job_id uuid NOT NULL REFERENCES public.provisioning_jobs(id) ON DELETE CASCADE,
  stage text NOT NULL,
  event_type text NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provisioning_events_job_created_idx
  ON public.provisioning_events (provisioning_job_id, created_at);

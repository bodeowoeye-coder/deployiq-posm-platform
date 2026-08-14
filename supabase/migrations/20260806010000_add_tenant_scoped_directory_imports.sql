-- ---------------------------------------------------------------------------
-- Customer Workspace Phase 2 Module 1: tenant-scoped directory imports
-- Runtime-safe package for a partially migrated Supabase database.
-- ---------------------------------------------------------------------------
-- Current expected runtime state:
-- - public.workspace_directory_import_batches may already exist and may contain data.
-- - public.deployment_locations may not yet have tenant/directory columns.
-- - public.commit_workspace_directory_import(...) may be missing.
--
-- This script is intentionally additive and idempotent:
-- - it does not drop or recreate populated tables;
-- - it does not rewrite or backfill legacy deployment_locations rows;
-- - it preserves legacy rows whose tenant fields remain NULL;
-- - it restricts Customer Workspace imports to trusted server/service-role calls.
-- ---------------------------------------------------------------------------

ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS product_key text;
ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS directory_record_type text;
ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS latitude numeric;
ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS longitude numeric;
ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS import_batch_id uuid;
ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS import_source text;
ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS imported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS imported_at timestamptz;
ALTER TABLE public.deployment_locations ADD COLUMN IF NOT EXISTS raw_data jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.workspace_directory_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  product_key text,
  directory_label text,
  source text,
  status text DEFAULT 'completed',
  imported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at timestamptz DEFAULT now(),
  records_imported integer DEFAULT 0,
  duplicate_count integer DEFAULT 0,
  error_count integer DEFAULT 0,
  warning_count integer DEFAULT 0,
  summary jsonb DEFAULT '{}'::jsonb,
  error_report jsonb DEFAULT '[]'::jsonb,
  idempotency_key text,
  source_file_hash text,
  preview_token_hash text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS product_key text;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS directory_label text;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed';
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS imported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS imported_at timestamptz DEFAULT now();
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS records_imported integer DEFAULT 0;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS duplicate_count integer DEFAULT 0;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS error_count integer DEFAULT 0;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS warning_count integer DEFAULT 0;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS summary jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS error_report jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS source_file_hash text;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS preview_token_hash text;
ALTER TABLE public.workspace_directory_import_batches ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE public.workspace_directory_import_batches ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.workspace_directory_import_batches ALTER COLUMN status SET DEFAULT 'completed';
ALTER TABLE public.workspace_directory_import_batches ALTER COLUMN imported_at SET DEFAULT now();
ALTER TABLE public.workspace_directory_import_batches ALTER COLUMN records_imported SET DEFAULT 0;
ALTER TABLE public.workspace_directory_import_batches ALTER COLUMN duplicate_count SET DEFAULT 0;
ALTER TABLE public.workspace_directory_import_batches ALTER COLUMN error_count SET DEFAULT 0;
ALTER TABLE public.workspace_directory_import_batches ALTER COLUMN warning_count SET DEFAULT 0;
ALTER TABLE public.workspace_directory_import_batches ALTER COLUMN summary SET DEFAULT '{}'::jsonb;
ALTER TABLE public.workspace_directory_import_batches ALTER COLUMN error_report SET DEFAULT '[]'::jsonb;
ALTER TABLE public.workspace_directory_import_batches ALTER COLUMN created_at SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.deployment_locations'::regclass
      AND conname = 'deployment_locations_client_workspace_match_check'
  ) THEN
    ALTER TABLE public.deployment_locations
      ADD CONSTRAINT deployment_locations_client_workspace_match_check
      CHECK (
        (client_id IS NULL AND workspace_id IS NULL)
        OR client_id = workspace_id
      )
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.workspace_directory_import_batches'::regclass
      AND conname = 'workspace_directory_import_batches_client_workspace_match_check'
  ) THEN
    ALTER TABLE public.workspace_directory_import_batches
      ADD CONSTRAINT workspace_directory_import_batches_client_workspace_match_check
      CHECK (
        (client_id IS NULL AND workspace_id IS NULL)
        OR client_id = workspace_id
      )
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.workspace_directory_import_batches'::regclass
      AND conname = 'workspace_directory_import_batches_status_check'
  ) THEN
    ALTER TABLE public.workspace_directory_import_batches
      ADD CONSTRAINT workspace_directory_import_batches_status_check
      CHECK (status IN ('previewed', 'completed', 'failed', 'rolled_back'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.workspace_directory_import_batches'::regclass
      AND conname = 'workspace_directory_import_batches_records_imported_check'
  ) THEN
    ALTER TABLE public.workspace_directory_import_batches
      ADD CONSTRAINT workspace_directory_import_batches_records_imported_check
      CHECK (records_imported >= 0)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.workspace_directory_import_batches'::regclass
      AND conname = 'workspace_directory_import_batches_duplicate_count_check'
  ) THEN
    ALTER TABLE public.workspace_directory_import_batches
      ADD CONSTRAINT workspace_directory_import_batches_duplicate_count_check
      CHECK (duplicate_count >= 0)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.workspace_directory_import_batches'::regclass
      AND conname = 'workspace_directory_import_batches_error_count_check'
  ) THEN
    ALTER TABLE public.workspace_directory_import_batches
      ADD CONSTRAINT workspace_directory_import_batches_error_count_check
      CHECK (error_count >= 0)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.workspace_directory_import_batches'::regclass
      AND conname = 'workspace_directory_import_batches_warning_count_check'
  ) THEN
    ALTER TABLE public.workspace_directory_import_batches
      ADD CONSTRAINT workspace_directory_import_batches_warning_count_check
      CHECK (warning_count >= 0)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.deployment_locations'::regclass
      AND conname = 'deployment_locations_import_batch_id_fkey'
  ) THEN
    ALTER TABLE public.deployment_locations
      ADD CONSTRAINT deployment_locations_import_batch_id_fkey
      FOREIGN KEY (import_batch_id)
      REFERENCES public.workspace_directory_import_batches(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS deployment_locations_client_id_idx ON public.deployment_locations(client_id);
CREATE INDEX IF NOT EXISTS deployment_locations_workspace_product_idx ON public.deployment_locations(workspace_id, product_key);
CREATE INDEX IF NOT EXISTS deployment_locations_import_batch_id_idx ON public.deployment_locations(import_batch_id);
CREATE INDEX IF NOT EXISTS deployment_locations_external_id_idx ON public.deployment_locations(client_id, product_key, external_id);
CREATE INDEX IF NOT EXISTS workspace_directory_import_batches_client_id_idx ON public.workspace_directory_import_batches(client_id, imported_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS deployment_locations_workspace_product_external_id_uidx
ON public.deployment_locations (
  client_id,
  workspace_id,
  product_key,
  lower(btrim(external_id))
)
WHERE client_id IS NOT NULL
  AND workspace_id IS NOT NULL
  AND product_key IS NOT NULL
  AND NULLIF(btrim(external_id), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS workspace_directory_import_batches_idempotency_uidx
ON public.workspace_directory_import_batches (
  client_id,
  workspace_id,
  product_key,
  idempotency_key
)
WHERE client_id IS NOT NULL
  AND workspace_id IS NOT NULL
  AND product_key IS NOT NULL
  AND idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS workspace_directory_import_batches_batch_scope_uidx
ON public.workspace_directory_import_batches (
  id,
  client_id,
  workspace_id,
  product_key
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.deployment_locations'::regclass
      AND conname = 'deployment_locations_import_batch_scope_fkey'
  ) THEN
    ALTER TABLE public.deployment_locations
      ADD CONSTRAINT deployment_locations_import_batch_scope_fkey
      FOREIGN KEY (import_batch_id, client_id, workspace_id, product_key)
      REFERENCES public.workspace_directory_import_batches(id, client_id, workspace_id, product_key)
      NOT VALID;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.commit_workspace_directory_import(
  uuid,
  uuid,
  text,
  text,
  uuid,
  text,
  jsonb,
  jsonb,
  jsonb
);

CREATE OR REPLACE FUNCTION public.commit_workspace_directory_import(
  p_client_id uuid,
  p_workspace_id uuid,
  p_product_key text,
  p_directory_label text,
  p_imported_by uuid,
  p_import_source text,
  p_rows jsonb,
  p_summary jsonb,
  p_error_report jsonb,
  p_idempotency_key text DEFAULT NULL,
  p_source_file_hash text DEFAULT NULL,
  p_preview_token_hash text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id uuid;
  v_records integer := COALESCE(jsonb_array_length(p_rows), 0);
  v_duplicates integer := COALESCE((p_summary->>'duplicateCount')::integer, 0);
  v_errors integer := COALESCE((p_summary->>'errorCount')::integer, 0);
  v_warnings integer := COALESCE((p_summary->>'warningCount')::integer, 0);
  v_import_source text := COALESCE(NULLIF(btrim(p_import_source), ''), 'upload');
  v_idempotency_key text := NULLIF(btrim(p_idempotency_key), '');
BEGIN
  IF p_client_id IS NULL OR p_workspace_id IS NULL OR p_imported_by IS NULL THEN
    RAISE EXCEPTION 'Tenant-scoped import requires client, workspace and importing user.';
  END IF;

  IF p_client_id <> p_workspace_id THEN
    RAISE EXCEPTION 'Directory import client/workspace mismatch.';
  END IF;

  IF NULLIF(btrim(COALESCE(p_product_key, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Directory import requires a product key.';
  END IF;

  IF v_errors > 0 THEN
    RAISE EXCEPTION 'Cannot commit a directory import with validation errors.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_memberships membership
    WHERE membership.client_id = p_client_id
      AND membership.user_id = p_imported_by
      AND membership.status = 'active'
      AND membership.role_key IN ('customer_admin', 'workspace_owner', 'workspace_administrator')
  ) THEN
    RAISE EXCEPTION 'Directory import requires an active workspace administrator.';
  END IF;

  IF v_idempotency_key IS NOT NULL THEN
    SELECT batch.id
    INTO v_batch_id
    FROM public.workspace_directory_import_batches batch
    WHERE batch.client_id = p_client_id
      AND batch.workspace_id = p_workspace_id
      AND batch.product_key = p_product_key
      AND batch.idempotency_key = v_idempotency_key
    LIMIT 1;

    IF v_batch_id IS NOT NULL THEN
      RETURN v_batch_id;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.workspace_directory_import_batches (
      client_id,
      workspace_id,
      product_key,
      directory_label,
      source,
      status,
      imported_by,
      records_imported,
      duplicate_count,
      error_count,
      warning_count,
      summary,
      error_report,
      idempotency_key,
      source_file_hash,
      preview_token_hash
    )
    VALUES (
      p_client_id,
      p_workspace_id,
      p_product_key,
      p_directory_label,
      v_import_source,
      'completed',
      p_imported_by,
      v_records,
      v_duplicates,
      v_errors,
      v_warnings,
      COALESCE(p_summary, '{}'::jsonb),
      COALESCE(p_error_report, '[]'::jsonb),
      v_idempotency_key,
      NULLIF(btrim(p_source_file_hash), ''),
      NULLIF(btrim(p_preview_token_hash), '')
    )
    RETURNING id INTO v_batch_id;
  EXCEPTION WHEN unique_violation THEN
    IF v_idempotency_key IS NULL THEN
      RAISE;
    END IF;

    SELECT batch.id
    INTO v_batch_id
    FROM public.workspace_directory_import_batches batch
    WHERE batch.client_id = p_client_id
      AND batch.workspace_id = p_workspace_id
      AND batch.product_key = p_product_key
      AND batch.idempotency_key = v_idempotency_key
    LIMIT 1;

    IF v_batch_id IS NOT NULL THEN
      RETURN v_batch_id;
    END IF;

    RAISE;
  END;

  INSERT INTO public.deployment_locations (
    client_id,
    workspace_id,
    product_key,
    directory_record_type,
    external_id,
    state,
    outlet_name,
    owner_name,
    address,
    brand_type,
    outlet_code,
    latitude,
    longitude,
    import_batch_id,
    import_source,
    imported_by,
    imported_at,
    raw_data,
    updated_at
  )
  SELECT
    p_client_id,
    p_workspace_id,
    p_product_key,
    COALESCE(NULLIF(row_data.directory_record_type, ''), p_directory_label),
    NULLIF(btrim(row_data.external_id), ''),
    row_data.state,
    row_data.outlet_name,
    NULLIF(row_data.owner_name, ''),
    NULLIF(row_data.address, ''),
    NULLIF(row_data.brand_type, ''),
    NULLIF(row_data.outlet_code, ''),
    row_data.latitude,
    row_data.longitude,
    v_batch_id,
    v_import_source,
    p_imported_by,
    now(),
    COALESCE(row_data.raw_data, '{}'::jsonb),
    now()
  FROM jsonb_to_recordset(COALESCE(p_rows, '[]'::jsonb)) AS row_data(
    state text,
    outlet_name text,
    owner_name text,
    address text,
    brand_type text,
    outlet_code text,
    external_id text,
    directory_record_type text,
    latitude numeric,
    longitude numeric,
    raw_data jsonb
  );

  UPDATE public.workspace_onboarding_checklist_items item
  SET completed = true,
      completed_at = COALESCE(item.completed_at, now()),
      updated_at = now()
  FROM public.workspace_onboarding_checklists checklist
  WHERE item.checklist_id = checklist.id
    AND checklist.client_id = p_client_id
    AND item.item_key = 'upload_directory';

  UPDATE public.workspace_onboarding_checklists checklist
  SET status = 'in_progress',
      updated_at = now()
  WHERE checklist.client_id = p_client_id
    AND checklist.status = 'not_started';

  RETURN v_batch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_workspace_directory_import(
  uuid,
  uuid,
  text,
  text,
  uuid,
  text,
  jsonb,
  jsonb,
  jsonb,
  text,
  text,
  text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_workspace_directory_import(
  uuid,
  uuid,
  text,
  text,
  uuid,
  text,
  jsonb,
  jsonb,
  jsonb,
  text,
  text,
  text
) FROM anon;
REVOKE ALL ON FUNCTION public.commit_workspace_directory_import(
  uuid,
  uuid,
  text,
  text,
  uuid,
  text,
  jsonb,
  jsonb,
  jsonb,
  text,
  text,
  text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.commit_workspace_directory_import(
  uuid,
  uuid,
  text,
  text,
  uuid,
  text,
  jsonb,
  jsonb,
  jsonb,
  text,
  text,
  text
) TO service_role;

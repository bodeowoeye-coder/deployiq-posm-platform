-- ---------------------------------------------------------------------------
-- CO-1D DeployIQ Retail workspace reference provisioning foundation
-- ---------------------------------------------------------------------------
-- Reuses public.clients as the workspace/client identity and adds durable
-- product-scoped configuration interpreted from retail_workspace_manifest.
-- No GCPL pilot data is copied by this migration.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workspace_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  workspace_display_name text NOT NULL,
  workspace_slug text NOT NULL UNIQUE,
  product_key text NOT NULL,
  product_name text NOT NULL,
  provisioning_manifest_key text NOT NULL,
  manifest_version text NOT NULL,
  country text,
  timezone text NOT NULL DEFAULT 'Africa/Lagos',
  currency text NOT NULL DEFAULT 'NGN',
  language text NOT NULL DEFAULT 'en-NG',
  date_format text NOT NULL DEFAULT 'DD MMM YYYY',
  commercial_reference text,
  pricing_template_id uuid REFERENCES public.commercial_pricing_templates(id) ON DELETE SET NULL,
  programme_quantity integer NOT NULL DEFAULT 0 CHECK (programme_quantity >= 0),
  selected_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  commercial_model text,
  enabled_modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  terminology jsonb NOT NULL DEFAULT '{}'::jsonb,
  dashboard_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  provisioned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  product_key text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
  acquisition_draft_id uuid REFERENCES public.onboarding_drafts(id) ON DELETE SET NULL,
  commercial_reference text,
  pricing_template_id uuid REFERENCES public.commercial_pricing_templates(id) ON DELETE SET NULL,
  programme_quantity integer NOT NULL DEFAULT 0 CHECK (programme_quantity >= 0),
  enabled_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  activation_date timestamptz NOT NULL DEFAULT now(),
  commercial_model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, product_key)
);

CREATE TABLE IF NOT EXISTS public.workspace_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  role_key text NOT NULL,
  label text NOT NULL,
  description text,
  app_role text NOT NULL CHECK (app_role IN ('admin', 'client', 'installer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, role_key)
);

CREATE TABLE IF NOT EXISTS public.workspace_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.workspace_roles(id) ON DELETE CASCADE,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, permission)
);

CREATE TABLE IF NOT EXISTS public.workspace_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid REFERENCES public.workspace_roles(id) ON DELETE SET NULL,
  role_key text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'invited')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.workspace_navigation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  label text NOT NULL,
  module_key text NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  required_permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  capability text,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, item_key)
);

CREATE TABLE IF NOT EXISTS public.workspace_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  category text NOT NULL,
  status_key text NOT NULL,
  label text NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  terminal boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, category, status_key)
);

CREATE TABLE IF NOT EXISTS public.workspace_onboarding_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  manifest_key text NOT NULL,
  manifest_version text NOT NULL,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_onboarding_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.workspace_onboarding_checklists(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  label text NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (checklist_id, item_key)
);

CREATE TABLE IF NOT EXISTS public.workspace_report_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  report_key text NOT NULL,
  label text NOT NULL,
  empty_state text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  generated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, report_key)
);

CREATE TABLE IF NOT EXISTS public.workspace_notification_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  label text NOT NULL,
  channel text NOT NULL DEFAULT 'in_app',
  enabled boolean NOT NULL DEFAULT true,
  send_external_email boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, event_key)
);

CREATE TABLE IF NOT EXISTS public.workspace_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  product_identity text NOT NULL,
  organisation_display_name text NOT NULL,
  workspace_initials text NOT NULL,
  logo_placeholder text NOT NULL,
  theme text NOT NULL,
  accent_colour text NOT NULL,
  notification_display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_settings_product_key_idx ON public.workspace_settings(product_key);
CREATE INDEX IF NOT EXISTS product_entitlements_product_key_idx ON public.product_entitlements(product_key, status);
CREATE INDEX IF NOT EXISTS workspace_roles_client_id_idx ON public.workspace_roles(client_id);
CREATE INDEX IF NOT EXISTS workspace_memberships_user_id_idx ON public.workspace_memberships(user_id);
CREATE INDEX IF NOT EXISTS workspace_navigation_client_id_idx ON public.workspace_navigation(client_id, sequence);
CREATE INDEX IF NOT EXISTS workspace_statuses_client_id_idx ON public.workspace_statuses(client_id, category);

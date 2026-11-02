-- These public-schema tables are server-authoritative. Historical browser-role
-- privileges are revoked by 20261016010000 and 20261016020000. Enable ordinary
-- RLS as an additional fail-closed boundary without adding browser policies,
-- forcing RLS for service operations, or changing any application data.

alter table public.commercial_pricing_snapshots enable row level security;
alter table public.commercial_pricing_templates enable row level security;
alter table public.commercial_pricing_tiers enable row level security;
alter table public.provisioning_events enable row level security;
alter table public.provisioning_jobs enable row level security;
alter table public.workspace_branding enable row level security;
alter table public.workspace_campaign_locations enable row level security;
alter table public.workspace_campaigns enable row level security;
alter table public.workspace_directory_import_batches enable row level security;
alter table public.workspace_field_assignments enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.workspace_navigation enable row level security;
alter table public.workspace_notification_defaults enable row level security;
alter table public.workspace_onboarding_checklist_items enable row level security;
alter table public.workspace_onboarding_checklists enable row level security;
alter table public.workspace_report_configs enable row level security;
alter table public.workspace_role_permissions enable row level security;
alter table public.workspace_roles enable row level security;
alter table public.workspace_settings enable row level security;
alter table public.workspace_statuses enable row level security;

revoke all privileges on table
  public.commercial_pricing_snapshots,
  public.commercial_pricing_templates,
  public.commercial_pricing_tiers,
  public.provisioning_events,
  public.provisioning_jobs,
  public.workspace_branding,
  public.workspace_campaign_locations,
  public.workspace_campaigns,
  public.workspace_directory_import_batches,
  public.workspace_field_assignments,
  public.workspace_memberships,
  public.workspace_navigation,
  public.workspace_notification_defaults,
  public.workspace_onboarding_checklist_items,
  public.workspace_onboarding_checklists,
  public.workspace_report_configs,
  public.workspace_role_permissions,
  public.workspace_roles,
  public.workspace_settings,
  public.workspace_statuses
from public, anon, authenticated;

grant all privileges on table
  public.commercial_pricing_snapshots,
  public.commercial_pricing_templates,
  public.commercial_pricing_tiers,
  public.provisioning_events,
  public.provisioning_jobs,
  public.workspace_branding,
  public.workspace_campaign_locations,
  public.workspace_campaigns,
  public.workspace_directory_import_batches,
  public.workspace_field_assignments,
  public.workspace_memberships,
  public.workspace_navigation,
  public.workspace_notification_defaults,
  public.workspace_onboarding_checklist_items,
  public.workspace_onboarding_checklists,
  public.workspace_report_configs,
  public.workspace_role_permissions,
  public.workspace_roles,
  public.workspace_settings,
  public.workspace_statuses
to service_role;

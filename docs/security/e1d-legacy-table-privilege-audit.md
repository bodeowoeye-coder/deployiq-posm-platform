# E1D legacy table privilege audit

Audit source: read-only metadata from Supabase Staging project `pmdgpgfbtolrgmuusszy`, correlated with repository HEAD `9c7fe5c32d125b6e16b537a2082a1b57a5ed7abc`.

Legend:

- `A7`: `SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER`.
- `S`: `SELECT`.
- `—`: no grant.
- `Policy-filtered`: the grant reaches RLS and the listed policy determines rows/commands.
- `Default-denied`: RLS is enabled but no policy permits browser access.
- `Directly exposed`: RLS is disabled, so browser grants are effective for the table.
- `Server`: application access is through authenticated API routes, `createAdminSupabase`, or service-only RPCs.
- `Session`: the authenticated Supabase client performs the established self/tenant-scoped read.

All 43 tables had no `PUBLIC` table privileges and `service_role` had `A7` in Staging. The remediation does not change either fact. It removes browser grants from server-authoritative tables. The canonical session migration retains only authenticated `SELECT` on `user_roles`, `user_profiles`, and `clients`.

| public table | anon | authenticated | RLS / policies | Effective pre-remediation access | Application dependency | Required browser privileges | Correction | Compatibility risk |
|---|---:|---:|---|---|---|---|---|---|
| agencies | A7 | A7 | on; none | Default-denied | Server: workspace field resources/search | — | Revoke both | Low |
| alert_events | A7 | A7 | on; none | Default-denied | Server: submissions/demo/admin alerts | — | Revoke both | Low |
| audit_logs | A7 | A7 | on; none | Default-denied | Server: user/admin audit services | — | Revoke both | Low |
| brands | A7 | A7 | on; client read policy | Policy-filtered reads; other commands denied by RLS | Server: brands/submissions/admin | — | Revoke both | Low |
| client_profiles | A7 | A7 | on; own-client read policy | Policy-filtered reads | Server: admin/customer services | — | Revoke both | Low |
| client_projects | A7 | A7 | on; none | Default-denied | No active browser consumer; legacy server schema | — | Revoke both | Low |
| clients | A7 | A7 | on; own-client read policy | Anonymous denied; authenticated tenant-filtered | Session plus server administration | authenticated S | Canonical session migration | Medium; retained intentionally |
| commercial_pricing_snapshots | A7 | A7 | off | Directly exposed | Server: acquisition checkout/pricing | — | Revoke both | Low |
| commercial_pricing_templates | A7 | A7 | off | Directly exposed | Server: pricing administration/evaluation | — | Revoke both | Low |
| commercial_pricing_tiers | A7 | A7 | off | Directly exposed | Server: pricing administration/evaluation | — | Revoke both | Low |
| deployment_locations | A7 | A7 | on; service management policy | Browser denied by policy expression | Server: workspace directory/search/submissions | — | Revoke both | Low |
| deployment_progress | A7 | A7 | on; linked-client read policy | Policy-filtered reads | Server-rendered client/workspace analytics | — | Revoke both | Low |
| deployment_stages | A7 | A7 | on; client read policy | Policy-filtered reads | Server reference/configuration reads | — | Revoke both | Low |
| installer_performance | A7 | A7 | on; none | Default-denied | No direct browser consumer; server reporting schema | — | Revoke both | Low |
| installers | A7 | A7 | on; none | Default-denied | Server: installer/resource/submission APIs | — | Revoke both | Low |
| notification_events | A7 | A7 | on; admin ALL, client SELECT/UPDATE policies | Policy-filtered client reads/updates | Server notification APIs/feed | — | Revoke both | Medium; APIs verified |
| onboarding_drafts | A7 | A7 | on; none | Default-denied | Server: anonymous token resume and authenticated ownership | — | Revoke both | Low |
| product_entitlements | S | S | on; none | Default-denied | Server: provisioning/customer administration | — | Revoke both | Low |
| project_targets | A7 | A7 | on; linked-client read policy | Policy-filtered reads | Server APIs and reporting | — | Revoke both | Low |
| projects | A7 | A7 | on; linked-client read policy | Policy-filtered reads | Server: Retail/Build project services | — | Revoke both | Medium; broad regression coverage |
| provisioning_events | A7 | A7 | off | Directly exposed | Server-only provisioning engine/admin diagnostics | — | Revoke both | Low |
| provisioning_jobs | A7 | A7 | off | Directly exposed | Server-only acquisition/provisioning/activation | — | Revoke both | Low |
| submission_status_history | A7 | A7 | on; linked-client read policy | Policy-filtered reads | Server submissions/admin reporting | — | Revoke both | Low |
| submissions | A7 | A7 | on; service ALL and linked-client read policies | Policy-filtered reads; service writes | Server submissions API/reporting | — | Revoke both | Medium; installer/API regressions required |
| user_profiles | A7 | A7 | on; self-read policy | Anonymous denied; authenticated self-filtered | Session-compatible read plus server profile services | authenticated S | Canonical session migration | Medium; retained intentionally |
| user_roles | A7 | A7 | on; self-read policy | Anonymous denied; authenticated self-filtered | Global Auth session role resolution | authenticated S | Canonical session migration | High; retained intentionally |
| workspace_activation_notifications | A7 | A7 | on; none | Default-denied | Server activation-notification service | — | Revoke both | Low |
| workspace_branding | A7 | A7 | off | Directly exposed | Server provisioning/customer workspace | — | Revoke both | Low |
| workspace_campaign_locations | A7 | A7 | off | Directly exposed | Server workspace campaign/location service | — | Revoke both | Low |
| workspace_campaigns | A7 | A7 | off | Directly exposed | Server workspace campaign service | — | Revoke both | Low |
| workspace_directory_import_batches | A7 | A7 | off | Directly exposed | Server directory-import service/RPC | — | Revoke both | Low |
| workspace_field_assignments | A7 | A7 | off | Directly exposed | Server field-resource/search services | — | Revoke both | Low |
| workspace_memberships | A7 | A7 | off | Directly exposed authorization data | Server workspace access/team/provisioning | — | Repaired by `20261016010000` | High; server access verified |
| workspace_navigation | A7 | A7 | off | Directly exposed | Server provisioning/workspace composition | — | Revoke both | Low |
| workspace_notification_defaults | A7 | A7 | off | Directly exposed | Server provisioning/settings | — | Revoke both | Low |
| workspace_onboarding_checklist_items | A7 | A7 | off | Directly exposed | Server provisioning/customer workspace | — | Revoke both | Low |
| workspace_onboarding_checklists | A7 | A7 | off | Directly exposed | Server provisioning/customer workspace | — | Revoke both | Low |
| workspace_report_configs | A7 | A7 | off | Directly exposed | Server provisioning/reporting | — | Revoke both | Low |
| workspace_role_permissions | A7 | A7 | off | Directly exposed authorization data | Server workspace access/team | — | Repaired by `20261016010000` | High; server access verified |
| workspace_roles | A7 | A7 | off | Directly exposed authorization data | Server workspace access/team | — | Repaired by `20261016010000` | High; server access verified |
| workspace_settings | A7 | A7 | off | Directly exposed tenant configuration | Server provisioning/customer/admin/support | — | Revoke both | Medium; workspace regressions required |
| workspace_statuses | A7 | A7 | off | Directly exposed status configuration | Server customer workspace/provisioning | — | Revoke both; preserve service SELECT | Medium; E1C lookup regression required |
| workspace_support_sessions | A7 | A7 | on; none | Default-denied | Server-only platform support access | — | Revoke both | Low |

## Dependency conclusions

1. Browser components use Supabase directly only for Auth and signed Build evidence Storage upload. They do not query these application tables.
2. `createUserSupabase` validates JWTs in server routes. Its only affected-table queries are the established `user_roles` and `clients` reads in Global Auth; both remain authenticated `SELECT` with RLS. `user_profiles` retains the matching canonical self-read contract.
3. Retail submissions, reporting, Customer Workspace, Build, notifications, commercial pricing, onboarding, provisioning, and support access use authenticated server routes and admin clients. Their browser roles require no table privileges.
4. Existing RLS policies are retained. Revocation is an additional outer permission boundary, not a substitute for tenant checks.
5. No table was ambiguous after code-path inspection. Legacy external consumers outside this repository cannot be proven; that operational risk must be checked before applying the migration to a shared environment.

## Material findings

- The 20 non-RLS tables with browser `A7` grants were directly exploitable through the Data API.
- The 10 RLS/no-policy tables were effectively default-denied, but the grants were unnecessary and unsafe against future policy changes.
- Most RLS-policy tables were row-filtered, but their broad grants exceeded actual application requirements.
- The three session tables are the sole intentional direct authenticated table-access contract.
- `PUBLIC` had no privilege on any affected table; no `PUBLIC` remediation was necessary.

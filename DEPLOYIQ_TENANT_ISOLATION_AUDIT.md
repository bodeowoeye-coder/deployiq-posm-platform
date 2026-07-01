# DeployIQ Phase 1 Audit: Tenant Isolation & Platform Architecture

Date: 2026-06-29  
Repository: deployiq-clean-new  
Scope: Read-only architectural and security audit for tenant/project isolation and platform modularization readiness

## Executive Summary

DeployIQ already has the right core entities for multi-tenant evolution (clients, projects, brands, submissions, user_roles, notification_events) and includes partial RLS policies in schema. However, the live application layer currently relies heavily on service-role access (via createAdminSupabase) for most API and dashboard reads/writes, which bypasses RLS controls. This makes tenant isolation mostly an application-level responsibility today.

Highest-priority concerns:

1. Service-role is used across nearly all API data paths, so DB-level tenant protection is not the primary enforcement point.
2. Admin data paths frequently allow unfiltered global reads (expected for super-admin, unsafe for future tenant-admin role split).
3. Duplicate detection loads recent submissions across projects, causing cross-project inference risk.
4. Storage object paths do not include tenant/project context and the bucket is public.
5. Retail-domain assumptions (GCPL constants, outlet/salon/dealer-board terminology) are deeply embedded in validation, submit flow, exports, and UI language.

Validation baseline:

- npx tsc --noEmit: passed
- npm run build: passed (with non-blocking Next metadataBase warning)

---

## Current Architecture Overview

### Frontend

- Next.js App Router with role-specific surfaces:
  - Admin: app/admin/* and components/AdminDashboard.tsx
  - Client: app/client/* and components/ClientDashboard.tsx
  - Installer submit: app/submit/page.tsx
  - Installer history: app/installer/history/page.tsx
- Role gating at route level uses requireRole in server components/layouts:
  - app/admin/AdminRoutePage.tsx
  - app/client/ClientRoutePage.tsx
  - app/submit/layout.tsx
  - app/installer/history/page.tsx

### Backend/API

- 21 route handlers under app/api, mostly server-side role checks with getCurrentUserContext or requireAdminContext.
- Data access is predominantly via createAdminSupabase (service role key), including client-scoped routes.

### Supabase usage

- Supabase Auth for users; custom role model in user_roles and user_profiles.
- Core business tables include clients, projects, brands, submissions, project_targets, deployment_progress, notification_events, deployment_locations.
- Schema enables RLS and defines select policies for client-facing access, but app usage patterns often bypass these with service role.

### Authentication flow

- Login page gets public config, signs in with supabase-js, then posts tokens to /api/auth/session.
- Cookies deployiq-access-token and deployiq-refresh-token are set server-side.
- getCurrentUserContext resolves user and role using user token first, then falls back to service-role lookups.

### Reporting/export

- Admin exports:
  - /api/exports/pdf
  - /api/exports/excel
- Client exports:
  - /api/client/exports/pdf
  - /api/client/exports/excel
- Client exports use loadClientSubmissionScope (client-aware visibility rules).

### Notifications

- /api/notifications supports admin and client read; admin create; admin/client patch read state.
- notification_events includes client_id and project_id.

### Media uploads

- Submission uploads to one public bucket (installation-images).
- Path format: installations/{timestamp}-{uuid}.jpg (no tenant/project structure).

### Approval/rejection workflow

- Submission PATCH route supports status changes, archive/restore/permanent delete, stage updates, and status history creation.
- Rejection reason validation exists in lib/submissionRejection.ts.

---

## Tenant Isolation Findings

This section reports each area with current behavior, gaps, leakage risk, and fix guidance.

### 1) Clients

Current scoping behavior:

- Client management endpoints are admin-only (/api/clients).
- Client dashboard resolved client is from role client_id and loadClientSubmissionScope.

Missing filters / gaps:

- No explicit tenant_id abstraction yet (client_id is current tenant key).

Leakage risk:

- Low currently for client users; medium for future role expansion if tenant concept broadens beyond client_id.

Recommended fix:

- Formalize tenant_id domain model (can initially alias client_id).
- Add a tenant context resolver used by all routes.

### 2) Users / Profiles

Current scoping behavior:

- user_roles ties user to role and optional client_id.
- user_profiles stores assignment arrays, status, agency linkage.

Missing filters / gaps:

- No client_id in user_profiles table.
- User-management APIs are admin-only but globally scoped.

Leakage risk:

- Medium for future tenant-admin model because profile and assignment reads are globally available to admin endpoints.

Recommended fix:

- Add explicit tenant ownership mapping for user profiles.
- Introduce scoped admin classes: platform_admin vs tenant_admin.

### 3) Projects

Current scoping behavior:

- /api/projects GET filters by client_id when requester role is client.
- Admin can query all projects.

Missing filters / gaps:

- No project_type/module field yet.

Leakage risk:

- Low for current client role; medium for future module segmentation.

Recommended fix:

- Add project_type and module_code support in project model.
- Centralize project-access guard helper and use it in all dependent routes.

### 4) Submissions

Current scoping behavior:

- POST is limited to admin/installer and hard-locked to GCPL pilot constants.
- Client views/exports use loadClientSubmissionScope filtering.
- Installer history filters by installer_user_id.

Missing filters / gaps:

- /api/submissions GET fetches all submissions for admin without any mandatory client/project constraints.
- Duplicate review query pulls recent submissions across all projects.

Leakage risk:

- High (cross-project inference from duplicate pool; broad admin endpoint for future tenant-admin role).

Recommended fix:

- Make project_id (or client_id + project_id) required for duplicate detection query.
- Introduce required tenant/project scope parameters for non-platform-admin reads.
- Add centralized submission-scope enforcement utility.

### 5) Deployment locations

Current scoping behavior:

- /api/deployment-locations GET allowed for admin/installer, optional state filter.

Missing filters / gaps:

- deployment_locations table has no client_id/project_id.

Leakage risk:

- Medium (global outlet dictionary visibility across tenants).

Recommended fix:

- Add tenant/project ownership strategy for location catalogs (global/shared vs tenant-private explicitly modeled).
- If tenant-private needed, add client_id and optional project_id columns + scoped indexes.

### 6) Notifications

Current scoping behavior:

- Client reads restricted by role client_id.
- Admin can optionally filter by clientId/projectId.

Missing filters / gaps:

- Admin read path does not require scope params.

Leakage risk:

- Medium for future tenant-admin role.

Recommended fix:

- Enforce client/project scope for tenant-admin contexts.
- Keep unrestricted access only for platform-admin.

### 7) Reports / exports

Current scoping behavior:

- Client exports are scoped through loadClientSubmissionScope.
- Admin exports apply filters only if provided.

Missing filters / gaps:

- Admin export routes can return full data if clientId/projectId omitted.

Leakage risk:

- High once non-platform admins exist.

Recommended fix:

- Mandatory tenant/project scope for tenant-admin export calls.
- Export guard middleware that verifies role + scope ownership before query execution.

### 8) Approvals/rejections

Current scoping behavior:

- PATCH on submissions is admin-only and can mutate any submission by id.

Missing filters / gaps:

- No ownership check (client/project) at mutation time.

Leakage risk:

- High for future tenant-admin split.

Recommended fix:

- Require and verify project/client ownership for all moderation actions unless platform-admin.

### 9) Analytics/dashboard queries

Current scoping behavior:

- Admin dashboard loads global submissions and related entities.
- Client dashboard receives scope-filtered submissions from loadClientSubmissionScope.

Missing filters / gaps:

- Admin dashboard architecture assumes global data visibility.

Leakage risk:

- Medium now; high if reused for tenant-admin without stricter scoping.

Recommended fix:

- Separate platform analytics from tenant analytics data providers.

### 10) Storage/media paths

Current scoping behavior:

- Upload path: installations/{timestamp}-{uuid}.jpg.
- Bucket is public via storage policy.

Missing filters / gaps:

- Path does not encode tenant/project/submission.
- Public bucket increases blast radius if image URLs leak.

Leakage risk:

- High (URL leakage risk and weak partitioning).

Recommended fix:

- Move to private bucket with signed URLs or policy-gated access.
- Path convention: tenant/{client_id}/project/{project_id}/submission/{submission_id}/{file}.

### 11) Admin views

Current scoping behavior:

- Admin route and dashboard intentionally global.

Missing filters / gaps:

- No concept of tenant-admin scope.

Leakage risk:

- High for intended multi-tenant platform hierarchy.

Recommended fix:

- Introduce role tiers and explicit admin scope model.

### 12) Client views

Current scoping behavior:

- Scoped by loadClientSubmissionScope and clientCanSeeSubmission.

Missing filters / gaps:

- Scope logic includes brand/project-name matching and Godrej special behavior, increasing complexity.

Leakage risk:

- Medium (logic regressions possible).

Recommended fix:

- Replace heuristic visibility with explicit access mapping tables.
- Keep brand/project fallback only for migration period.

### 13) Installer views

Current scoping behavior:

- Installer history filtered by installer_user_id.
- Submit endpoint role-checks installer/admin.

Missing filters / gaps:

- Installer assignment to project is hardcoded GCPL pilot in submit flow.

Leakage risk:

- Low now, but blocks module/tenant expansion.

Recommended fix:

- Dynamic assignment from user profile and project permissions.

### 14) API route pattern

Current scoping behavior:

- Auth checks are generally present.
- Access to DB often via service role.

Missing filters / gaps:

- Relying on service role bypasses RLS; route code must enforce every isolation rule manually.

Leakage risk:

- High systemic risk.

Recommended fix:

- Use user-scoped Supabase clients for user-facing reads/writes where feasible.
- Reserve service-role for trusted platform operations only.

---

## Project Isolation Findings

### Client dashboard

Current behavior:

- Client data source is loadClientSubmissionScope.
- Filters include project, campaign, region/state/LGA, status and GPS.

Gaps:

- Visibility relies on combined client_id + brand + (Godrej project name/id) heuristics.

Risk:

- Medium.

Fix:

- Enforce project membership with explicit mapping and remove name-based fallback after migration.

### Admin dashboard

Current behavior:

- Loads all submissions and supporting entities.

Gaps:

- No project guard for non-platform-admin future roles.

Risk:

- High for tenant-admin introduction.

Fix:

- Build scoped admin data loaders.

### Deployment Reports page

Current behavior:

- Report filters exist but admin scope constraints are optional.

Gaps:

- Unscoped exports possible.

Risk:

- High.

Fix:

- Mandatory project/client scope for tenant-admin; explicit platform-admin bypass only.

### PDF export

Current behavior:

- Admin PDF route starts from submissions select and applies optional filters.
- Client PDF route uses scoped submission loader.

Gaps:

- Admin filter optionality.

Risk:

- High.

Fix:

- Enforce scope contract at route entry.

### Excel export

Current behavior:

- Same pattern as PDF.

Gaps:

- Same optionality issue.

Risk:

- High.

Fix:

- Same export guard approach.

### Map views

Current behavior:

- Map renders whatever submissions array is passed.

Gaps:

- Isolation depends entirely on upstream query scope.

Risk:

- Medium.

Fix:

- Ensure map inputs are always scope-verified at backend source.

### Rejection/approval summaries

Current behavior:

- Built from whichever submissions are loaded in dashboard/export contexts.

Gaps:

- Global admin context not segmented.

Risk:

- Medium.

Fix:

- Recompute from scoped datasets only.

### Installer submit form

Current behavior:

- Hardcoded project/client for pilot and role checks.

Gaps:

- No dynamic project isolation model yet.

Risk:

- Medium platform-readiness risk.

Fix:

- Replace hardcoded IDs with assignment-based project selection and server-side scope verification.

### Duplicate prevention

Current behavior:

- Outlet duplicate check is project-scoped.
- Fingerprint/heuristic duplicate check uses recent submissions pool not project-scoped.

Gaps:

- Cross-project duplicate pool.

Risk:

- High.

Fix:

- Restrict duplicate pool to project_id and optionally client_id.

---

## Role & Permission Findings

Roles in use:

- admin
- client
- installer

### Pages/components potentially wrong role exposure

- No direct page-level bypass found for admin/client/installer route shells.
- Submit layout allows both installer and admin (intentional but should remain explicit in policy docs).

### APIs relying on frontend hiding

- Most APIs do server-side role checks.
- Notable gaps:
  - app/api/brands/route.ts has no auth check.
  - app/api/admin/diagnostics/route.ts has no session/role check.

### APIs needing stricter server-side permission checks

- app/api/submissions/route.ts GET and PATCH should support scope checks for future tenant-admin.
- app/api/exports/pdf/route.ts and app/api/exports/excel/route.ts should enforce scope for non-platform-admin.
- app/api/notifications/route.ts admin reads should become scope-bound for tenant-admin.

### Cross-client/project visibility risk

- High systemic risk due to service-role usage and optional scope enforcement in admin routes.

---

## Database Findings

### Tables with client_id and/or project_id (good foundation)

- brands: client_id
- projects: client_id, brand_id
- client_projects: client_id, project_id
- submissions: client_id, project_id, brand_id
- notification_events: client_id, project_id
- deployment_progress: project_id
- project_targets: project_id

### Tables missing client_id/project_id where multi-tenant needs may require it

- deployment_locations (global currently)
- installers (no direct client_id)
- agencies (no direct client_id)
- installer_performance (global by installer_name)
- user_profiles (no client_id direct)
- alert_events and submission_status_history rely only on submission linkage

### RLS posture

- RLS enabled on many tables in schema.sql.
- Policies exist for client read paths and service-role operations.
- Practical gap: route handlers frequently use service-role client, so RLS isolation is not the operational control layer.

### Potential schema additions for module readiness

- projects.project_type
- projects.module_code
- tenants (if client != tenant in future)
- tenant_modules (licensed modules)
- module_registry
- submissions.module_code or project_type snapshot field

### Index observations

Existing useful indexes:

- submissions_client_id_idx
- submissions_project_id_idx
- projects_client_id_idx
- brands_client_id_idx
- notification_events_client_id_idx
- notification_events_project_id_idx

Likely additional indexes for scale and stricter scoping:

- user_roles(role, client_id)
- user_roles(client_id)
- installers(user_id, agency_id) with optional client mapping once added
- deployment_locations(client_id, state) if tenant-private catalogs are introduced
- submissions(client_id, project_id, submitted_at desc) composite

### Storage bucket/path recommendations

- Keep non-public by default for evidence media.
- Use scoped hierarchical object keys.
- Add lifecycle and retention rules per tenant/module.

---

## API Route Findings

Route-by-route summary:

| Route | Method(s) | Data | Auth check | Client/project validation | Leakage risk | Recommended fix |
|---|---|---|---|---|---|---|
| /api/submissions | POST, GET, PATCH | submissions, alerts, history, storage | yes | partial (POST hardcoded project; GET/PATCH broad) | High | scope GET/PATCH by access model; project-scope duplicate query |
| /api/exports/pdf | GET | submissions + projects + installers/profiles | yes admin | optional filters | High | mandatory scope for tenant-admin contexts |
| /api/exports/excel | GET | submissions + projects | yes admin | optional filters | High | same as PDF |
| /api/client/exports/pdf | GET | scoped submissions | yes client | yes via loadClientSubmissionScope | Medium | simplify to explicit mapping tables |
| /api/client/exports/excel | GET | scoped submissions | yes client | yes via loadClientSubmissionScope | Medium | same as above |
| /api/projects | GET, POST, PATCH | projects, client_projects, targets, progress | yes | client GET scoped; admin global | Medium | add role tiering and module fields |
| /api/clients | GET, POST, PATCH, DELETE | clients + profiles | admin | n/a | Low | prepare tenant model abstraction |
| /api/users | GET, POST, PATCH | auth users, user_roles, profiles, installers | admin | n/a | Medium | support tenant-admin scoping in future |
| /api/notifications | GET, POST, PATCH | notification_events, projects | yes | client scoped; admin optional | Medium | require scope for tenant-admin |
| /api/deployment-locations | GET, POST, DELETE | deployment_locations | yes | state filter only | Medium | add tenant/project scope strategy |
| /api/brands | GET | brands | no | none | Medium | add auth + scoping for non-public catalogs |
| /api/agencies | GET, POST, PATCH | agencies | admin | none | Medium | add tenant linkage if needed |
| /api/installers | GET, POST, PATCH | installers | admin | none | Medium | add client/project ownership model |
| /api/project-targets | POST | project_targets | admin | project id required, no ownership guard | Medium | verify project ownership for tenant-admin |
| /api/audit-logs | GET | audit_logs | admin | none | Low | add tenant-aware audit slicing for tenant admins |
| /api/demo-data | GET, POST | clients/projects/users/submissions/alerts | admin | optional selected scope | Low | keep admin-only; add explicit environment guard |
| /api/admin/diagnostics | GET | submissions | none | none | Medium | requireAdminContext + disable in production unless needed |
| /api/auth/session | GET, POST, DELETE | auth + user_roles/profiles | yes token/session flow | role-level only | Low | keep; reduce service-role fallback dependency |
| /api/auth/public-config | GET | public keys | none | n/a | Low | acceptable |
| /api/auth/login-diagnostics | POST | logs | none | n/a | Low | gate by env to avoid noisy production logging |
| /api/health | GET | none | none | n/a | Low | acceptable |

---

## Reporting & Export Security Findings

### Admin reports

- Current state: broad query with optional filters.
- Risk: high for tenant-admin future because unscoped exports are possible.
- Required changes:
  - enforce role tier (platform_admin can global export, tenant_admin cannot)
  - require scope contract and validate ownership before query
  - embed applied scope metadata in export header for auditability

### Client reports

- Current state: uses loadClientSubmissionScope, generally safe.
- Risk: medium due to heuristic complexity (brand/project name based).
- Required changes:
  - migrate to explicit access mapping tables
  - keep deterministic project_id-based filtering as primary path

---

## Storage & Media Findings

Current behavior:

- One public bucket and flat installations path.

Risks:

- URL leakage exposes media broadly.
- No built-in path-level tenant partitioning.

Recommendations:

1. Migrate evidence to private bucket.
2. Use signed URLs with short TTL for UI rendering.
3. Path structure with tenant/client/project/submission identifiers.
4. Add media ownership metadata in DB and enforce joins for access.

---

## Retail-Specific Assumptions (for future module abstraction)

Representative assumptions found:

- GCPL pilot constants and project locking in submit flow.
- Dealer board / salon / outlet-centric language in submit, validation, exports, and dashboard labels.
- Installer-centric role and naming for field actors.
- Deployment terminology tightly bound to retail signage workflow.

Key files containing assumptions:

- app/api/submissions/route.ts
- app/submit/page.tsx
- lib/submissionValidation.ts
- lib/types.ts
- components/ClientDashboard.tsx
- components/AdminDashboard.tsx
- supabase/schema.sql

Abstraction recommendation (do later, not in this phase):

- Introduce module-specific label dictionaries and domain adapters.
- Keep canonical core terms internally (actor, site, evidence, work_item, project) while rendering module labels externally.

---

## DeployIQ Core Services: Reusability Assessment

| Core service | Current location | Reusability now | Cleanup needed before reuse |
|---|---|---|---|
| Authentication/session | lib/auth.ts, api/auth/session | Medium | reduce service-role fallback; add role-tier model |
| Tenant/project access control | lib/clientVisibility.ts, lib/clientSubmissions.ts | Medium-Low | replace heuristics with explicit access mapping |
| GPS capture/geocoding | app/submit/page.tsx, lib/reverseGeocoding.ts | High | extract shared form hooks/service API |
| Evidence/media upload | api/submissions + storage | Medium | private bucket + scoped keys + signed URLs |
| Approval workflow | api/submissions PATCH | Medium | ownership checks for non-platform admins |
| Rejection workflow | lib/submissionRejection.ts + PATCH | High | make module-configurable reason sets |
| Notifications | api/notifications + lib/notifications.ts | Medium | enforce scope policy by role tier |
| KPI engine | lib/reporting.ts, lib/operations.ts | High | ensure source dataset is scope-verified |
| PDF report generation | api/exports/pdf, api/client/exports/pdf | Medium | shared report engine with strict scope contract |
| Excel export | api/exports/excel, api/client/exports/excel | Medium | same as PDF |
| Map rendering | components/DeploymentMap.tsx | High | ensure upstream scope guarantees |
| Audit logging | lib/userManagement.ts + audit_logs | High | add tenant/project identifiers in log payloads |
| Offline queue | lib/installerDrafts.ts | High | convert retail fields to generic evidence payload schema |
| Duplicate detection | lib/duplicates.ts + submissions route | Medium | force project scope input, tune per module |

---

## Module Readiness Recommendations

Minimum architecture to support DeployIQ Retail, Build, Telecom, Audit:

1. Add project_type and module_code to projects.
2. Add module registry table defining module metadata, enabled features, label overrides.
3. Add tenant_modules table for licensed module activation.
4. Build module-aware navigation provider (per tenant + module).
5. Build shared dashboard KPI engine with module adapters.
6. Build shared evidence engine (upload, metadata, access, retention, media transforms).
7. Introduce role tiers:
   - platform_admin
   - tenant_admin
   - tenant_user (module-specific permissions)

### Suggested model concepts

- project_type: retail, build, telecom, audit
- module_registry: module_code, display_name, route_namespace, feature_flags
- tenant_modules: tenant/client_id + module_code + status + limits
- module navigation map: role + module_code -> allowed views/routes

---

## Risk Assessment Table

| Risk item | Severity | Affected files | Why it matters | Recommended remediation |
|---|---|---|---|---|
| Service-role used for most app data access | High | lib/supabaseAdmin.ts, many app/api routes | Bypasses RLS enforcement layer | Use user-scoped clients for user-facing data; reserve service role for privileged ops |
| Unscoped admin submissions read endpoint | High | app/api/submissions/route.ts | Broad read path not tenant/project constrained for future tenant-admin model | Add scope contract and ownership checks |
| Admin exports allow unfiltered global data | High | app/api/exports/pdf/route.ts, app/api/exports/excel/route.ts | Potential cross-tenant export leakage in tenant-admin future | Mandatory client/project constraints for tenant-admin |
| Duplicate detection pool not project-scoped | High | app/api/submissions/route.ts, lib/duplicates.ts | Cross-project inference and false duplicate coupling | Filter recent pool by project_id (+ client_id) |
| Public bucket and unscoped path format | High | supabase/schema.sql policies, app/api/submissions/route.ts | Leaked URLs can expose evidence media | Private bucket + signed URLs + scoped keys |
| Admin diagnostics route lacks explicit auth | Medium | app/api/admin/diagnostics/route.ts | Sensitive operational data exposed if route reachable | Add requireAdminContext and environment guard |
| Brands endpoint lacks auth | Medium | app/api/brands/route.ts | Catalog data exposed without auth | Require authenticated role and apply tenant/module scoping |
| Heuristic client visibility logic | Medium | lib/clientVisibility.ts, lib/clientSubmissions.ts | Complex rules are error-prone and hard to audit | Replace with explicit access mapping tables |
| Deployment locations globally shared | Medium | app/api/deployment-locations/route.ts, supabase/schema.sql | No tenant/project boundary for outlet directory | Decide shared/global vs tenant-private and model explicitly |
| Hardcoded GCPL pilot constants | Medium | app/api/submissions/route.ts, app/submit/page.tsx, lib/submissionValidation.ts | Blocks scaling to multi-module, multi-project platform | Move to assignment-driven configuration |

---

## Phased Implementation Roadmap

### Phase 1A: Critical tenant/project leakage fixes

- Introduce centralized scope resolver and scope guard utilities.
- Require scope enforcement for submission reads/mutations in non-platform-admin contexts.
- Restrict duplicate detection recent pool to project_id (and optionally client_id).

### Phase 1B: API permission hardening

- Define role tiers: platform_admin vs tenant_admin vs tenant_user.
- Apply strict server-side permission checks per route.
- Add auth to currently open endpoints (brands, diagnostics).

### Phase 1C: Report/export isolation fixes

- Enforce mandatory client/project scope for tenant-admin exports.
- Record export scope metadata in response headers/logs/audit logs.
- Standardize filter contract across PDF/Excel admin/client exports.

### Phase 1D: Storage/media path hardening

- Migrate to private evidence bucket.
- Implement scoped object key format with tenant/project/submission path hierarchy.
- Use signed URLs with expiry and revoke/rotation strategy.

### Phase 1E: Module registry and project_type preparation

- Add project_type/module_code fields.
- Add module_registry and tenant_modules.
- Add module-aware routing/navigation and feature flag checks.

### Phase 1F: Retail terminology cleanup for future DeployIQ Build readiness

- Introduce module label abstraction layer.
- Replace hardcoded retail text in UI and exports with module dictionary keys.
- Keep compatibility adapters during transition.

---

## Recommended First Implementation Prompt After Audit

Use this exact prompt to start Phase 1A:

Implement Phase 1A only: Critical tenant/project leakage fixes.

Requirements:
1. No UI redesign and no schema migration yet.
2. Add a centralized access-scope utility that resolves requester scope (platform_admin, tenant_admin, client, installer) and returns allowed client_id/project_id set.
3. Update app/api/submissions/route.ts:
   - GET must enforce scope for non-platform-admin contexts.
   - PATCH must verify mutation target belongs to allowed scope when requester is not platform_admin.
   - Duplicate detection recent query in POST must be filtered by project_id.
4. Keep existing behavior for platform_admin global access.
5. Add focused tests for cross-tenant and cross-project access denial.
6. Do not modify exports or storage in this phase.

Deliverables:
- Updated access utility and submissions route.
- Test cases proving scope enforcement and duplicate query scoping.
- Brief changelog and risk reduction summary.

---

## Validation Results (Requested Commands)

Executed as requested:

- npx tsc --noEmit: Passed
- npm run build: Passed

Observed warning:

- Next.js metadataBase warning during static page generation (non-blocking for this audit phase).

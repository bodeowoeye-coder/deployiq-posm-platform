# DeployIQ Build Site Foundation

## Purpose
This adjustment strengthens Sprint 1 by introducing Site as the core operational entity beneath a Project for Build use cases.

Hierarchy:

Client/Tenant -> Project -> Site -> Future operational modules

This is additive and does not change existing Retail deployment behavior.

## Why Site Sits Beneath Project
Build operations are executed at a physical destination. A Project can span one or many locations/phases, and each location needs distinct operational records. Site provides that consistent anchor.

Examples:
- A single estate project with Phase 1, Phase 2, and utilities as separate Sites.
- A national project with separate Sites per city/state.

## Relationship Model
- One Project can have many Sites.
- Every Site belongs to exactly one Client and one Project.
- Sites are unique by site_code within a project.

## Access and Ownership Rules
- `build_sites.project_id` references `projects.id`.
- `build_sites.client_id` references `clients.id`.
- API/service layer enforces project-client consistency.
- API/service layer enforces authenticated actor scope and project access.
- At this stage, create/update/archive operations are admin-only.
- Archived sites are excluded by default, with explicit include support for authorized admins.
- Retail projects are rejected for Build Site operations.

## Site Code Strategy
Current strategy supports:
- Manual admin-provided `site_code`, sanitized to uppercase token form.
- Safe default generation when omitted: `<PROJECT_PREFIX>-SITE-<NNN>`.

Rules:
- Unique within project.
- Stable and searchable.
- Intended for future reports/evidence linking.

No complex auto-numbering engine is introduced in this phase.

## Future Module Relationship Guidance
Future Build records should normally include:
- `client_id`
- `project_id`
- `site_id`

Applicable modules include:
- activities
- milestones
- supplies and deliveries
- progress reports
- site diary
- inspections
- QA/QC
- HSE
- documents
- equipment
- assets
- defects/snagging
- workforce
- photo/GPS evidence

## Supply Monitoring Site Relationship
Future supply flow:

Project -> Site -> Material Request -> Approval -> Dispatch -> Site Receipt -> Consumption / Stock Balance

Every future supply delivery should identify destination site with at least:
- `project_id`
- `site_id`
- supplier
- quantities
- GPS
- photographs
- receiver
- timestamp
- waybill/delivery note

No supply workflow is implemented in this adjustment.

## Migration and Rollback
Migration added:
- `supabase/migrations/20260714113000_build_sites_foundation.sql`

It is additive:
- creates `public.build_sites`
- adds indexes
- adds update timestamp trigger
- no changes to retail submissions/reports/exports
- no destructive edits or renames

Rollback options:
1. `drop trigger if exists trg_touch_build_sites_updated_at on public.build_sites;`
2. `drop function if exists public.touch_build_sites_updated_at();`
3. `drop table if exists public.build_sites;`

## Boundary: This Adjustment vs Sprint 2
Included now:
- Site schema, types, service, API foundation
- Project shell site-context preparation
- Build module context and registry alignment

Explicitly deferred to Sprint 2:
- Site management UI workflows
- activities/supplies/site diary/inspections/QA-QC/HSE implementations
- progress tracking workflows
- operational dashboards and reports

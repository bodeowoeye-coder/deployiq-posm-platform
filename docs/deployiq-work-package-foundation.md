# DeployIQ Work Package Foundation

## Purpose
Work Package is introduced as the primary operational grouping beneath Site.

Hierarchy:

Client -> Business Unit (optional) -> Portfolio (optional) -> Project -> Site -> Work Package

This is an additive foundation layer and does not modify existing Retail behavior.

## Why Work Package Exists
Site-level operations are often too broad for execution, controls, and accountability.
Work Packages provide manageable operational slices (for example Foundation, Electrical, Plumbing) where future modules can attach naturally.

## Relationship to Site
- Every Work Package belongs to exactly one Client, one Project, and one Site.
- Site must belong to the referenced Project.
- Project must belong to the referenced Client.
- Work Package code is unique within Site.

## Work Package Codes
Examples:
- EARTH-001
- FOUND-001
- ROOF-001
- ELEC-001

Code behavior:
- searchable
- stable identifier
- unique within site
- editable only through explicit update operations

## Future Module Ownership
Future operational records should normally attach to Work Package:
- Activities
- Supplies
- Progress
- Site Diary
- QA/QC
- Inspections
- Documents
- Evidence

Future relationship intent:
Client -> Project -> Site -> Work Package -> Operational Record

## Supply Monitoring Relationship
Planned future flow:

Project -> Site -> Work Package -> Material Request -> Approval -> Purchase -> Dispatch -> Delivery -> Inspection -> Accepted -> Consumption -> Remaining Stock

Future supply records should reference:
- client_id
- project_id
- site_id
- work_package_id

## Reporting Strategy
Work Packages enable future reporting cuts by:
- site
- work package
- contractor
- status
- planned versus actual dates

Portfolio and Business Unit reporting can be resolved through project relationships and should not be duplicated unnecessarily in all operational records.

## Migration Notes
Migration added:
- `supabase/migrations/20260714203000_build_work_package_foundation.sql`

Additive behavior:
- creates `build_work_packages`
- adds lookup indexes
- adds updated_at trigger
- no destructive table/column changes
- no retail flow/schema removals

## Rollback Notes
Suggested rollback sequence:
1. drop trigger `trg_touch_build_work_packages_updated_at`
2. drop function `touch_build_work_packages_updated_at`
3. drop table `build_work_packages`

## Boundary Before Sprint 2B
Included now:
- Work Package schema, contracts, service, and API foundation
- minimal Build dashboard read-only Work Package context under selected site

Deferred to Sprint 2B and beyond:
- work package management UI workflows
- activities/supplies/progress/diary/QA/inspection/document implementations
- kanban, gantt, timeline views
- operational reports

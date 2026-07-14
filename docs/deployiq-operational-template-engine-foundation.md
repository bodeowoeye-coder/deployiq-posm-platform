# DeployIQ Operational Template Engine Foundation (Sprint 2B)

## Purpose
Sprint 2B introduces a reusable Operational Template Engine beneath Work Package without enabling execution modules.

Hierarchy remains:

Client -> Business Unit (optional) -> Portfolio (optional) -> Project -> Site -> Work Package -> Template Engine

This sprint is additive and does not change Retail behavior.

## Scope Included
- Work Package Template schema
- Activity Template schema
- Checklist Template schema
- Inspection Template scaffold schema
- Safety Template scaffold schema
- Supply Template scaffold schema
- Equipment Template scaffold schema
- tenant/global template visibility logic
- template CRUD service
- instantiation preview service (structured output only)
- template API endpoints
- work-package template assignment field and display context

## Explicitly Out of Scope
- Progress tracking
- Site Diary
- Supply execution
- QA/QC execution
- Inspections execution
- Reports and dashboards
- Gantt and scheduling

## Visibility Rules
Global template:
- `is_global = true`
- `client_id = null`
- visible to all tenants

Tenant template:
- `is_global = false`
- `client_id = owning tenant`
- visible only to owning tenant

Template code uniqueness:
- global unique code across table

## Instantiation Preview
`instantiateTemplate()` currently returns a preview bundle only:
- template
- categories
- activities
- checklists
- inspection templates
- safety templates
- supply templates
- equipment templates
- shared resource requirements

No live Activities, Checklists, Inspections, Supplies, or Equipment records are created in Sprint 2B.

## Future Instantiation Flow (Sprint 2C+)
Template
-> Create Categories
-> Create Activities
-> Create Checklists
-> Create Shared Resource Requirements
-> Create Inspections
-> Create Safety Tasks
-> Create Supply Requirements
-> Create Equipment Requirements
-> Create Documents

All generated records should carry:
- client_id
- project_id
- site_id
- work_package_id
- source_template_id (or equivalent lineage fields)

Activity-template lineage should also preserve category relationship fields for reporting and progress grouping.

Shared resource requirement lineage should preserve catalogue identity (`resource_id`) and ownership level (template/category/activity-template).

## API Summary
`GET /api/build/templates`
- list templates
- get single template
- preview instantiation with `instantiate=true`

`POST /api/build/templates`
- create template record

`PATCH /api/build/templates`
- update template
- archive template
- assign/unassign template to work package via `action=assign`

All operations are tenant-aware and validated through existing work-package access gates.

## Migration
`supabase/migrations/20260714223000_operational_template_engine_foundation.sql`

Additive only:
- creates seven template tables
- adds updated_at triggers
- adds nullable `build_work_packages.template_id`
- no destructive change to existing operational or retail schema paths

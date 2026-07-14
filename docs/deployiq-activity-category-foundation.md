# DeployIQ Activity Category Foundation (Sprint 2C)

## Purpose
Sprint 2C introduces reusable Activity Categories beneath Operational Templates as the execution hierarchy preparation layer.

Hierarchy now:

Client -> Business Unit -> Portfolio -> Project -> Site -> Work Package -> Operational Template -> Activity Category

This sprint remains additive and does not enable live execution workflows.

## Scope Included
- Activity Category schema and service layer
- Activity Template linkage to exactly one category (`activity_category_id`)
- Category API (tenant-aware, admin writes)
- Template hierarchy display context under Work Packages
- Future strategy documentation for reporting, progress, and aggregation

## Explicitly Out of Scope
- Live Activities
- Progress tracking execution
- Site Diary execution
- Supply execution
- QA/QC execution
- Inspection execution
- Reports and dashboards
- Scheduling and Gantt

## Activity Category Model
Table: `build_activity_categories`

Core fields:
- id
- template_id
- sequence
- code
- name
- description
- category_type
- estimated_duration
- status
- created_at
- updated_at

Rules:
- each category belongs to one template
- `sequence` unique within template
- `code` unique within template

Category types (enum, extensible via ALTER TYPE):
- preparation
- execution
- inspection
- testing
- commissioning
- close_out
- general

## Activity Template Linkage
`build_activity_templates.activity_category_id` now links each activity template to one category.

Validation safeguards:
- application layer rejects missing category in template integrity checks
- database trigger rejects inserts/updates where:
  - activity has no category
  - category does not exist
  - category belongs to a different template

## Future Execution Hierarchy
Template
-> Categories
-> Activities
-> Checklists
-> Supply Requirements
-> Equipment
-> Safety Tasks
-> Inspection Requirements
-> Documents

## Future Reporting Strategy
Categories are the reporting group key for template and execution layers.

Examples of future category reporting buckets:
- Preparation
- Execution
- Inspection
- Close-Out

Rollups can then aggregate:
- Category -> Work Package -> Site -> Project -> Portfolio -> Business Unit -> Client

## Future Progress Strategy
Future progress calculations should support category-level weighting and completion snapshots, for example:
- Preparation: 100%
- Execution: 60%
- Inspection: 20%
- Close-Out: 0%

This sprint only defines the hierarchy foundation; no progress math is executed.

## Future Supply Aggregation Strategy
Ownership chain:
- Supply Requirements belong to Activities
- Activities belong to Categories
- Categories belong to Templates

Therefore future supply reporting can aggregate by:
- Category -> Work Package -> Site -> Project

## Future QA/QC and Dashboard Hierarchy
QA/QC, inspections, and dashboards should use Activity Categories as grouping buckets for:
- planning views
- completion views
- compliance views
- cross-site comparisons

No dashboard or execution implementation is introduced in Sprint 2C.

## Migration
`supabase/migrations/20260715001000_activity_category_foundation.sql`

Additive only:
- creates category enum and table
- links activity templates to categories
- adds trigger-based integrity validation
- no destructive changes
- no retail path changes

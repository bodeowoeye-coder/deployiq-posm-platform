# DeployIQ Shared Resource Foundation (Sprint 2D)

## Purpose
Sprint 2D introduces a shared Build Resource Foundation for reusable template-level requirements without implementing live execution assignment or consumption.

Hierarchy now:

Client -> Business Unit (optional) -> Portfolio (optional) -> Project -> Site -> Work Package -> Operational Template -> Activity Category -> Resource Requirements

This sprint remains additive and does not modify DeployIQ Retail workflows.

## Audit Findings (Existing Resource-Like Concepts)

### Retail/Platform Concepts Already Present
- `installers` and `agencies` are existing operational entities for retail submission and installer administration.
- `projects.assigned_installers` exists as an assignment field for retail/project operations.
- `projects.contractor` and work-package `contractor` text fields exist as metadata, not structured resource catalogue records.

### Template Scaffolds Already Present
- `build_supply_templates` contains free-text material and supplier-oriented fields (`material`, `preferred_supplier`, etc.).
- `build_equipment_templates` contains free-text equipment requirement fields.

### Gaps Identified
- no shared Build resource identity table for labour/material/equipment/vehicle/contractor/service
- no unified template-level resource requirement model spanning template/category/activity-template scopes
- no catalogue-level tenant/global visibility model for Build resources

### Design Decision
- Preserve `build_supply_templates` and `build_equipment_templates` for backward compatibility.
- Introduce shared `build_resources` and `build_template_resource_requirements` as the future source of truth.
- Do not destructively alter existing supply/equipment scaffolds in this sprint.

## Shared Resource Model

### Resource Taxonomy
`BuildResourceType` values:
- labour
- material
- equipment
- vehicle
- contractor
- service

Status values:
- draft
- active
- inactive
- archived

Requirement types:
- estimated
- mandatory
- optional

## Resource Catalogue Schema
Table: `build_resources`

Fields:
- id
- client_id (nullable only when `is_global=true`)
- code
- name
- description
- resource_type
- category
- unit_of_measure
- specification
- default_rate
- currency
- is_global
- status
- created_by
- created_at
- updated_at
- archived_at

Rules:
- global resources: `is_global=true`, `client_id=null`
- tenant resources: `is_global=false`, `client_id` required
- tenant visibility: own tenant records + approved globals
- unique code scoped by visibility:
  - global unique by `code`
  - tenant unique by `(client_id, code)`
- archived excluded by default in service/API reads

## Resource Grouping Strategy
This sprint uses a simple optional `category` field on `build_resources`.

Reason:
- least-complex additive model
- sufficient for initial grouping (Skilled Labour, Concrete Materials, Heavy Equipment, etc.)
- preserves flexibility to introduce normalized category tables later if governance complexity increases

## Template Resource Requirement Schema
Table: `build_template_resource_requirements`

Fields:
- id
- template_id
- activity_category_id (nullable)
- activity_template_id (nullable)
- resource_id
- sequence
- quantity
- unit_of_measure
- requirement_type
- required_stage
- mandatory
- notes
- created_at
- updated_at
- archived_at

Ownership scopes:
- template-level: category/activity null
- category-level: category set, activity null
- activity-template-level: activity set (category optional but validated if both supplied)

Validation rules:
- quantity > 0
- unit required, or auto-resolved from resource catalogue unit
- category must belong to template
- activity-template must belong to template
- activity-template category must match supplied category when both set
- resource must be tenant-visible for template ownership
- cross-tenant references blocked

## Global vs Tenant Governance
Current role model does not cleanly distinguish platform-admin from tenant-admin.

Conservative rule applied in Sprint 2D:
- global resource reads supported
- global resource writes are blocked in service/API
- tenant admin writes allowed for tenant-owned resources only

This prevents unintended cross-tenant catalog changes.

## Catalogue vs Transactional Values
Resource catalogue stores reusable identity and defaults.

Future transactional records (requests, dispatch, receipts, consumption, usage) must still store transactional facts, including:
- quantity
- unit
- specification snapshot
- evidence
- timestamps and actor context

Do not rely solely on catalogue defaults for transactional truth.

## Compatibility with Existing Supply/Equipment Scaffolds
Compatibility strategy:
- keep `build_supply_templates` and `build_equipment_templates` intact in Sprint 2D
- mark them as transitional in architecture guidance
- treat `build_template_resource_requirements` as forward model for shared requirements
- avoid dual-write conversion in this sprint
- avoid destructive schema changes

## Template Preview Integration
Template preview now includes shared `resourceRequirements` list and count summary while preserving legacy scaffold lists.

Future instantiation lifecycle target:

Template Resource Requirement
-> Planned Activity Resource Requirement
-> Assignment / Procurement / Delivery / Usage

No live assignment/consumption implemented in Sprint 2D.

## Future Supply Monitoring Relationship
Material flow target:

Material Resource
-> Template Requirement
-> Work Package Requirement
-> Material Request
-> Approval
-> Purchase
-> Dispatch
-> Site Receipt
-> Consumption
-> Remaining Stock

Future modules should reference `resource_id` wherever practical to reduce free-text duplication.

## Future Workforce Relationship
Labour flow target:

Labour Resource Type
-> Required Skill / Trade
-> Planned Headcount
-> Named Worker or Crew Assignment
-> Attendance / Time Record

No employee records, attendance, or payroll workflows are introduced in this sprint.

## Future Equipment/Vehicle Relationship
Equipment and vehicle flow target:

Equipment/Vehicle Resource Type
-> Required Quantity/Duration
-> Named Asset Assignment
-> Mobilisation
-> Usage Log
-> Breakdown / Maintenance

No asset assignment, usage logging, or maintenance implementation is introduced now.

## Future Contractor Relationship
Distinctions to preserve:
- generic contractor resource requirement (catalogue identity)
- named supplier/contractor company profile (future domain entity)
- assignment of contractor to Project/Site/Work Package/Activity (future execution entity)

No procurement, commercial contracting, invoicing, or payment workflows are introduced now.

## Migration and Rollback
Migration:
- `supabase/migrations/20260715014000_build_resource_foundation.sql`

Additive only:
- new resource enums
- `build_resources`
- `build_template_resource_requirements`
- validation and touch triggers
- no Retail table modifications
- no destructive changes to existing template scaffolds

Rollback notes are included in migration comments.

## Boundary Before Activity Template Authoring
Included in Sprint 2D:
- shared resource catalogue
- template-level/category-level/activity-template-level resource requirement definitions
- tenant/global read model with conservative global write restrictions
- read-only requirement summaries in template context

Deferred beyond Sprint 2D:
- activity template authoring flows
- live activity resource assignment
- procurement, stock, dispatch, receipt, usage, and billing workflows
- progress/reporting dashboards and scheduling

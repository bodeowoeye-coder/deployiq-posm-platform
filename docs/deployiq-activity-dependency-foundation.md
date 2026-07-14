# DeployIQ Activity Dependency Foundation (Sprint 2E)

## Objective

Sprint 2E introduces a shared activity dependency graph foundation for Build templates. This adds durable, tenant-safe dependency relationships between activity templates without introducing execution workflows or changing Retail behavior.

## Scope

This sprint adds:

- dependency edge model at template level (`build_activity_template_dependencies`)
- dependency relationship types (`FS`, `SS`, `FF`, `SF`)
- lag representation (`lag_value` + `lag_unit` where unit is `hours`, `days`, `weeks`)
- API and service layer for CRUD/archive with tenant/work-package enforcement
- graph validation primitives for cycle, duplicate, self-reference, missing-node, disconnected detection
- template preview execution-flow payload (topological order + edges + validation report)

This sprint does not add:

- runtime scheduling engine
- automatic activity start/finish calculations
- progress-state transitions based on dependency resolution
- supply/resource readiness constraints at execution time

## Data Model

### New enums

- `build_activity_dependency_type`: `FS`, `SS`, `FF`, `SF`
- `build_activity_dependency_lag_unit`: `hours`, `days`, `weeks`

### New table

`public.build_activity_template_dependencies`

- `id uuid primary key`
- `template_id uuid not null` -> `build_work_package_templates(id)`
- `predecessor_activity_template_id uuid not null` -> `build_activity_templates(id)`
- `successor_activity_template_id uuid not null` -> `build_activity_templates(id)`
- `dependency_type build_activity_dependency_type not null default 'FS'`
- `lag_value integer not null default 0 check (lag_value >= 0)`
- `lag_unit build_activity_dependency_lag_unit not null default 'days'`
- `mandatory boolean not null default true`
- `notes text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `archived_at timestamptz`

### Constraints and indexes

- self-reference guard: `check (predecessor_activity_template_id <> successor_activity_template_id)`
- partial unique edge guard for active dependencies:
  - `(template_id, predecessor_activity_template_id, successor_activity_template_id)` where `archived_at is null`
- lookup indexes on `template_id`, `predecessor_activity_template_id`, `successor_activity_template_id`, `archived_at`

### Trigger validation

`validate_build_activity_template_dependency()` enforces:

- predecessor and successor activities exist
- predecessor and successor activity templates both belong to `new.template_id`
- predecessor != successor

`touch_build_activity_template_dependencies_updated_at()` updates `updated_at` on update.

## Service/API Foundation

### Service

`lib/build/dependencies/service.ts`

Core operations:

- `assertDependencyAccess(...)`
- `getDependencies(...)`
- `getDependency(...)`
- `createDependency(...)`
- `updateDependency(...)`
- `archiveDependency(...)`

Access model:

- reuses `assertWorkPackageAccess` for tenant and role controls
- template visibility constrained to client scope or global templates
- dependency rows must remain within resolved template scope

Graph validator:

- `validateDependencyGraph(...)` returns:
  - `isValid`
  - `issues[]`
  - `disconnectedNodeIds[]`
  - `topologicalOrder[]`

Issue codes:

- `SELF_REFERENCE`
- `DUPLICATE_EDGE`
- `MISSING_NODE`
- `CYCLE`
- `DISCONNECTED`

Blocking policy:

- create/update rejects blocking issues (`SELF_REFERENCE`, `DUPLICATE_EDGE`, `MISSING_NODE`, `CYCLE`)
- disconnected graphs are surfaced as warnings (`DISCONNECTED`) but do not block write operations

### API

`app/api/build/dependencies/route.ts`

- `GET`
  - list dependencies (+ graph validation)
  - fetch single dependency by `dependencyId`
- `POST`
  - create dependency edge
- `PATCH`
  - update dependency edge
  - archive dependency (`archived: true` or `action: "archive"`)

All endpoints require:

- `projectId`
- `siteId`
- `workPackageId`
- `templateId`

## Template Preview Integration

`instantiateTemplate(...)` preview now includes `executionFlow`:

- `orderedActivities[]`: topological order mapped to activity code/name
- `edges[]`: dependency links with type/lag/mandatory metadata
- `graphValidation`: validator output for client-side diagnostics

Preview summary adds:

- `dependenciesCount`

This keeps dependency intelligence available to Build UX/reporting without activating execution semantics.

## Non-Regression Notes

- additive changes only; no existing tables or retail paths altered
- no changes to execution runtime behavior
- no changes to resource requirement behavior beyond preview enrichment

## Future Extensions

Foundation supports later sprints:

- scheduler that interprets `FS/SS/FF/SF` + lag
- calendar-aware duration and lag conversion rules
- critical-path and slack analysis
- dependency-aware progress gating
- supply/resource readiness constraints in dispatch planning

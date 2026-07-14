# DeployIQ Enterprise Hierarchy Foundation

## Audit Findings
1. `clients` already represents the top-level customer tenant/legal organization.
2. One client already owns many projects through `projects.client_id` and `client_projects`.
3. A separate top-level `organisation` table is unnecessary and would duplicate tenant identity.
4. `business_units` is the clearer extension for internal divisions under a client.
5. Projects can safely belong directly to a portfolio while the portfolio belongs to the client.

## Top-Level Tenant Decision
`clients` remains the top-level tenant and organization boundary.

Hierarchy introduced:

Client -> Business Unit (optional) -> Portfolio (optional) -> Project -> Site

## Business Unit Purpose
`business_units` models internal structure under a client tenant:
- division
- department
- subsidiary
- strategic business unit

Business Unit assignment is optional for projects so existing Retail and Build projects remain valid.

## Portfolio Purpose
`project_portfolios` groups related projects under a client, optionally under one business unit.

Portfolio assignment is optional for projects so existing flows continue unchanged.

## Optional Relationship Rules
- A business unit belongs to one client.
- A portfolio belongs to one client.
- A portfolio may optionally belong to one business unit.
- A project may optionally reference one business unit and one portfolio.
- If portfolio is set, it must belong to the same client as the project.
- If both business unit and portfolio are set, they must be consistent.
- Existing projects with null business_unit_id and portfolio_id remain valid.

## Ownership and Access-Control Flow
- Tenant identity is derived from authenticated context and existing role model.
- Client users can read only records for their own client.
- Admin users can read globally and perform create/update/archive operations.
- Server-side validation blocks cross-tenant ID combinations.
- Archived records are excluded by default in hierarchy APIs.

## Project and Site Relationships
- Sites still belong to project and client.
- Project-site ownership consistency remains server-side validated.
- Retail projects continue to reject Build Site operations.

## Future Operational Relationship
Future operational records should usually carry:
- `client_id`
- `project_id`
- `site_id`

They should not automatically duplicate `business_unit_id` and `portfolio_id` unless there is a specific reporting/performance need. Those values can usually be resolved from project relationships.

## Site Supply Monitoring Relationship
Planned hierarchy for supply monitoring:

Client -> Portfolio -> Project -> Site -> Supply Request -> Dispatch -> Receipt -> Consumption

Target future reporting outcomes:
- supplies by portfolio
- supplies by project
- supplies by site
- supplier performance across projects
- requested versus delivered quantities
- material consumption by site
- outstanding supplies by project

No supply workflows are implemented in this foundation task.

## Migration Notes
Migration added:
- `supabase/migrations/20260714170000_enterprise_hierarchy_foundation.sql`

Additive behavior:
- creates `business_units`
- creates `project_portfolios`
- adds nullable `projects.business_unit_id` and `projects.portfolio_id`
- adds tenant-oriented indexes and update triggers

No destructive data operations are included.

## Rollback Notes
Rollback order:
1. drop triggers for portfolio and business unit update timestamps
2. drop associated trigger functions
3. drop `projects.portfolio_id` and `projects.business_unit_id`
4. drop `project_portfolios`
5. drop `business_units`

## Boundary Before Sprint 2
Included in this Sprint 1.5 foundation:
- enterprise hierarchy data model and API foundation
- server-side tenancy and relationship validation
- minimal project page context preparation for hierarchy display

Deferred to Sprint 2:
- business unit and portfolio management UX
- operational module implementation
- new dashboards and reports
- supply workflow logic

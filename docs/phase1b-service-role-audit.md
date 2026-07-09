# DeployIQ Phase 1B Service-Role Audit

This audit catalogs current API service-role (`createAdminSupabase`) usage and the recommended execution mode per route.

## Decision Rules

- `required`: route performs privileged admin operations (`auth.admin.*`, cross-tenant diagnostics, or writes that should bypass user-scoped RLS after explicit admin authorization).
- `replaceable`: route can use user-scoped Supabase access token client with tenant scoping and no elevated auth operations.
- `mixed`: route should keep service-role for specific branches only, but use user-scoped access for normal reads.

## Route Matrix

| Route | Current usage | Why used today | Recommendation |
| --- | --- | --- | --- |
| `/api/admin/diagnostics` | service-role | platform-wide diagnostics count/sample query | `required` (already guarded by admin check) |
| `/api/agencies` | service-role | admin CRUD | `required` (post-auth only) |
| `/api/auth/session` | service-role | fallback role/client lookups and project checks | `mixed` (prefer user-scoped first, service-role fallback only) |
| `/api/brands` | service-role | list brands with optional client scoping | `replaceable` for reads |
| `/api/client/exports/excel` | service-role | report joins and export generation | `mixed` (user-scoped read path where possible) |
| `/api/client/exports/pdf` | service-role | report joins, image URL resolution, export generation | `mixed` (user-scoped data, service-role storage helper only if needed) |
| `/api/clients` | service-role | admin CRUD + linked integrity checks | `required` (post-auth only) |
| `/api/demo-data` | service-role | synthetic dataset writes and resets | `required` (admin-only utility) |
| `/api/deployment-locations` | service-role | import/list/count against shared catalog | `mixed` (reads replaceable, writes/import admin service-role) |
| `/api/exports/excel` | service-role | admin export across tenants | `required` (admin export backend) |
| `/api/exports/pdf` | service-role | admin export + storage image access | `required` (admin export backend) |
| `/api/installers` | service-role | admin CRUD and assignments | `required` (post-auth only) |
| `/api/notifications` | service-role | read/write events with role-based scope | `mixed` (client reads replaceable) |
| `/api/project-targets` | service-role | project target writes and reads | `mixed` (user-scoped reads possible) |
| `/api/projects` | service-role | admin create/update + client read | `mixed` (client reads replaceable) |
| `/api/submissions` | service-role | complex moderation, archive, and admin actions | `mixed` (installer/client reads replaceable, admin actions required) |
| `/api/users` | service-role | role/profile admin sync and `auth.admin.*` user ops | `required` |

## Phase 1B Work Completed In This Changeset

- Standardized authorization entry for key admin routes to centralized access control (`requireAdmin`):
  - `/api/agencies`
  - `/api/clients`
  - `/api/installers`
  - `/api/projects` (admin branches)
  - `/api/users`
- Confirmed these routes now verify role before privileged DB operations.
- Added reusable core modules to support progressive migration:
  - `lib/core/auth.ts`
  - `lib/core/permissions.ts`
  - `lib/core/dataAccess.ts`
  - `lib/core/storage.ts`

## Next Adoption Steps

1. Migrate read-only client and installer route branches from service-role to user-scoped clients.
2. Keep service-role only in explicitly documented elevated operations.
3. Add route-level tests asserting auth gate order (unauthorized calls fail before DB mutation).
4. Wire storage ownership checks from `lib/core/storage.ts` into image read endpoints.

# DeployIQ Build staging harmonisation

## BH-1B forward schema contract

Migration `20260828010000_harmonize_build_foundation.sql` reconstructs the accumulated historical Build foundation without replaying or rewriting historical Build migrations. It is intended for the canonical staging state in which historical migration versions can be recorded while Build objects are absent.

The migration is additive and data-preserving. It creates absent Build objects, retains known historical columns, adds the Sprint 2F authoring columns when necessary, and does not drop or truncate Build tables. The obsolete global `UNIQUE(code)` constraint on work-package templates is replaced with separate uniqueness for global codes and `(client_id, code)` for tenant-owned templates.

Build sites are constrained to canonical `public.projects(id, client_id)` ownership and explicitly supported Build project types. Work packages are constrained through `(site_id, project_id, client_id)`. Tenant-owned template assignment must match the work-package tenant; global templates use the explicit representation `is_global = true, client_id = null`.

All Build tables have RLS enabled. `anon` and `authenticated` receive no direct table privileges and no Build policies are installed. The supported access path remains browser → DeployIQ server API → authoritative authorization → service-role database operation.

### BH-1B.1 trigger-authority correction

The first disposable BH-2 rehearsal proved that an invoker-rights `validate_build_site_authority()` trigger could not read canonical `public.projects` during an intended `service_role` Build Site write. BH-1B.1 therefore gives only that trigger function controlled `SECURITY DEFINER` authority. It uses the fixed `pg_catalog` search path, schema-qualifies `public.projects`, contains no dynamic SQL, returns no project data, and is callable only as a row-validation trigger in this architecture. Direct execution remains revoked from `PUBLIC`, `anon`, and `authenticated`; no direct execution grant is added for `service_role`, because PostgreSQL invokes an installed trigger function through the trigger rather than as a caller-issued function API.

No `public.projects` privilege was broadened. The remaining Build validators stay invoker-rights because they either inspect only `NEW`/`OLD` values or read Build tables for which the migration already grants the server authority the required privileges.

## Proposed BH-2 disposable rehearsal

BH-2 must be separately authorized. Its proposed sequence is:

1. Start a completely fresh disposable local Supabase stack with fresh volumes.
2. Apply `supabase/baselines/20260816020000_pre_core2a.sql` only.
3. Apply the already-approved current staging foundation needed after that baseline, including the existing CORE-2A migration only if BH-2 explicitly confirms that the disposable rehearsal must mirror the current staging ledger/schema state.
4. Apply `supabase/migrations/20260828010000_harmonize_build_foundation.sql` directly; do not replay historical Build migrations.
5. Run the Build schema verification inventory: tables, columns, enums, constraints, indexes, triggers, functions, RLS flags, policies, and grants.
6. Exercise rollback-only test transactions that attempt invalid Retail-site, cross-client site, contradictory work-package hierarchy, cross-tenant template assignment, category/activity mismatch, resource visibility breach, and dependency self/cross-template writes. Every invalid write must fail and the transaction must be rolled back.
7. Record a deterministic Build schema fingerprint from the normalized inventory.
8. Destroy the complete local stack and volumes.
9. Repeat steps 1–7 from zero.
10. Accept BH-2 only if both runs pass and their normalized fingerprints are identical.

Remote staging must not be contacted during this rehearsal. Remote application is a later separately authorized phase.

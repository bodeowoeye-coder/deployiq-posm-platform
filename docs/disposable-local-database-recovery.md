# Disposable local database baseline recovery

This workflow reconstructs the current DeployIQ schema in a disposable local
Supabase stack. It never links or contacts a remote project.

## Why the wrapper is required

DeployIQ began with `supabase/schema.sql` as a consolidated production
snapshot. The historical migration stream begins with an alteration of
`public.submissions`, not its creation. A normal clean `supabase start` therefore
cannot replay the repository from zero.

The supported recovery mechanism uses the Supabase CLI `--workdir` option. The
wrapper creates a temporary isolated project with an empty `migrations/`
directory, starts the local services, applies the canonical pre-CORE-2A
baseline, repairs only the disposable local migration ledger, then exposes the
unchanged repository migration directory and runs `migration up --local`.

No undocumented `config.toml` migration-disable setting is used. Supabase CLI
2.115.0 exposes no supported `db.migrations.enabled` setting; `schema_paths`
controls declarative diff ordering and does not disable migration replay.

## Safety contract

The command fails unless all of the following are true:

- the API and Postgres targets are loopback;
- `DEPLOYIQ_ENVIRONMENT` is local;
- the mutation allowlist contains only `local`;
- no remote-target CLI argument is supplied;
- the repository has no `supabase/.temp/project-ref` link;
- the isolated temporary project has no project link;
- Docker, `psql`, and Supabase CLI are available;
- the initial public schema and local migration ledger are empty.

The wrapper uses a unique local project ID per rehearsal and always runs
`supabase stop --no-backup` during cleanup.

## Commands

One disposable rehearsal:

```sh
DEPLOYIQ_CONFIRM_DESTRUCTIVE_OPERATION=YES npm run db:local:bootstrap
```

Two independent rehearsals with fingerprint comparison:

```sh
DEPLOYIQ_CONFIRM_DESTRUCTIVE_OPERATION=YES npm run db:local:rehearse
```

The destructive confirmation applies only to deleting the disposable local
volumes created by this command.

## Canonical sequence

1. Start an isolated local stack with no migration files visible.
2. Assert zero public application tables and zero migration-ledger versions.
3. Apply `supabase/baselines/20260816020000_pre_core2a.sql` transactionally.
4. Apply `supabase/seeds/canonical_reference_data.sql` transactionally.
5. Attach the unchanged repository migration directory.
6. Run `supabase migration repair --local --status applied` for every historical
   version through `20260816020000`.
7. Assert `20260823010000` is the first pending migration.
8. Run `supabase migration up --local --include-all`.
9. Verify the complete current schema and calculate a normalized fingerprint.
10. Remove the local database and temporary project directory.

The forward migration set includes CORE-2A, Build harmonisation, Build runtime,
inspection, exception, schedule, notification governance, canonical Supervisor
authorization, and E1B mobile evidence metadata.

## Verification contract

The normalized inventory includes tables, columns, constraints, indexes, RLS,
policies, functions, function grants, table grants, triggers, storage buckets,
and the migration ledger. Verification additionally requires:

- canonical composite tenant foreign keys;
- rollback-only rejection of a cross-tenant Build Site write;
- RLS on Build tables;
- service-only execution for Build mutation RPCs;
- no anonymous Build-table grants;
- only the intentionally supported authenticated notification read grant;
- a private `build-runtime-evidence` bucket;
- no anonymous/authenticated Build evidence storage policy;
- E1B operation-id uniqueness indexes;
- E1B device/GPS metadata and check constraints;
- canonical reference-row counts and absence of customer/project/draft/job fixtures;
- `20261013010000` as the E1B migration and `20261014010000` as the final
  canonical session-privilege repair migration.

The Build harmonisation migration deliberately creates its legacy composite
tenant foreign keys as `NOT VALID`. PostgreSQL still enforces them for all new
writes, while avoiding an implicit scan or rejection of historical rows. The
normalized inventory records this state, and the disposable bootstrap proves
new-write enforcement with a rollback-only cross-tenant probe. Validating
historical rows in an existing environment remains a separate data-audit task.

Synthetic application fixtures and browser acceptance are deliberately outside
this recovery command and require a separately approved phase.

## Remote environments

Never use this command for staging or production. Existing remote migration
ledgers require their own read-only inventory and an explicitly approved
environment-specific reconciliation plan.

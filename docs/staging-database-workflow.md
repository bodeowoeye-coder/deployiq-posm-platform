# DeployIQ staging database workflow

The production Supabase project `vmurvcpmqwnxgruhqevf` must never be used by
the staging bootstrap, reference seed, fixture seed, or migration-development
commands.

## Required local environment

Set server-side values without committing them:

```text
DEPLOYIQ_ENVIRONMENT=staging
DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS=<staging-project-ref>
NEXT_PUBLIC_SUPABASE_URL=https://<staging-project-ref>.supabase.co
SUPABASE_DB_URL=<staging-or-local-postgres-connection>
```

For the Supabase CLI local stack, use `DEPLOYIQ_ENVIRONMENT=local`,
`DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS=local`, the CLI's loopback API URL, and
its loopback Postgres URL.

The public and database URLs must resolve to the same allowlisted Supabase
project. Loopback database URLs are accepted only with
`DEPLOYIQ_ENVIRONMENT=local` or `test`; a staging operation cannot silently
redirect to a local database. Both URL forms always reject the production ref.

Synthetic fixtures additionally require a synthetic Auth user created in the
staging project and `DEPLOYIQ_SYNTHETIC_ADMIN_USER_ID` set to that user's UUID.

## Fresh database sequence

1. Run `npm run staging:bootstrap` against an empty local or staging database.
2. Mark historical versions as represented using supported Supabase CLI repair:

   ```sh
   for version in 20260625000000 20260714090000 20260714113000 20260714170000 20260714203000 20260714223000 20260715001000 20260715014000 20260715030000 20260718102000 20260729120000 20260730120000 20260731000000 20260801000000 20260804000000 20260804010000 20260805000000 20260806000000 20260806010000 20260806020000 20260806030000 20260806040000 20260806050000 20260815000000 20260815010000 20260816020000; do
     supabase migration repair --status applied "$version"
   done
   ```

3. Confirm `20260823010000` remains pending with `supabase migration list`.
4. Run `npm run staging:seed-reference`.
5. Run `npm run staging:verify` and record the fingerprint.
6. Optionally run `npm run staging:seed-fixtures` only after creating the
   synthetic Auth user.

Historical migration files remain in Git as production lineage. Fresh databases
use the baseline and repair markers; they do not replay the historical files.
Never write the migration ledger directly.

## Supabase dashboard checklist

- Set Site URL to the stable staging application URL.
- Allow localhost and staging redirects for `/login/create-password` and
  `/onboarding`.
- Enable email/password authentication with the intended confirmation behavior.
- Configure recovery-link expiry and staging recovery templates.
- Configure a staging SMTP/provider identity and bounded rate limits.
- Ensure no production webhook destinations are configured.
- Keep the service-role key server-side only.
- Use staging-only storage and never copy production objects.

## Reference and fixture boundaries

The canonical reference seed contains only deployment stages and current Retail
pricing configuration. Synthetic fixtures use `example` identities and simulated
commercial references. They contain no CORE-2A payment or approval authority.

## Existing mutating scripts

The following commands can mutate databases or Auth despite some being named
`verify`; do not use them against any live target until they adopt the shared
guard in `scripts/lib/assert-safe-supabase-target.mjs`:

- `seed-test-client.mjs`
- `reset-onboarding-test.mjs`
- `activate-retail-template.mjs`
- `apply-commercial-model-migration.mjs`
- `backfill-customer-admin-workspace-roles.mjs`
- `verify-phase2b-live.mjs`
- `verify-phase4-live.mjs`
- `verify-project-resource-migration.mjs`
- `verify-support-sessions-migration.mjs`

## CORE-2A gate

Only after two clean baseline bootstraps produce the same fingerprint, local and
Vercel Preview use staging, and the pre-CORE-2A Retail flow passes may
`20260823010000_add_commercial_entitlement_authority_foundation.sql` be applied
to staging. It is not part of the baseline.

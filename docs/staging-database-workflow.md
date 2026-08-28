# DeployIQ staging database workflow

The production Supabase project `vmurvcpmqwnxgruhqevf` must never be used by
the staging bootstrap, reference seed, fixture seed, or migration-development
commands.

The only registered remote staging project is **DeployIQ Staging** in
`eu-west-1` (West EU, Ireland), project ref `pmdgpgfbtolrgmuusszy`. The guard
requires this repository-known identity, a matching declared project ref, and
an explicit runtime allowlist entry. None of those checks can override the
production hard denial.

## Local staging secret environment

Create `.env.staging.local` at the repository root by copying
`.env.staging.example`, then replace only the three placeholder values locally.
The real file is explicitly Git-ignored. Staging npm commands load this file;
they do not load or overwrite `.env.local`.

```text
DEPLOYIQ_ENVIRONMENT=staging
SUPABASE_PROJECT_REF=pmdgpgfbtolrgmuusszy
DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS=pmdgpgfbtolrgmuusszy
NEXT_PUBLIC_SUPABASE_URL=https://pmdgpgfbtolrgmuusszy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging-publishable-or-legacy-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<staging-secret-or-legacy-service-role-key>
SUPABASE_DB_URL=<staging-postgres-connection-string>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`NEXT_PUBLIC_SUPABASE_URL`, the publishable/legacy anon key, and the
secret/legacy service-role key come from the DeployIQ Staging project Connect
dialog or **Project Settings → API Keys**. The Postgres connection string comes
from **Connect → Connection string**; use the staging database password when
the displayed string contains a password placeholder. The project ref and
region are visible under **Project Settings → General**.

Store these values only in an approved local secret store or deployment
environment scoped to Staging/Preview. The publishable or legacy anon key is
the only browser-exposed key and is assigned to
`NEXT_PUBLIC_SUPABASE_ANON_KEY`; `SUPABASE_SERVICE_ROLE_KEY` and
`SUPABASE_DB_URL` are server-only and must never use a `NEXT_PUBLIC_` prefix.
Do not add a populated staging environment file to Git.

Use `npm run dev:staging` when the local Next.js application must consume this
staging-specific environment. Its launcher creates a temporary project view
that excludes every repository `.env*` file. The App Router tree is exposed as
real directories with source-file links so Next can discover routes while edits
remain visible. The launcher passes only the explicitly parsed staging values
plus a small OS-variable allowlist and fixes the local staging application URL
at `http://localhost:3000`. The ordinary `npm run dev` retains the existing
Next.js environment-file behavior.

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

## Accepted pre-CORE-2A fingerprint

The accepted deterministic schema fingerprint for
`20260816020000_pre_core2a.sql` plus `canonical_reference_data.sql` is:

```text
b35de7769e399d8f463614f4031d95dd75feb3f00d7a56eb1e988bce5ab141e6
```

Acceptance was established with two fresh disposable local databases and the
isolated remote staging database. All three current inventories were identical
across tables, columns, indexes, foreign keys, RLS, policies, functions, routine
grants, and storage configuration.

The earlier fingerprint
`d95fcd2f0247436727d1cc3bf0566fd4a70a06c322069029eb22e58080fa4cc1`
is stale. Its inventory payload was not retained, so it cannot be reconstructed;
no application-schema difference was detected between the current fresh local
and remote inventories. The change is therefore attributed to local Supabase
runtime/image drift only after current three-way reproducibility was proven.

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

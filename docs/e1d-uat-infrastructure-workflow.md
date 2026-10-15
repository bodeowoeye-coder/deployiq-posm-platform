# E1D isolated mobile UAT workflow

This workflow prepares a dedicated DeployIQ Build UAT deployment for physical iPhone Safari and Android Chrome acceptance. It does not authorize cloud creation, migration, deployment, DNS changes, or paid infrastructure.

## Isolation contract

The E1D environment is a third environment, separate from canonical staging and production:

- one dedicated Supabase UAT project containing synthetic data only;
- one dedicated Vercel UAT project using its generated `*.vercel.app` HTTPS hostname;
- the unified DeployIQ repository and existing workspace routes;
- no custom DNS during initial acceptance;
- no production or staging secrets, data, integrations, or project references.

Repository guards reject the production project and canonical staging project unconditionally for E1D mutation commands. A UAT operation also requires the API URL, declared project references, exact one-entry allowlist, and database connection project reference to agree.

## Prerequisites requiring separate approval

An authorized operator must create the dedicated Supabase and Vercel projects manually. Before doing so, obtain approval for:

1. creating both cloud projects and accepting any plan cost;
2. applying the repository baseline and forward migrations to the new UAT database;
3. configuring UAT-only Vercel and Supabase environment settings;
4. deploying the reviewed commit to the dedicated Vercel project;
5. loading synthetic fixtures into the dedicated Supabase project;
6. deleting the UAT resources after acceptance.

Do not link the repository's working directory to a remote Supabase project. Do not reuse canonical staging or production resources.

## Environment configuration

Copy `.env.uat.example` to the ignored `.env.uat.local` file and replace placeholders with values from the new UAT projects. Never commit that file.

The following values must all identify the same UAT Supabase project:

- `DEPLOYIQ_UAT_PROJECT_REF`
- `SUPABASE_PROJECT_REF`
- `DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS` (exactly one value)
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_DB_URL`

`NEXT_PUBLIC_APP_URL` and `DEPLOYIQ_APP_URL` must be the same generated HTTPS Vercel origin. The guard rejects paths, non-HTTPS URLs, custom DeployIQ domains, and non-Vercel hosts.

Keep server secrets in Vercel's encrypted environment configuration. Only values intentionally prefixed `NEXT_PUBLIC_` may reach the browser. UAT uses its own encryption and email configuration; do not copy production credentials. Keep provisioning AI disabled unless a later, separate acceptance explicitly authorizes it.

## Database initialization (only after approval)

Use the accepted canonical baseline-recovery process:

1. prove the target is the new UAT project and not linked to a shared local CLI context;
2. apply `supabase/baselines/20260816020000_pre_core2a.sql`;
3. load `supabase/seeds/canonical_reference_data.sql`;
4. reconcile the historical migration ledger through `20260816020000` without replaying historical migrations;
5. verify `20260823010000` is the first pending migration;
6. apply every later repository migration chronologically;
7. run the read-only full-schema verification before fixture loading.

Stop on migration drift, unexpected objects, privilege differences, RLS failures, or a project-reference mismatch. Never repair a remote migration ledger until the exact target and intended versions have been independently reviewed.

## Synthetic fixture loading

The fixture command reuses the accepted E1C synthetic Build scenario. It creates only synthetic test identities and two isolated synthetic tenants. It does not contain production customer data or credentials.

Immediately before an approved fixture run, set both confirmations to `YES` in the ignored local UAT environment:

```text
DEPLOYIQ_CONFIRM_REMOTE_UAT_MUTATION=YES
DEPLOYIQ_CONFIRM_DESTRUCTIVE_OPERATION=YES
```

Then run:

```bash
npm run e1d:uat:seed
```

The command first validates the UAT application identity, exact Supabase project/database match, and current schema. It writes a restricted local manifest at `.e1d-uat-manifest.json`; the manifest is ignored by Git and contains no password. Restore both confirmation values to `NO` after the single approved fixture operation.

## Read-only verification

Run this before and after physical-device acceptance:

```bash
npm run e1d:uat:verify
```

The verifier checks the current schema and normalized fingerprint, expected synthetic fixture inventory, evidence operation uniqueness, and evidence ancestry. It performs SELECT queries only. A failed check is a stop condition.

## Vercel UAT deployment (only after approval)

Create a new Vercel project for this repository and configure only its dedicated UAT environment. Do not attach `app.deployiq.ng`, modify production aliases, or share production environment variables. Configure the generated deployment origin in Supabase Auth Site URL and permitted redirects. Verify deployment protection settings still allow the explicitly nominated physical testers to authenticate.

The physical devices require valid HTTPS for camera, geolocation, service-worker, and storage behavior. Test browser access first; Home Screen/PWA installation is a separate scenario and must not be recorded as passed merely because browser testing passed.

## Acceptance procedure

Use the synthetic Project Manager, Supervisor, Field Coordinator, Viewer, and cross-tenant identities from the local restricted manifest. Collect test ID, device/OS/browser versions, timestamps, screenshots or screen recordings, network transition evidence, and database verification output.

At minimum validate:

- Global Auth and authorized Build destinations;
- assigned project and Activity visibility;
- camera and gallery evidence capture;
- device-reported GPS permission granted, denied, and unavailable states;
- offline IndexedDB retention across reload/backgrounding;
- foreground reconnect and synchronization;
- interrupted upload and explicit retry;
- one finalized evidence row per mobile operation identifier;
- Viewer mutation denial and cross-tenant denial;
- notification deep links and session refresh;
- browser mode separately on iPhone Safari and Android Chrome;
- installed PWA behavior as a separately labelled result.

Device GPS and timestamps remain device-reported metadata, not server-verified facts. Offline actions remain pending until the server authorizes and accepts them.

## Teardown (only after approval)

1. export only the agreed synthetic acceptance evidence, excluding credentials;
2. revoke UAT test sessions and remove the local restricted manifest;
3. delete the dedicated Vercel UAT project and Supabase UAT project rather than repurposing them;
4. remove local `.env.uat.local` and any operator-held UAT secrets;
5. confirm production and canonical staging project configuration and data were unchanged.

Deleting cloud projects is destructive and requires explicit approval at execution time. No teardown command is automated by this repository preparation.

# E1C disposable-local UAT harness

The E1C harness exists only to create the synthetic Meridian Civil Works Ltd acceptance scenario. It is not production provisioning and cannot target staging or production.

## Safety contract

- `DEPLOYIQ_ENVIRONMENT` must equal `local`.
- Supabase API and database hosts must be loopback addresses.
- `DEPLOYIQ_ALLOWED_MUTATION_PROJECT_REFS` must contain `local`.
- The production and staging project references are rejected by the shared target guard.
- A repository remote link causes the orchestrator to stop.
- Passwords and local Supabase keys remain process-only. The restricted manifest contains IDs and synthetic emails, never credentials.
- The orchestrator removes the disposable stack and temporary files in `finally`.

## Fixture boundary

The fixture bootstrap creates synthetic Auth users, tenant roles, memberships, project assignment prerequisites, the Build project, Site, four Work Packages, one Operational Template, seven Activity templates, dependencies and checklist requirements. These records have no complete public setup path and are prerequisites for browser acceptance.

The bootstrap deliberately does not insert or update runtime Activities, events, evidence, inspections, exceptions or notifications. Work Plan creation, baselining and every lifecycle outcome must use the existing application APIs/RPCs during integrated UAT.

## Commands

```sh
DEPLOYIQ_CONFIRM_DESTRUCTIVE_OPERATION=YES npm run e1c:rehearse-fixture
DEPLOYIQ_CONFIRM_DESTRUCTIVE_OPERATION=YES npm run e1c:uat-local
npm run e1c:test-harness
```

The rehearsal is destructive only to its own disposable-local stack. It must never be run while another Supabase project is using the standard local ports.

Physical iPhone and Android acceptance remains separate and cannot be claimed by this harness.

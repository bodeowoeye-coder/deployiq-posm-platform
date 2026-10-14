import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const shell = read("components/workspace/OperationalBuildWorkspaceShell.tsx");
const activities = read("lib/build/mobile/activities.ts");
const activityPage = read("app/workspace/build/projects/[id]/activities/[activityId]/page.tsx");
const capture = read("components/workspace/BuildMobileEvidenceOutbox.tsx");
const activityExecution = read("components/workspace/BuildRuntimeActivityExecution.tsx");
const outbox = read("lib/build/mobile/evidenceOutbox.ts");
const evidenceRoute = read("app/api/build/runtime-activities/[activityId]/evidence/route.ts");
const runtime = read("lib/build/runtime/service.ts");
const migration = read("supabase/migrations/20261013010000_add_build_mobile_evidence_sync_foundation.sql");

test("E1B mobile navigation stays inside the operational Build and authorized notification routes", () => {
  for (const route of ["/workspace/build/activities", "/workspace/build/projects", "/workspace/notifications", "/workspace/build/sync"]) assert.match(shell, new RegExp(route.replaceAll("/", "\\/")));
  assert.match(shell, /lg:hidden/);
});

test("My Activities is tenant and authorized-project scoped before role relevance filtering", () => {
  assert.match(activities, /\.eq\("client_id", access\.clientId\)/);
  assert.match(activities, /\.in\("project_id", access\.authorizedProjectIds\)/);
  assert.match(activities, /\.is\("archived_at", null\)/);
  assert.match(activities, /access\.roleKey === "supervisor"[\s\S]*supervisor_user_id/);
  assert.match(activities, /field_coordinator"\) query = query\.eq\("activity_owner_user_id"/);
  assert.doesNotMatch(activities, /role\s*===\s*["']client["']/);
});

test("Activity execution keeps E1A authorization and passes only authoritative identity to mobile evidence", () => {
  assert.match(activityPage, /resolveOperationalBuildAccess\(\)/);
  assert.match(activityPage, /authorizedProjectIds\.includes\(params\.id\)/);
  assert.match(activityPage, /assignedSupervisor/);
  assert.match(activityPage, /mobileIdentity=\{\{ userId: access\.userId, clientId: access\.clientId \}\}/);
});

test("mobile evidence supports camera, gallery, compression, GPS denial and explicit device-reported labelling", () => {
  assert.match(capture, /capture="environment"/);
  assert.match(capture, /Choose from device/);
  assert.match(capture, /compressImage/);
  assert.match(capture, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(capture, /PERMISSION_DENIED\?"denied"/);
  assert.match(capture, /Device-reported/);
  assert.match(capture, /not server evidence until synchronization is confirmed/i);
});

test("Activity evidence controls and cards can shrink within mobile viewports", () => {
  assert.match(capture, /grid min-w-0 gap-1 text-sm font-bold[^>]*>Take a photo/);
  assert.match(capture, /min-w-0 max-w-full rounded-lg border bg-white p-2/);
  assert.match(capture, /break-all font-black/);
  assert.match(activityExecution, /grid min-w-0 gap-4 rounded-lg border/);
  assert.match(activityExecution, /min-w-0 max-w-full rounded-lg border border-slate-300 p-2 text-sm/);
  assert.match(activityExecution, /break-all text-sm text-slate-700/);
  assert.doesNotMatch(`${capture}\n${activityExecution}`, /overflow-x-hidden/);
});

test("Build outbox is identity and ancestry bound and never stores auth or signed upload credentials", () => {
  for (const field of ["userId", "clientId", "projectId", "siteId", "workPackageId", "activityId"]) assert.match(outbox, new RegExp(`${field}: string`));
  assert.doesNotMatch(outbox, /accessToken|refreshToken|signedUrl|\btoken:/i);
  assert.match(outbox, /expiresAt/);
  assert.match(outbox, /QuotaExceededError/);
  assert.match(outbox, /navigator\.locks/);
  assert.match(outbox, /status !== "synchronized"/);
});

test("synchronization reauthorizes, uploads, finalizes and classifies permanent failures without blind retry", () => {
  assert.match(capture, /action: "authorize"/);
  assert.match(capture, /uploadToSignedUrl/);
  assert.match(capture, /action: "finalize"/);
  assert.match(capture, /status === 401 \? "authentication_required"/);
  assert.match(capture, /failure\.retryable \? "failed" : "needs_review"/);
  assert.match(capture, /withBuildEvidenceSyncLock/);
});

test("server evidence boundary exposes bounded codes and operation idempotency", () => {
  assert.match(evidenceRoute, /boundedCode/);
  assert.match(evidenceRoute, /operationId/);
  assert.match(runtime, /mobile_operation_id/);
  assert.match(runtime, /existingEvidence/);
  assert.match(runtime, /existing\.data\?\.id/);
});

test("E1B migration is additive, constrains metadata, and does not alter role authority", () => {
  assert.match(migration, /alter table public\.build_runtime_evidence_uploads[\s\S]*add column if not exists mobile_operation_id/);
  assert.match(migration, /build_runtime_evidence_mobile_operation_uidx/);
  assert.match(migration, /device_captured_at/);
  assert.match(migration, /gps_accuracy_metres/);
  assert.match(migration, /Device-reported capture time; never authoritative/);
  assert.doesNotMatch(migration, /workspace_memberships|workspace_roles|apply_build_runtime_activity_action/);
});

test("lifecycle, inspections and exception decisions are not represented in the offline outbox", () => {
  assert.doesNotMatch(outbox, /lifecycle|inspection|exception resolution|assign_responsibility/);
  assert.equal(outbox.includes('evidence-outbox'), true);
});

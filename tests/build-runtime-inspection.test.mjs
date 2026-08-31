import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260831020000_add_build_runtime_inspection_foundation.sql", "utf8");
const service = readFileSync("lib/build/runtime/service.ts", "utf8");
const types = readFileSync("lib/build/runtime/types.ts", "utf8");
const route = readFileSync("app/api/build/runtime-activities/[activityId]/inspection/route.ts", "utf8");
const ui = readFileSync("components/workspace/BuildRuntimeActivityExecution.tsx", "utf8");
const page = readFileSync("app/workspace/admin/projects/[id]/activities/[activityId]/page.tsx", "utf8");

test("S3A-9A uses the existing requires_approval snapshot as its compatibility boundary", () => {
  assert.match(migration, /not v_activity\.requires_approval[\s\S]*BUILD_ACTIVITY_REVIEW_NOT_REQUIRED/);
  assert.match(migration, /old\.requires_approval[\s\S]*new\.status='completed'[\s\S]*BUILD_ACTIVITY_REVIEW_REQUIRED/);
  assert.match(ui, /activity\.requires_approval/);
  assert.match(ui, /requires independent review[\s\S]*Inspection view/);
  assert.doesNotMatch(migration, /add column requires_review|alter table public\.build_activity_templates/);
});

test("Submit for Review is explicit, locked and tenant-authoritative", () => {
  assert.match(migration, /create function public\.submit_build_runtime_activity_for_review/);
  assert.match(migration, /for update of activity/);
  assert.match(migration, /v_activity\.status<>'in_progress'/);
  assert.match(migration, /project\.project_type in \('Construction','Real Estate','Facility Management'\)/);
  assert.match(migration, /membership\.client_id=v_activity\.client_id[\s\S]*membership\.user_id=p_actor_user_id[\s\S]*membership\.status='active'/);
  assert.match(migration, /'submitted_for_review'/);
});

test("mandatory Pending and every Failed checklist block submission while optional Pending remains allowed", () => {
  assert.match(migration, /\(checklist\.mandatory and checklist\.status='pending'\) or checklist\.status='failed'/);
  assert.doesNotMatch(migration, /checklist\.status not in \('passed','not_applicable'\)/);
});

test("comment and exact checklist Photo requirements remain enforced", () => {
  assert.match(migration, /checklist\.requires_comment[\s\S]*nullif\(btrim\(checklist\.result_note\),''\) is null/);
  assert.match(migration, /checklist\.requires_photo[\s\S]*evidence\.runtime_checklist_item_id=checklist\.id[\s\S]*evidence\.evidence_type='photo'/);
  assert.doesNotMatch(migration, /evidence_type='video'[\s\S]*BUILD_CHECKLIST_PHOTO_REQUIRED/);
});

test("durable inspections are append-only and create a new record for each decision", () => {
  assert.match(migration, /create table public\.build_runtime_inspections/);
  assert.match(migration, /insert into public\.build_runtime_inspections/);
  assert.match(migration, /BUILD_RUNTIME_INSPECTION_IMMUTABLE/);
  assert.doesNotMatch(migration, /update public\.build_runtime_inspections/);
  assert.doesNotMatch(migration, /unique\s*\(\s*runtime_activity_id\s*\)/i);
});

test("inspection authority is Supervisor or active tenant management, never owner alone", () => {
  assert.match(migration, /p_actor_user_id is distinct from v_activity\.supervisor_user_id[\s\S]*v_actor_role not in \('customer_admin','workspace_manager','project_manager'\)/);
  assert.match(migration, /BUILD_INSPECTION_REVIEW_FORBIDDEN/);
  assert.doesNotMatch(migration, /p_actor_user_id=v_activity\.activity_owner_user_id[\s\S]*BUILD_INSPECTION_REVIEW_FORBIDDEN/);
});

test("Accepted persists one inspection and transitions to Approved", () => {
  assert.match(migration, /p_outcome when 'accepted' then 'approved'/);
  assert.match(migration, /when 'accepted' then 'inspection_accepted'/);
  assert.match(migration, /completed_at=case when p_outcome='accepted' then v_now/);
});

test("Changes Required requires observation and preserves a corrective lifecycle", () => {
  assert.match(migration, /p_outcome='changes_required'[\s\S]*nullif\(btrim\(p_comments\),''\) is null[\s\S]*BUILD_INSPECTION_COMMENT_REQUIRED/);
  assert.match(migration, /v_resulting_status := case p_outcome when 'accepted' then 'approved' else 'changes_required' end/);
  assert.match(migration, /create function public\.resume_build_runtime_activity_corrections/);
  assert.match(migration, /status='in_progress'/);
  assert.match(migration, /'corrective_work_resumed'/);
});

test("double submission, double inspection and stale concurrent review fail closed", () => {
  assert.match(migration, /v_activity\.status<>'in_progress'[\s\S]*BUILD_ACTIVITY_REVIEW_STATE_INVALID/);
  assert.match(migration, /v_activity\.status<>'submitted_for_review'[\s\S]*BUILD_INSPECTION_STALE_ACTIVITY_STATE/);
  assert.match(migration, /for update of activity/g);
});

test("Activity History provides the minimal complete review audit story", () => {
  for (const event of ["submitted_for_review", "inspection_accepted", "changes_required", "corrective_work_resumed"]) assert.match(migration, new RegExp(event));
  assert.match(migration, /actor_user_id/);
  assert.match(migration, /event_context[\s\S]*inspection_id/);
  assert.match(ui, /Submitted for review/);
  assert.match(ui, /Inspection accepted/);
  assert.match(ui, /Changes required/);
});

test("Activity History status constraints admit every review transition", () => {
  assert.match(migration, /build_runtime_activity_events_previous_status_check[\s\S]*submitted_for_review[\s\S]*changes_required[\s\S]*approved/);
  assert.match(migration, /build_runtime_activity_events_resulting_status_check[\s\S]*submitted_for_review[\s\S]*changes_required[\s\S]*approved/);
});

test("existing deterministic event_sequence trigger remains the sole ordering authority", () => {
  assert.doesNotMatch(migration, /update public\.build_runtime_activity_events/);
  assert.doesNotMatch(migration, /event_sequence\s*\)/);
  assert.match(service, /order\("occurred_at"\)\.order\("event_sequence"/);
});

test("new table has RLS, no browser CRUD and controlled service-only functions", () => {
  assert.match(migration, /alter table public\.build_runtime_inspections enable row level security/);
  assert.match(migration, /revoke all on table public\.build_runtime_inspections from public,anon,authenticated,service_role/);
  assert.match(migration, /grant select,insert on table public\.build_runtime_inspections to service_role/);
  for (const name of ["submit_build_runtime_activity_for_review", "record_build_runtime_inspection", "resume_build_runtime_activity_corrections"]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}`));
  }
  assert.doesNotMatch(route, /createBrowserSupabase|\.from\("build_runtime_inspections"\)/);
});

test("privileged functions and trigger functions use hardened search paths", () => {
  const securityDefiners = migration.match(/security definer/g) ?? [];
  const hardened = migration.match(/security definer\s*set search_path = pg_catalog/g) ?? [];
  assert.equal(hardened.length, securityDefiners.length);
});

test("Inspection API uses the established authenticated server service boundary", () => {
  assert.match(route, /submitRuntimeActivityForReview/);
  assert.match(route, /recordRuntimeInspection/);
  assert.match(route, /resumeRuntimeActivityCorrections/);
  assert.match(service, /assertWorkPackageAccess/);
  assert.match(service, /access\.authContext\.user_id/);
  assert.doesNotMatch(route, /clientId/);
});

test("customer workspace preserves Inspection between Evidence and later runtime modules", () => {
  assert.match(ui, /"evidence", "inspection", "exceptions", "resources"/);
  assert.match(page, /SERVER_ACTIVITY_VIEWS[\s\S]*"evidence", "inspection", "exceptions", "resources"/);
  assert.match(ui, /Evidence proves that work was performed\. Inspection determines whether that work is acceptable\./);
  assert.match(ui, /Inspection History/);
  assert.match(ui, /Inspection History/);
});

test("S3A-8 evidence and success feedback remain unchanged", () => {
  for (const message of ["Photo uploaded successfully.", "Video uploaded successfully.", "Document uploaded successfully.", "Note added successfully."]) assert.match(ui, new RegExp(message.replace(".", "\\.")));
  assert.match(service, /fetchBuildEvidenceSignature/);
  assert.match(types, /BuildRuntimeEvidenceType = "photo" \| "video" \| "document" \| "note"/);
});

test("S3A-9A migration remains isolated from Retail, Exceptions, AI and mobile execution", () => {
  assert.doesNotMatch(migration, /Retail Deployment/);
  assert.doesNotMatch(migration, /build_runtime_exceptions|AI summary|mobile execution/i);
  assert.doesNotMatch([route, ui].join("\n"), /["'`]\/client(?:\/|["'`])/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260830040000_add_build_runtime_checklist_evidence_execution.sql");
const service = read("lib/build/runtime/service.ts");
const types = read("lib/build/runtime/types.ts");
const ui = read("components/workspace/BuildRuntimeActivityExecution.tsx");
const checklistRoute = read("app/api/build/runtime-activities/[activityId]/checklist/route.ts");
const evidenceRoute = read("app/api/build/runtime-activities/[activityId]/evidence/route.ts");
const evidenceVerification = read("lib/build/runtime/evidenceVerification.ts");

test("S3A-8 uses exactly the four canonical evidence types", () => {
  assert.match(migration, /evidence_type in \('photo', 'video', 'document', 'note'\)/);
  assert.match(types, /"photo" \| "video" \| "document" \| "note"/);
  for (const label of ["photo", "video", "document", "note"]) assert.match(ui, new RegExp(label));
});
test("file limits and conservative MIME allowlists are exact", () => {
  for (const value of ["10485760", "52428800", "20971520", "image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm", "application/pdf", "text/plain", "wordprocessingml.document", "spreadsheetml.sheet"]) assert.match(migration, new RegExp(value.replace(".", "\\.")));
  assert.match(service, /photo: 10 \* 1024 \* 1024, video: 50 \* 1024 \* 1024, document: 20 \* 1024 \* 1024/);
  assert.match(migration, /expected_file_size_bytes <= 10485760/);
  assert.match(migration, /expected_file_size_bytes <= 52428800/);
  assert.match(migration, /expected_file_size_bytes <= 20971520/);
});
test("private Build bucket never uses permanent public URLs", () => {
  assert.match(migration, /'build-runtime-evidence','build-runtime-evidence',false,52428800/);
  assert.doesNotMatch([service, ui, evidenceRoute].join("\n"), /getPublicUrl/);
  assert.match(service, /createSignedUploadUrl/);
  assert.match(service, /createSignedUrl\(storagePath, 300\)/);
  assert.match(ui, /uploadToSignedUrl/);
});
test("uploads are pending until server finalization and rejected objects are cleaned", () => {
  assert.match(migration, /build_runtime_evidence_uploads/);
  assert.match(migration, /finalized_at/);
  assert.match(service, /verifyStoredEvidence/);
  assert.match(service, /fetchBuildEvidenceSignature/);
  assert.match(evidenceVerification, /response\.arrayBuffer\(\)/);
  assert.doesNotMatch([service, evidenceVerification].join("\n"), /getReader\(|reader\.cancel\(/);
  assert.match(evidenceVerification, /AbortController/);
  assert.match(evidenceVerification, /response\.status !== 206/);
  assert.match(service, /rejected_at/);
  assert.match(service, /\.remove\(expiredPaths\)/);
  assert.match(evidenceRoute, /action === "authorize"/);
  assert.match(evidenceRoute, /action === "finalize"/);
});
test("filename extensions are non-authoritative", () => {
  assert.match(service, /expected_mime_type/);
  assert.match(service, /storedMime/);
  assert.match(evidenceVerification, /signature does not match its declared type/);
  assert.doesNotMatch(service, /endsWith\([^)]*\.(?:jpg|mp4|pdf)/i);
});

test("finalization fails closed when the RPC does not return an evidence UUID", () => {
  assert.match(service, /Evidence finalization could not be verified/);
  assert.match(service, /\^\[0-9a-f\]\{8\}/);
});
test("Video is first class but cannot satisfy a Photo requirement", () => {
  assert.match(migration, /evidence\.evidence_type='photo'/);
  assert.doesNotMatch(migration, /evidence_type in \('photo','video'\)/);
  assert.match(ui, /<video controls preload="metadata"/);
  assert.match(ui, /Download authorized video/);
});
test("checklist execution uses Pending Passed Failed and Not Applicable", () => {
  assert.match(migration, /status in \('pending', 'passed', 'failed', 'not_applicable'\)/);
  assert.match(migration, /alter column status set default 'pending'/);
  assert.match(migration, /p_result not in \('passed','failed','not_applicable'\)/);
  assert.match(migration, /BUILD_CHECKLIST_REASON_REQUIRED/);
  assert.match(checklistRoute, /applyRuntimeChecklistResult/);
});
test("Activity completion distinguishes mandatory Pending from optional Pending", () => {
  assert.match(migration, /checklist\.mandatory and checklist\.status='pending'/);
  assert.match(migration, /or checklist\.status='failed'/);
  assert.doesNotMatch(migration, /checklist\.status not in \('passed','not_applicable'\)/);
  assert.match(migration, /checklist\.status='not_applicable'[\s\S]*result_note/);
  assert.match(migration, /BUILD_ACTIVITY_PHOTO_REQUIRED/);
  assert.match(migration, /Untouched optional items remain Pending without creating an artificial result or history event/);
});
test("optional Pending UX is non-blocking while failed results remain blockers", () => {
  assert.match(ui, /item\.mandatory && item\.status === "pending"/);
  assert.match(ui, /item\.status === "failed"/);
  assert.match(ui, /mandatory checklist/);
  assert.match(ui, /failed and must be resolved/);
  assert.match(ui, /untouched Optional items may remain Pending/);
  assert.doesNotMatch(ui, /Pending and Failed items block Activity completion/);
});
test("result requirements remain fail closed", () => {
  assert.match(migration, /p_result in \('failed','not_applicable'\)[\s\S]*BUILD_CHECKLIST_REASON_REQUIRED/);
  assert.match(migration, /v_checklist\.requires_comment[\s\S]*BUILD_CHECKLIST_COMMENT_REQUIRED/);
  assert.match(migration, /v_checklist\.requires_photo[\s\S]*BUILD_CHECKLIST_PHOTO_REQUIRED/);
});
test("Checklist Photo requirement is scoped to the exact Checklist item", () => {
  assert.match(migration, /evidence\.runtime_checklist_item_id=v_checklist\.id/);
  assert.match(migration, /evidence\.runtime_activity_id=v_activity\.id/);
  assert.match(migration, /evidence\.archived_at is null/);
});
test("Build ancestry and Retail exclusion fail closed", () => {
  assert.match(migration, /BUILD_RUNTIME_EVIDENCE_ANCESTRY_INVALID/);
  assert.match(migration, /project\.project_type in \('Construction','Real Estate','Facility Management'\)/);
  assert.doesNotMatch(migration, /Retail Deployment/);
  assert.match(service, /Checklist item is outside this Activity/);
  assert.match(service, /assertRuntimeChecklistScope/);
});
test("only assigned responsibility or active management can execute", () => {
  assert.match(migration, /p_actor_user_id<>v_activity\.activity_owner_user_id/);
  assert.match(migration, /p_actor_user_id is distinct from v_activity\.supervisor_user_id/);
  assert.match(migration, /'customer_admin','workspace_manager','project_manager'/);
  assert.match(migration, /membership\.status='active'/);
});
test("Checklist and evidence changes share immutable deterministic Activity History", () => {
  for (const event of ["checklist_passed", "checklist_failed", "checklist_not_applicable", "evidence_added"]) assert.match(migration, new RegExp(event));
  assert.match(migration, /runtime_checklist_item_id/);
  assert.match(migration, /runtime_evidence_id/);
  assert.doesNotMatch(migration, /update public\.build_runtime_activity_events/);
  assert.match(ui, /Checklist passed/);
  assert.match(ui, /Evidence added/);
});
test("Evidence success feedback is type-specific and follows authoritative finalization", () => {
  assert.match(ui, /photo: "Photo uploaded successfully\."/);
  assert.match(ui, /video: "Video uploaded successfully\."/);
  assert.match(ui, /document: "Document uploaded successfully\."/);
  assert.match(ui, /setMessage\("Note added successfully\."\)/);
  assert.match(ui, /if \(!finalize\.ok\) throw new Error[\s\S]{0,300}setMessage\(FILE_EVIDENCE_SUCCESS_MESSAGES\[evidenceType\]\)/);
  assert.match(ui, /if \(!response\.ok\) throw new Error[\s\S]{0,300}setMessage\("Note added successfully\."\)/);
  assert.doesNotMatch(ui, /setMessage\("Evidence added\."\)/);
});
test("browser mutation remains server mediated and customer-safe", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.build_runtime_evidence from public,anon,authenticated,service_role/);
  assert.match(migration, /grant execute on function public\.record_build_runtime_evidence[\s\S]*to service_role/);
  assert.doesNotMatch([ui, service, checklistRoute, evidenceRoute].join("\n"), /["'`]\/client(?:\/|["'`])/);
});
test("trigger-only functions account for hosted default ACLs", () => {
  assert.match(migration, /revoke all on function public\.validate_build_runtime_evidence_ancestry\(\) from public,anon,authenticated,service_role/);
  assert.match(migration, /security definer[\s\S]*set search_path = pg_catalog/);
});
test("S3A-8 does not mutate templates or introduce post-S3A-8 systems", () => {
  assert.doesNotMatch(migration, /(?:update|alter table) public\.build_(?:checklist_templates|activity_templates)/);
  assert.doesNotMatch([migration, service, ui].join("\n"), /requires_video|transcod|AI video|inspection approval|resource consumption/i);
});

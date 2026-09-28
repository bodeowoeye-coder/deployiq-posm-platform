import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runBuildNotificationPostMutationReconciliation } from "../lib/build/notifications/postMutationCore.ts";

const runtime = () => readFileSync(new URL("../lib/build/runtime/service.ts", import.meta.url), "utf8");
const postMutation = () => readFileSync(new URL("../lib/build/notifications/postMutation.ts", import.meta.url), "utf8");

test("post-mutation reconciliation uses the accepted shared project-scoped engine", async () => {
  const calls = [];
  const result = await runBuildNotificationPostMutationReconciliation(
    { projectId: "project-1", boundary: "activity_action" },
    async (input) => { calls.push(input); return { evaluated: 1 }; },
  );
  assert.deepEqual(calls, [{ projectId: "project-1" }]);
  assert.deepEqual(result, { status: "reconciled" });
  assert.match(postMutation(), /reconcileAuthenticatedBuildNotifications/);
  assert.doesNotMatch(postMutation(), /createAdminSupabase|\.from\(|\.rpc\(/);
});

test("reconciliation failure is isolated after authoritative mutation success", async () => {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    const result = await runBuildNotificationPostMutationReconciliation(
      { projectId: "project-1", boundary: "inspection_decision" },
      async () => { throw new Error("sensitive database detail"); },
    );
    assert.deepEqual(result, { status: "deferred_to_feed_backstop" });
    assert.equal(warnings.length, 1);
    assert.deepEqual(warnings[0][1], { projectId: "project-1", boundary: "inspection_decision" });
    assert.doesNotMatch(JSON.stringify(warnings), /sensitive database detail/);
  } finally {
    console.warn = original;
  }
});

test("activity block and resume reconcile only after successful RPC verification", () => {
  const source = runtime();
  const verified = source.indexOf('if (text(data) !== params.activityId) throw new AccessControlError("The Activity update could not be verified.", 500);');
  const actionHook = source.indexOf('boundary: "activity_action"');
  assert.ok(verified >= 0 && actionHook > verified);
  assert.match(source.slice(verified, actionHook + 80), /params\.action === "block" \|\| params\.action === "resume"/);
});

test("review, inspection and correction boundaries cover review and changes-required lifecycle", () => {
  const source = runtime();
  for (const boundary of ["review_submission", "inspection_decision", "corrective_work_resumed"]) {
    assert.match(source, new RegExp(`boundary: "${boundary}"`));
  }
  assert.ok(source.indexOf('boundary: "review_submission"') > source.indexOf("Review submission could not be verified."));
  assert.ok(source.indexOf('boundary: "inspection_decision"') > source.indexOf("Inspection decision could not be verified."));
  assert.ok(source.indexOf('boundary: "corrective_work_resumed"') > source.indexOf("Corrective work could not be verified."));
});

test("exception creation and lifecycle actions reconcile after verified mutation results", () => {
  const source = runtime();
  assert.ok(source.indexOf('boundary: "exception_created"') > source.indexOf("The Exception could not be verified."));
  const actionVerification = source.lastIndexOf("The Exception action could not be verified.");
  assert.ok(source.indexOf('boundary: "exception_action"') > actionVerification);
});

test("mutation responses do not expose notification lifecycle internals", () => {
  const source = runtime();
  assert.doesNotMatch(source, /return \{[^}]*(conditionId|episodeId|ruleId|recipientId|auditId)/s);
  assert.match(source, /return getRuntimeActivityExecution\(params\)/);
});

test("feed reconciliation remains as the idempotent correctness backstop", () => {
  const repository = readFileSync(new URL("../lib/build/notifications/repository.ts", import.meta.url), "utf8");
  assert.match(repository, /reconcileBackstop/);
  assert.match(repository, /reconcileAuthenticatedBuildNotifications/);
  assert.match(repository, /Promise\.allSettled/);
});

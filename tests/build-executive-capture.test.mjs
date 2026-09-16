import assert from "node:assert/strict";
import test from "node:test";
import { captureBuildExecutiveAcceptance, assertBuildExecutiveCaptureComplete } from "./support/build-executive-capture.mjs";

const accepted = () => ({
  sections: [
    { id: "executive_position", availability: "available", sourceTasks: ["executive_summary"], statements: [{ id: "executive_summary:s1", sourceTask: "executive_summary", text: "Overdue: 5." }], limitations: [] },
    { id: "data_coverage_and_limitations", availability: "available", sourceTasks: ["change_interpretation"], statements: [{ id: "change_interpretation:s2", sourceTask: "change_interpretation", text: "History is bounded." }], limitations: [{ id: "change_interpretation:l1", sourceTask: "change_interpretation", text: "Item overlap is unavailable." }] },
  ],
});
const explanation = () => ({ decisionConsiderations: [{ id: "executive_summary:d1", sourceTask: "executive_summary", text: "Review overdue work." }], limitations: [{ id: "change_interpretation:l1", sourceTask: "change_interpretation", text: "Item overlap is unavailable." }], evidence: [{ id: "executive_summary:f1", source: { task: "executive_summary" }, availability: "available", label: "Currently overdue" }] });

test("acceptance capture traverses mixed Data Coverage statements and limitations and all explainability identities", () => {
  const artifact = captureBuildExecutiveAcceptance(accepted(), explanation());
  const parsed = JSON.parse(artifact);
  assert.deepEqual(parsed.sections.map((section) => section.id), ["executive_position", "data_coverage_and_limitations"]);
  assert.equal(parsed.sections[1].statements[0].text, "History is bounded.");
  assert.equal(parsed.sections[1].limitations[0].text, "Item overlap is unavailable.");
  assert.equal(parsed.decisionConsiderations[0].id, "executive_summary:d1");
  assert.equal(parsed.evidence[0].id, "executive_summary:f1");
});

test("omitted or altered accepted statement, limitation, decision or evidence fails closed", () => {
  const interpretation = accepted(), explainability = explanation();
  const baseline = JSON.parse(captureBuildExecutiveAcceptance(interpretation, explainability));
  for (const mutate of [
    (value) => value.sections[1].statements.pop(),
    (value) => value.sections[1].limitations.pop(),
    (value) => value.sections.reverse(),
    (value) => value.decisionConsiderations.pop(),
    (value) => value.evidence.pop(),
    (value) => { value.evidence[0].label = "Changed"; },
    (value) => { value.sections[0].statements[0].text = "Changed"; },
  ]) {
    const candidate = structuredClone(baseline); mutate(candidate);
    assert.throws(() => assertBuildExecutiveCaptureComplete(interpretation, explainability, JSON.stringify(candidate)));
  }
});

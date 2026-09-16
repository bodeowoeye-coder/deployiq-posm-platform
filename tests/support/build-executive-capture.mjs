/** Acceptance-only, credential-free serialization of an already accepted result. */
export function captureBuildExecutiveAcceptance(interpretation, explainability) {
  if (!Array.isArray(interpretation?.sections) || !Array.isArray(explainability?.decisionConsiderations) || !Array.isArray(explainability?.limitations) || !Array.isArray(explainability?.evidence)) throw new Error("Invalid accepted executive result");
  const manifest = {
    sections: interpretation.sections.map((section) => ({
      id: section.id, availability: section.availability, sourceTasks: [...section.sourceTasks],
      statements: section.statements.map((item) => ({ id: item.id, sourceTask: item.sourceTask, text: item.text })),
      limitations: section.limitations.map((item) => ({ id: item.id, sourceTask: item.sourceTask, text: item.text })),
    })),
    decisionConsiderations: explainability.decisionConsiderations.map((item) => ({ id: item.id, sourceTask: item.sourceTask, text: item.text })),
    limitations: explainability.limitations.map((item) => ({ id: item.id, sourceTask: item.sourceTask, text: item.text })),
    evidence: explainability.evidence.map((item) => ({ id: item.id, sourceTask: item.source.task, availability: item.availability, label: item.label, value: item.value, timing: item.timing })),
  };
  const artifact = JSON.stringify(manifest);
  assertBuildExecutiveCaptureComplete(interpretation, explainability, artifact);
  return artifact;
}

export function assertBuildExecutiveCaptureComplete(interpretation, explainability, artifact) {
  let parsed;
  try { parsed = JSON.parse(artifact); } catch { throw new Error("Acceptance capture is not valid JSON"); }
  const expected = {
    sections: interpretation.sections.map((section) => ({ id: section.id, availability: section.availability, sourceTasks: [...section.sourceTasks], statements: section.statements.map((item) => ({ id: item.id, sourceTask: item.sourceTask, text: item.text })), limitations: section.limitations.map((item) => ({ id: item.id, sourceTask: item.sourceTask, text: item.text })) })),
    decisionConsiderations: explainability.decisionConsiderations.map((item) => ({ id: item.id, sourceTask: item.sourceTask, text: item.text })),
    limitations: explainability.limitations.map((item) => ({ id: item.id, sourceTask: item.sourceTask, text: item.text })),
    evidence: explainability.evidence.map((item) => ({ id: item.id, sourceTask: item.source.task, availability: item.availability, label: item.label, value: item.value, timing: item.timing })),
  };
  const unique = (items) => items.length === new Set(items).size;
  if (!unique(expected.sections.map((section) => section.id)) || !unique(expected.sections.flatMap((section) => section.statements.map((item) => item.id))) || !unique(expected.sections.flatMap((section) => section.limitations.map((item) => item.id))) || !unique(expected.decisionConsiderations.map((item) => item.id)) || !unique(expected.evidence.map((item) => item.id))) throw new Error("Acceptance capture contains duplicate identifiers");
  if (JSON.stringify(parsed) !== JSON.stringify(expected)) throw new Error("Acceptance capture does not match the accepted executive result");
  return true;
}

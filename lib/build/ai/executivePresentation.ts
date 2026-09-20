import type { BuildExecutiveServiceResult } from "./executiveService.ts";
import type { BuildExecutiveSectionAvailability, BuildExecutiveSectionId, BuildExecutiveSourceTask } from "./executiveInterpretation.ts";
import type { BuildExecutiveEvidenceDescriptor } from "./explainability.ts";

export type ExecutiveEvidence = Pick<BuildExecutiveEvidenceDescriptor, "id" | "label" | "source" | "availability" | "value" | "timing" | "authoritativeReference"> & { href: null };
export type ExecutiveStatement = { id: string; text: string; supportState: "fully_supported" | "coverage_limited"; evidenceIds: string[]; limitationIds: string[] };
export type ExecutiveSection = { id: BuildExecutiveSectionId; availability: BuildExecutiveSectionAvailability; statements: ExecutiveStatement[] };
export type ExecutiveIntelligenceViewModel = {
  availability: "available" | "partial" | "unavailable";
  timing: Partial<Record<BuildExecutiveSourceTask, { asOf: string; generatedAt: string; historyPeriod?: { from: string; through: string; timezone: "UTC"; cadence: "daily" | "weekly" } }>>;
  executivePosition: ExecutiveSection;
  managementAttention: ExecutiveSection;
  materialChanges: ExecutiveSection;
  decisionConsiderations: { availability: BuildExecutiveSectionAvailability; authority: "non_binding"; items: ExecutiveStatement[] };
  coverage: { availability: BuildExecutiveSectionAvailability; limitations: Array<{ id: string; text: string; code: string }>; measures: Array<{ label: string; represented: number; eligible: number; noun: string }> };
  evidence: ExecutiveEvidence[];
  attentionGroups: Array<{ label: string; count: number; evidenceId: string; href: null }>;
};

const SECTION_IDS = ["executive_position", "current_management_attention", "material_execution_changes", "decision_considerations", "data_coverage_and_limitations", "supporting_deterministic_facts"] as const;
const attentionPaths = new Set(["scheduleOverdue", "executionBlocks", "reviewsPending", "correctiveActionsRequired", "activeExceptions", "overdueExceptions", "assignmentsMissing"]);
const coveragePaths = [
  { path: "/quality/firstPassAcceptance", label: "First-Pass Acceptance", noun: "eligible reviewed Activities" },
  { path: "/quality/reviewCoverage", label: "Review Coverage", noun: "review-required Activities" },
  { path: "/coverage/schedule", label: "Schedule Coverage", noun: "eligible Activities" },
  { path: "/coverage/review", label: "Review Coverage", noun: "review-required Activities" },
] as const;
const factKey = (task: string, fact: { toolCallId: string; factPath: string; provenanceKeys: string[] }) => `${task}:${fact.toolCallId}:${fact.factPath}:${fact.provenanceKeys.join(",")}`;

export function composeExecutiveIntelligenceViewModel(result: BuildExecutiveServiceResult, projectId: string): ExecutiveIntelligenceViewModel | null {
  if (!result.ok || result.interpretation.contract !== "deployiq.build.executive_interpretation" || result.interpretation.schemaVersion !== "1.0" || result.explainability.contract !== "deployiq.build.executive_explainability" || result.explainability.schemaVersion !== "1.0" || result.interpretation.scope.projectId !== projectId || result.explainability.scope.projectId !== projectId) return null;
  const sections = new Map(result.interpretation.sections.map((section) => [section.id, section]));
  if (SECTION_IDS.some((id) => !sections.has(id)) || sections.size !== SECTION_IDS.length) return null;
  const evidence = result.explainability.evidence.map((item): ExecutiveEvidence => ({ id: item.id, label: item.label, source: item.source, availability: item.availability, value: item.value, timing: item.timing, authoritativeReference: item.authoritativeReference, href: null }));
  const evidenceIds = new Map(evidence.map((item) => [factKey(item.source.task, item.authoritativeReference), item.id]));
  const mapStatement = (item: (typeof result.interpretation.sections)[number]["statements"][number]): ExecutiveStatement => ({ id: item.id, text: item.text, supportState: item.supportState, evidenceIds: item.supportingFacts.map((fact) => evidenceIds.get(factKey(item.sourceTask, fact))).filter((id): id is string => Boolean(id)), limitationIds: [...item.limitationIds] });
  const section = (id: BuildExecutiveSectionId): ExecutiveSection => { const value = sections.get(id)!; return { id, availability: value.availability, statements: value.statements.map(mapStatement) }; };
  const timing: ExecutiveIntelligenceViewModel["timing"] = {};
  for (const item of evidence) if (!timing[item.source.task] && item.timing.asOf && item.timing.generatedAt) timing[item.source.task] = item.timing;
  const attentionGroups = evidence.filter((item) => item.source.task === "management_attention" && item.availability === "available" && item.authoritativeReference.factPath.startsWith("/attention/summary/categoryCounts/") && attentionPaths.has(item.authoritativeReference.factPath.split("/").at(-1) ?? "") && item.value?.type === "count" && typeof item.value.raw === "number" && item.value.raw > 0).map((item) => ({ label: item.label, count: item.value!.raw as number, evidenceId: item.id, href: null as null }));
  const measures = coveragePaths.flatMap(({ path, label, noun }) => {
    const numerator = evidence.find((item) => item.availability === "available" && item.authoritativeReference.factPath === `${path}/numerator` && typeof item.value?.raw === "number");
    const denominator = evidence.find((item) => item.availability === "available" && item.source.task === numerator?.source.task && item.authoritativeReference.factPath === `${path}/denominator` && typeof item.value?.raw === "number");
    return numerator && denominator ? [{ label, represented: numerator.value!.raw as number, eligible: denominator.value!.raw as number, noun }] : [];
  });
  return {
    availability: result.interpretation.availability,
    timing,
    executivePosition: section("executive_position"), managementAttention: section("current_management_attention"), materialChanges: section("material_execution_changes"),
    decisionConsiderations: { availability: sections.get("decision_considerations")!.availability, authority: "non_binding", items: result.explainability.decisionConsiderations.map((item) => ({ id: item.id, text: item.text, supportState: item.supportState, evidenceIds: [...item.evidenceIds], limitationIds: [...item.limitationIds] })) },
    coverage: { availability: sections.get("data_coverage_and_limitations")!.availability, limitations: result.explainability.limitations.map((item) => ({ id: item.id, text: item.text, code: item.code })), measures },
    evidence,
    attentionGroups,
  };
}

import type { BuildExecutiveServiceResult } from "./executiveService.ts";
import type { BuildExecutiveSectionAvailability, BuildExecutiveSectionId, BuildExecutiveSourceTask } from "./executiveInterpretation.ts";
import type { BuildExecutiveEvidenceDescriptor } from "./explainability.ts";

export type ExecutiveEvidence = Pick<BuildExecutiveEvidenceDescriptor, "id" | "label" | "source" | "availability" | "value" | "timing" | "authoritativeReference"> & { href: null };
export type ExecutiveStatement = { id: string; text: string; supportState: "fully_supported" | "coverage_limited"; evidenceIds: string[]; limitationIds: string[] };
export type ExecutiveStatementGroup = ExecutiveStatement & { sourceIds: string[]; itemCount: number };
export type ExecutiveFact = { label: string; value: string | number | boolean | null; evidenceId: string };
export type ExecutiveAttentionItemGroup = { condition: string; expectedNextAction: string; itemCount: number; evidenceIds: string[] };
export type ExecutiveSection = { id: BuildExecutiveSectionId; availability: BuildExecutiveSectionAvailability; statements: ExecutiveStatement[] };
export type ExecutiveIntelligenceViewModel = {
  availability: "available" | "partial" | "unavailable";
  timing: Partial<Record<BuildExecutiveSourceTask, { asOf: string; generatedAt: string; historyPeriod?: { from: string; through: string; timezone: "UTC"; cadence: "daily" | "weekly" } }>>;
  executivePosition: ExecutiveSection;
  managementAttention: ExecutiveSection;
  materialChanges: ExecutiveSection;
  decisionConsiderations: { availability: BuildExecutiveSectionAvailability; authority: "non_binding"; items: ExecutiveStatementGroup[] };
  coverage: { availability: BuildExecutiveSectionAvailability; limitations: Array<{ id: string; text: string; code: string }>; measures: Array<{ label: string; represented: number; eligible: number; noun: string }> };
  evidence: ExecutiveEvidence[];
  attentionGroups: Array<{ label: string; count: number; evidenceId: string; href: null }>;
  attentionItems: ExecutiveAttentionItemGroup[];
  executiveFacts: ExecutiveFact[];
  materialFacts: ExecutiveFact[];
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
const executiveFactPaths = new Set(["/currentState/activitiesCompleted", "/currentState/activitiesAccepted", "/currentState/currentOverdue", "/currentState/openExceptions"]);
const materialFactPaths = new Set(["/history/summary/activitiesStarted", "/history/summary/activitiesCompleted", "/history/summary/activitiesAccepted", "/history/summary/submissions", "/history/summary/blockedEvents", "/history/summary/resumedEvents"]);

export function groupExecutiveStatements(items: ExecutiveStatement[]): ExecutiveStatementGroup[] {
  const groups = new Map<string, ExecutiveStatementGroup>();
  for (const item of items) {
    const key = JSON.stringify([item.text, item.supportState, [...item.limitationIds].sort()]);
    const current = groups.get(key);
    if (!current) { groups.set(key, { ...item, sourceIds: [item.id], itemCount: 1, evidenceIds: [...new Set(item.evidenceIds)] }); continue; }
    current.sourceIds.push(item.id); current.itemCount += 1;
    current.evidenceIds = [...new Set([...current.evidenceIds, ...item.evidenceIds])];
  }
  return [...groups.values()];
}

export function materialChangesEmptyMessage(section: ExecutiveSection | null) {
  if (!section) return "Generate intelligence to prepare this briefing.";
  if (section.availability !== "available") return "Material Changes interpretation is unavailable for this briefing.";
  return "No Material Changes statements are available for this briefing.";
}

export function formatExecutiveCoverage(measure: { represented: number; eligible: number; noun: string }) {
  const noun = measure.eligible === 1 ? measure.noun.replace(/Activities$/, "Activity") : measure.noun;
  return `${measure.represented} of ${measure.eligible} ${noun} represented`;
}

export function groupExecutiveDecisionActions(items: ExecutiveStatementGroup[], evidence: ExecutiveEvidence[]): ExecutiveStatementGroup[] {
  const byId = new Map(evidence.map((item) => [item.id, item]));
  const expanded: ExecutiveStatementGroup[] = [];
  for (const item of items) {
    const match = item.itemCount === 1 && /^Management may review (.+)\. This is non-binding\.$/.exec(item.text);
    const parts = match ? match[1].split("; ") : [];
    if (!parts.length || parts.length !== item.evidenceIds.length || parts.some((part, index) => {
      const descriptor = byId.get(item.evidenceIds[index]);
      return !part.startsWith("Expected Next Action: ") || descriptor?.availability !== "available"
        || descriptor.value?.type !== "text" || descriptor.value.raw !== part.slice("Expected Next Action: ".length)
        || !/^\/attention\/preview\/items\/\d+\/expectedNextAction$/.test(descriptor.authoritativeReference.factPath);
    })) {
      expanded.push(item);
      continue;
    }
    for (let index = 0; index < parts.length; index++) {
      const action = parts[index].slice("Expected Next Action: ".length);
      expanded.push({ ...item, id: `${item.id}:action:${index}`, text: `Management may review ${action}. This is non-binding.`, itemCount: 1, evidenceIds: [item.evidenceIds[index]], sourceIds: [...item.sourceIds] });
    }
  }
  const grouped = new Map<string, ExecutiveStatementGroup>();
  for (const item of expanded) {
    const key = JSON.stringify([item.text, item.supportState, [...item.limitationIds].sort()]);
    const current = grouped.get(key);
    if (!current) { grouped.set(key, { ...item }); continue; }
    current.itemCount += item.itemCount;
    current.evidenceIds = [...new Set([...current.evidenceIds, ...item.evidenceIds])];
    current.sourceIds = [...new Set([...current.sourceIds, ...item.sourceIds])];
  }
  return [...grouped.values()];
}

export function groupExecutiveAttentionItems(evidence: ExecutiveEvidence[]): ExecutiveAttentionItemGroup[] {
  const items = new Map<string, { condition?: ExecutiveEvidence; action?: ExecutiveEvidence }>();
  for (const item of evidence) {
    const match = item.authoritativeReference.factPath.match(/^\/attention\/preview\/items\/(\d+)\/(condition|expectedNextAction)$/);
    if (!match || item.availability !== "available" || item.value?.type !== "text" || typeof item.value.raw !== "string") continue;
    const current = items.get(match[1]) ?? {}; current[match[2] === "condition" ? "condition" : "action"] = item; items.set(match[1], current);
  }
  const groups = new Map<string, ExecutiveAttentionItemGroup>();
  for (const item of items.values()) {
    if (!item.condition || !item.action) continue;
    const key = JSON.stringify([item.condition.value!.raw, item.action.value!.raw]);
    const current = groups.get(key); const ids = [item.condition.id, item.action.id];
    if (!current) groups.set(key, { condition: String(item.condition.value!.raw), expectedNextAction: String(item.action.value!.raw), itemCount: 1, evidenceIds: ids });
    else { current.itemCount += 1; current.evidenceIds = [...new Set([...current.evidenceIds, ...ids])]; }
  }
  return [...groups.values()];
}

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
  const facts = (paths: Set<string>, task: BuildExecutiveSourceTask) => evidence.filter((item) => item.source.task === task && item.availability === "available" && paths.has(item.authoritativeReference.factPath) && item.value).map((item) => ({ label: item.label, value: item.value!.raw, evidenceId: item.id }));
  const measures = coveragePaths.flatMap(({ path, label, noun }) => {
    const numerator = evidence.find((item) => item.availability === "available" && item.authoritativeReference.factPath === `${path}/numerator` && typeof item.value?.raw === "number");
    const denominator = evidence.find((item) => item.availability === "available" && item.source.task === numerator?.source.task && item.authoritativeReference.factPath === `${path}/denominator` && typeof item.value?.raw === "number");
    return numerator && denominator ? [{ label, represented: numerator.value!.raw as number, eligible: denominator.value!.raw as number, noun }] : [];
  });
  return {
    availability: result.interpretation.availability,
    timing,
    executivePosition: section("executive_position"), managementAttention: section("current_management_attention"), materialChanges: section("material_execution_changes"),
    decisionConsiderations: { availability: sections.get("decision_considerations")!.availability, authority: "non_binding", items: groupExecutiveStatements(result.explainability.decisionConsiderations.map((item) => ({ id: item.id, text: item.text, supportState: item.supportState, evidenceIds: [...item.evidenceIds], limitationIds: [...item.limitationIds] }))) },
    coverage: { availability: sections.get("data_coverage_and_limitations")!.availability, limitations: result.explainability.limitations.map((item) => ({ id: item.id, text: item.text, code: item.code })), measures },
    evidence,
    attentionGroups,
    attentionItems: groupExecutiveAttentionItems(evidence),
    executiveFacts: facts(executiveFactPaths, "executive_summary"),
    materialFacts: facts(materialFactPaths, "change_interpretation"),
  };
}

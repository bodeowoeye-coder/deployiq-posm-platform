import "server-only";

import type { BuildAIFactReference, BuildAIInterpretationV1, BuildAILimitation, BuildAIStatementType, BuildAITask } from "./types.ts";
import type { BuildAIOrchestrationStatus } from "./orchestration.ts";

export const BUILD_EXECUTIVE_INTERPRETATION_CONTRACT = "deployiq.build.executive_interpretation" as const;
export const BUILD_EXECUTIVE_INTERPRETATION_SCHEMA_VERSION = "1.0" as const;

const SOURCE_TASKS = ["executive_summary", "management_attention", "change_interpretation"] as const;
export type BuildExecutiveSourceTask = typeof SOURCE_TASKS[number];
export type BuildExecutiveSectionId = "executive_position" | "current_management_attention" | "material_execution_changes" | "decision_considerations" | "data_coverage_and_limitations" | "supporting_deterministic_facts";
export type BuildExecutiveSectionAvailability = "available" | "ai_unavailable" | "interpretation_unavailable" | "deterministic_intelligence_unavailable" | "no_data" | "not_authorized" | "invalid_request" | "not_requested";
export type BuildExecutiveOverallAvailability = "available" | "partial" | "unavailable";

export type BuildExecutiveInterpretationSource = {
  task: BuildExecutiveSourceTask;
  status: BuildAIOrchestrationStatus | "not_requested";
  deterministicIntelligenceAvailable: boolean;
  interpretation: BuildAIInterpretationV1 | null;
};

export type BuildExecutiveComposedStatement = {
  id: string;
  sourceTask: BuildExecutiveSourceTask;
  sourceStatementId: string;
  type: BuildAIStatementType;
  text: string;
  supportState: "fully_supported" | "coverage_limited";
  supportingFacts: BuildAIFactReference[];
  limitationIds: string[];
};

export type BuildExecutiveComposedLimitation = {
  id: string;
  sourceTask: BuildExecutiveSourceTask;
  sourceLimitationId: string;
  code: BuildAILimitation["code"];
  text: string;
  coverageRefs: BuildAILimitation["coverageRefs"];
};

export type BuildExecutiveEvidenceReference = {
  id: string;
  sourceTask: BuildExecutiveSourceTask;
  authoritativeReference: BuildAIFactReference;
};

export type BuildExecutiveInterpretationSection = {
  id: BuildExecutiveSectionId;
  label: string;
  availability: BuildExecutiveSectionAvailability;
  sourceTasks: BuildExecutiveSourceTask[];
  statements: BuildExecutiveComposedStatement[];
  limitations: BuildExecutiveComposedLimitation[];
  evidence: BuildExecutiveEvidenceReference[];
};

export type BuildExecutiveInterpretationV1 = {
  contract: typeof BUILD_EXECUTIVE_INTERPRETATION_CONTRACT;
  schemaVersion: typeof BUILD_EXECUTIVE_INTERPRETATION_SCHEMA_VERSION;
  scope: { kind: "project"; projectId: string };
  availability: BuildExecutiveOverallAvailability;
  sections: BuildExecutiveInterpretationSection[];
};

export type BuildExecutiveInterpretationInput = {
  scope: { kind: "project"; projectId: string };
  sources: BuildExecutiveInterpretationSource[];
};

export type BuildExecutiveCompositionResult = { ok: true; interpretation: BuildExecutiveInterpretationV1 } | { ok: false; reason: string };

const SECTION_DEFINITIONS: ReadonlyArray<{ id: BuildExecutiveSectionId; label: string }> = [
  { id: "executive_position", label: "Executive Position" },
  { id: "current_management_attention", label: "Current Management Attention" },
  { id: "material_execution_changes", label: "Material Execution Changes" },
  { id: "decision_considerations", label: "Decision Considerations" },
  { id: "data_coverage_and_limitations", label: "Data Coverage and Limitations" },
  { id: "supporting_deterministic_facts", label: "Supporting Deterministic Facts" },
];
const PRIMARY_SECTION: Record<BuildExecutiveSourceTask, BuildExecutiveSectionId> = {
  executive_summary: "executive_position",
  management_attention: "current_management_attention",
  change_interpretation: "material_execution_changes",
};
const AVAILABILITY = new Set<BuildExecutiveSectionAvailability>(["available", "ai_unavailable", "interpretation_unavailable", "deterministic_intelligence_unavailable", "no_data", "not_authorized", "invalid_request", "not_requested"]);
const STATEMENT_TYPES = new Set<BuildAIStatementType>(["interpretation", "attention", "decision_option", "limitation"]);
const SUPPORT_STATES = new Set(["fully_supported", "coverage_limited"]);
const LIMITATION_CODES = new Set(["partial_coverage", "data_unavailable", "history_unavailable", "interpretation_unavailable", "unsupported_conclusion", "governance_not_configured"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

const plain = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).every((key) => typeof key === "string");
const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => plain(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const task = (value: unknown): value is BuildExecutiveSourceTask => typeof value === "string" && SOURCE_TASKS.includes(value as BuildExecutiveSourceTask);
const identifier = (value: unknown): value is string => typeof value === "string" && ID.test(value);
const stringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(identifier);
const statementType = (value: unknown): value is BuildAIStatementType => typeof value === "string" && STATEMENT_TYPES.has(value as BuildAIStatementType);
const supportState = (value: unknown): value is "fully_supported" | "coverage_limited" => typeof value === "string" && SUPPORT_STATES.has(value);
const limitationCode = (value: unknown): value is BuildAILimitation["code"] => typeof value === "string" && LIMITATION_CODES.has(value);

function validFact(value: unknown): value is BuildAIFactReference {
  return exact(value, ["toolCallId", "factPath", "provenanceKeys"]) && identifier(value.toolCallId) && typeof value.factPath === "string" && value.factPath.startsWith("/") && stringArray(value.provenanceKeys) && value.provenanceKeys.length > 0;
}

function validLimitation(value: unknown): value is BuildAILimitation {
  return exact(value, ["id", "code", "text", "coverageRefs"]) && identifier(value.id) && limitationCode(value.code) && typeof value.text === "string" && value.text.length > 0 && Array.isArray(value.coverageRefs) && value.coverageRefs.every((reference) => exact(reference, ["toolCallId", "coveragePath"]) && identifier(reference.toolCallId) && typeof reference.coveragePath === "string" && reference.coveragePath.startsWith("/"));
}

function validInterpretation(value: unknown, sourceTask: BuildExecutiveSourceTask, projectId: string): value is BuildAIInterpretationV1 {
  if (!exact(value, ["schemaVersion", "generatedAt", "scope", "task", "dataset", "statements", "limitations", "validation"]) || value.schemaVersion !== "1.0" || value.task !== sourceTask) return false;
  if (!exact(value.scope, ["kind", "projectId"]) || value.scope.kind !== "project" || value.scope.projectId !== projectId) return false;
  if (!exact(value.validation, ["status", "policyVersion"]) || value.validation.status !== "accepted" || typeof value.validation.policyVersion !== "string") return false;
  if (!Array.isArray(value.statements) || !Array.isArray(value.limitations) || !value.limitations.every(validLimitation)) return false;
  const limitationIds = new Set(value.limitations.map((item) => item.id));
  if (limitationIds.size !== value.limitations.length) return false;
  const statementIds = new Set<string>();
  for (const statement of value.statements) {
    if (!exact(statement, ["id", "type", "text", "supportingFacts", "limitationIds", "supportState"]) || !identifier(statement.id) || statementIds.has(statement.id) || !statementType(statement.type) || typeof statement.text !== "string" || !supportState(statement.supportState) || !Array.isArray(statement.supportingFacts) || !statement.supportingFacts.every(validFact) || !stringArray(statement.limitationIds) || statement.limitationIds.some((id) => !limitationIds.has(id))) return false;
    if (statement.type !== "limitation" && statement.supportingFacts.length === 0) return false;
    statementIds.add(statement.id);
  }
  return true;
}

function sourceAvailability(source: BuildExecutiveInterpretationSource): BuildExecutiveSectionAvailability {
  return source.status === "interpreted" ? "available" : source.status;
}

function sharedSectionAvailability(sources: ReadonlyMap<BuildExecutiveSourceTask, BuildExecutiveInterpretationSource>): BuildExecutiveSectionAvailability {
  const states = SOURCE_TASKS.map((sourceTask) => sourceAvailability(sources.get(sourceTask)!));
  if (states.includes("available")) return "available";
  return states.every((state) => state === states[0]) ? states[0] : "interpretation_unavailable";
}

const namespace = (sourceTask: BuildExecutiveSourceTask, id: string) => `${sourceTask}:${id}`;
const factKey = (sourceTask: BuildExecutiveSourceTask, fact: BuildAIFactReference) => `${sourceTask}:${fact.toolCallId}:${fact.factPath}:${fact.provenanceKeys.join(",")}`;

export function composeBuildExecutiveInterpretation(input: unknown): BuildExecutiveCompositionResult {
  if (!exact(input, ["scope", "sources"]) || !exact(input.scope, ["kind", "projectId"]) || input.scope.kind !== "project" || typeof input.scope.projectId !== "string" || !UUID.test(input.scope.projectId) || !Array.isArray(input.sources) || input.sources.length !== SOURCE_TASKS.length) return { ok: false, reason: "invalid_input" };
  const projectId = input.scope.projectId;
  const sources = new Map<BuildExecutiveSourceTask, BuildExecutiveInterpretationSource>();
  for (const candidate of input.sources) {
    if (!exact(candidate, ["task", "status", "deterministicIntelligenceAvailable", "interpretation"]) || !task(candidate.task) || sources.has(candidate.task) || typeof candidate.deterministicIntelligenceAvailable !== "boolean") return { ok: false, reason: "invalid_source" };
    const availability = candidate.status === "interpreted" ? "available" : candidate.status;
    if (!AVAILABILITY.has(availability as BuildExecutiveSectionAvailability)) return { ok: false, reason: "invalid_source_status" };
    const deterministicExpected = candidate.status === "interpreted" || candidate.status === "ai_unavailable" || candidate.status === "interpretation_unavailable";
    if (candidate.deterministicIntelligenceAvailable !== deterministicExpected) return { ok: false, reason: "invalid_deterministic_availability" };
    if (candidate.status === "interpreted" ? !validInterpretation(candidate.interpretation, candidate.task, projectId) : candidate.interpretation !== null) return { ok: false, reason: "invalid_interpretation" };
    sources.set(candidate.task, candidate as BuildExecutiveInterpretationSource);
  }
  if (sources.size !== SOURCE_TASKS.length) return { ok: false, reason: "missing_source" };

  const sections = new Map(SECTION_DEFINITIONS.map((definition) => [definition.id, { ...definition, availability: "not_requested" as BuildExecutiveSectionAvailability, sourceTasks: [] as BuildExecutiveSourceTask[], statements: [] as BuildExecutiveComposedStatement[], limitations: [] as BuildExecutiveComposedLimitation[], evidence: [] as BuildExecutiveEvidenceReference[] }]));
  const evidence = new Map<string, BuildExecutiveEvidenceReference>();
  for (const sourceTask of SOURCE_TASKS) {
    const source = sources.get(sourceTask)!;
    const primary = sections.get(PRIMARY_SECTION[sourceTask])!;
    primary.availability = sourceAvailability(source);
    primary.sourceTasks.push(sourceTask);
    if (!source.interpretation) continue;
    const limitationIds = new Map(source.interpretation.limitations.map((limitation) => [limitation.id, namespace(sourceTask, limitation.id)]));
    const composedLimitations = source.interpretation.limitations.map((limitation) => ({ ...limitation, id: limitationIds.get(limitation.id)!, sourceTask, sourceLimitationId: limitation.id, coverageRefs: limitation.coverageRefs.map((reference) => ({ ...reference })) }));
    sections.get("data_coverage_and_limitations")!.limitations.push(...composedLimitations);
    for (const statement of source.interpretation.statements) {
      const composed: BuildExecutiveComposedStatement = { ...statement, id: namespace(sourceTask, statement.id), sourceTask, sourceStatementId: statement.id, supportingFacts: statement.supportingFacts.map((fact) => ({ ...fact, provenanceKeys: [...fact.provenanceKeys] })), limitationIds: statement.limitationIds.map((id) => limitationIds.get(id)!) };
      const target = statement.type === "decision_option" ? "decision_considerations" : statement.type === "limitation" ? "data_coverage_and_limitations" : PRIMARY_SECTION[sourceTask];
      sections.get(target)!.statements.push(composed);
      for (const fact of composed.supportingFacts) {
        const key = factKey(sourceTask, fact);
        if (!evidence.has(key)) evidence.set(key, { id: `${sourceTask}:fact:${String(evidence.size + 1).padStart(3, "0")}`, sourceTask, authoritativeReference: { ...fact, provenanceKeys: [...fact.provenanceKeys] } });
      }
    }
  }
  const interpretedSources = SOURCE_TASKS.filter((sourceTask) => sources.get(sourceTask)!.status === "interpreted");
  const sharedAvailability = sharedSectionAvailability(sources);
  for (const id of ["decision_considerations", "data_coverage_and_limitations", "supporting_deterministic_facts"] as const) {
    const section = sections.get(id)!;
    section.availability = sharedAvailability;
    section.sourceTasks.push(...interpretedSources);
  }
  sections.get("supporting_deterministic_facts")!.evidence.push(...evidence.values());
  const primaryAvailable = SOURCE_TASKS.filter((sourceTask) => sources.get(sourceTask)!.status === "interpreted").length;
  const availability: BuildExecutiveOverallAvailability = primaryAvailable === SOURCE_TASKS.length ? "available" : primaryAvailable > 0 ? "partial" : "unavailable";
  return { ok: true, interpretation: { contract: BUILD_EXECUTIVE_INTERPRETATION_CONTRACT, schemaVersion: BUILD_EXECUTIVE_INTERPRETATION_SCHEMA_VERSION, scope: { kind: "project", projectId }, availability, sections: SECTION_DEFINITIONS.map(({ id }) => sections.get(id)!) } };
}

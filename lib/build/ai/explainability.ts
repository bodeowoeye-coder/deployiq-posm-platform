import "server-only";

import type { BuildAIFactReference } from "./types.ts";
import type { BuildAIOrchestrationResult } from "./orchestration.ts";
import type {
  BuildExecutiveComposedLimitation,
  BuildExecutiveInterpretationV1,
  BuildExecutiveSourceTask,
} from "./executiveInterpretation.ts";

export const BUILD_EXECUTIVE_EXPLAINABILITY_CONTRACT = "deployiq.build.executive_explainability" as const;
export const BUILD_EXECUTIVE_EXPLAINABILITY_SCHEMA_VERSION = "1.0" as const;

export type BuildExecutiveEvidenceConceptId =
  | "execution_position" | "progress_position" | "schedule_performance" | "management_attention"
  | "quality_acceptance" | "dependency_position" | "exception_health" | "recent_execution"
  | "data_coverage" | "comparison_period" | "execution_change_history" | "review_change_history" | "historical_data_coverage";
export type BuildExecutiveEvidenceValueType = "count" | "number" | "ratio" | "percentage" | "duration_hours" | "date" | "date_time" | "status" | "boolean" | "text";

export type BuildExecutiveEvidenceDescriptor = {
  id: string;
  conceptId: BuildExecutiveEvidenceConceptId | null;
  label: string;
  source: { task: BuildExecutiveSourceTask; label: string };
  availability: "available" | "descriptor_unavailable";
  value: { type: BuildExecutiveEvidenceValueType; raw: string | number | boolean | null } | null;
  timing: { asOf: string; generatedAt: string; historyPeriod?: { from: string; through: string; timezone: "UTC"; cadence: "daily" | "weekly" } };
  authoritativeReference: BuildAIFactReference;
};
export type BuildExecutiveDecisionConsideration = {
  id: string;
  label: "Decision Consideration";
  authority: "non_binding";
  sourceTask: BuildExecutiveSourceTask;
  text: string;
  supportState: "fully_supported" | "coverage_limited";
  evidenceIds: string[];
  limitationIds: string[];
};
export type BuildExecutiveExplainabilityV1 = {
  contract: typeof BUILD_EXECUTIVE_EXPLAINABILITY_CONTRACT;
  schemaVersion: typeof BUILD_EXECUTIVE_EXPLAINABILITY_SCHEMA_VERSION;
  scope: { kind: "project"; projectId: string };
  evidence: BuildExecutiveEvidenceDescriptor[];
  decisionConsiderations: BuildExecutiveDecisionConsideration[];
  limitations: BuildExecutiveComposedLimitation[];
};
export type BuildExecutiveExplainabilitySource = { task: BuildExecutiveSourceTask; result: BuildAIOrchestrationResult };
export type BuildExecutiveExplainabilityResult = { ok: true; explainability: BuildExecutiveExplainabilityV1 } | { ok: false; reason: "invalid_input" };

const SOURCE_TASKS = ["executive_summary", "management_attention", "change_interpretation"] as const;
const SOURCE_LABEL: Record<BuildExecutiveSourceTask, string> = {
  executive_summary: "Executive Position",
  management_attention: "Management Attention",
  change_interpretation: "Material Execution Changes",
};
type DescriptorMapping = { conceptId: BuildExecutiveEvidenceConceptId; label: string; type: BuildExecutiveEvidenceValueType };
const EXACT_PATHS: Record<string, DescriptorMapping> = Object.create(null);
const label = (field: string) => field.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (value) => value.toUpperCase());
function add(prefix: string, conceptId: BuildExecutiveEvidenceConceptId, type: BuildExecutiveEvidenceValueType, fields: string) {
  for (const field of fields.split(" ")) EXACT_PATHS[`${prefix}/${field}`] = { conceptId, label: label(field), type };
}
add("/currentState", "execution_position", "count", "activitiesAccepted activitiesCompleted activitiesExpectedComplete currentOverdue managementAttention openExceptions");
add("/progress", "progress_position", "status", "dataQuality");
add("/progress", "progress_position", "number", "operationalShortfall acceptedShortfall");
add("/progress/durationCoverage", "progress_position", "status", "state");
add("/progress/durationCoverage", "progress_position", "count", "eligible total");
for (const prefix of ["/progress/durationExpected", "/progress/durationCompleted", "/progress/durationAccepted"]) {
  add(prefix, "progress_position", "count", "numerator denominator"); add(prefix, "progress_position", "ratio", "ratio"); add(prefix, "progress_position", "status", "state");
}
add("/plannedPosition", "progress_position", "number", "operationalShortfall acceptedShortfall");
for (const prefix of ["/plannedPosition/durationExpected", "/plannedPosition/durationCompleted", "/plannedPosition/durationAccepted"]) {
  add(prefix, "progress_position", "count", "numerator denominator"); add(prefix, "progress_position", "ratio", "ratio"); add(prefix, "progress_position", "status", "state");
}
add("/schedule", "schedule_performance", "count", "scheduled currentlyOverdue completedOnTime completedLate workPackagesOverdue blockedOverdue changesRequiredOverdue dataIncomplete");
add("/attention/summary", "management_attention", "count", "outstandingObligations overdueObligations activitiesAffected workPackagesAffected explicitOwnersAffected unassignedObligations");
for (const [field, descriptorLabel] of Object.entries({
  executionBlocks: "Execution Blocks", reviewsPending: "Reviews Pending", activeExceptions: "Active Exceptions",
  overdueExceptions: "Overdue Exceptions", correctiveActionsRequired: "Corrective Actions Required",
  assignmentsMissing: "Assignments Missing", scheduleOverdue: "Schedule Overdue",
})) EXACT_PATHS[`/attention/summary/categoryCounts/${field}`] = { conceptId: "management_attention", label: descriptorLabel, type: "count" };
add("/attention/preview", "management_attention", "count", "total returned");
add("/attention/preview", "management_attention", "boolean", "truncated");
add("/quality", "quality_acceptance", "count", "activitiesRequiringCorrection currentChangesRequired");
add("/quality", "quality_acceptance", "duration_hours", "medianReviewTurnaroundHours");
add("/quality", "quality_acceptance", "status", "reviewCoverageState scheduleCoverageState");
for (const prefix of ["/quality/scheduleAdherence", "/quality/firstPassAcceptance", "/quality/reviewCoverage", "/coverage/schedule", "/coverage/review"]) {
  const conceptId = prefix.startsWith("/quality") ? "quality_acceptance" : "data_coverage";
  add(prefix, conceptId, "count", "numerator denominator"); add(prefix, conceptId, "ratio", "ratio"); add(prefix, conceptId, "status", "state");
}
add("/dependencies/summary", "dependency_position", "count", "totalConstraints unreleasedConstraints downstreamActivitiesExposed overdueSuccessorsWithUnreleasedConstraints latePredecessorActivities workPackagesWithDependencyExceptions dataIncompleteConstraints baselineControllingConstraints");
add("/exceptions/summary", "exception_health", "count", "total active open inRemediation resolved verified overdue critical high");
add("/exceptions/preview", "exception_health", "count", "total returned"); add("/exceptions/preview", "exception_health", "boolean", "truncated");
add("/recentExecution", "recent_execution", "boolean", "ok"); add("/recentExecution", "recent_execution", "status", "dataQuality timezone interval");
add("/recentExecution", "recent_execution", "date_time", "periodStart periodEnd");
add("/recentExecution/counts", "recent_execution", "count", "activitiesStarted operationalCompletions acceptedActivities submissions initialSubmissions resubmissions changesRequiredOutcomes activitiesRequiringChanges correctiveWorkResumptions correctiveCycles activitiesWithCorrectiveCycles blockedEvents activitiesBlocked resumedEvents");
add("/coverage", "data_coverage", "status", "progress");
add("/coverage", "data_coverage", "count", "dependencyDataIncomplete workPackagesWithoutPlan workPackagesWithMultiplePlans workPackagesWithIncompleteMeasurement assignmentsMissing");
add("/timing/requestedHistory", "comparison_period", "date", "from through");
add("/timing/requestedHistory", "comparison_period", "date_time", "periodStart periodEnd");
add("/timing/requestedHistory", "comparison_period", "status", "timezone cadence interval");
add("/history/summary", "execution_change_history", "count", "activitiesStarted activitiesCompleted activitiesAccepted submissions initialSubmissions resubmissions changesRequiredOutcomes activitiesRequiringCorrection correctiveCycles blockedEvents resumedEvents");
add("/history/review", "review_change_history", "count", "cyclesTotal cyclesMeasured cyclesUnmeasurable");
add("/history/review", "review_change_history", "duration_hours", "averageHours medianHours minHours maxHours");
add("/history/coverage", "historical_data_coverage", "status", "dataQuality");
add("/history/coverage", "historical_data_coverage", "boolean", "scopedBucketsAvailable");
add("/history/coverage", "historical_data_coverage", "count", "archivedWorkPackages reviewCyclesMeasured reviewCyclesTotal");
// Only these complete preview-item structures may vary by a bounded array index.
const INDEXED_PATHS: ReadonlyArray<{ pattern: RegExp; descriptor: DescriptorMapping }> = [
  ...(["type", "dataQuality"] as const).map((field) => ({ pattern: new RegExp(`^/attention/preview/items/[0-5]/${field}$`), descriptor: { conceptId: "management_attention" as const, label: label(field), type: "status" as const } })),
  ...(["condition", "expectedActor", "expectedNextAction"] as const).map((field) => ({ pattern: new RegExp(`^/attention/preview/items/[0-5]/${field}$`), descriptor: { conceptId: "management_attention" as const, label: label(field), type: "text" as const } })),
  { pattern: /^\/attention\/preview\/items\/[0-5]\/overdue$/, descriptor: { conceptId: "management_attention", label: "Overdue", type: "boolean" } },
  { pattern: /^\/attention\/preview\/items\/[0-5]\/dueAt$/, descriptor: { conceptId: "management_attention", label: "Due At", type: "date_time" } },
  ...(["activityOwner", "expectedNextActor"] as const).flatMap((actor) => (["assignmentState", "role"] as const).map((field) => ({ pattern: new RegExp(`^/attention/preview/items/[0-5]/${actor}/${field}$`), descriptor: { conceptId: "management_attention" as const, label: label(field), type: "status" as const } }))),
  ...(["status", "severity"] as const).map((field) => ({ pattern: new RegExp(`^/exceptions/preview/items/[0-4]/${field}$`), descriptor: { conceptId: "exception_health" as const, label: label(field), type: "status" as const } })),
  { pattern: /^\/exceptions\/preview\/items\/[0-4]\/dueAt$/, descriptor: { conceptId: "exception_health", label: "Due At", type: "date_time" } },
  { pattern: /^\/exceptions\/preview\/items\/[0-4]\/overdue$/, descriptor: { conceptId: "exception_health", label: "Overdue", type: "boolean" } },
];
const POINTER_SEGMENT = /~1|~0/g;

const plain = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).every((key) => typeof key === "string");
const referenceKey = (task: BuildExecutiveSourceTask, reference: BuildAIFactReference) => `${task}:${reference.toolCallId}:${reference.factPath}:${reference.provenanceKeys.join(",")}`;
const decode = (segment: string) => segment.replace(POINTER_SEGMENT, (value) => value === "~1" ? "/" : "~");
function pointer(value: unknown, path: string): unknown {
  if (!path.startsWith("/") || path.includes("/__proto__") || path.includes("/prototype") || path.includes("/constructor")) return undefined;
  return path.slice(1).split("/").map(decode).reduce<unknown>((current, part) => current && typeof current === "object" ? (current as Record<string, unknown>)[part] : undefined, value);
}
function mapping(path: string): DescriptorMapping | null {
  return EXACT_PATHS[path] ?? INDEXED_PATHS.find(({ pattern }) => pattern.test(path))?.descriptor ?? null;
}

export function buildBuildExecutiveExplainability(input: unknown): BuildExecutiveExplainabilityResult {
  if (!plain(input) || Object.keys(input).length !== 2 || !Object.hasOwn(input, "interpretation") || !Object.hasOwn(input, "sources")) return { ok: false, reason: "invalid_input" };
  const interpretation = input.interpretation as BuildExecutiveInterpretationV1;
  if (!plain(interpretation) || interpretation.contract !== "deployiq.build.executive_interpretation" || interpretation.schemaVersion !== "1.0" || !plain(interpretation.scope) || interpretation.scope.kind !== "project" || !Array.isArray(interpretation.sections) || !Array.isArray(input.sources)) return { ok: false, reason: "invalid_input" };
  const sources = new Map<BuildExecutiveSourceTask, BuildAIOrchestrationResult>();
  for (const candidate of input.sources) {
    if (!plain(candidate) || Object.keys(candidate).length !== 2 || !SOURCE_TASKS.includes(candidate.task as BuildExecutiveSourceTask) || sources.has(candidate.task as BuildExecutiveSourceTask) || !plain(candidate.result)) return { ok: false, reason: "invalid_input" };
    const result = candidate.result as BuildAIOrchestrationResult;
    if (result.interpretation && (result.interpretation.task !== candidate.task || result.interpretation.scope.kind !== "project" || result.interpretation.scope.projectId !== interpretation.scope.projectId)) return { ok: false, reason: "invalid_input" };
    sources.set(candidate.task as BuildExecutiveSourceTask, candidate.result as BuildAIOrchestrationResult);
  }
  const evidenceSection = interpretation.sections.find((section) => section.id === "supporting_deterministic_facts");
  const decisionSection = interpretation.sections.find((section) => section.id === "decision_considerations");
  const limitationSection = interpretation.sections.find((section) => section.id === "data_coverage_and_limitations");
  if (!evidenceSection || !decisionSection || !limitationSection) return { ok: false, reason: "invalid_input" };
  if (decisionSection.statements.some((statement) => statement.type !== "decision_option")) return { ok: false, reason: "invalid_input" };
  const seenEvidence = new Set<string>();
  const evidence: BuildExecutiveEvidenceDescriptor[] = evidenceSection.evidence.flatMap((item) => {
    const identity = referenceKey(item.sourceTask, item.authoritativeReference);
    if (seenEvidence.has(identity)) return [];
    seenEvidence.add(identity);
    const source = sources.get(item.sourceTask); const call = source?.toolResults.find((candidate) => candidate.id === item.authoritativeReference.toolCallId);
    const sourceInterpretation = source?.interpretation; const tool = sourceInterpretation?.dataset.toolCalls.find((candidate) => candidate.id === item.authoritativeReference.toolCallId);
    const selected = call ? pointer(call.result.dataset, item.authoritativeReference.factPath) : undefined; const mapped = mapping(item.authoritativeReference.factPath);
    const scalar = selected === null || typeof selected === "string" || typeof selected === "number" || typeof selected === "boolean";
    const available = Boolean(mapped && tool && sourceInterpretation && scalar);
    const history = call?.result.dataset.timing.requestedHistory;
    return [{
      id: item.id, conceptId: available ? mapped!.conceptId : null, label: available ? mapped!.label : "Evidence descriptor unavailable",
      source: { task: item.sourceTask, label: SOURCE_LABEL[item.sourceTask] }, availability: available ? "available" : "descriptor_unavailable",
      value: available ? { type: mapped!.type, raw: selected as string | number | boolean | null } : null,
      timing: { asOf: tool?.asOf ?? "", generatedAt: sourceInterpretation?.generatedAt ?? "", ...(history ? { historyPeriod: { from: history.from, through: history.through, timezone: history.timezone, cadence: history.cadence } } : {}) },
      authoritativeReference: { ...item.authoritativeReference, provenanceKeys: [...item.authoritativeReference.provenanceKeys] },
    }];
  });
  const evidenceIds = new Map(evidence.map((item) => [referenceKey(item.source.task, item.authoritativeReference), item.id]));
  const decisionConsiderations = decisionSection.statements.map((statement): BuildExecutiveDecisionConsideration => ({
    id: statement.id, label: "Decision Consideration", authority: "non_binding", sourceTask: statement.sourceTask, text: statement.text,
    supportState: statement.supportState, evidenceIds: statement.supportingFacts.map((fact) => evidenceIds.get(referenceKey(statement.sourceTask, fact))).filter((id): id is string => Boolean(id)), limitationIds: [...statement.limitationIds],
  }));
  return { ok: true, explainability: {
    contract: BUILD_EXECUTIVE_EXPLAINABILITY_CONTRACT, schemaVersion: BUILD_EXECUTIVE_EXPLAINABILITY_SCHEMA_VERSION,
    scope: { kind: "project", projectId: interpretation.scope.projectId }, evidence, decisionConsiderations,
    limitations: limitationSection.limitations.map((item) => ({ ...item, coverageRefs: item.coverageRefs.map((reference) => ({ ...reference })) })),
  } };
}

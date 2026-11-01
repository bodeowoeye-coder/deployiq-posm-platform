import "server-only";

import {
  orchestrateBuildAI,
  type BuildAIHistoryRequest,
  type BuildAIOrchestrationRequest,
  type BuildAIOrchestrationResult,
  type BuildAIOrchestrationStatus,
} from "./orchestration.ts";
import {
  composeBuildExecutiveInterpretation,
  type BuildExecutiveInterpretationSource,
  type BuildExecutiveInterpretationV1,
  type BuildExecutiveSourceTask,
} from "./executiveInterpretation.ts";
import { buildBuildExecutiveExplainability, type BuildExecutiveExplainabilityV1 } from "./explainability.ts";

export const BUILD_EXECUTIVE_PRIMARY_SECTIONS = [
  "executive_position",
  "current_management_attention",
  "material_execution_changes",
] as const;

export type BuildExecutivePrimarySection = typeof BUILD_EXECUTIVE_PRIMARY_SECTIONS[number];
export type BuildExecutiveServiceRequest = {
  projectId: string;
  sections: BuildExecutivePrimarySection[];
  history?: BuildAIHistoryRequest;
};
export type BuildExecutiveTaskDiagnostic = {
  task: BuildExecutiveSourceTask;
  status: BuildAIOrchestrationStatus | "not_requested" | "unexpected_failure";
  outcome: "successful" | "provider_timeout" | "provider_rejection" | "malformed_structured_output" | "invalid_fact_references" | "governance_validation_rejection" | "provider_failure" | "not_requested" | "invalid_request" | "deterministic_unavailable" | "unexpected_failure";
  effectiveModel: string | null;
  providerFailureCategory: BuildAIOrchestrationResult["audit"]["providerFailureCategory"];
  providerFailureDetail: BuildAIOrchestrationResult["audit"]["providerFailureDetail"];
  validationOutcome: BuildAIOrchestrationResult["audit"]["validationOutcome"];
  validationErrorCodes: BuildAIOrchestrationResult["audit"]["validationErrorCodes"];
  durationMs: number | null;
};
export type BuildExecutiveServiceResult =
  | { ok: true; interpretation: BuildExecutiveInterpretationV1; explainability: BuildExecutiveExplainabilityV1; diagnostics: BuildExecutiveTaskDiagnostic[] }
  | { ok: false; status: "invalid_request" | "composition_unavailable" };

type Orchestrator = (request: BuildAIOrchestrationRequest) => Promise<BuildAIOrchestrationResult>;
type ServiceDependencies = { orchestrate: Orchestrator };

const SOURCE_TASKS = ["executive_summary", "management_attention", "change_interpretation"] as const;
const SECTION_TASK: Record<BuildExecutivePrimarySection, BuildExecutiveSourceTask> = {
  executive_position: "executive_summary",
  current_management_attention: "management_attention",
  material_execution_changes: "change_interpretation",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REQUEST_KEYS = ["projectId", "sections"] as const;
const REQUEST_KEYS_WITH_HISTORY = [...REQUEST_KEYS, "history"] as const;
const HISTORY_KEYS = ["from", "through", "timezone", "cadence"] as const;

const plain = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).every((key) => typeof key === "string");
const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  plain(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const validDate = (value: unknown): value is string =>
  typeof value === "string" && DATE.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

function validHistory(value: unknown): value is BuildAIHistoryRequest {
  if (!exact(value, HISTORY_KEYS) || !validDate(value.from) || !validDate(value.through) || value.timezone !== "UTC" || (value.cadence !== "daily" && value.cadence !== "weekly")) return false;
  const from = new Date(`${value.from}T00:00:00.000Z`).getTime();
  const through = new Date(`${value.through}T00:00:00.000Z`).getTime();
  return from <= through && ((through - from) / 86_400_000) + 1 <= 366;
}

function validateRequest(value: unknown): BuildExecutiveServiceRequest | null {
  if (!plain(value) || (!exact(value, REQUEST_KEYS) && !exact(value, REQUEST_KEYS_WITH_HISTORY)) || typeof value.projectId !== "string" || !UUID.test(value.projectId)) return null;
  if (!Array.isArray(value.sections) || value.sections.length === 0 || value.sections.length > BUILD_EXECUTIVE_PRIMARY_SECTIONS.length) return null;
  const sections = value.sections as unknown[];
  if (sections.some((section) => typeof section !== "string" || !BUILD_EXECUTIVE_PRIMARY_SECTIONS.includes(section as BuildExecutivePrimarySection)) || new Set(sections).size !== sections.length) return null;
  if (value.history !== undefined && !validHistory(value.history)) return null;
  if (value.history !== undefined && !sections.includes("material_execution_changes")) return null;
  return value as BuildExecutiveServiceRequest;
}

function source(task: BuildExecutiveSourceTask, status: BuildAIOrchestrationStatus | "not_requested", interpretation: BuildAIOrchestrationResult["interpretation"] = null): BuildExecutiveInterpretationSource {
  return {
    task,
    status,
    deterministicIntelligenceAvailable: status === "interpreted" || status === "ai_unavailable" || status === "interpretation_unavailable",
    interpretation,
  };
}

function taskRequest(request: BuildExecutiveServiceRequest, task: BuildExecutiveSourceTask): BuildAIOrchestrationRequest {
  return {
    task,
    projectId: request.projectId,
    ...(task === "change_interpretation" ? { history: request.history! } : {}),
  };
}

function boundedDuration(startedAt: string, completedAt: string) {
  const duration = Date.parse(completedAt) - Date.parse(startedAt);
  return Number.isFinite(duration) && duration >= 0 && duration <= 120_000 ? duration : null;
}

function diagnosticOutcome(result: BuildAIOrchestrationResult): BuildExecutiveTaskDiagnostic["outcome"] {
  if (result.audit.validationOutcome === "accepted" && result.status === "interpreted") return "successful";
  if (result.audit.validationOutcome === "rejected") return "governance_validation_rejection";
  if (result.audit.providerFailureCategory === "provider_timeout" || result.audit.providerFailureCategory === "outer_timeout") return "provider_timeout";
  if (result.audit.providerFailureCategory === "provider_refusal" || result.audit.providerFailureCategory === "incomplete_response") return "provider_rejection";
  if (result.audit.providerFailureCategory === "invalid_provider_response") return "malformed_structured_output";
  if (result.audit.providerFailureCategory === "invalid_provider_reference") return "invalid_fact_references";
  if (result.audit.providerFailureCategory) return "provider_failure";
  if (result.status === "invalid_request") return "invalid_request";
  return "deterministic_unavailable";
}

function diagnostic(task: BuildExecutiveSourceTask, result: BuildAIOrchestrationResult | null, status: "not_requested" | "invalid_request" | "unexpected_failure" = "unexpected_failure"): BuildExecutiveTaskDiagnostic {
  if (!result) return { task, status, outcome: status, effectiveModel: null, providerFailureCategory: null, providerFailureDetail: null, validationOutcome: "not_run", validationErrorCodes: [], durationMs: null };
  return {
    task,
    status: result.status,
    outcome: diagnosticOutcome(result),
    effectiveModel: result.audit.provider?.modelId ?? null,
    providerFailureCategory: result.audit.providerFailureCategory,
    providerFailureDetail: result.audit.providerFailureDetail ?? null,
    validationOutcome: result.audit.validationOutcome,
    validationErrorCodes: result.audit.validationErrorCodes ?? [],
    durationMs: boundedDuration(result.audit.startedAt, result.audit.completedAt),
  };
}

export function createBuildExecutiveService(dependencies: ServiceDependencies) {
  return async function getBuildExecutiveInterpretation(input: unknown): Promise<BuildExecutiveServiceResult> {
    const request = validateRequest(input);
    if (!request) return { ok: false, status: "invalid_request" };

    const selected = new Set(request.sections.map((section) => SECTION_TASK[section]));
    const pending = SOURCE_TASKS.map(async (task): Promise<{ source: BuildExecutiveInterpretationSource; result: BuildAIOrchestrationResult | null; diagnosticStatus?: "not_requested" | "invalid_request" | "unexpected_failure" }> => {
      if (!selected.has(task)) return { source: source(task, "not_requested"), result: null, diagnosticStatus: "not_requested" };
      if (task === "change_interpretation" && !request.history) return { source: source(task, "invalid_request"), result: null, diagnosticStatus: "invalid_request" };
      try {
        const result = await dependencies.orchestrate(taskRequest(request, task));
        return { source: source(task, result.status, result.status === "interpreted" ? result.interpretation : null), result };
      } catch {
        return { source: source(task, "deterministic_intelligence_unavailable"), result: null, diagnosticStatus: "unexpected_failure" };
      }
    });
    const settled = await Promise.all(pending); const sources = settled.map((item) => item.source);
    const composed = composeBuildExecutiveInterpretation({ scope: { kind: "project", projectId: request.projectId }, sources });
    if (!composed.ok) return { ok: false, status: "composition_unavailable" };
    const explainability = buildBuildExecutiveExplainability({ interpretation: composed.interpretation, sources: settled.filter((item) => item.result).map((item) => ({ task: item.source.task, result: item.result })) });
    const diagnostics = settled.map((item) => diagnostic(item.source.task, item.result, item.diagnosticStatus));
    return explainability.ok ? { ok: true, interpretation: composed.interpretation, explainability: explainability.explainability, diagnostics } : { ok: false, status: "composition_unavailable" };
  };
}

export function createBuildExecutiveServiceFromOrchestration(
  dependencies: Parameters<typeof orchestrateBuildAI>[1],
) {
  return createBuildExecutiveService({ orchestrate: (request) => orchestrateBuildAI(request, dependencies) });
}

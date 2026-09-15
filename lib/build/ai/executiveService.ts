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
export type BuildExecutiveServiceResult =
  | { ok: true; interpretation: BuildExecutiveInterpretationV1 }
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

export function createBuildExecutiveService(dependencies: ServiceDependencies) {
  return async function getBuildExecutiveInterpretation(input: unknown): Promise<BuildExecutiveServiceResult> {
    const request = validateRequest(input);
    if (!request) return { ok: false, status: "invalid_request" };

    const selected = new Set(request.sections.map((section) => SECTION_TASK[section]));
    const pending = SOURCE_TASKS.map(async (task): Promise<BuildExecutiveInterpretationSource> => {
      if (!selected.has(task)) return source(task, "not_requested");
      if (task === "change_interpretation" && !request.history) return source(task, "invalid_request");
      try {
        const result = await dependencies.orchestrate(taskRequest(request, task));
        return source(task, result.status, result.status === "interpreted" ? result.interpretation : null);
      } catch {
        return source(task, "deterministic_intelligence_unavailable");
      }
    });
    const sources = await Promise.all(pending);
    const composed = composeBuildExecutiveInterpretation({ scope: { kind: "project", projectId: request.projectId }, sources });
    return composed.ok ? { ok: true, interpretation: composed.interpretation } : { ok: false, status: "composition_unavailable" };
  };
}

export function createBuildExecutiveServiceFromOrchestration(
  dependencies: Parameters<typeof orchestrateBuildAI>[1],
) {
  return createBuildExecutiveService({ orchestrate: (request) => orchestrateBuildAI(request, dependencies) });
}

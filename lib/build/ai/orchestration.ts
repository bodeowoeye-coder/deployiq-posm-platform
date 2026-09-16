import "server-only";

import { BUILD_AI_DEFAULT_TIMEOUT_MS } from "./config.ts";
import { DEFAULT_BUILD_AI_GOVERNANCE } from "./governance.ts";
import { BuildAIProviderError, type BuildAIProvider, type BuildAIProviderFailureCategory, type BuildAIProviderMetadata, type BuildAIProviderRequest, type BuildAIProviderToolContext } from "./provider.ts";
import type { BuildAIAcceptedToolCall, BuildAIInterpretationV1, BuildAIInterpretationV2, BuildAIModelOutputV1, BuildAITask, BuildAIValidationError } from "./types.ts";
import { validateBuildAIModelOutput } from "./validation.ts";
import { BUILD_INTELLIGENCE_TOOLS, type BuildIntelligenceTool, type BuildIntelligenceToolName } from "../intelligence/tools.ts";

export const BUILD_AI_ORCHESTRATION_VERSION = "build-ai-orchestration-v1" as const;
export const BUILD_AI_PROVIDER_TIMEOUT_MS = BUILD_AI_DEFAULT_TIMEOUT_MS;
export const BUILD_AI_PROVIDER_TIMEOUT_MARGIN_MS = 2_500;
export const BUILD_AI_MAX_QUESTION_LENGTH = 1_000;

export type BuildAIHistoryRequest = { from: string; through: string; timezone: "UTC"; cadence: "daily" | "weekly" };
export type BuildAIOrchestrationRequest = {
  task: BuildAITask;
  projectId: string;
  workPackageId?: string;
  activityId?: string;
  question?: string;
  history?: BuildAIHistoryRequest;
};
export type BuildAIOrchestrationStatus = "invalid_request" | "not_authorized" | "no_data" | "deterministic_intelligence_unavailable" | "ai_unavailable" | "interpretation_unavailable" | "interpreted";
export type BuildAIOrchestrationAudit = {
  orchestrationVersion: typeof BUILD_AI_ORCHESTRATION_VERSION;
  task: BuildAITask;
  scope: "project" | "work_package" | "activity";
  toolCalls: Array<{ id: string; tool: BuildIntelligenceToolName; datasetSchemaVersion?: string }>;
  governanceVersion: string;
  outputSchemaVersion: "1.0" | "2.0";
  provider: BuildAIProviderMetadata | null;
  providerFailureCategory: BuildAIProviderFailureCategory | null;
  validationOutcome: "not_run" | "accepted" | "rejected";
  startedAt: string;
  completedAt: string;
};
export type BuildAIOrchestrationResult = {
  ok: boolean;
  status: BuildAIOrchestrationStatus;
  toolResults: readonly BuildAIAcceptedToolCall[];
  interpretation: BuildAIInterpretationV1 | BuildAIInterpretationV2 | null;
  errors?: readonly BuildAIValidationError[];
  audit: BuildAIOrchestrationAudit;
};

type Clock = () => Date;
type Timer = { set(callback: () => void, delayMs: number): unknown; clear(handle: unknown): void };
type Dependencies = { provider: BuildAIProvider; tools?: readonly BuildIntelligenceTool[]; clock?: Clock; providerTimeoutMs?: number; timer?: Timer };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REQUEST_KEYS = new Set(["task", "projectId", "workPackageId", "activityId", "question", "history"]);
const HISTORY_KEYS = ["from", "through", "timezone", "cadence"];
const TASKS = new Set<BuildAITask>(["executive_summary", "change_interpretation", "management_attention"]);

export function buildAIOuterTimeoutMs(providerTimeoutMs: number): number {
  if (!Number.isSafeInteger(providerTimeoutMs) || providerTimeoutMs <= 0 || providerTimeoutMs > Number.MAX_SAFE_INTEGER - BUILD_AI_PROVIDER_TIMEOUT_MARGIN_MS) throw new RangeError("Invalid Build AI provider timeout.");
  return providerTimeoutMs + BUILD_AI_PROVIDER_TIMEOUT_MARGIN_MS;
}

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).every((key) => typeof key === "string");
}
function exact(value: unknown, keys: readonly string[]) { return plain(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function validDate(value: unknown) { return typeof value === "string" && DATE.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value; }
function validHistory(value: unknown): value is BuildAIHistoryRequest {
  if (!plain(value) || !exact(value, HISTORY_KEYS)) return false;
  if (!validDate(value.from) || !validDate(value.through) || value.timezone !== "UTC" || !["daily", "weekly"].includes(String(value.cadence))) return false;
  const from = new Date(`${value.from}T00:00:00.000Z`).getTime(), through = new Date(`${value.through}T00:00:00.000Z`).getTime();
  return from <= through && ((through - from) / 86_400_000) + 1 <= 366;
}

function validateRequest(input: unknown): BuildAIOrchestrationRequest | null {
  if (!plain(input) || Reflect.ownKeys(input).some((key) => typeof key !== "string" || !REQUEST_KEYS.has(key)) || !TASKS.has(input.task as BuildAITask) || !UUID.test(String(input.projectId))) return null;
  if (input.workPackageId !== undefined && !UUID.test(String(input.workPackageId))) return null;
  if (input.activityId !== undefined && (!input.workPackageId || !UUID.test(String(input.activityId)))) return null;
  if (input.question !== undefined && (typeof input.question !== "string" || input.question.trim() !== input.question || input.question.length === 0 || input.question.length > BUILD_AI_MAX_QUESTION_LENGTH)) return null;
  if (input.history !== undefined && !validHistory(input.history)) return null;
  if (input.task === "change_interpretation" && (!input.history || input.activityId)) return null;
  if (input.task !== "change_interpretation" && input.history !== undefined) return null;
  return input as BuildAIOrchestrationRequest;
}

function route(request: BuildAIOrchestrationRequest): { tool: BuildIntelligenceToolName; arguments: Record<string, unknown>; scope: BuildAIOrchestrationAudit["scope"] } {
  const scope = request.activityId ? "activity" : request.workPackageId ? "work_package" : "project";
  if (request.task === "change_interpretation") return { tool: "get_build_execution_history", arguments: { projectId: request.projectId, ...(request.workPackageId ? { workPackageId: request.workPackageId } : {}), ...request.history! }, scope };
  if (scope === "activity") return { tool: "get_build_activity_intelligence", arguments: { projectId: request.projectId, workPackageId: request.workPackageId, activityId: request.activityId }, scope };
  if (scope === "work_package") return { tool: "get_build_work_package_intelligence", arguments: { projectId: request.projectId, workPackageId: request.workPackageId }, scope };
  return { tool: "get_build_project_intelligence", arguments: { projectId: request.projectId }, scope };
}

function failureStatus(code: string): BuildAIOrchestrationStatus {
  if (code === "unauthenticated" || code === "permission_denied") return "not_authorized";
  if (["project_not_found", "work_package_not_found", "activity_not_found", "ambiguous_work_plan"].includes(code)) return "no_data";
  if (["invalid_arguments", "invalid_period", "unsupported_cadence"].includes(code)) return "invalid_request";
  return "deterministic_intelligence_unavailable";
}

function providerRequest(task: BuildAITask, question: string | undefined, context: readonly BuildAIProviderToolContext[], signal: AbortSignal): BuildAIProviderRequest {
  return {
    task, question: question ?? null, authorizedContext: context,
    policy: {
      governanceVersion: DEFAULT_BUILD_AI_GOVERNANCE.version, visibility: "shadow", allowedTask: task,
      allowedStatementTypes: DEFAULT_BUILD_AI_GOVERNANCE.permittedStatementTypes,
      requireFactReferences: true, requireCoverageQualification: true,
      unsupportedConclusions: DEFAULT_BUILD_AI_GOVERNANCE.forbiddenConclusions,
      allowAutonomousActions: false, allowModelAuthoredFacts: false, decisionOptionsOnly: true,
    },
    outputContract: { schemaVersion: "2.0" }, signal,
  };
}

function safeProviderMetadata(value: unknown): BuildAIProviderMetadata | null {
  if (!plain(value) || Object.keys(value).some((key) => !["providerId", "modelId", "modelVersion"].includes(key))) return null;
  const bounded = (item: unknown, required = false) => typeof item === "string" && item.trim() === item && item.length > 0 && item.length <= 100 ? item : required ? null : undefined;
  const providerId = bounded(value.providerId, true);
  const modelId = bounded(value.modelId), modelVersion = bounded(value.modelVersion);
  if (!providerId || (value.modelId !== undefined && !modelId) || (value.modelVersion !== undefined && !modelVersion)) return null;
  return { providerId, ...(modelId ? { modelId } : {}), ...(modelVersion ? { modelVersion } : {}) };
}

export function composeBuildAIModelOutput(body: unknown, task: BuildAITask, toolCalls: readonly BuildAIAcceptedToolCall[]): unknown {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return body;
  const keys = Reflect.ownKeys(body);
  if (keys.length !== 3 || keys.some((key) => typeof key !== "string" || !["schemaVersion", "statements", "limitations"].includes(key))) return body;
  const candidate = body as Record<string, unknown>;
  if (!["1.0", "2.0"].includes(String(candidate.schemaVersion)) || !Array.isArray(candidate.statements) || !Array.isArray(candidate.limitations)) return body;
  const primary = toolCalls[0]?.result.dataset;
  if (!primary) return body;
  const prototype = Object.getPrototypeOf(body);
  const record = <T extends Record<string, unknown>>(value: T): T => Object.assign(Object.create(prototype), value) as T;
  return record({
    schemaVersion: candidate.schemaVersion as "1.0",
    generatedAt: primary.timing.generatedAt,
    scope: primary.scope,
    task,
    dataset: record({
      schemaVersion: primary.schemaVersion,
      toolCalls: toolCalls.map((call) => record({
        id: call.id,
        tool: call.tool,
        scope: call.result.dataset.scope,
        datasetSchemaVersion: call.result.dataset.schemaVersion,
        asOf: call.result.dataset.timing.currentState.asOf,
      })),
    }),
    statements: candidate.statements,
    limitations: candidate.limitations,
  }) satisfies BuildAIModelOutputV1;
}

export async function orchestrateBuildAI(input: unknown, dependencies: Dependencies): Promise<BuildAIOrchestrationResult> {
  const clock = dependencies.clock ?? (() => new Date());
  const startedAt = clock().toISOString();
  const request = validateRequest(input);
  const baseAudit = (task: BuildAITask, scope: BuildAIOrchestrationAudit["scope"]): BuildAIOrchestrationAudit => ({ orchestrationVersion: BUILD_AI_ORCHESTRATION_VERSION, task, scope, toolCalls: [], governanceVersion: DEFAULT_BUILD_AI_GOVERNANCE.version, outputSchemaVersion: "2.0", provider: null, providerFailureCategory: null, validationOutcome: "not_run", startedAt, completedAt: clock().toISOString() });
  if (!request) return { ok: false, status: "invalid_request", toolResults: [], interpretation: null, audit: baseAudit("executive_summary", "project") };
  const routed = route(request), audit = baseAudit(request.task, routed.scope);
  const tool = (dependencies.tools ?? BUILD_INTELLIGENCE_TOOLS).find((candidate) => candidate.name === routed.tool);
  if (!tool) return { ok: false, status: "deterministic_intelligence_unavailable", toolResults: [], interpretation: null, audit };
  const result = await tool.handler(routed.arguments);
  audit.toolCalls.push({ id: "tool-call-1", tool: routed.tool, ...(result.ok ? { datasetSchemaVersion: result.dataset.schemaVersion } : {}) });
  if (!result.ok) { audit.completedAt = clock().toISOString(); return { ok: false, status: failureStatus(result.error.code), toolResults: [], interpretation: null, audit }; }
  const accepted: BuildAIAcceptedToolCall = { id: "tool-call-1", tool: routed.tool, result };
  const context: readonly BuildAIProviderToolContext[] = [{ toolCallId: accepted.id, tool: accepted.tool, dataset: result.dataset }];
  const controller = new AbortController();
  let generated;
  const providerTimeoutMs = dependencies.providerTimeoutMs ?? BUILD_AI_PROVIDER_TIMEOUT_MS;
  const outerTimeoutMs = buildAIOuterTimeoutMs(providerTimeoutMs);
  const timer = dependencies.timer ?? { set: (callback, delayMs) => setTimeout(callback, delayMs), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) };
  let rejectTimeout: ((reason?: unknown) => void) | undefined;
  const boundedTimeout = new Promise<never>((_, reject) => { rejectTimeout = reject; });
  const timeout = timer.set(() => { controller.abort(); rejectTimeout?.(new BuildAIProviderError("ai_unavailable", "outer_timeout")); }, outerTimeoutMs);
  try { generated = await Promise.race([dependencies.provider.generate(providerRequest(request.task, request.question, context, controller.signal)), boundedTimeout]); }
  catch (error) {
    timer.clear(timeout);
    audit.completedAt = clock().toISOString();
    if (error instanceof BuildAIProviderError) audit.providerFailureCategory = error.category;
    else audit.providerFailureCategory = "transport_error";
    return { ok: true, status: error instanceof BuildAIProviderError ? error.availability : "ai_unavailable", toolResults: [accepted], interpretation: null, audit };
  }
  timer.clear(timeout);
  audit.provider = safeProviderMetadata(generated.metadata);
  if (!audit.provider) { audit.completedAt = clock().toISOString(); return { ok: true, status: "interpretation_unavailable", toolResults: [accepted], interpretation: null, audit }; }
  const validation = validateBuildAIModelOutput({ output: composeBuildAIModelOutput(generated.output, request.task, [accepted]), toolCalls: [accepted], governance: DEFAULT_BUILD_AI_GOVERNANCE });
  audit.completedAt = clock().toISOString();
  if (!validation.ok) { audit.validationOutcome = "rejected"; return { ok: true, status: "interpretation_unavailable", toolResults: [accepted], interpretation: null, errors: validation.errors, audit }; }
  audit.validationOutcome = "accepted";
  return { ok: true, status: "interpreted", toolResults: [accepted], interpretation: validation.interpretation, audit };
}

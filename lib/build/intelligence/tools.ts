import "server-only";

import {
  BuildIntelligenceServiceError,
  getAuthenticatedBuildIntelligence,
  type AuthenticatedBuildIntelligenceRequest,
  type BuildIntelligenceServiceErrorCode,
} from "./service.ts";
import type { BuildIntelligenceDatasetV1 } from "./types.ts";

export const BUILD_INTELLIGENCE_TOOL_NAMES = [
  "get_build_project_intelligence",
  "get_build_work_package_intelligence",
  "get_build_activity_intelligence",
  "get_build_execution_history",
] as const;

export type BuildIntelligenceToolName = typeof BUILD_INTELLIGENCE_TOOL_NAMES[number];
export type BuildIntelligenceToolErrorCode = BuildIntelligenceServiceErrorCode | "invalid_arguments";
export type BuildIntelligenceToolResult =
  | { ok: true; tool: BuildIntelligenceToolName; scope: BuildIntelligenceDatasetV1["scope"]; dataset: BuildIntelligenceDatasetV1 }
  | { ok: false; tool: BuildIntelligenceToolName; error: { code: BuildIntelligenceToolErrorCode; message: string } };

export type BuildIntelligenceTool = {
  name: BuildIntelligenceToolName;
  description: string;
  inputSchema: {
    type: "object";
    additionalProperties: false;
    required: readonly string[];
    properties: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  };
  handler: (input: unknown) => Promise<BuildIntelligenceToolResult>;
};

type IntelligenceService = (request: AuthenticatedBuildIntelligenceRequest) => Promise<BuildIntelligenceDatasetV1>;
type ToolInput = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_HISTORY_DAYS = 366;
const DAY_MS = 86_400_000;
const idProperty = { type: "string", format: "uuid" } as const;
const dateProperty = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } as const;

function exactObject(input: unknown, required: readonly string[], optional: readonly string[] = []): ToolInput | null {
  if (typeof input !== "object" || input === null || Object.getPrototypeOf(input) !== Object.prototype) return null;
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(input);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) return null;
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(input, key))) return null;
  return input as ToolInput;
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function calendarDate(value: unknown): Date | null {
  if (typeof value !== "string" || !DATE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? parsed : null;
}

function projectRequest(input: unknown): AuthenticatedBuildIntelligenceRequest | null {
  const value = exactObject(input, ["projectId"]);
  return value && uuid(value.projectId) ? { scope: "project", projectId: value.projectId } : null;
}

function workPackageRequest(input: unknown): AuthenticatedBuildIntelligenceRequest | null {
  const value = exactObject(input, ["projectId", "workPackageId"]);
  return value && uuid(value.projectId) && uuid(value.workPackageId)
    ? { scope: "work_package", projectId: value.projectId, workPackageId: value.workPackageId }
    : null;
}

function activityRequest(input: unknown): AuthenticatedBuildIntelligenceRequest | null {
  const value = exactObject(input, ["projectId", "workPackageId", "activityId"]);
  return value && uuid(value.projectId) && uuid(value.workPackageId) && uuid(value.activityId)
    ? { scope: "activity", projectId: value.projectId, workPackageId: value.workPackageId, activityId: value.activityId }
    : null;
}

function historyRequest(input: unknown): AuthenticatedBuildIntelligenceRequest | null {
  const value = exactObject(input, ["projectId", "from", "through", "timezone", "cadence"], ["workPackageId"]);
  if (!value || !uuid(value.projectId) || (value.workPackageId !== undefined && !uuid(value.workPackageId))) return null;
  if (value.timezone !== "UTC" || (value.cadence !== "daily" && value.cadence !== "weekly")) return null;
  const from = calendarDate(value.from), through = calendarDate(value.through);
  if (!from || !through || from > through || ((through.getTime() - from.getTime()) / DAY_MS) + 1 > MAX_HISTORY_DAYS) return null;
  const cadence: "daily" | "weekly" = value.cadence;
  const history = { from: value.from as string, through: value.through as string, timezone: "UTC" as const, cadence };
  return typeof value.workPackageId === "string"
    ? { scope: "work_package", projectId: value.projectId, workPackageId: value.workPackageId, history }
    : { scope: "project", projectId: value.projectId, history };
}

function validationFailure(tool: BuildIntelligenceToolName): BuildIntelligenceToolResult {
  return { ok: false, tool, error: { code: "invalid_arguments", message: `Invalid arguments for ${tool}.` } };
}

function serviceFailure(tool: BuildIntelligenceToolName, error: unknown): BuildIntelligenceToolResult {
  if (error instanceof BuildIntelligenceServiceError) {
    return { ok: false, tool, error: { code: error.code, message: error.message } };
  }
  return { ok: false, tool, error: { code: "dataset_validation_failed", message: "Build intelligence is unavailable." } };
}

function tool(
  name: BuildIntelligenceToolName,
  description: string,
  inputSchema: BuildIntelligenceTool["inputSchema"],
  translate: (input: unknown) => AuthenticatedBuildIntelligenceRequest | null,
  service: IntelligenceService,
): BuildIntelligenceTool {
  return {
    name,
    description,
    inputSchema,
    async handler(input) {
      const request = translate(input);
      if (!request) return validationFailure(name);
      try {
        const dataset = await service(request);
        return { ok: true, tool: name, scope: dataset.scope, dataset };
      } catch (error) {
        return serviceFailure(name, error);
      }
    },
  };
}

export function createBuildIntelligenceTools(service: IntelligenceService = getAuthenticatedBuildIntelligence): readonly BuildIntelligenceTool[] {
  return [
    tool("get_build_project_intelligence", "Get authorized deterministic Build Project intelligence.",
      { type: "object", additionalProperties: false, required: ["projectId"], properties: { projectId: idProperty } }, projectRequest, service),
    tool("get_build_work_package_intelligence", "Get authorized deterministic Build Work Package intelligence.",
      { type: "object", additionalProperties: false, required: ["projectId", "workPackageId"], properties: { projectId: idProperty, workPackageId: idProperty } }, workPackageRequest, service),
    tool("get_build_activity_intelligence", "Get authorized deterministic Build Activity intelligence.",
      { type: "object", additionalProperties: false, required: ["projectId", "workPackageId", "activityId"], properties: { projectId: idProperty, workPackageId: idProperty, activityId: idProperty } }, activityRequest, service),
    tool("get_build_execution_history", "Get authorized deterministic Build Project or Work Package execution history.",
      { type: "object", additionalProperties: false, required: ["projectId", "from", "through", "timezone", "cadence"], properties: { projectId: idProperty, workPackageId: idProperty, from: dateProperty, through: dateProperty, timezone: { type: "string", const: "UTC" }, cadence: { type: "string", enum: ["daily", "weekly"] } } }, historyRequest, service),
  ];
}

export const BUILD_INTELLIGENCE_TOOLS = createBuildIntelligenceTools();

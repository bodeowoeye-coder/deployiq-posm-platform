import "server-only";

import type { BuildIntelligenceDatasetV1 } from "../intelligence/types.ts";
import type { BuildAIGovernanceV1 } from "./governance.ts";
import type {
  BuildAIAcceptedToolCall, BuildAICoverageReference, BuildAIFactReference, BuildAIInterpretationV1,
  BuildAILimitation, BuildAIModelOutputV1, BuildAIModelStatement, BuildAIStatementSupport,
  BuildAIToolCallReference, BuildAIValidationError, BuildAIValidationErrorCode, BuildAIValidationResult,
} from "./types.ts";

export const BUILD_AI_MAX_STATEMENTS = 12;
export const BUILD_AI_MAX_LIMITATIONS = 8;
export const BUILD_AI_MAX_TEXT_LENGTH = 500;
export const BUILD_AI_MAX_FACTS_PER_STATEMENT = 8;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const POINTER = /^(?:\/(?:[A-Za-z][A-Za-z0-9_]*|0|[1-9]\d*))+$/;
const DANGEROUS_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
const MODEL_KEYS = ["schemaVersion", "generatedAt", "scope", "task", "dataset", "statements", "limitations"];
const STATEMENT_KEYS = ["id", "type", "text", "supportingFacts", "limitationIds"];
const FACT_KEYS = ["toolCallId", "factPath", "provenanceKeys"];
const LIMITATION_KEYS = ["id", "code", "text", "coverageRefs"];
const COVERAGE_KEYS = ["toolCallId", "coveragePath"];
const TOOL_REFERENCE_KEYS = ["id", "tool", "scope", "datasetSchemaVersion", "asOf"];
const SCOPE_KEYS = { project: ["kind", "projectId"], work_package: ["kind", "projectId", "workPackageId"], activity: ["kind", "projectId", "workPackageId", "activityId"] } as const;
const LIMITATION_CODES = new Set(["partial_coverage", "data_unavailable", "history_unavailable", "interpretation_unavailable", "unsupported_conclusion", "governance_not_configured"]);
const AUTONOMOUS_FIELDS = new Set(["decision", "approved", "executed", "action", "command", "write", "escalation_sent"]);
const SEVERITY_FIELDS = new Set(["severity", "riskScore", "healthScore", "priorityScore"]);
const CONFIDENCE_FIELDS = new Set(["confidence", "confidenceScore", "probability"]);
const UNSUPPORTED_FIELDS = new Set(["forecast", "rootCause", "criticalPath", "financialImpact", "productivityRanking", "causalAttribution", "unsupportedConclusion"]);

const error = (code: BuildAIValidationErrorCode, path: string, message: string): BuildAIValidationError => ({ code, path, message });
const plain = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).every((key) => typeof key === "string");
const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => plain(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
const instant = (value: unknown) => typeof value === "string" && Number.isFinite(new Date(value).getTime()) && new Date(value).toISOString() === value;
const identifier = (value: unknown) => typeof value === "string" && ID.test(value);
const text = (value: unknown) => typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= BUILD_AI_MAX_TEXT_LENGTH;
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

function structuredViolation(value: unknown, path = "$", seen = new Set<object>()): BuildAIValidationError | null {
  if (typeof value !== "object" || value === null || seen.has(value)) return null;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return error("invalid_shape", path, "Build AI output contains an unsupported property.");
    const child = `${path}.${key}`;
    if (AUTONOMOUS_FIELDS.has(key)) return error("autonomous_action_not_allowed", child, "Build AI cannot make or execute operational decisions.");
    if (SEVERITY_FIELDS.has(key)) return error("subjective_severity_not_allowed", child, "Subjective severity is not configured.");
    if (CONFIDENCE_FIELDS.has(key)) return error("numeric_confidence_not_allowed", child, "Numeric AI confidence is not supported.");
    if (UNSUPPORTED_FIELDS.has(key)) return error("unsupported_conclusion", child, "This conclusion is not supported by Build intelligence.");
    const nested = structuredViolation((value as Record<PropertyKey, unknown>)[key], child, seen);
    if (nested) return nested;
  }
  return null;
}

function validScope(value: unknown): value is BuildIntelligenceDatasetV1["scope"] {
  if (!plain(value) || typeof value.kind !== "string" || !(value.kind in SCOPE_KEYS)) return false;
  const keys = SCOPE_KEYS[value.kind as keyof typeof SCOPE_KEYS];
  return exact(value, keys) && keys.filter((key) => key !== "kind").every((key) => typeof value[key] === "string" && Boolean(value[key]));
}

function pointerSegments(path: unknown): string[] | null {
  if (typeof path !== "string" || !POINTER.test(path)) return null;
  const segments = path.slice(1).split("/");
  return segments.some((segment) => DANGEROUS_SEGMENTS.has(segment)) ? null : segments;
}

function resolvePath(root: unknown, path: unknown): { found: boolean; value?: unknown } {
  const segments = pointerSegments(path);
  if (!segments) return { found: false };
  let value: unknown = root;
  for (const segment of segments) {
    if (Array.isArray(value)) {
      if (!/^\d+$/.test(segment) || Number(segment) >= value.length) return { found: false };
      value = value[Number(segment)];
    } else if (plain(value) && Object.prototype.hasOwnProperty.call(value, segment)) value = value[segment];
    else return { found: false };
  }
  return { found: typeof value !== "function", value };
}

function provenanceKeys(dataset: BuildIntelligenceDatasetV1): Set<string> {
  const keys = new Set(dataset.provenance.groups.map((row) => row.key));
  const visit = (value: unknown, seen = new Set<object>()) => {
    if (typeof value !== "object" || value === null || seen.has(value)) return;
    seen.add(value);
    if (plain(value) && plain(value.provenance) && typeof value.provenance.key === "string") keys.add(value.provenance.key);
    for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child, seen);
  };
  visit(dataset);
  return keys;
}

function incompleteCoverage(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return !["complete", "available", "measurable"].includes(value);
  if (typeof value === "number") return value > 0;
  if (!plain(value)) return false;
  if (typeof value.state === "string" && value.state !== "available" && value.state !== "complete") return true;
  if (typeof value.denominator === "number" && typeof value.numerator === "number") return value.denominator === 0 || value.numerator < value.denominator;
  if (typeof value.total === "number" && typeof value.eligible === "number") return value.total === 0 || value.eligible < value.total;
  if (typeof value.dataQuality === "string") return value.dataQuality !== "complete";
  return false;
}

function coveragePaths(dataset: BuildIntelligenceDatasetV1, factPath: string): string[] {
  if (factPath.startsWith("/schedule")) return ["/coverage/schedule"];
  if (factPath.startsWith("/quality")) return ["/coverage/review"];
  if (factPath.startsWith("/progress") || factPath.startsWith("/plannedPosition")) return dataset.scope.kind === "project" ? ["/coverage/progress"] : ["/coverage/duration"];
  if (factPath.startsWith("/dependencies")) return ["/coverage/dependencyDataIncomplete"];
  if (factPath.startsWith("/history")) return ["/history/coverage/dataQuality"];
  return [];
}

function validateToolReference(value: unknown, source: BuildAIAcceptedToolCall | undefined): value is BuildAIToolCallReference {
  if (!exact(value, TOOL_REFERENCE_KEYS) || !source || !validScope(value.scope) || !instant(value.asOf)) return false;
  const dataset = source.result.dataset;
  return value.id === source.id && value.tool === source.tool && same(value.scope, dataset.scope) && value.datasetSchemaVersion === dataset.schemaVersion && value.asOf === dataset.timing.currentState.asOf;
}

function validateFact(value: unknown, sources: Map<string, BuildAIAcceptedToolCall>, declared: Set<string>, path: string, errors: BuildAIValidationError[]): value is BuildAIFactReference {
  if (!exact(value, FACT_KEYS) || typeof value.toolCallId !== "string" || !identifier(value.toolCallId) || !declared.has(value.toolCallId) || typeof value.factPath !== "string" || !Array.isArray(value.provenanceKeys) || value.provenanceKeys.length === 0 || value.provenanceKeys.some((key) => typeof key !== "string" || !identifier(key))) {
    errors.push(error("invalid_fact_reference", path, "The deterministic fact reference is invalid.")); return false;
  }
  const source = sources.get(value.toolCallId);
  if (!source || !resolvePath(source.result.dataset, value.factPath).found) {
    errors.push(error("invalid_fact_reference", `${path}.factPath`, "The deterministic fact path does not exist.")); return false;
  }
  const known = provenanceKeys(source.result.dataset);
  if (value.provenanceKeys.some((key) => !known.has(key))) {
    errors.push(error("invalid_provenance_reference", `${path}.provenanceKeys`, "The provenance reference is not present in the deterministic dataset.")); return false;
  }
  return true;
}

function validateCoverageRef(value: unknown, sources: Map<string, BuildAIAcceptedToolCall>, declared: Set<string>): value is BuildAICoverageReference {
  if (!exact(value, COVERAGE_KEYS) || typeof value.toolCallId !== "string" || !identifier(value.toolCallId) || !declared.has(value.toolCallId) || typeof value.coveragePath !== "string") return false;
  if (!value.coveragePath.startsWith("/coverage/") && !value.coveragePath.startsWith("/history/coverage/")) return false;
  const source = sources.get(value.toolCallId);
  return Boolean(source && resolvePath(source.result.dataset, value.coveragePath).found);
}

function limitationCovers(limitation: BuildAILimitation, toolCallId: string, coveragePath: string) {
  return limitation.coverageRefs.some((ref) => ref.toolCallId === toolCallId && ref.coveragePath === coveragePath) && ["partial_coverage", "data_unavailable", "history_unavailable"].includes(limitation.code);
}

export function validateBuildAIModelOutput(input: { output: unknown; toolCalls: readonly BuildAIAcceptedToolCall[]; governance: BuildAIGovernanceV1 }): BuildAIValidationResult {
  const errors: BuildAIValidationError[] = [];
  const violation = structuredViolation(input.output);
  if (violation) return { ok: false, errors: [violation] };
  if (!exact(input.output, MODEL_KEYS)) return { ok: false, errors: [error("invalid_shape", "$", "Build AI output shape is invalid.")] };
  const output = input.output;
  if (output.schemaVersion !== "1.0" || !instant(output.generatedAt) || !validScope(output.scope) || !exact(output.dataset, ["schemaVersion", "toolCalls"]) || !Array.isArray(output.statements) || !Array.isArray(output.limitations)) {
    return { ok: false, errors: [error("invalid_shape", "$", "Build AI output shape is invalid.")] };
  }
  const datasetContract = output.dataset;
  if (typeof datasetContract.schemaVersion !== "string" || !Array.isArray(datasetContract.toolCalls)) return { ok: false, errors: [error("invalid_shape", "$.dataset", "Build AI dataset references are invalid.")] };
  if (!input.governance.allowedTasks.includes(output.task as never)) errors.push(error("unsupported_task", "$.task", "The Build AI task is not permitted."));
  const sources = new Map(input.toolCalls.map((call) => [call.id, call]));
  if (sources.size !== input.toolCalls.length || datasetContract.toolCalls.length === 0 || datasetContract.toolCalls.length > 4) errors.push(error("invalid_shape", "$.dataset.toolCalls", "Tool-call references are invalid."));
  const declared = new Set<string>();
  for (let index = 0; index < datasetContract.toolCalls.length; index++) {
    const candidate = datasetContract.toolCalls[index];
    const id = plain(candidate) && typeof candidate.id === "string" ? candidate.id : "";
    if (!identifier(id) || declared.has(id) || !validateToolReference(candidate, sources.get(id))) errors.push(error("invalid_fact_reference", `$.dataset.toolCalls.${index}`, "The tool-call reference is not authorized."));
    else declared.add(id);
  }
  if (datasetContract.schemaVersion !== "1.0" || !input.toolCalls.every((call) => call.result.dataset.schemaVersion === datasetContract.schemaVersion)) errors.push(error("invalid_shape", "$.dataset.schemaVersion", "The dataset schema version is invalid."));
  if (!input.toolCalls.some((call) => same(call.result.dataset.scope, output.scope))) errors.push(error("invalid_fact_reference", "$.scope", "The interpretation scope is not authorized by its datasets."));

  if (output.limitations.length > BUILD_AI_MAX_LIMITATIONS) errors.push(error("limit_exceeded", "$.limitations", "Too many Build AI limitations were supplied."));
  const limitations = new Map<string, BuildAILimitation>();
  output.limitations.forEach((candidate, index) => {
    const path = `$.limitations.${index}`;
    if (!exact(candidate, LIMITATION_KEYS) || typeof candidate.id !== "string" || !identifier(candidate.id) || limitations.has(candidate.id) || typeof candidate.code !== "string" || !LIMITATION_CODES.has(candidate.code) || !text(candidate.text) || !Array.isArray(candidate.coverageRefs) || candidate.coverageRefs.some((ref) => !validateCoverageRef(ref, sources, declared))) {
      errors.push(error("invalid_shape", path, "The Build AI limitation is invalid."));
    } else limitations.set(candidate.id, candidate as BuildAILimitation);
  });

  if (output.statements.length > BUILD_AI_MAX_STATEMENTS) errors.push(error("limit_exceeded", "$.statements", "Too many Build AI statements were supplied."));
  const statementIds = new Set<string>();
  const validatedStatements: Array<BuildAIModelStatement & { supportState: BuildAIStatementSupport }> = [];
  output.statements.forEach((candidate, index) => {
    const path = `$.statements.${index}`;
    if (!exact(candidate, STATEMENT_KEYS) || typeof candidate.id !== "string" || !identifier(candidate.id) || statementIds.has(candidate.id) || !text(candidate.text) || !Array.isArray(candidate.supportingFacts) || !Array.isArray(candidate.limitationIds) || candidate.limitationIds.some((id) => typeof id !== "string" || !identifier(id) || !limitations.has(id))) {
      errors.push(error("invalid_shape", path, "The Build AI statement is invalid.")); return;
    }
    statementIds.add(candidate.id);
    if (!input.governance.permittedStatementTypes.includes(candidate.type as never)) {
      errors.push(error("unsupported_statement_type", `${path}.type`, "The Build AI statement type is not permitted.")); return;
    }
    if (candidate.supportingFacts.length > BUILD_AI_MAX_FACTS_PER_STATEMENT) errors.push(error("limit_exceeded", `${path}.supportingFacts`, "Too many deterministic facts support this statement."));
    if (candidate.type !== "limitation" && input.governance.requireFactReferences && candidate.supportingFacts.length === 0) errors.push(error("invalid_fact_reference", `${path}.supportingFacts`, "This statement requires deterministic fact support."));
    const validFacts = candidate.supportingFacts.filter((fact, factIndex) => validateFact(fact, sources, declared, `${path}.supportingFacts.${factIndex}`, errors));
    let coverageLimited = false;
    for (const fact of validFacts) {
      const source = sources.get(fact.toolCallId)!;
      for (const coveragePath of coveragePaths(source.result.dataset, fact.factPath)) {
        const resolved = resolvePath(source.result.dataset, coveragePath);
        if (resolved.found && incompleteCoverage(resolved.value)) {
          coverageLimited = true;
          const qualified = candidate.limitationIds.some((id) => limitationCovers(limitations.get(id)!, fact.toolCallId, coveragePath));
          if (input.governance.requireCoverageQualification && !qualified) errors.push(error("coverage_limitation_required", path, "Incomplete deterministic coverage requires an explicit limitation."));
        }
      }
    }
    validatedStatements.push({ ...(candidate as BuildAIModelStatement), supportState: coverageLimited ? "coverage_limited" : "fully_supported" });
  });
  if (errors.length) return { ok: false, errors };
  const interpretation: BuildAIInterpretationV1 = { ...(output as BuildAIModelOutputV1), statements: validatedStatements, validation: { status: "accepted", policyVersion: input.governance.version } };
  return { ok: true, interpretation };
}

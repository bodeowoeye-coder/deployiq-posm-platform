import "server-only";

import type { BuildAIProviderOutputV1, BuildAIProviderRequest, BuildAIProviderToolContext } from "./provider.ts";
import type { BuildAICoverageReference, BuildAIFactReference, BuildAILimitation, BuildAIModelStatement } from "./types.ts";

export const BUILD_AI_MAX_PROJECTED_FACTS = 180;
const INCLUDED_ROOTS = ["currentState", "progress", "plannedPosition", "schedule", "attention", "quality", "dependencies", "exceptions", "recentExecution", "coverage", "activities", "history"] as const;
const EXCLUDED_KEYS = new Set(["id", "clientId", "name", "title", "code", "displayName", "workspaceName", "workspaceReference", "projectId", "siteId", "siteName", "workPackageId", "workPackageName", "workPlanId", "activityId", "activityName", "exceptionId", "userId", "ownerUserId", "email", "phone", "address", "latitude", "longitude", "coordinates", "storageUrl", "photoUrl", "evidenceUrl", "url"]);
const scalar = (value: unknown) => value === null || ["string", "number", "boolean"].includes(typeof value);
const escapePointer = (value: string) => value.replaceAll("~", "~0").replaceAll("/", "~1");
const sensitiveKey = (key: string) => EXCLUDED_KEYS.has(key) || /(?:displayName|userId|email|phone|address|latitude|longitude|coordinates|storageUrl|photoUrl|evidenceUrl|password|secret|token|auth|session|cookie|credential)$/i.test(key);

export type BuildAIProjectedFact = {
  factRefId: string;
  label: string;
  value: string | number | boolean | null;
  coverageRefIds: readonly string[];
};
export type BuildAIProjectedCoverage = { coverageRefId: string; label: string; value: unknown };
export type BuildAIProjectedToolContext = {
  tool: BuildAIProviderToolContext["tool"];
  scope: { kind: "project" | "work_package" | "activity" };
  facts: readonly BuildAIProjectedFact[];
  coverage: readonly BuildAIProjectedCoverage[];
  constraints: { unsupportedConclusions: readonly string[] };
  selection: {
    contract: "all_allowed_facts" | "project_executive_summary_v1";
    sourceCoverage: "preserved";
    detail: "full_allowed_detail" | "project_rollups_and_canonical_previews";
  };
};
export type BuildAIReferenceRegistry = {
  facts: ReadonlyMap<string, BuildAIFactReference>;
  coverage: ReadonlyMap<string, BuildAICoverageReference>;
};
export type BuildAIProviderProjectionBundle = { projection: BuildAIProviderProjection; registry: BuildAIReferenceRegistry };

const alias = (prefix: "fact" | "coverage", index: number) => `${prefix}-${String(index + 1).padStart(3, "0")}`;
const coveragePathsForFact = (path: string, scope: BuildAIProviderToolContext["dataset"]["scope"]): string[] => {
  if (path.startsWith("/schedule")) return ["/coverage/schedule"];
  if (path.startsWith("/quality")) return ["/coverage/review"];
  if (path.startsWith("/progress") || path.startsWith("/plannedPosition")) return [scope.kind === "project" ? "/coverage/progress" : "/coverage/duration"];
  if (path.startsWith("/dependencies")) return ["/coverage/dependencyDataIncomplete"];
  if (path.startsWith("/history")) return ["/history/coverage/dataQuality"];
  return [];
};
export type BuildAIProviderProjection = {
  task: BuildAIProviderRequest["task"];
  question: string | null;
  context: readonly BuildAIProjectedToolContext[];
  policy: BuildAIProviderRequest["policy"];
  outputContract: BuildAIProviderRequest["outputContract"];
};

type PendingFact = { label: string; value: string | number | boolean | null; reference: BuildAIFactReference };
function collect(value: unknown, path: string, toolCallId: string, provenanceKeys: readonly string[], facts: PendingFact[]): void {
  if (facts.length > BUILD_AI_MAX_PROJECTED_FACTS) return;
  if (scalar(value)) {
    facts.push({ reference: { toolCallId, factPath: path, provenanceKeys: [...provenanceKeys] }, label: path.split("/").at(-1) ?? "value", value: value as string | number | boolean | null });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collect(item, `${path}/${index}`, toolCallId, provenanceKeys, facts));
    return;
  }
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return;
  for (const [key, child] of Object.entries(value)) {
    if (sensitiveKey(key)) continue;
    collect(child, `${path}/${escapePointer(key)}`, toolCallId, provenanceKeys, facts);
  }
}

function collectKeys(
  value: unknown,
  path: string,
  keys: readonly string[],
  toolCallId: string,
  provenanceKeys: readonly string[],
  facts: PendingFact[],
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  for (const key of keys) if (key in record && !sensitiveKey(key)) collect(record[key], `${path}/${escapePointer(key)}`, toolCallId, provenanceKeys, facts);
}

function collectPreview(
  value: unknown,
  path: string,
  itemKeys: readonly string[],
  toolCallId: string,
  provenanceKeys: readonly string[],
  facts: PendingFact[],
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const preview = value as Record<string, unknown>;
  collectKeys(preview, path, ["total", "returned", "truncated", "continuationToken"], toolCallId, provenanceKeys, facts);
  if (!Array.isArray(preview.items)) return;
  preview.items.forEach((item, index) => collectKeys(item, `${path}/items/${index}`, itemKeys, toolCallId, provenanceKeys, facts));
}

function collectProjectExecutiveSummary(
  dataset: BuildAIProviderToolContext["dataset"],
  toolCallId: string,
  provenanceKeys: readonly string[],
  facts: PendingFact[],
) {
  for (const root of ["currentState", "progress", "plannedPosition", "schedule", "quality", "coverage"] as const) {
    if (root in dataset) collect(dataset[root], `/${root}`, toolCallId, provenanceKeys, facts);
  }

  collectKeys(dataset.attention?.summary, "/attention/summary", [
    "outstandingObligations", "overdueObligations", "activitiesAffected", "workPackagesAffected",
    "explicitOwnersAffected", "unassignedObligations", "categoryCounts",
  ], toolCallId, provenanceKeys, facts);
  collectPreview(dataset.attention?.preview, "/attention/preview", [
    "type", "dueAt", "overdue", "dataQuality",
  ], toolCallId, provenanceKeys, facts);

  collect(dataset.dependencies?.summary, "/dependencies/summary", toolCallId, provenanceKeys, facts);
  collect(dataset.exceptions?.summary, "/exceptions/summary", toolCallId, provenanceKeys, facts);
  collectPreview(dataset.exceptions?.preview, "/exceptions/preview", [
    "status", "severity", "dueAt", "overdue",
  ], toolCallId, provenanceKeys, facts);

  collectKeys(dataset.recentExecution, "/recentExecution", [
    "ok", "dataQuality", "periodStart", "periodEnd", "timezone", "interval", "counts",
  ], toolCallId, provenanceKeys, facts);
}

function projectToolContext(context: BuildAIProviderToolContext, task: BuildAIProviderRequest["task"], factOffset: number, coverageOffset: number): { context: BuildAIProjectedToolContext; facts: Array<[string, BuildAIFactReference]>; coverage: Array<[string, BuildAICoverageReference]> } {
  const dataset = context.dataset;
  const availableKeys = [...new Set(dataset.provenance.groups.map((group) => group.key))];
  const provenanceKeys = availableKeys.slice(0, 8);
  const pendingFacts: PendingFact[] = [];
  const isProjectExecutiveSummary = task === "executive_summary" && dataset.scope.kind === "project";
  if (isProjectExecutiveSummary) {
    collectProjectExecutiveSummary(dataset, context.toolCallId, provenanceKeys, pendingFacts);
  } else {
    for (const root of INCLUDED_ROOTS) {
      if (root in dataset) collect(dataset[root], `/${root}`, context.toolCallId, provenanceKeys, pendingFacts);
    }
  }
  if (pendingFacts.length > BUILD_AI_MAX_PROJECTED_FACTS) throw new Error("Build AI provider projection exceeds its deterministic bound.");
  const coveragePaths = [...new Set(pendingFacts.flatMap((fact) => coveragePathsForFact(fact.reference.factPath, dataset.scope)).filter((path) => {
    const segments = path.slice(1).split("/"); let value: unknown = dataset;
    for (const segment of segments) { if (!value || typeof value !== "object" || !(segment in value)) return false; value = (value as Record<string, unknown>)[segment]; }
    return true;
  }))];
  const coverage = coveragePaths.map((path, index): [string, BuildAICoverageReference] => [alias("coverage", coverageOffset + index), { toolCallId: context.toolCallId, coveragePath: path }]);
  const coverageAliases = new Map(coverage.map(([id, reference]) => [reference.coveragePath, id]));
  const facts = pendingFacts.map((fact, index): [string, BuildAIFactReference] => [alias("fact", factOffset + index), fact.reference]);
  return { context: {
    tool: context.tool,
    scope: { kind: dataset.scope.kind },
    facts: pendingFacts.map((fact, index) => ({ factRefId: facts[index][0], label: fact.label, value: fact.value, coverageRefIds: coveragePathsForFact(fact.reference.factPath, dataset.scope).map((path) => coverageAliases.get(path)).filter((id): id is string => Boolean(id)) })),
    coverage: coverage.map(([coverageRefId, reference]) => { const segments = reference.coveragePath.slice(1).split("/"); let value: unknown = dataset; for (const segment of segments) value = (value as Record<string, unknown>)[segment]; return { coverageRefId, label: segments.at(-1) ?? "coverage", value }; }),
    constraints: { unsupportedConclusions: dataset.constraints.unsupportedConclusions },
    selection: isProjectExecutiveSummary
      ? { contract: "project_executive_summary_v1", sourceCoverage: "preserved", detail: "project_rollups_and_canonical_previews" }
      : { contract: "all_allowed_facts", sourceCoverage: "preserved", detail: "full_allowed_detail" },
  }, facts, coverage };
}

export function buildBuildAIProviderProjection(request: BuildAIProviderRequest): BuildAIProviderProjectionBundle {
  let factOffset = 0, coverageOffset = 0;
  const projected = request.authorizedContext.map((context) => { const result = projectToolContext(context, request.task, factOffset, coverageOffset); factOffset += result.facts.length; coverageOffset += result.coverage.length; return result; });
  if (factOffset > BUILD_AI_MAX_PROJECTED_FACTS) throw new Error("Build AI provider projection exceeds its deterministic bound.");
  return { projection: {
    task: request.task,
    question: request.question,
    context: projected.map((item) => item.context),
    policy: request.policy,
    outputContract: request.outputContract,
  }, registry: { facts: new Map(projected.flatMap((item) => item.facts)), coverage: new Map(projected.flatMap((item) => item.coverage)) } };
}

export function projectBuildAIProviderRequest(request: BuildAIProviderRequest): BuildAIProviderProjection {
  return buildBuildAIProviderProjection(request).projection;
}

export function resolveBuildAIProviderOutput(output: unknown, registry: BuildAIReferenceRegistry): { ok: true; output: { schemaVersion: "1.0"; statements: BuildAIModelStatement[]; limitations: BuildAILimitation[] } } | { ok: false } {
  if (!output || typeof output !== "object" || Array.isArray(output)) return { ok: false };
  const body = output as Partial<BuildAIProviderOutputV1>;
  const exact = (value: unknown, keys: readonly string[]) => Boolean(value && typeof value === "object" && !Array.isArray(value) && Reflect.ownKeys(value).every((key) => typeof key === "string") && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)));
  if (!exact(body, ["schemaVersion", "statements", "limitations"]) || body.schemaVersion !== "1.0" || !Array.isArray(body.statements) || !Array.isArray(body.limitations)) return { ok: false };
  const statements: BuildAIModelStatement[] = [];
  for (const statement of body.statements) {
    if (!exact(statement, ["id", "type", "text", "supportingFacts", "limitationIds"]) || !Array.isArray(statement.supportingFacts) || !Array.isArray(statement.limitationIds)) return { ok: false };
    const supportingFacts: BuildAIFactReference[] = [];
    const seen = new Set<string>();
    for (const selected of statement.supportingFacts) {
      if (!exact(selected, ["factRefId"]) || typeof selected.factRefId !== "string" || seen.has(selected.factRefId)) return { ok: false };
      const reference = registry.facts.get(selected.factRefId); if (!reference) return { ok: false };
      seen.add(selected.factRefId); supportingFacts.push({ ...reference, provenanceKeys: [...reference.provenanceKeys] });
    }
    statements.push({ id: statement.id, type: statement.type, text: statement.text, supportingFacts, limitationIds: statement.limitationIds });
  }
  const limitations: BuildAILimitation[] = [];
  for (const limitation of body.limitations) {
    if (!exact(limitation, ["id", "code", "text", "coverageRefs"]) || !Array.isArray(limitation.coverageRefs)) return { ok: false };
    const coverageRefs: BuildAICoverageReference[] = [];
    const seen = new Set<string>();
    for (const selected of limitation.coverageRefs) {
      if (!exact(selected, ["coverageRefId"]) || typeof selected.coverageRefId !== "string" || seen.has(selected.coverageRefId)) return { ok: false };
      const reference = registry.coverage.get(selected.coverageRefId); if (!reference) return { ok: false };
      seen.add(selected.coverageRefId); coverageRefs.push({ ...reference });
    }
    limitations.push({ id: limitation.id, code: limitation.code, text: limitation.text, coverageRefs });
  }
  return { ok: true, output: { schemaVersion: "1.0", statements, limitations } };
}

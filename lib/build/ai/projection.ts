import "server-only";

import type { BuildAIProviderRequest, BuildAIProviderToolContext } from "./provider.ts";

export const BUILD_AI_MAX_PROJECTED_FACTS = 180;
const INCLUDED_ROOTS = ["currentState", "progress", "plannedPosition", "schedule", "attention", "quality", "dependencies", "exceptions", "recentExecution", "coverage", "activities", "history"] as const;
const EXCLUDED_KEYS = new Set(["id", "clientId", "name", "title", "code", "displayName", "workspaceName", "workspaceReference", "projectId", "siteId", "siteName", "workPackageId", "workPackageName", "workPlanId", "activityId", "activityName", "exceptionId", "userId", "ownerUserId", "email", "phone", "address", "latitude", "longitude", "coordinates", "storageUrl", "photoUrl", "evidenceUrl", "url"]);
const scalar = (value: unknown) => value === null || ["string", "number", "boolean"].includes(typeof value);
const escapePointer = (value: string) => value.replaceAll("~", "~0").replaceAll("/", "~1");
const sensitiveKey = (key: string) => EXCLUDED_KEYS.has(key) || /(?:displayName|userId|email|phone|address|latitude|longitude|coordinates|storageUrl|photoUrl|evidenceUrl|password|secret|token|auth|session|cookie|credential)$/i.test(key);

export type BuildAIProjectedFact = {
  reference: { toolCallId: string; factPath: string; provenanceKeys: readonly string[] };
  label: string;
  value: string | number | boolean | null;
};
export type BuildAIProjectedToolContext = {
  toolCallId: string;
  tool: BuildAIProviderToolContext["tool"];
  scope: { kind: "project" | "work_package" | "activity" };
  facts: readonly BuildAIProjectedFact[];
  coverage: unknown;
  provenance: { authority: "deployiq_deterministic_build_intelligence"; availableKeys: readonly string[] };
  constraints: { unsupportedConclusions: readonly string[] };
};
export type BuildAIProviderProjection = {
  task: BuildAIProviderRequest["task"];
  question: string | null;
  context: readonly BuildAIProjectedToolContext[];
  policy: BuildAIProviderRequest["policy"];
  outputContract: BuildAIProviderRequest["outputContract"];
};

function collect(value: unknown, path: string, toolCallId: string, provenanceKeys: readonly string[], facts: BuildAIProjectedFact[]): void {
  if (facts.length > BUILD_AI_MAX_PROJECTED_FACTS) return;
  if (scalar(value)) {
    facts.push({ reference: { toolCallId, factPath: path, provenanceKeys }, label: path.split("/").at(-1) ?? "value", value: value as string | number | boolean | null });
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

function projectToolContext(context: BuildAIProviderToolContext): BuildAIProjectedToolContext {
  const dataset = context.dataset;
  const availableKeys = [...new Set(dataset.provenance.groups.map((group) => group.key))];
  const facts: BuildAIProjectedFact[] = [];
  for (const root of INCLUDED_ROOTS) {
    if (root in dataset) collect(dataset[root], `/${root}`, context.toolCallId, availableKeys.slice(0, 8), facts);
  }
  if (facts.length > BUILD_AI_MAX_PROJECTED_FACTS) throw new Error("Build AI provider projection exceeds its deterministic bound.");
  return {
    toolCallId: context.toolCallId,
    tool: context.tool,
    scope: { kind: dataset.scope.kind },
    facts,
    coverage: dataset.coverage,
    provenance: { authority: dataset.provenance.authority, availableKeys },
    constraints: { unsupportedConclusions: dataset.constraints.unsupportedConclusions },
  };
}

export function projectBuildAIProviderRequest(request: BuildAIProviderRequest): BuildAIProviderProjection {
  return {
    task: request.task,
    question: request.question,
    context: request.authorizedContext.map(projectToolContext),
    policy: request.policy,
    outputContract: request.outputContract,
  };
}

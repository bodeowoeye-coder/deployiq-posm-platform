import "server-only";

import type { BuildIntelligenceDatasetV1 } from "../intelligence/types.ts";
import type { BuildAIFactReference, BuildAILimitationCode } from "./types.ts";

export type BuildAISemanticRelationship = "direct" | "approved_ratio" | "approved_difference" | "approved_sum";
export type BuildAIFactSemantics = {
  measureKind: "event_count" | "entity_count" | "ratio" | "duration" | "status" | "boolean" | "number";
  grain: "project" | "work_package" | "activity";
  period: "current" | "history";
  populationId: string | null;
  relationshipGroup: string | null;
  allowedDerivations: readonly BuildAISemanticRelationship[];
  deniedCapabilities: readonly ("item_overlap_from_aggregate_events" | "entity_transition_from_aggregate_rollups")[];
};

const RATIO_GROUP = /^\/(progress\/(?:durationExpected|durationCompleted|durationAccepted)|plannedPosition\/(?:durationExpected|durationCompleted|durationAccepted)|quality\/(?:firstPassAcceptance|reviewCoverage|scheduleAdherence)|coverage\/(?:review|schedule))\/(numerator|denominator|ratio)$/;
const SUBMISSION_PARTITION = /^\/(recentExecution\/counts|history\/summary)\/(submissions|initialSubmissions|resubmissions)$/;
const HISTORY_EVENTS = /^\/history\/summary\/(activitiesStarted|activitiesCompleted|activitiesAccepted|submissions|initialSubmissions|resubmissions|changesRequiredOutcomes|blockedEvents|resumedEvents)$/;
const DENIED = ["item_overlap_from_aggregate_events", "entity_transition_from_aggregate_rollups"] as const;
const LABELS: Readonly<Record<string, string>> = {
  activitiesStarted: "Start events", activitiesCompleted: "Completion events", activitiesAccepted: "Acceptance events",
  currentlyOverdue: "Currently overdue activities", outstandingObligations: "Outstanding obligations",
  executionBlocks: "Execution blocks", reviewsPending: "Reviews pending",
};

export function buildAIFactSemantics(path: string, scope: BuildIntelligenceDatasetV1["scope"]): BuildAIFactSemantics {
  const ratio = RATIO_GROUP.exec(path);
  const submission = SUBMISSION_PARTITION.exec(path);
  const relationshipGroup = ratio ? `${scope.kind}:/${ratio[1]}` : submission ? `${scope.kind}:/${submission[1]}:submission_partition` : null;
  const history = path.startsWith("/history/") || path.startsWith("/timing/requestedHistory/");
  const eventCount = HISTORY_EVENTS.test(path);
  return {
    measureKind: eventCount || submission ? "event_count" : ratio?.[2] === "ratio" ? "ratio" : /Hours$/.test(path) ? "duration" : /\/(state|status|dataQuality|timezone|interval|cadence)$/.test(path) ? "status" : /\/(ok|truncated)$/.test(path) ? "boolean" : /\/(ratio)$/.test(path) ? "ratio" : /\/(count|total|numerator|denominator|currentlyOverdue|activities[A-Z][^/]*)$/.test(path) || path.includes("/categoryCounts/") ? "entity_count" : "number",
    grain: scope.kind,
    period: history ? "history" : "current",
    populationId: relationshipGroup,
    relationshipGroup,
    allowedDerivations: ratio ? ratio[2] === "ratio" ? ["direct", "approved_ratio"] : ["direct", "approved_ratio", "approved_difference"] : submission ? ["direct", "approved_sum"] : ["direct"],
    deniedCapabilities: eventCount ? DENIED : [],
  };
}

export type BuildAISemanticFact = { reference: BuildAIFactReference; value: unknown; scope: BuildIntelligenceDatasetV1["scope"] };
const label = (path: string) => LABELS[path.split("/").at(-1) ?? ""] ?? (path.split("/").at(-1) ?? "Fact").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (value) => value.toUpperCase());
const scalar = (value: unknown): value is string | number | boolean => typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value);

/** Text is always rendered from validated facts; model-authored factual prose is never accepted in v2. */
export function renderBuildAISemanticClaim(relationship: unknown, facts: readonly BuildAISemanticFact[], statementType: string): string | null {
  if (statementType === "limitation" && relationship === "direct" && facts.length === 0) return "The supplied evidence has limitations.";
  if (!Array.isArray(facts) || facts.length === 0 || facts.length > 8 || facts.some((fact) => !scalar(fact.value))) return null;
  const metadata = facts.map((fact) => buildAIFactSemantics(fact.reference.factPath, fact.scope));
  let factual: string;
  if (relationship === "direct") {
    factual = facts.map((fact) => `${label(fact.reference.factPath)}: ${String(fact.value)}`).join("; ");
  } else if (relationship === "approved_ratio" || relationship === "approved_difference") {
    if (facts.length !== 2 || metadata.some((item) => !item.relationshipGroup || !item.allowedDerivations.includes(relationship)) || metadata[0].relationshipGroup !== metadata[1].relationshipGroup || metadata[0].populationId !== metadata[1].populationId || metadata[0].grain !== metadata[1].grain || metadata[0].period !== metadata[1].period || facts[0].reference.toolCallId !== facts[1].reference.toolCallId || JSON.stringify(facts[0].scope) !== JSON.stringify(facts[1].scope) || facts.some((fact) => typeof fact.value !== "number")) return null;
    const paths = facts.map((fact) => fact.reference.factPath);
    const numerator = paths.findIndex((path) => path.endsWith("/numerator"));
    const denominator = paths.findIndex((path) => path.endsWith("/denominator"));
    if (numerator < 0 || denominator < 0) return null;
    const n = facts[numerator].value as number, d = facts[denominator].value as number;
    if (d < 0 || n < 0 || n > d || relationship === "approved_ratio" && d === 0) return null;
    factual = relationship === "approved_ratio" ? `${label(paths[numerator])} / ${label(paths[denominator])}: ${n / d}` : `${label(paths[denominator])} minus ${label(paths[numerator])}: ${d - n}`;
  } else if (relationship === "approved_sum") {
    if (facts.length !== 3 || metadata.some((item) => !item.relationshipGroup?.endsWith(":submission_partition") || !item.allowedDerivations.includes("approved_sum") || item.relationshipGroup !== metadata[0].relationshipGroup || item.period !== metadata[0].period || item.grain !== metadata[0].grain) || facts.some((fact) => fact.reference.toolCallId !== facts[0].reference.toolCallId || JSON.stringify(fact.scope) !== JSON.stringify(facts[0].scope) || typeof fact.value !== "number" || fact.value < 0)) return null;
    const byLeaf = new Map(facts.map((fact) => [fact.reference.factPath.split("/").at(-1), fact.value as number]));
    if (byLeaf.size !== 3 || !byLeaf.has("initialSubmissions") || !byLeaf.has("resubmissions") || !byLeaf.has("submissions") || byLeaf.get("initialSubmissions")! + byLeaf.get("resubmissions")! !== byLeaf.get("submissions")) return null;
    factual = `Initial submissions plus resubmissions: ${byLeaf.get("submissions")}`;
  } else return null;
  return statementType === "decision_option" ? `Management may review ${factual}. This is non-binding.` : `${factual}.`;
}

const LIMITATION_TEXT: Record<BuildAILimitationCode, string> = {
  partial_coverage: "The cited measure has partial coverage.", data_unavailable: "Some deterministic data is unavailable.",
  history_unavailable: "Historical detail is unavailable for this conclusion.", interpretation_unavailable: "Interpretation is unavailable.",
  unsupported_conclusion: "The supplied facts do not support further conclusions.", governance_not_configured: "Governance does not permit this interpretation.",
};
export function renderBuildAILimitation(code: BuildAILimitationCode): string { return LIMITATION_TEXT[code]; }

import type { BuildIntelligenceDatasetV1 } from "../intelligence/types.ts";
import type { BuildIntelligenceToolName, BuildIntelligenceToolResult } from "../intelligence/tools.ts";

export type BuildAITask = "executive_summary" | "change_interpretation" | "management_attention";
export type BuildAIStatementType = "interpretation" | "attention" | "decision_option" | "limitation";
export type BuildAIStatementSupport = "fully_supported" | "coverage_limited";
export type BuildAILimitationCode = "partial_coverage" | "data_unavailable" | "history_unavailable" | "interpretation_unavailable" | "unsupported_conclusion" | "governance_not_configured";

export type BuildAIFactReference = { toolCallId: string; factPath: string; provenanceKeys: string[] };
export type BuildAICoverageReference = { toolCallId: string; coveragePath: string };
export type BuildAIToolCallReference = { id: string; tool: BuildIntelligenceToolName; scope: BuildIntelligenceDatasetV1["scope"]; datasetSchemaVersion: string; asOf: string };
export type BuildAIAcceptedToolCall = { id: string; tool: BuildIntelligenceToolName; result: Extract<BuildIntelligenceToolResult, { ok: true }> };

export type BuildAIModelStatement = { id: string; type: BuildAIStatementType; text: string; supportingFacts: BuildAIFactReference[]; limitationIds: string[] };
export type BuildAIModelStatementV2 = BuildAIModelStatement & { claim: { relationship: "direct" | "approved_ratio" | "approved_difference" | "approved_sum"; factRefs: BuildAIFactReference[] } };
export type BuildAILimitation = { id: string; code: BuildAILimitationCode; text: string; coverageRefs: BuildAICoverageReference[] };

export type BuildAIModelOutputV1 = {
  schemaVersion: "1.0";
  generatedAt: string;
  scope: BuildIntelligenceDatasetV1["scope"];
  task: BuildAITask;
  dataset: { schemaVersion: string; toolCalls: BuildAIToolCallReference[] };
  statements: BuildAIModelStatement[];
  limitations: BuildAILimitation[];
};
/** v2 preserves the authoritative envelope and adds a validated relationship per statement. */
export type BuildAIModelOutputV2 = Omit<BuildAIModelOutputV1, "schemaVersion" | "statements"> & {
  schemaVersion: "2.0";
  statements: BuildAIModelStatementV2[];
};

export type BuildAIInterpretationV1 = Omit<BuildAIModelOutputV1, "statements"> & {
  statements: Array<BuildAIModelStatement & { supportState: BuildAIStatementSupport }>;
  validation: { status: "accepted"; policyVersion: string };
};
export type BuildAIInterpretationV2 = Omit<BuildAIModelOutputV2, "statements"> & {
  statements: Array<BuildAIModelStatementV2 & { supportState: BuildAIStatementSupport }>;
  validation: { status: "accepted"; policyVersion: string };
};

export type BuildAIInterpretationAvailability = "accepted" | "interpretation_unavailable" | "no_data" | "partial_data" | "not_authorized" | "ai_unavailable";

export type BuildAIValidationErrorCode =
  | "invalid_shape" | "unsupported_task" | "unsupported_statement_type" | "invalid_fact_reference"
  | "invalid_provenance_reference" | "coverage_limitation_required" | "unsupported_conclusion"
  | "autonomous_action_not_allowed" | "subjective_severity_not_allowed" | "numeric_confidence_not_allowed" | "limit_exceeded";

export type BuildAIValidationError = { code: BuildAIValidationErrorCode; path: string; message: string };
export type BuildAIValidationResult = { ok: true; interpretation: BuildAIInterpretationV1 | BuildAIInterpretationV2 } | { ok: false; errors: BuildAIValidationError[] };

export type BuildAIDeterministicFallback = {
  status: Exclude<BuildAIInterpretationAvailability, "accepted">;
  interpretation: null;
  deterministicToolCalls: readonly BuildAIAcceptedToolCall[];
};

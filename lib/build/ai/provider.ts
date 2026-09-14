import "server-only";

import type { BuildAIGovernanceV1 } from "./governance.ts";
import type { BuildAILimitation, BuildAIModelOutputV1, BuildAIModelStatement, BuildAITask } from "./types.ts";
import type { BuildIntelligenceDatasetV1 } from "../intelligence/types.ts";
import type { BuildIntelligenceToolName } from "../intelligence/tools.ts";

export type BuildAIProviderMetadata = {
  providerId: string;
  modelId?: string;
  modelVersion?: string;
};

export type BuildAIProviderToolContext = {
  toolCallId: string;
  tool: BuildIntelligenceToolName;
  dataset: BuildIntelligenceDatasetV1;
};

export type BuildAIProviderPolicy = {
  governanceVersion: BuildAIGovernanceV1["version"];
  visibility: "shadow";
  allowedTask: BuildAITask;
  allowedStatementTypes: BuildAIGovernanceV1["permittedStatementTypes"];
  requireFactReferences: true;
  requireCoverageQualification: true;
  unsupportedConclusions: BuildAIGovernanceV1["forbiddenConclusions"];
  allowAutonomousActions: false;
  allowModelAuthoredFacts: false;
  decisionOptionsOnly: true;
};

export type BuildAIProviderRequest = {
  task: BuildAITask;
  question: string | null;
  authorizedContext: readonly BuildAIProviderToolContext[];
  policy: BuildAIProviderPolicy;
  outputContract: { schemaVersion: "1.0" };
  signal: AbortSignal;
};

export type BuildAIProviderResult = {
  metadata: BuildAIProviderMetadata;
  output: unknown;
};

/** Model-authored interpretation content. DeployIQ attaches the authoritative envelope. */
export type BuildAIProviderOutputV1 = {
  schemaVersion: "1.0";
  statements: BuildAIModelStatement[];
  limitations: BuildAILimitation[];
};

export interface BuildAIProvider {
  generate(request: BuildAIProviderRequest): Promise<BuildAIProviderResult>;
}

export type BuildAIProviderFailureAvailability = "ai_unavailable" | "interpretation_unavailable";
export type BuildAIProviderFailureCategory =
  | "provider_timeout"
  | "transport_error"
  | "outer_timeout"
  | "configuration_error"
  | "rate_limited"
  | "provider_unavailable"
  | "incomplete_response"
  | "provider_refusal"
  | "invalid_provider_response";

export class BuildAIProviderError extends Error {
  constructor(readonly availability: BuildAIProviderFailureAvailability, readonly category: BuildAIProviderFailureCategory) {
    super("Build AI provider is unavailable.");
    this.name = "BuildAIProviderError";
  }
}

export type BuildAIValidatedProviderOutput = BuildAIModelOutputV1;

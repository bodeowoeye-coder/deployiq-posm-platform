import "server-only";

import { BUILD_INTELLIGENCE_UNSUPPORTED_CONCLUSIONS, type BuildUnsupportedConclusion } from "../intelligence/constraints.ts";
import type { BuildAIStatementType, BuildAITask } from "./types.ts";

export type BuildAIGovernanceV1 = {
  version: "build-ai-governance-v1";
  allowedTasks: readonly BuildAITask[];
  permittedStatementTypes: readonly BuildAIStatementType[];
  forbiddenConclusions: readonly BuildUnsupportedConclusion[];
  requireCoverageQualification: true;
  requireFactReferences: true;
  allowAutonomousActions: false;
  visibilityMode: "shadow";
};

export const DEFAULT_BUILD_AI_GOVERNANCE: BuildAIGovernanceV1 = Object.freeze({
  version: "build-ai-governance-v1",
  allowedTasks: Object.freeze(["executive_summary", "change_interpretation", "management_attention"] as const),
  permittedStatementTypes: Object.freeze(["interpretation", "attention", "decision_option", "limitation"] as const),
  forbiddenConclusions: BUILD_INTELLIGENCE_UNSUPPORTED_CONCLUSIONS,
  requireCoverageQualification: true,
  requireFactReferences: true,
  allowAutonomousActions: false,
  visibilityMode: "shadow",
});

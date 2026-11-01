import "server-only";

import OpenAI, { APIConnectionTimeoutError } from "openai";
import { readBuildAIConfig, type BuildAIEnabledConfig } from "../config.ts";
import { buildBuildAIInstructions } from "../prompt.ts";
import { buildBuildAIProviderProjection, resolveBuildAIProviderOutput, type BuildAIProviderProjection } from "../projection.ts";
import { BuildAIProviderError, type BuildAIProvider, type BuildAIProviderRequest, type BuildAIProviderResult } from "../provider.ts";

export const BUILD_AI_OPENAI_OUTPUT_SCHEMA_NAME = "deployiq_build_ai_model_output_v1";
const identifier = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$" } as const;
const boundedText = { type: "string", minLength: 1, maxLength: 500 } as const;
export function buildBuildAIOpenAIOutputSchema(projection: BuildAIProviderProjection) {
  const factRefIds = projection.context.flatMap((context) => context.facts.map((fact) => fact.factRefId));
  const coverageRefIds = projection.context.flatMap((context) => context.coverage.map((coverage) => coverage.coverageRefId));
  const factAlias = { type: "string", enum: factRefIds } as const;
  const coverageAlias = { type: "string", enum: coverageRefIds } as const;
  if (projection.outputContract.schemaVersion === "2.0") return {
    type: "object", additionalProperties: false,
    properties: {
      schemaVersion: { type: "string", const: "2.0" },
      statements: { type: "array", maxItems: 12, items: { type: "object", additionalProperties: false, properties: {
        id: identifier, type: { type: "string", enum: ["interpretation", "attention", "decision_option", "limitation"] },
        claim: { type: "object", additionalProperties: false, properties: { relationship: { type: "string", enum: ["direct", "approved_ratio", "approved_difference", "approved_sum"] }, factRefIds: { type: "array", maxItems: 8, items: factAlias } }, required: ["relationship", "factRefIds"] },
        limitationIds: { type: "array", maxItems: 8, items: identifier },
      }, required: ["id", "type", "claim", "limitationIds"] } },
      limitations: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, properties: {
        id: identifier, code: { type: "string", enum: ["partial_coverage", "data_unavailable", "history_unavailable", "interpretation_unavailable", "unsupported_conclusion", "governance_not_configured"] },
        coverageRefs: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, properties: { coverageRefId: coverageAlias }, required: ["coverageRefId"] } },
      }, required: ["id", "code", "coverageRefs"] } },
    }, required: ["schemaVersion", "statements", "limitations"],
  } as const;
  return {
  type: "object", additionalProperties: false,
  properties: {
    schemaVersion: { type: "string", const: "1.0" },
    statements: { type: "array", maxItems: 12, items: { type: "object", additionalProperties: false, properties: {
      id: identifier, type: { type: "string", enum: ["interpretation", "attention", "decision_option", "limitation"] }, text: boundedText,
      supportingFacts: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, properties: {
        factRefId: factAlias,
      }, required: ["factRefId"] } },
      limitationIds: { type: "array", maxItems: 8, items: identifier },
    }, required: ["id", "type", "text", "supportingFacts", "limitationIds"] } },
    limitations: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, properties: {
      id: identifier, code: { type: "string", enum: ["partial_coverage", "data_unavailable", "history_unavailable", "interpretation_unavailable", "unsupported_conclusion", "governance_not_configured"] }, text: boundedText,
      coverageRefs: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, properties: { coverageRefId: coverageAlias }, required: ["coverageRefId"] } },
    }, required: ["id", "code", "text", "coverageRefs"] } },
  }, required: ["schemaVersion", "statements", "limitations"],
  } as const;
}

type OpenAIResponse = { status?: string; output_text?: string; model?: string };
export type BuildAIOpenAIClient = { responses: { create(body: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<OpenAIResponse> } };
export type BuildAIOpenAIClientFactory = (options: { apiKey: string; timeout: number; maxRetries: 0 }) => BuildAIOpenAIClient;
const defaultClientFactory: BuildAIOpenAIClientFactory = (options) => new OpenAI(options) as unknown as BuildAIOpenAIClient;

export class OpenAIBuildAIProvider implements BuildAIProvider {
  constructor(private readonly config: BuildAIEnabledConfig, private readonly client: BuildAIOpenAIClient) {}

  async generate(request: BuildAIProviderRequest): Promise<BuildAIProviderResult> {
    if (request.signal.aborted) throw new BuildAIProviderError("ai_unavailable", "provider_timeout");
    const { projection: projected, registry } = buildBuildAIProviderProjection(request);
    const instructions = buildBuildAIInstructions(projected);
    try {
      const response = await this.client.responses.create({
        model: this.config.model,
        instructions: JSON.stringify({ systemPolicyId: instructions.systemPolicyId, systemPolicy: instructions.systemPolicy }),
        input: JSON.stringify({ taskInstruction: instructions.taskInstruction, userContent: instructions.userContent, deterministicContext: instructions.deterministicContext }),
        text: { format: { type: "json_schema", name: request.outputContract.schemaVersion === "2.0" ? "deployiq_build_ai_model_output_v2" : BUILD_AI_OPENAI_OUTPUT_SCHEMA_NAME, strict: true, schema: buildBuildAIOpenAIOutputSchema(projected) } },
        reasoning: { effort: "none" },
        max_output_tokens: this.config.maxOutputTokens,
        store: false,
        truncation: "disabled",
      }, { signal: request.signal });
      if (response.status !== "completed") throw new BuildAIProviderError("interpretation_unavailable", response.status === "incomplete" ? "incomplete_response" : "provider_refusal");
      if (typeof response.output_text !== "string" || !response.output_text.trim()) throw new BuildAIProviderError("interpretation_unavailable", "invalid_provider_response");
      let output: unknown;
      try { output = JSON.parse(response.output_text); }
      catch { throw new BuildAIProviderError("interpretation_unavailable", "invalid_provider_response"); }
      const effectiveModel = typeof response.model === "string" && response.model.trim() && response.model.length <= 100 ? response.model : this.config.model;
      const resolved = resolveBuildAIProviderOutput(output, registry);
      if (!resolved.ok) throw new BuildAIProviderError("interpretation_unavailable", "invalid_provider_reference", resolved.code, { providerId: "openai", modelId: effectiveModel });
      return { metadata: { providerId: "openai", modelId: effectiveModel }, output: resolved.output };
    } catch (error) {
      if (error instanceof BuildAIProviderError) throw error;
      const status = Number((error as { status?: unknown })?.status ?? 0);
      const category = error instanceof APIConnectionTimeoutError || request.signal.aborted
        ? "provider_timeout"
        : status === 401 || status === 403
          ? "configuration_error"
          : status === 429
            ? "rate_limited"
            : status >= 500
              ? "provider_unavailable"
              : "transport_error";
      throw new BuildAIProviderError("ai_unavailable", category);
    }
  }
}

export type BuildAIProviderFactoryResult =
  | { status: "disabled" }
  | { status: "invalid"; code: string }
  | { status: "ready"; provider: BuildAIProvider; config: BuildAIEnabledConfig };

export function createConfiguredBuildAIProvider(options: { environment?: Readonly<Record<string, string | undefined>>; clientFactory?: BuildAIOpenAIClientFactory } = {}): BuildAIProviderFactoryResult {
  const environment = options.environment ?? process.env;
  const parsed = readBuildAIConfig(environment);
  if (parsed.status === "disabled") return { status: "disabled" };
  if (parsed.status === "invalid") return parsed;
  const apiKey = environment.OPENAI_API_KEY?.trim();
  if (!apiKey) return { status: "invalid", code: "provider_credentials_missing" };
  const client = (options.clientFactory ?? defaultClientFactory)({ apiKey, timeout: parsed.config.timeoutMs, maxRetries: 0 });
  return { status: "ready", provider: new OpenAIBuildAIProvider(parsed.config, client), config: parsed.config };
}
